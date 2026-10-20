# Local intelligence worker

Python 3.12; loopback port 8090. This process loads SAM-Med3D-turbo and Chronos-2
locally. It receives identity only from the authenticated Express gateway.

Setup:

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
cp .env.example .env
# Set INTELLIGENCE_TOKEN to the same server-only value as backend/.env.
.venv/bin/python download_models.py
.venv/bin/python app.py
```

The tested Linux setup uses PyPI `torch==2.6.0` CUDA 12.4 wheels.
For exact Linux reproduction install `requirements.lock`; `requirements.txt` pins
direct dependencies. CPU-only PyTorch wheels are also compatible but inference
may take substantially longer. Slow downloads may need `UV_HTTP_TIMEOUT=1800`.
Model calls share a lock to bound GPU use. Local setup targets an RTX 4050 6GB.

Checkpoints are revision-pinned by `download_models.py`; it records licenses and
SHA-256 values in `.models/provenance.json`. Source code, not model weights or
patient records, belongs in Git. `INTELLIGENCE_MODEL_DIR` and
`INTELLIGENCE_DATA_DIR` optionally relocate private storage. Default `.runtime/`
contains actor-owned MRI files, predicted masks, vital sessions, and cached
forecasts. Its lifecycle and backup are controlled by the local operator.

Endpoints require `X-Intelligence-Key` and gateway-injected `X-Actor-Id`, except
`GET /health`. Browsers use `/api/intelligence` with clinician JWTs. Worker never
accepts patient-app tokens directly. Studies/sessions are scoped to creating
clinician account, without implied team sharing.

`pytest tests` checks geometry, ownership, upload validation, batch atomicity,
replay cutoffs and model adapter contracts. Synthetic model fixtures are used
only in isolated tests. Actual pretrained-model smoke checks are separate.

SAM output is a point-prompted candidate within a 192 mm field of view; anatomical
context mesh uses image intensities, not a second segmentation model. Demo seed
points disclose reference annotation use. Classification uses the separately
running Brain Health Monitor and remains limited to its four trained classes.

Chronos-2 predicts vital series and quantiles. It has not been calibrated as a
clinical deterioration model. NEWS2-style reference bands assume adult, room
air, alert state and SpO2 scale 1; omitted clinical observations are disclosed.
Simulated demo data cannot be described as a live device stream.
