/** Authenticated gateway for actor-owned local model artifacts. */
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { analyzeBrainMri } = require('../services/brainMri');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 128 * 1024 * 1024, files: 1, fields: 4 } });
router.use(requireAuth);
const id = '[a-f0-9]{32}';
const allowed = [
  ['GET', /^\/health$/],
  ['GET', /^\/brain\/demo$/], ['POST', /^\/brain\/demo$/],
  ['GET', /^\/brain\/studies$/], ['POST', /^\/brain\/studies$/],
  ['GET', new RegExp(`^/brain/studies/${id}$`)],
  ['GET', new RegExp(`^/brain/studies/${id}/(slice|mesh|mask)$`)],
  ['POST', new RegExp(`^/brain/studies/${id}/segment$`)],
  ['GET', new RegExp(`^/brain/studies/${id}/compare/${id}$`)],
  ['GET', /^\/radar\/demo$/], ['GET', /^\/radar\/sessions$/], ['POST', /^\/radar\/sessions$/],
  ['GET', new RegExp(`^/radar/sessions/${id}$`)],
  ['GET', new RegExp(`^/radar/sessions/${id}/export$`)],
  ['POST', new RegExp(`^/radar/sessions/${id}/(step|readings|forecast)$`)],
];
function configuration() {
  const token = process.env.INTELLIGENCE_TOKEN;
  let origin;
  try { origin = new URL(process.env.INTELLIGENCE_URL || 'http://127.0.0.1:8090'); } catch {}
  if (!token || !origin || !['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw Object.assign(new Error('Local intelligence worker is not configured'), { status: 503 });
  }
  return { token, origin };
}
async function worker(req, path, options = {}) {
  const { token, origin } = configuration();
  try {
    return await fetch(new URL(path, origin), {
      ...options, headers: { ...options.headers, 'X-Intelligence-Key': token, 'X-Actor-Id': req.userId },
      signal: AbortSignal.timeout(300_000), redirect: 'error',
    });
  } catch { throw Object.assign(new Error('Local intelligence worker unavailable. Start the intelligence engine.'), { status: 503 }); }
}
async function sendUpstream(response, res) {
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  res.set('Cache-Control', 'no-store');
  if (contentType.includes('application/json')) {
    let data;
    try { data = await response.json(); } catch { return res.status(502).json({ error: 'Invalid intelligence response' }); }
    return res.status(response.status).json(data);
  }
  if (!response.ok) return res.status(502).json({ error: 'Intelligence request failed' });
  res.type(contentType).status(response.status).send(Buffer.from(await response.arrayBuffer()));
}
router.post('/brain/studies/:id/classify', async (req, res, next) => {
  try {
    if (!new RegExp(`^${id}$`).test(req.params.id)) return res.status(404).json({ error: 'Study not found' });
    const { axis = 'axial', index } = req.body || {};
    if (!['axial', 'coronal', 'sagittal'].includes(axis) || !Number.isInteger(index) || index < 0) {
      return res.status(400).json({ error: 'Valid slice axis and index required' });
    }
    const upstream = await worker(req, `/brain/studies/${req.params.id}/slice?axis=${axis}&index=${index}&mask=0`);
    if (!upstream.ok) return sendUpstream(upstream, res);
    const result = await analyzeBrainMri(Buffer.from(await upstream.arrayBuffer()), 'mri-slice.png', 'image/png');
    res.set('Cache-Control', 'no-store').json({ ...result, scope: 'Four-class 2D slice classifier; separate from prompted 3D segmentation.' });
  } catch (error) { next(error); }
});
router.use((req, res, next) => {
  if (!allowed.some(([method, pattern]) => method === req.method && pattern.test(req.path))) return res.status(404).json({ error: 'Intelligence route not found' });
  next();
});
router.post('/brain/studies', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'NIfTI file required' });
    const form = new FormData();
    form.set('file', new Blob([req.file.buffer], { type: 'application/octet-stream' }), req.file.originalname);
    for (const key of ['patientId', 'studyDate', 'name']) if (typeof req.body[key] === 'string') form.set(key, req.body[key]);
    await sendUpstream(await worker(req, '/brain/studies', { method: 'POST', body: form }), res);
  } catch (error) { next(error); }
});
router.use(async (req, res, next) => {
  try {
    const path = req.path + (req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '');
    const options = { method: req.method };
    if (req.method === 'POST') { options.body = JSON.stringify(req.body || {}); options.headers = { 'Content-Type': 'application/json' }; }
    await sendUpstream(await worker(req, path, options), res);
  } catch (error) { next(error); }
});
router.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'NIfTI upload exceeds 128 MiB' : 'Invalid MRI upload fields' });
  }
  next(error);
});
module.exports = router;
