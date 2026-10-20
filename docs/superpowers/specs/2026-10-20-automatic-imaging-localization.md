# Automatic finding localization in Imaging

User intent: automatically analyze uploaded scans and show labelled boxes directly on the image, matching supplied MediCluster v4 reference. User clarified live means uploaded scans, not video. Implement within existing imaging worker/gateway/page. No fixed/example boxes or inference from classification scores.

Chest default model becomes `vindr-cxr-yolov8s`, a pretrained finding detector. Existing DenseNet/ResNet models remain selectable classifiers; Brain MRI retains its existing classifier, with no invented boxes. Upload analysis is automatic for selected model; saved analyzed scans reuse persisted results. Model changes explicitly request a fresh analysis. Prevent duplicate requests and stale responses from overwriting a newer selected model. Manual retry remains after failures.

## Additive worker/gateway contract
- Existing `GET /models` includes detector `{id:"vindr-cxr-yolov8s",label:"YOLOv8s · Chest finding detection",kind:"detector",size:1024}` and defaults to this ID.
- Existing `POST /analyze-image` accepts detector model ID. Returns existing model/model_label/findings plus `modality:"chest-xray"` and `localization` below.
- `localization = {model:"vindr-cxr-yolov8s", width: originalPixelWidth, height: originalPixelHeight, threshold:0.25, boxes:[{id,label,confidence,x1,y1,x2,y2}], source:"pretrained VinDr-CXR detector", reviewOnly:true}`. Box coordinates in original decoded image pixels; finite bounded xyxy, x2>x1/y2>y1. Finding scores are per-class maximum of retained detections; no detections => findings/boxes empty, not a normal diagnosis.
- Persist localization with analysis. Empty successful result still marked complete.
- Add `GET /api/media/preview/:fileId`: image/png preview of decoded DICOM; frontend can use this for DICOM viewer and thumbnails. Browser images keep existing file URL. PNG aspect matches original pixels; boxes remain original-image coordinates. Worker backs this via `POST /preview-image` using existing base64 body.
- Detector failure is visible JSON503; never substitute Grad-CAM or static boxes. Classifier results can offer existing heatmap action, with no detector boxes claimed. Do not call classifier Grad-CAM endpoint for YOLO.

## Frontend (owned separately)
Files: ImagingPage.jsx; new components/ImagingDetectionOverlay.jsx; utils/imagingModels.js; tests/imagingModels.test.js; optional new UI helper/test files. Root owns backend/Python, package files and dependencies.
- Retain reference flat paper/ink two-column viewer/findings, orange labelled rectangles over actual image. SVG original-pixel viewBox with preserveAspectRatio matches object-contain letterboxing at every viewport. Click finding/box highlights region; optional visibility toggle.
- Auto-analyze on successful upload, or selection of unanalyzed saved image. Deduplicate in-flight operations and stale updates; analyzed saved scans retain own model. On explicit selected-model change rerun current image with new model once. Loading models cannot overwrite explicit selection.
- Separate detecting, completed with no detection, failed/retry states. While new model runs, do not present old boxes as current output. Never loop retries automatically.
- Detector confidence label uses localization.threshold (0.25), independent of DenseNet operating-point0.5. Detector summary uses `Detected finding`/`No regions detected`, avoiding clear/normal diagnostic claims.
- Brain auto-analysis may run on upload under explicitly selected Brain MRI modality; no chest detector boxes on MRI classification.
- DICOM uses preview route and can display boxes; don't render blank placeholder with fake regions.
- Meaningful helper tests first; browser real-model/mobile/source-coordinate checks by root.

## Validation
Model provenance/revision/license and SHA recorded; genuine pretrained inference on real local chest samples; no fake model output. Backend persistence/reload; auto upload triggers exactly once; empty results; model change and scan switch; boxes remain aligned under object-contain/mobile; model errors permit deliberate retry. Existing classifier and MRI workflows remain available. Include radiologist/record actions only where existing authorized backend routes support them; do not create decorative buttons.
