export const CHEST_DETECTOR_MODEL_ID = 'vindr-cxr-yolov8s';
export const BRAIN_MRI_MODEL_ID = 'brain-mri-tflite';
export const BRAIN_CLASSES = ['Glioma Tumor', 'Meningioma Tumor', 'No Tumor', 'Pituitary Tumor'];

export function hasImagingAnalysis(analysis) {
  return typeof analysis?.model === 'string' && !!analysis.model && Array.isArray(analysis.findings);
}

export function imagingSummary(analysis) {
  const findings = analysis?.findings || [];
  const top = findings.reduce((best, finding) => !best || finding.confidence > best.confidence ? finding : best, null);
  const isBrain = analysis?.modality === 'brain-mri' || analysis?.model === BRAIN_MRI_MODEL_ID;
  const isDetector = !isBrain && (analysis?.model === CHEST_DETECTOR_MODEL_ID || !!analysis?.localization);
  const threshold = isDetector ? analysis?.localization?.threshold ?? .25 : .5;
  return {
    isBrain, isDetector, threshold, top,
    model: analysis?.model || (isBrain ? BRAIN_MRI_MODEL_ID : 'densenet121-res224-all'),
    scanType: isBrain ? 'brain-mri' : 'chest-xray',
    label: isBrain ? analysis.prediction_label || top?.label || 'No classification' : isDetector ? top?.label || 'No regions detected' : top?.label || 'Clear',
    caption: isBrain ? 'Top model class' : isDetector ? top ? 'Detected finding' : 'Detection complete' : top && top.confidence >= .5 ? 'Likely finding' : 'No finding above threshold',
  };
}

export function acceptsImagingFile(file, modality) {
  if (/\.(dcm|dicom)$/i.test(file.name)) return true;
  const types = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff'];
  if (modality !== 'brain-mri') types.push('image/gif');
  return types.includes(file.type);
}

export function detectionBoxes(localization) {
 if(!Number.isFinite(localization?.width)||!Number.isFinite(localization?.height)||localization.width<=0||localization.height<=0)return [];
 return (localization.boxes||[]).filter(box=>[box.x1,box.y1,box.x2,box.y2,box.confidence].every(Number.isFinite)&&box.x1>=0&&box.y1>=0&&box.x2>box.x1&&box.y2>box.y1&&box.x2<=localization.width&&box.y2<=localization.height);
}
