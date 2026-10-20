# Brain Explorer and Deterioration Radar Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and disjoint parallel-agent tasks for the independent modules. Track outcomes here.

**Goal:** Deliver the two approved research features with real pretrained inference and functional browser workflows.
**Architecture:** Clinician-authenticated Node gateway to a private Python 3.12 worker, with separate brain/radar blueprints and React pages.
**Tech Stack:** Flask, PyTorch, MedIM/SAM-Med3D, Chronos-2, nibabel/scipy/skimage, React/Vite/Three.js/Recharts.
**Spec:** `docs/superpowers/specs/2026-10-20-brain-explorer-radar.md`

## Global constraints
Preserve existing workspace changes and all current routes. Model weights, datasets, generated artifacts and virtual environments stay ignored. No paid API. Preserve actor ownership, physical image geometry and replay cutoff. Display simulation and research limits accurately. Do not infer tumor histology from segmentation or clinical outcome probability from generic forecasts.

## Review focus
- Anisotropic/flipped-affine images: physical volume and point/mask locations remain correct.
- Cross-actor IDs and path traversal: no patient file disclosure.
- Replay scrubbed backward: future observations never enter forecast or score.
- Model/download/GPU failure: visible recoverable errors, no fake model outputs.
- Different-patient or undated studies: no misleading longitudinal comparison.

## Task 1: Shared worker/runtime and model setup (root)
- [x] Add authentication/ownership/atomic metadata tests.
- [x] Implement runtime helpers and Flask application contract from spec.
- [x] Create isolated Python 3.12 environment, pinned dependency manifests, model downloader and provenance record.
- [x] Verify tests and downloaded checkpoint loading. Keep existing Python ML environment unchanged.

## Task 2: Brain worker (parallel domain)
Files: intelligence-engine/brain.py, brain_geometry.py, brain_model.py, tests/test_brain*.py.
Interfaces: runtime helpers and all /brain endpoints in spec.
- [x] Add geometry, boundary and ownership tests.
- [x] Implement NIfTI ingestion, slices, bounded meshes, real physical volumes and comparisons.
- [x] Implement point-guided pretrained SAM inference, persistent candidate masks and exports.
- [x] Verify tests; run real MRI inference after root completes dependencies/checkpoint acquisition.

## Task 3: Radar worker (parallel domain)
Files: intelligence-engine/radar.py, radar_forecast.py, tests/test_radar*.py.
Interfaces: runtime helpers and all /radar endpoints/state schema in spec.
- [x] Add replay-prefix, validation, reference-score and forecast-shape tests.
- [x] Implement persistent sessions, labelled demo progression, manual ingestion, replay and export.
- [x] Implement real Chronos-2 multivariate inference, quantiles, caching and threshold projections.
- [x] Verify tests; run real pretrained forecast after root completes model acquisition.

## Task 4: Frontend modules (parallel domain)
Files: frontend/src/pages/BrainExplorerPage.jsx, DeteriorationRadarPage.jsx; components/intelligence/*; api/intelligenceClient.js; utils/intelligence*.js; tests/intelligence*.test.js.
Interfaces: gateway mirrors worker endpoints under /api/intelligence; bearer token comes from existing getToken().
- [x] Write behavioral helper tests before implementation.
- [x] Build Three.js mesh viewer, slice point controls, studies/segmentation/compare/export workflows.
- [x] Build live/demo/manual radar, Recharts quantile chart, scoring evidence and replay controls.
- [x] Validate build and responsive UI; root wires routes/navigation.

## Task 5: Gateway and integration (root)
- [x] Add gateway authentication, safe forwarding and binary response tests.
- [x] Implement intelligenceRoutes and gateway-only 2D classifier bridge.
- [x] Wire clinician routes/navigation, runtime settings, launch instructions and model provenance.
- [x] Run full backend/frontend/worker tests and build/typecheck.
- [x] Run live model and browser workflows at desktop/mobile sizes; clean temporary patient resources.
- [x] Request whole-feature review; fix material findings and reverify affected behavior.

## Progress
Ruling: user authorized implementation of the offered model approach. Continue within scope without repeating authorization prompts. Existing source remains in place on feature branch to preserve the user's current app and uncommitted MRI work.

2026-10-20 integration: authenticated worker/gateway and routes implemented. Backend69/69 and frontend45/45 pass; frontend build/typecheck pass. Lightweight worker25 tests pass, one remaining torch-based test awaits dependency installation. Desktop/mobile real-service flows pass for MRI geometry/slices and radar replay. Review fixes: shared demo identity cannot qualify for comparison; forecasts use per-session locks; blank UI patient defaults and local timestamps corrected. Pretrained checkpoint downloads and full GPU inference checks remain pending.

Both revision-pinned checkpoints downloaded and SHA-256 recorded. Real-service browser checks now cover 3D context rendering, classifier bridge, missing-model503/no fabricated mask, manual CSV/import/export, strict replay and responsive layouts.25 worker non-torch tests pass. GPU dependency source switched after slow download timeouts; full model smoke remains pending.

Final verification completed:
- Backend 69 tests, frontend 49 tests, worker 27 tests pass (145 total).
- Frontend typecheck and production build pass; existing bundle-size advisory remains.
- PyTorch 2.6 CUDA 12.4 verified on RTX 4050 6GB; both models load locally.
- Actual SAM-Med3D-turbo: 26,099 predicted foreground voxels / 26.099 mL on UCSF0350, cold request5.8s. Duplicate scan segmentation compares at0mL change.
- Actual Chronos-2: six-vital6-step ordered quantiles from strict12-reading prefix, cold request2.8s.
- Downloaded NIfTI shape, units, affine determinant and foreground volume independently verified.
- Desktop/mobile browser flows pass for real mask export and six model quantile charts with no JavaScript errors or horizontal overflow.
- Independent full-feature review found no further material defects; tested direct requirements and full Linux lock now provided.
- Demo/research labels remain explicit. Results establish integration function, not clinical accuracy.
