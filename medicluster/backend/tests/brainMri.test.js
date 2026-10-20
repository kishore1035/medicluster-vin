const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const multer = require('multer');
const { createTestDatabase } = require('./helpers/supabaseTestDb');

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('brain MRI integrates with patient media independently of chest X-ray runtime', async t => {
  await createTestDatabase(t);
  const bytes = Buffer.from('fixture MRI pixels');
  const heatmap = 'data:image/jpeg;base64,aGVhdG1hcA==';
  let prediction = {
    success: true, label: 'No Tumor', confidence: 90, is_tumor: false,
    probabilities: { Glioma: 4, Meningioma: 3, 'No Tumor': 90, Pituitary: 3 },
    heatmap_b64: heatmap, explanation: { available: true },
  };
  let upstreamStatus = 200;
  let predictionCalls = 0;
  const provider = express();
  provider.get('/models', (_req, res) => res.status(500).json({ error: 'Chest runtime missing' }));
  provider.post('/analyze-image', (_req, res) => res.status(500).type('html').send('<h1>private provider traceback</h1>'));
  provider.post('/api/predict', multer().single('file'), (req, res) => {
    predictionCalls++;
    assert.equal(req.file.originalname, 'brain.png');
    assert.deepEqual(req.file.buffer, bytes);
    res.status(upstreamStatus).json(prediction);
  });
  const providerOrigin = await listen(t, provider);
  const previous = { ML_ENGINE_URL: process.env.ML_ENGINE_URL, BRAIN_MRI_URL: process.env.BRAIN_MRI_URL, JWT_SECRET: process.env.JWT_SECRET };
  process.env.ML_ENGINE_URL = providerOrigin;
  process.env.BRAIN_MRI_URL = providerOrigin;
  process.env.JWT_SECRET = 'clinical-media-action-test-secret-at-least-32-characters';
  const actionToken = require('../middleware/auth').signToken({ _id: 'media-reviewer' });
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const app = express();
  app.use(express.json());
  app.use('/api/media', require('../routes/mediaRoutes'));
  app.use('/api/alerts', require('../routes/alertRoutes'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const origin = await listen(t, app);
  const realFetch = global.fetch;
  global.fetch = (url, options) => {
    if (new URL(url).pathname.startsWith('/storage/v1/')) {
      return Promise.resolve(options.method === 'GET' ? new Response(bytes) : Response.json({ message: 'success' }));
    }
    return realFetch(url, options);
  };
  t.after(() => { global.fetch = realFetch; });

  await t.test('lists MRI even when chest model discovery fails', async () => {
    const response = await realFetch(`${origin}/api/media/models`);
    const data = await response.json();
    const brain = data.models.find(model => model.id === 'brain-mri-tflite');
    assert.equal(brain?.modality, 'brain-mri');
    assert.match(brain.label, /Brain MRI/);
    assert.ok(data.models.some(model => model.id === 'densenet121-res224-all'));
  });

  const form = new FormData();
  form.set('patient_id', 'brain-patient');
  form.set('file', new Blob([bytes], { type: 'image/png' }), 'brain.png');
  const upload = await realFetch(`${origin}/api/media/upload`, { method: 'POST', body: form });
  assert.equal(upload.status, 201);
  const media = await upload.json();
  const analyze = () => realFetch(`${origin}/api/media/analyze/${media.gridfs_id}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model_name: 'brain-mri-tflite' }),
  });
  const action = (name, body = {}) => realFetch(`${origin}/api/media/${name}/${media.gridfs_id}`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${actionToken}` }, body: JSON.stringify(body),
  });

  await t.test('record and review actions require clinician sign-in', async () => {
    for (const name of ['record', 'review']) {
      assert.equal((await realFetch(`${origin}/api/media/${name}/${media.gridfs_id}`, { method: 'POST' })).status, 401);
    }
  });

  await t.test('record and review actions reject images without a completed analysis', async () => {
    assert.equal((await action('record', { patient_id: 'brain-patient' })).status, 409);
    assert.equal((await action('review')).status, 409);
  });

  await t.test('unavailable chest inference gives actionable MRI selection error without provider internals', async () => {
    const response = await realFetch(`${origin}/api/media/analyze/${media.gridfs_id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model_name: 'densenet121-res224-all' }),
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.match(body.error, /Chest X-ray.*unavailable/);
    assert.match(body.error, /Brain MRI/);
    assert.doesNotMatch(body.error, /traceback|private/);
  });

  await t.test('converts percentages and persists brain classes, modality and heatmap', async () => {
    const response = await analyze();
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.modality, 'brain-mri');
    assert.equal(result.is_tumor, false);
    assert.equal(result.prediction_label, 'No Tumor');
    assert.equal(result.findings.length, 4);
    assert.equal(result.findings[0].label, 'No Tumor');
    assert.equal(result.findings[0].confidence, .9);
    assert.equal(result.findings.find(item => item.label === 'Glioma Tumor').confidence, .04);
    assert.equal(result.heatmap_data_url, heatmap);
    const saved = await (await realFetch(`${origin}/api/media/brain-patient`)).json();
    assert.equal(saved[0].analysis.modality, 'brain-mri');
    assert.equal(saved[0].analysis.heatmap_data_url, heatmap);
    assert.equal(saved[0].patient_id, 'brain-patient');
  });

  await t.test('No Tumor creates no abnormal imaging alert', async () => {
    const response = await realFetch(`${origin}/api/alerts`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });

  await t.test('returns saved MRI heatmap without calling chest runtime', async () => {
    const response = await realFetch(`${origin}/api/media/gradcam/${media.gridfs_id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model_name: 'brain-mri-tflite' }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.heatmap_data_url, heatmap);
    assert.equal(result.gradcam_available, true);
    assert.equal(predictionCalls, 1);
  });

  await t.test('rejects malformed model distributions without overwriting saved analysis', async () => {
    prediction = { ...prediction, probabilities: { Glioma: 100, Meningioma: 100, 'No Tumor': 0, Pituitary: 0 } };
    assert.equal((await analyze()).status, 502);
    const saved = await (await realFetch(`${origin}/api/media/brain-patient`)).json();
    assert.equal(saved[0].analysis.prediction_label, 'No Tumor');
  });

  await t.test('preserves unsupported MRI input errors without provider internals', async () => {
    upstreamStatus = 422;
    prediction = { detail: 'sensitive provider traceback' };
    const response = await analyze();
    assert.equal(response.status, 422);
    assert.doesNotMatch(await response.text(), /sensitive|traceback/);
  });

  await t.test('adding an analyzed image links its record to the entered patient and survives reload', async () => {
    assert.equal((await action('record', { patient_id: 'imaging-session' })).status, 400);
    const response = await action('record', { patient_id: 'brain-patient-linked' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.patient_id, 'brain-patient-linked');
    assert.ok(Number.isFinite(Date.parse(result.recordedAt)));
    assert.equal(result.analysis.model, 'brain-mri-tflite');
    const repeated = await (await action('record', { patient_id: 'brain-patient-linked' })).json();
    assert.equal(repeated.recordedAt, result.recordedAt);
    const saved = await (await realFetch(`${origin}/api/media/brain-patient-linked`)).json();
    assert.equal(saved[0].recordedAt, result.recordedAt);
  });

  await t.test('radiologist flag is persisted, idempotent and keeps existing patient association', async () => {
    const response = await action('review');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(Number.isFinite(Date.parse(result.reviewRequestedAt)));
    assert.equal(result.patient_id, 'brain-patient-linked');
    const repeated = await (await action('review')).json();
    assert.equal(repeated.reviewRequestedAt, result.reviewRequestedAt);
    const saved = await (await realFetch(`${origin}/api/media/brain-patient-linked`)).json();
    assert.equal(saved[0].reviewRequestedAt, result.reviewRequestedAt);
  });
});
