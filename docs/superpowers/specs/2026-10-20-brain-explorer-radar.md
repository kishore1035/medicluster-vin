# Brain Explorer and Deterioration Radar

## Authorized outcome
Implement two research/demo modules inside existing MediCluster: interactive 3D tumor segmentation and longitudinal measurements, plus live vital-sign forecasting and replay. Retain the existing four-class 2D brain classifier. User approved a promptable general segmentation model; do not claim automatic recognition or validated coverage of every brain tumor. Preserve existing uncommitted work and existing application routes.

## Execution decisions
Use the current workspace on feature branch `feat/brain-explorer-radar`; no worktree was requested. Use disjoint worker modules and frontend files for parallel implementation. Model services run locally in a separate Python 3.12 environment, since the existing ML environment is Python 3.14. Downloads and inference are authorized by “okay do it”; no hosted model API or paid service is required. Demo vitals are visibly labelled simulated; file/manual vitals support real measurements. No device-vendor integration is implied.

## Shared architecture and contracts
New worker: `medicluster/intelligence-engine`, Flask on loopback port 8090. Node gateway `/api/intelligence` requires existing clinician JWT. Gateway adds `X-Intelligence-Key` and authenticated `X-Actor-Id`; worker rejects missing/incorrect internal key. Worker stores resources under ignored `.runtime/` and model weights under ignored `.models/`; patient datasets/models never enter git. Resources belong to actor, with 404 for cross-actor access. Frontend API clients send existing `medicluster.token`. Persistent metadata, volumes, masks and sessions survive service restart. APIs return JSON errors `{error: string}` with proper status. The worker health route is public but returns no patient data or local paths.

Runtime helpers in `runtime.py`: `ApiError(status, message)`; `actor()`; `create_record(kind, metadata) -> (Path, dict)` (adds id, owner, createdAt); `owned_record(kind, id) -> (Path, dict)`; `save_record(directory, metadata)` atomic JSON write; `root_for(kind)`; `MODEL_DIR: Path`; `MODEL_LOCK: threading.RLock`. Record IDs are uuid hex, validated before filesystem access. Flask app enforces internal authentication before blueprint routes. Blueprint modules export `bp` and optional `status()`.

## Brain module
Use pretrained SAM-Med3D-turbo checkpoint from the official project's referenced Hugging Face `blueyo0/SAM-Med3D` repository. One or more positive/negative user-selected 3D points guide a candidate binary lesion mask. Never use a reference mask as prediction or as an inference input. An optional demo seed may derive from a reference annotation only when explicitly disclosed as such. Classification remains a separate four-class output through existing Brain Health Monitor. Segmentation provides no histological classification.

Accept bounded single-channel 3D NIfTI (`.nii`, `.nii.gz`) with finite, invertible geometry and known physical units. Canonicalize to RAS; preserve physical geometry when mapping prompts and masks through model crop/resampling. Cap volume at 32 million voxels and request at 128 MiB. Normalize using the upstream positive-voxel policy. Export predicted NIfTI with correct geometry. Physical volume equals foreground voxel count times physical voxel volume (affine determinant, converted to mm³) / 1000. Mesh vertices use physical world coordinates. Label the intensity-derived brain envelope as an anatomical context surface, not model-segmented anatomy. Bound meshes for browser memory.

API (worker paths, gateway prefixes `/api/intelligence`):
- `GET /brain/demo` -> `{cases:[{id,title,source}]}` from an allowlist of local UCSF MRI files, no filesystem paths in response.
- `POST /brain/demo` JSON `{caseId,patientId?,studyDate?}` -> study metadata; copies MRI only. May include `suggestedPoint:{x,y,z,label:1}` explicitly marked reference-derived.
- `POST /brain/studies` multipart `file`, `patientId`, `studyDate`, optional `name` -> study metadata.
- `GET /brain/studies?patientId=...` -> `{studies:[metadata]}` owned resources only.
- `GET /brain/studies/:id` -> metadata.
- `GET /brain/studies/:id/slice?axis=axial|coronal|sagittal&index=n&mask=0|1` -> PNG. Axial display: `volume[:,:,z].T[::-1]`; click maps x=u*(shape[0]-1), y=(1-v)*(shape[1]-1), z=index.
- `GET /brain/studies/:id/mesh?layer=brain|lesion` -> `{positions:[number],indices:[integer],layer,coordinateSystem:"RAS-mm"}`.
- `POST /brain/studies/:id/segment` JSON `{points:[{x,y,z,label:0|1}]}` -> updated metadata including segmentation.
- `GET /brain/studies/:id/mask` -> predicted NIfTI.
- `POST /brain/studies/:id/classify` JSON `{axis,index}`: gateway fetches rendered slice from worker and submits it to existing BHM `/api/predict`; returns same four-class classification adapter output. This is slice classification only.
- `GET /brain/studies/:id/compare/:otherId` -> volume delta for owned, segmented studies with identical patientId and distinct valid study dates; no spatial registration or treatment-response claim.

Study metadata: `{id,patientId,name,studyDate,shape:[x,y,z],spacingMm:[x,y,z],voxelVolumeMm3,createdAt,source,segmentation:null|{model,volumeMl,voxelCount,points,createdAt,prompted:true}}`. Include `modelStatus` where useful; never return owner/internal paths. UI `/brain-explorer`: real 3D rotatable meshes, context opacity, three orthogonal slices, axial point prompting, positive/negative controls, segment action, masks, real volume metrics, study selection and comparison. Reference annotations remain clearly separate. Model unavailable/error stays visible instead of fake mesh/mask fallback.

## Radar module
Use pretrained `amazon/chronos-2` for multivariate quantile forecasts, not disease diagnosis or a fabricated mortality probability. Store ordered scalar readings, source, observation timestamps and stable session identifiers. Provide explicit simulated stable/deteriorating/recovering scenarios; demo advances only through requested steps. Each demo step represents 5 minutes. Start sessions with at least 16 past measurements so first forecast can run. Manual/csv source must never receive simulated readings.

- `GET /radar/demo` -> `{scenarios:[{id,title,description}]}`.
- `POST /radar/sessions` JSON `{patientId,source:"demo"|"manual",scenario?}` -> session state. `scenario` stable/deteriorating/recovering.
- `GET /radar/sessions?patientId=...` -> `{sessions:[session summary]}`.
- `GET /radar/sessions/:id?cursor=n` -> state computed from first n readings only; cursor omitted means all observations.
- `POST /radar/sessions/:id/step` -> append one demo reading and return state; reject manual sessions.
- `POST /radar/sessions/:id/readings` JSON `{readings:[{timestamp,heart_rate,spo2,systolic_bp,diastolic_bp,respiratory_rate,temperature}]}` -> state. Require increasing unique timestamps, finite values and physiologically broad bounds; validate complete batch before writing.
- `POST /radar/sessions/:id/forecast` JSON `{cursor?:number,steps?:number}` -> state plus forecast based only on prefix. Default 6 steps, cap 24, require at least 12 readings. Cache by session revision/cursor/model/horizon. Return quantiles 0.1/0.5/0.9 and model provenance.
- `GET /radar/sessions/:id/export` -> JSON for owned session.

State: `{id,patientId,source,scenario,readings:[...],cursor,totalReadings,score:{value,tier,drivers:[{name,value,points,reason}],assumptions:[...]},forecast:null|{model,steps,intervalMinutes,series:{heart_rate:{median:[],lower:[],upper:[]},spo2:...,systolic_bp:...,diastolic_bp:...,respiratory_rate:...,temperature:...},warnings:[...],generatedAt},createdAt}`. Score is explicitly a reference early-warning score with disclosed adult/room-air/alert assumptions, distinct from learned forecasting. Drivers are scoring contributors, not falsely attributed model SHAP explanations. Forecasts have aligned timestamps/horizon and never use post-cursor readings. Irregular sample spacing must be disclosed; forecast steps are next readings if minutes cannot be justified. Failed model inference produces a clear unavailable state, not linear/random output labelled Chronos.

UI `/deterioration-radar`: source badge, scenario selector, play/pause and speed, live vital tiles, forecast fan chart, current score and contributors, replay scrubber and session export. Poll/step stream is labelled as demo; manual ingestion API supports external senders without pretending a device is attached. Highlight forecasted reference-threshold crossings as model projections, not verified clinical outcomes.

## Verification
Failing tests first for geometry, prompt mapping and empty masks; cross-owner protection; complete-batch readings validation; future leakage through replay; quantile ordering; volume comparison eligibility; unauthenticated gateway rejection and binary proxy responses. Real pretrained inference on a local MRI with a human/reference-disclosed prompt and Chronos inference on recorded-prefix/demo data. Full backend/frontend test suites, new worker tests, production frontend build/typecheck, desktop/mobile browser actions. Clinical accuracy across all tumor types is not established by successful integration. Preserve model/license/data provenance.

## Primary model sources
- https://github.com/uni-medical/SAM-Med3D (Apache-2.0, promptable 3D segmentation)
- https://huggingface.co/blueyo0/SAM-Med3D
- https://huggingface.co/amazon/chronos-2 (Apache-2.0, 120M multivariate time-series forecasting)
