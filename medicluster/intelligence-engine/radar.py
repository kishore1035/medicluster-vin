"""Persisted actor-owned vital sessions and a disclosed reference warning score."""
from datetime import datetime, timedelta, timezone
import math
import threading
import weakref
from contextlib import contextmanager

from flask import Blueprint, jsonify, request
from runtime import ApiError, create_record, owned_record, save_record, root_for
import radar_forecast

bp = Blueprint('radar', __name__, url_prefix='/radar')
_LOCKS_GUARD = threading.Lock()
# Waiting/active requests hold strong references; idle locks disappear automatically.
_SESSION_LOCKS = weakref.WeakValueDictionary()


@contextmanager
def session_record(session_id):
    # Resolve ownership before a caller can allocate or wait on any session lock.
    owned_record('radar', session_id)
    with _LOCKS_GUARD:
        lock = _SESSION_LOCKS.get(session_id)
        if lock is None:
            lock = threading.RLock()
            _SESSION_LOCKS[session_id] = lock
    with lock:
        # Read again after waiting, so every mutation uses the latest persisted revision.
        yield owned_record('radar', session_id)

VITALS = ('heart_rate', 'spo2', 'systolic_bp', 'diastolic_bp', 'respiratory_rate', 'temperature')
BOUNDS = dict(heart_rate=(15, 300), spo2=(30, 100), systolic_bp=(40, 300), diastolic_bp=(20, 200), respiratory_rate=(2, 80), temperature=(25, 45))
SCENARIOS = [dict(id='stable', title='Stable', description='Simulated steady observations; each requested step represents five minutes.'), dict(id='deteriorating', title='Deteriorating', description='Simulated worsening vital signs, not a diagnosis.'), dict(id='recovering', title='Recovering', description='Simulated recovery of vital signs, not a treatment prediction.')]
ASSUMPTIONS = ['Research reference early-warning score inspired by NEWS2; not a validated clinical assessment.', 'Assumes an adult, room air (no supplemental oxygen), SpO2 scale 1 and alert consciousness; these are not measured.', 'Diastolic pressure does not contribute. Drivers are score contributors, not model explanations.', 'Reference: https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/']


def now():
    return datetime.now(timezone.utc).isoformat()


def parse_time(value):
    try:
        if not isinstance(value, str):
            raise ValueError()
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError()
        return parsed.astimezone(timezone.utc)
    except (ValueError, TypeError, OverflowError):
        raise ApiError(400, 'timestamp must be an ISO-8601 date and time with timezone')


def validate_readings(batch, existing):
    if not isinstance(batch, list) or not 1 <= len(batch) <= 10000:
        raise ApiError(400, 'readings must contain 1 to 10000 complete observations')
    previous = parse_time(existing[-1]['timestamp']) if existing else None
    validated = []
    for entry in batch:
        if not isinstance(entry, dict):
            raise ApiError(400, 'Each reading must be an object')
        timestamp = parse_time(entry.get('timestamp'))
        if previous is not None and timestamp <= previous:
            raise ApiError(400, 'Reading timestamps must increase strictly after all stored observations')
        normalized = {'timestamp': timestamp.isoformat()}
        for name in VITALS:
            value = entry.get(name)
            low, high = BOUNDS[name]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
                raise ApiError(400, f'{name} must be finite and within {low}–{high}')
            normalized[name] = float(value)
        if normalized['diastolic_bp'] >= normalized['systolic_bp']:
            raise ApiError(400, 'diastolic_bp must be below systolic_bp')
        validated.append(normalized)
        previous = timestamp
    return validated


def reference_score(history):
    if not history:
        return dict(value=None, tier='unavailable', drivers=[], assumptions=ASSUMPTIONS)
    r = history[-1]
    rules = {
        'respiratory_rate': lambda x: 3 if x <= 8 or x >= 25 else 2 if x > 20 else 1 if x < 12 else 0,
        'spo2': lambda x: 3 if x < 92 else 2 if x < 94 else 1 if x < 96 else 0,
        'systolic_bp': lambda x: 3 if x <= 90 or x >= 220 else 2 if x <= 100 else 1 if x <= 110 else 0,
        'heart_rate': lambda x: 3 if x <= 40 or x > 130 else 2 if x > 110 else 1 if x <= 50 or x > 90 else 0,
        'temperature': lambda x: 3 if x <= 35 else 2 if x > 39 else 1 if x <= 36 or x > 38 else 0,
    }
    drivers = [dict(name=name, value=r[name], points=rule(r[name]), reason='Reference physiological scoring band; assumes adult, room air and alert consciousness') for name, rule in rules.items()]
    value = sum(d['points'] for d in drivers)
    tier = 'high' if value >= 7 else 'medium' if value >= 5 else 'single-parameter' if any(d['points'] == 3 for d in drivers) else 'low'
    return dict(value=value, tier=tier, drivers=drivers, assumptions=ASSUMPTIONS)


def demo_reading(scenario, index, start):
    # Bounded, deterministic and explicitly simulated; no RNG or unattended progression.
    phase = min(index / 48, 1)
    severity = phase if scenario == 'deteriorating' else 1 - phase if scenario == 'recovering' else 0
    wave = math.sin(index * 0.7)
    return dict(timestamp=(start + timedelta(minutes=5*index)).isoformat(), heart_rate=round(74 + 65*severity + 2*wave, 1), spo2=round(98 - 10*severity + .2*wave, 1), systolic_bp=round(122 - 38*severity + wave, 1), diastolic_bp=round(77 - 23*severity + wave, 1), respiratory_rate=round(16 + 14*severity + .3*wave, 1), temperature=round(36.8 + 2.5*severity + .05*wave, 1))


def integer(value, label, low, high):
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ApiError(400, f'{label} must be an integer between {low} and {high}')
    return value


def session_state(record, cursor=None, forecast=None):
    total = len(record['readings'])
    cursor = total if cursor is None else integer(cursor, 'cursor', 0, total)
    prefix = record['readings'][:cursor]
    return dict(id=record['id'], patientId=record['patientId'], source=record['source'], scenario=record.get('scenario'), readings=prefix, cursor=cursor, totalReadings=total, score=reference_score(prefix), forecast=forecast, createdAt=record['createdAt'])


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, 'A JSON object is required')
    return data


@bp.get('/demo')
def demo():
    return jsonify(scenarios=SCENARIOS)


@bp.post('/sessions')
def create_session():
    data = body()
    source = data.get('source')
    if source not in ('demo', 'manual'):
        raise ApiError(400, 'source must be demo or manual')
    patient = data.get('patientId', '')
    if not isinstance(patient, str) or len(patient) > 200:
        raise ApiError(400, 'patientId must be a string of at most 200 characters')
    scenario = data.get('scenario', 'stable') if source == 'demo' else None
    if source == 'demo' and scenario not in ('stable', 'deteriorating', 'recovering'):
        raise ApiError(400, 'Unknown simulated scenario')
    start = datetime.now(timezone.utc) - timedelta(minutes=75)
    metadata = dict(patientId=patient, source=source, scenario=scenario, readings=[demo_reading(scenario, i, start) for i in range(16)] if source == 'demo' else [], revision=0, forecasts={})
    _, record = create_record('radar', metadata)
    return jsonify(session_state(record)), 201


@bp.get('/sessions')
def list_sessions():
    result = []
    for directory in root_for('radar').iterdir():
        if not directory.is_dir():
            continue
        try:
            _, record = owned_record('radar', directory.name)
        except ApiError:
            continue
        if request.args.get('patientId') is not None and record['patientId'] != request.args['patientId']:
            continue
        state = session_state(record)
        state.pop('readings')
        result.append(state)
    return jsonify(sessions=sorted(result, key=lambda s: s['createdAt'], reverse=True))


@bp.get('/sessions/<session_id>')
def get_session(session_id):
    _, record = owned_record('radar', session_id)
    value = request.args.get('cursor')
    if value is not None:
        try:
            value = int(value)
        except (TypeError, ValueError):
            raise ApiError(400, 'cursor must be an integer')
    return jsonify(session_state(record, value))


@bp.post('/sessions/<session_id>/step')
def step(session_id):
    with session_record(session_id) as (directory, record):
        if record['source'] != 'demo':
            raise ApiError(400, 'Only simulated demo sessions may be stepped')
        reading = demo_reading(record['scenario'], len(record['readings']), parse_time(record['readings'][0]['timestamp']))
        record['readings'].extend(validate_readings([reading], record['readings']))
        record['revision'] += 1
        record['forecasts'] = {}
        save_record(directory, record)
        return jsonify(session_state(record))


@bp.post('/sessions/<session_id>/readings')
def append_readings(session_id):
    data = body()
    with session_record(session_id) as (directory, record):
        if record['source'] != 'manual':
            raise ApiError(400, 'Manual observations require a manual session')
        batch = validate_readings(data.get('readings'), record['readings'])
        record['readings'].extend(batch)
        record['revision'] += 1
        record['forecasts'] = {}
        save_record(directory, record)
        return jsonify(session_state(record))


@bp.post('/sessions/<session_id>/forecast')
def forecast(session_id):
    data = body()
    # Serialize this session only; unrelated patients can ingest readings during inference.
    with session_record(session_id) as (directory, record):
        steps = integer(data.get('steps', 6), 'steps', 1, 24)
        state = session_state(record, data.get('cursor'))
        if state['cursor'] < 12:
            raise ApiError(400, 'At least 12 prefix observations are required for forecasting')
        key = f"{record['revision']}:{state['cursor']}:{radar_forecast.MODEL_ID}:{steps}"
        cache = record.setdefault('forecasts', {})
        if key not in cache:
            try:
                cache[key] = radar_forecast.forecast(state['readings'], steps)
            except Exception as exc:
                raise ApiError(503, 'Chronos-2 forecast unavailable; check local model readiness or retry') from exc
            while len(cache) > 8:
                del cache[next(iter(cache))]
            save_record(directory, record)
        return jsonify(session_state(record, state['cursor'], cache[key]))


@bp.get('/sessions/<session_id>/export')
def export(session_id):
    _, record = owned_record('radar', session_id)
    exported = session_state(record)
    exported['generatedForecasts'] = [
        dict(revision=record['revision'], cursor=int(key.split(':')[1]), forecast=value)
        for key, value in record.get('forecasts', {}).items()
    ]
    response = jsonify(exported)
    response.headers['Content-Disposition'] = f'attachment; filename="radar-{record["id"]}.json"'
    return response


def status():
    return radar_forecast.status()
