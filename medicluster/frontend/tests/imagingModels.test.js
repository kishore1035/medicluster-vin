import test from 'node:test';
import assert from 'node:assert/strict';
import * as imaging from '../src/utils/imagingModels.js';
const { imagingSummary, acceptsImagingFile } = imaging;

test('newly uploaded records await analysis while completed empty findings remain valid', () => {
  assert.equal(typeof imaging.hasImagingAnalysis, 'function');
  assert.equal(imaging.hasImagingAnalysis({ findings: [] }), false);
  assert.equal(imaging.hasImagingAnalysis(undefined), false);
  assert.equal(imaging.hasImagingAnalysis({ model: 'claude-vision', findings: [] }), true);
  assert.equal(imaging.hasImagingAnalysis({ model: 'brain-mri-tflite', findings: [{ label: 'No Tumor', confidence: .9 }] }), true);
});

test('No Tumor stays a brain classification, never a likely pathology', () => {
  const summary = imagingSummary({
    modality: 'brain-mri', model: 'brain-mri-tflite', prediction_label: 'No Tumor', is_tumor: false,
    findings: [{ label: 'No Tumor', confidence: .92 }, { label: 'Glioma Tumor', confidence: .08 }],
  });
  assert.equal(summary.caption, 'Top model class');
  assert.equal(summary.label, 'No Tumor');
  assert.equal(summary.isBrain, true);
  assert.equal(summary.model, 'brain-mri-tflite');
  assert.equal(summary.scanType, 'brain-mri');
});

test('brain class stays visible even when no score crosses chest threshold', () => {
  const summary = imagingSummary({ modality: 'brain-mri', findings: [
    { label: 'Meningioma Tumor', confidence: .31 }, { label: 'Glioma Tumor', confidence: .39 },
  ] });
  assert.equal(summary.label, 'Glioma Tumor');
  assert.equal(summary.caption, 'Top model class');
});

test('existing chest findings retain threshold behavior', () => {
  assert.equal(imagingSummary({ findings: [{ label: 'Pneumonia', confidence: .8 }] }).caption, 'Likely finding');
  assert.equal(imagingSummary({ findings: [{ label: 'Pneumonia', confidence: .3 }] }).caption, 'No finding above threshold');
});

test('saved studies keep their own model when selected or re-analyzed', () => {
  const chest = imagingSummary({ model: 'resnet50-res512-all', findings: [] });
  assert.equal(chest.model, 'resnet50-res512-all');
  assert.equal(chest.scanType, 'chest-xray');
  const brain = imagingSummary({ model: 'brain-mri-tflite', findings: [] });
  assert.equal(brain.model, 'brain-mri-tflite');
  assert.equal(brain.scanType, 'brain-mri');
  assert.equal(imagingSummary().model, 'densenet121-res224-all');
});

test('MRI upload accepts supported slices and DICOM but rejects GIF and unrelated files', () => {
  for (const file of [
    { name: 'brain.png', type: 'image/png' },
    { name: 'brain.tiff', type: 'image/tiff' },
    { name: 'brain.DCM', type: 'application/octet-stream' },
  ]) assert.equal(acceptsImagingFile(file, 'brain-mri'), true);
  for (const file of [
    { name: 'brain.gif', type: 'image/gif' },
    { name: 'notes.pdf', type: 'application/pdf' },
    { name: 'brain.svg', type: 'image/svg+xml' },
  ]) assert.equal(acceptsImagingFile(file, 'brain-mri'), false);
  assert.equal(acceptsImagingFile({ name: 'scan.gif', type: 'image/gif' }, 'chest-xray'), true);
});

test('detector summaries distinguish regions from a normal diagnosis and use detector threshold',()=>{
 const localization={model:'vindr-cxr-yolov8s',width:100,height:200,threshold:.25,boxes:[]};
 const empty=imagingSummary({model:localization.model,findings:[],localization});
 assert.equal(empty.isDetector,true);assert.equal(empty.label,'No regions detected');assert.equal(empty.threshold,.25);
 const found=imagingSummary({model:localization.model,findings:[{label:'Nodule/Mass',confidence:.32}],localization:{...localization,boxes:[{id:0,label:'Nodule/Mass',confidence:.32,x1:10,y1:20,x2:40,y2:80}]}});
 assert.equal(found.caption,'Detected finding');assert.equal(found.label,'Nodule/Mass');
});
test('overlay boxes preserve original pixel coordinates and reject malformed regions',()=>{
 assert.equal(typeof imaging.detectionBoxes,'function');
 const box={id:1,label:'Opacity',confidence:.8,x1:10,y1:20,x2:80,y2:120};
 assert.deepEqual(imaging.detectionBoxes({width:100,height:200,boxes:[box,{...box,x2:Infinity},{...box,x1:90},{...box,y2:201}]}),[box]);
});
