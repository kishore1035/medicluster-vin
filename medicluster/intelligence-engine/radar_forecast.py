"""Local pretrained Chronos-2 multivariate quantile inference; no fallback forecasts.

API shape verified against amazon-science/chronos-forecasting Chronos2Pipeline:
list[np.ndarray(n_variates, history)] -> quantiles[n_variates, horizon, quantile].
"""
from datetime import datetime, timedelta, timezone
import numpy as np
from runtime import MODEL_DIR, MODEL_LOCK

MODEL_ID = 'amazon/chronos-2'
VITALS = ('heart_rate', 'spo2', 'systolic_bp', 'diastolic_bp', 'respiratory_rate', 'temperature')
_pipeline = None
_last_error = None


def _load_pipeline():
    global _pipeline, _last_error
    if _pipeline is None:
        path = MODEL_DIR / 'chronos-2'
        if not (path / 'config.json').is_file():
            _last_error = 'Local pretrained Chronos-2 checkpoint is not installed'
            raise RuntimeError(_last_error)
        try:
            from chronos import Chronos2Pipeline
            import torch
            _pipeline = Chronos2Pipeline.from_pretrained(str(path), device_map='cuda' if torch.cuda.is_available() else 'cpu', local_files_only=True)
            _last_error = None
        except Exception:
            _last_error = 'Local pretrained Chronos-2 model could not be loaded'
            raise
    return _pipeline


def status():
    return dict(model=MODEL_ID, ready=_pipeline is not None, installed=all((MODEL_DIR / 'chronos-2' / filename).is_file() for filename in ('config.json', 'model.safetensors')), error=_last_error)


def forecast(history, steps):
    context = np.asarray([[r[name] for r in history] for name in VITALS], dtype=np.float32)
    if context.shape[1] < 12 or not np.isfinite(context).all() or not 1 <= steps <= 24:
        raise ValueError('Forecast requires 12 finite complete observations and 1 to 24 steps')
    with MODEL_LOCK:
        pipeline = _load_pipeline()
        quantiles, _ = pipeline.predict_quantiles([context], prediction_length=steps, quantile_levels=[.1, .5, .9])
    values = quantiles[0].detach().cpu().numpy()
    if values.shape != (len(VITALS), steps, 3) or not np.isfinite(values).all():
        raise RuntimeError('Chronos-2 returned malformed or nonfinite quantiles')
    # Monotone rearrangement preserves the three predicted values if quantiles cross.
    crossing = bool(np.any(np.diff(values, axis=-1) < 0))
    values = np.sort(values, axis=-1)
    times = [datetime.fromisoformat(r['timestamp'].replace('Z', '+00:00')) for r in history]
    differences = [(b-a).total_seconds() for a, b in zip(times, times[1:])]
    regular = differences[0] > 0 and all(abs(delta-differences[0]) < .001 for delta in differences)
    interval = differences[0] / 60 if regular else None
    warnings = ['Research forecasts are model projections, not diagnoses or verified clinical outcomes. Quantiles are not calibrated clinical risk probabilities.']
    if not regular:
        warnings.append('Irregular observation spacing: forecast steps represent next readings; no minutes or future timestamps can be justified.')
    if crossing:
        warnings.append('Crossed model quantiles were reordered monotonically for display.')
    series = {name: dict(lower=values[i, :, 0].tolist(), median=values[i, :, 1].tolist(), upper=values[i, :, 2].tolist()) for i, name in enumerate(VITALS)}
    # Threshold statements describe medians only, with explicit units/step and no disease claim.
    thresholds = dict(heart_rate=(40, 130), spo2=(92, None), systolic_bp=(90, 220), respiratory_rate=(8, 24), temperature=(35, 39))
    for name, (low, high) in thresholds.items():
        for index, value in enumerate(series[name]['median']):
            if value <= low or (high is not None and value > high):
                warnings.append(f'Projected reference-threshold crossing: {name} median {value:.1f} at step {index+1}; this is not a diagnosis.')
                break
    return dict(model=MODEL_ID, steps=steps, intervalMinutes=interval, series=series, warnings=warnings, generatedAt=datetime.now(timezone.utc).isoformat(), quantiles=[.1, .5, .9], timestamps=[(times[-1] + timedelta(seconds=differences[0]*i)).isoformat() for i in range(1, steps+1)] if regular else None, provenance=dict(repository='https://huggingface.co/amazon/chronos-2', license='Apache-2.0', mode='local pretrained multivariate quantile forecast', contextReadings=len(history)))
