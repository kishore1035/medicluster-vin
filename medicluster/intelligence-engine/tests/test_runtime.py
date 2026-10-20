import json
import pytest
from flask import Flask, g
import runtime


def test_private_records_are_owner_bound_atomic_and_path_safe(tmp_path, monkeypatch):
    monkeypatch.setenv('INTELLIGENCE_DATA_DIR', str(tmp_path))
    app = Flask(__name__)
    with app.test_request_context():
        g.actor='alice'
        directory, record=runtime.create_record('brain', {'patientId':'p'})
        assert runtime.owned_record('brain',record['id'])[1]['patientId']=='p'
        runtime.save_record(directory,{**record,'name':'updated'})
        assert json.loads((directory/'metadata.json').read_text())['name']=='updated'
        assert not list(directory.glob('.metadata-*'))
        for identity in ['bob','alice']:
            g.actor=identity
            for resource in ['../brain', '0'*32] + ([record['id']] if identity=='bob' else []):
                with pytest.raises(runtime.ApiError) as error: runtime.owned_record('brain',resource)
                assert error.value.status==404


def test_worker_auth_fails_closed_and_excludes_patient_data(monkeypatch):
    monkeypatch.setenv('INTELLIGENCE_TOKEN','test-key')
    from app import app
    client=app.test_client()
    assert client.get('/health').status_code==200
    assert client.get('/brain/studies').status_code==401
    assert client.get('/brain/studies',headers={'X-Intelligence-Key':'test-key'}).status_code==400
    assert client.get('/brain/studies',headers={'X-Intelligence-Key':'bad-é','X-Actor-Id':'alice'}).status_code==401
