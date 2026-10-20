"""Private, actor-owned research artifacts and shared model serialization."""
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from flask import g

BASE = Path(__file__).resolve().parent
MODEL_DIR = Path(os.environ.get('INTELLIGENCE_MODEL_DIR', BASE / '.models')).resolve()
MODEL_LOCK = threading.RLock()

class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status, self.message = status, message

def actor():
    return g.actor

def root_for(kind):
    if kind not in ('brain', 'radar'):
        raise ValueError('Invalid artifact kind')
    root = Path(os.environ.get('INTELLIGENCE_DATA_DIR', BASE / '.runtime')).resolve() / kind
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    return root

def save_record(directory, metadata):
    directory = Path(directory)
    fd, temporary = tempfile.mkstemp(prefix='.metadata-', dir=directory)
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(metadata, output, allow_nan=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, directory / 'metadata.json')
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def create_record(kind, metadata):
    record = {**metadata, 'id': uuid.uuid4().hex, 'owner': actor(), 'createdAt': datetime.now(timezone.utc).isoformat()}
    directory = root_for(kind) / record['id']
    directory.mkdir(mode=0o700)
    save_record(directory, record)
    return directory, record

def owned_record(kind, resource_id):
    if not isinstance(resource_id, str) or not re.fullmatch(r'[0-9a-f]{32}', resource_id):
        raise ApiError(404, 'Resource not found')
    directory = root_for(kind) / resource_id
    try:
        record = json.loads((directory / 'metadata.json').read_text())
    except (OSError, ValueError):
        raise ApiError(404, 'Resource not found')
    if record.get('owner') != actor(): raise ApiError(404, 'Resource not found')
    return directory, record
