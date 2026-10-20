// Adapter for the Brain Health Monitor's existing, validated TFLite inference API.
// It owns MRI decoding, training-time preprocessing, class order and Grad-CAM.
const MODEL_ID = 'brain-mri-tflite';
const MODEL = {
  id: MODEL_ID,
  label: 'Brain MRI · Local TFLite',
  modality: 'brain-mri',
  size: 224,
};
const CLASSES = {
  Glioma: 'Glioma Tumor',
  Meningioma: 'Meningioma Tumor',
  'No Tumor': 'No Tumor',
  Pituitary: 'Pituitary Tumor',
};
const fail = (status, message) => Object.assign(new Error(message), { status });

function normalizePrediction(data) {
  const scores = data?.probabilities;
  const values = scores && Object.values(scores);
  if (data?.success !== true || !scores || Object.keys(scores).length !== 4 ||
      !Object.keys(CLASSES).every(key => Object.hasOwn(scores, key)) ||
      !values.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100) ||
      Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) > .1 ||
      !Object.values(CLASSES).includes(data.label) || data.is_tumor !== (data.label !== 'No Tumor')) {
    throw fail(502, 'Brain MRI service returned an invalid classification.');
  }
  const findings = Object.entries(CLASSES)
    .map(([key, label]) => ({ label, confidence: scores[key] / 100 }))
    .sort((a, b) => b.confidence - a.confidence);
  const heatmap = data.explanation?.available && typeof data.heatmap_b64 === 'string' &&
    /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.heatmap_b64)
    ? data.heatmap_b64 : null;
  return {
    findings, model: MODEL_ID, model_label: MODEL.label, modality: MODEL.modality,
    prediction_label: data.label, is_tumor: data.is_tumor,
    gradcam_available: !!heatmap, heatmap_data_url: heatmap,
    analyzedAt: new Date(),
  };
}

async function analyzeBrainMri(bytes, filename, mimetype) {
  const configured = process.env.BRAIN_MRI_URL;
  if (!configured) throw fail(503, 'Configure BRAIN_MRI_URL and start the local Brain Health Monitor service.');
  let url;
  try { url = new URL(configured); } catch { throw fail(503, 'BRAIN_MRI_URL must be a valid service origin.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || url.protocol === 'http:' && local) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw fail(503, 'BRAIN_MRI_URL must be an HTTPS or local HTTP service origin.');
  }
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: mimetype }), filename);
  let response;
  try {
    response = await fetch(new URL('/api/predict', url), {
      method: 'POST', body: form, signal: AbortSignal.timeout(120_000), redirect: 'error',
    });
  } catch { throw fail(503, 'Brain MRI service is unavailable. Check that the local service is running.'); }
  if (!response.ok) {
    const inputErrors = {
      413: 'Brain MRI upload exceeds the service size limit.',
      415: 'Brain MRI supports JPEG, PNG, WebP, BMP, TIFF and single-frame MR DICOM images.',
      422: 'Invalid brain MRI image. Upload a supported single slice or single-frame MR DICOM.',
    };
    if (inputErrors[response.status]) throw fail(response.status, inputErrors[response.status]);
    throw fail(response.status === 429 || response.status === 503 ? 503 : 502, 'Brain MRI service could not analyze this image.');
  }
  let data;
  try { data = await response.json(); } catch { throw fail(502, 'Brain MRI service returned an invalid response.'); }
  return normalizePrediction(data);
}

module.exports = { MODEL_ID, MODEL, analyzeBrainMri };
