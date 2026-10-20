"""Radar contracts: storage, ownership, replay and transactional ingestion."""
import copy
import unittest
from unittest.mock import patch
from datetime import datetime, timedelta, timezone

import radar


def readings(n=16):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return [dict(timestamp=(start + timedelta(minutes=5*i)).isoformat(), heart_rate=75., spo2=98., systolic_bp=120., diastolic_bp=80., respiratory_rate=16., temperature=37.) for i in range(n)]


class RadarDomainTests(unittest.TestCase):
    def test_score_reference_and_empty(self):
        self.assertIsNone(radar.reference_score([])['value'])
        score = radar.reference_score(readings())
        self.assertEqual(score['value'], 0)
        r = readings(1)
        r[0].update(heart_rate=135, spo2=90, systolic_bp=85, respiratory_rate=26, temperature=39.2)
        score = radar.reference_score(r)
        self.assertEqual(score['value'], 14)
        self.assertEqual(score['tier'], 'high')
        self.assertTrue(any('room air' in x for x in score['assumptions']))

    def test_full_batch_validation_no_mutation(self):
        original = readings(1)
        incoming = readings(3)[1:]
        incoming[-1]['spo2'] = float('nan')
        before = copy.deepcopy(original)
        with self.assertRaises(Exception):
            radar.validate_readings(incoming, original)
        self.assertEqual(original, before)
        for invalid in [readings(1), [dict(readings(2)[1], heart_rate=True)], [dict(readings(2)[1], timestamp='2026-01-01')]]:
            with self.assertRaises(Exception):
                radar.validate_readings(invalid, original)

    def test_replay_state_score_uses_prefix(self):
        history = readings()
        history[-1]['spo2'] = 85
        record = dict(id='a', patientId='p', source='manual', scenario=None, createdAt='now', readings=history, revision=1)
        state = radar.session_state(record, 12)
        self.assertEqual(state['cursor'], 12)
        self.assertEqual(len(state['readings']), 12)
        self.assertEqual(state['score']['value'], 0)
        self.assertEqual(state['totalReadings'], 16)
        self.assertIsNone(state['forecast'])

    def test_demo_progression_is_bounded_and_explicit(self):
        for scenario in ['stable', 'deteriorating', 'recovering']:
            for index in [0, 15, 32, 5000]:
                item = radar.demo_reading(scenario, index, datetime(2026, 1, 1, tzinfo=timezone.utc))
                self.assertEqual(len(radar.validate_readings([item], [])), 1)


class RadarApiTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        import os
        import runtime
        from flask import Flask, request, g
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        # Runtime root is configured through environment before app creation in integration.
        self.runtime = runtime
        self.root_patch = patch.dict(os.environ, {'INTELLIGENCE_DATA_DIR': self.temp.name})
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.app = Flask(__name__)
        self.app.register_blueprint(radar.bp)
        @self.app.before_request
        def authenticate():
            g.actor = request.headers.get('X-Actor-Id', '')
        @self.app.errorhandler(runtime.ApiError)
        def error(exc):
            return {'error': str(exc)}, exc.status
        self.client = self.app.test_client()
        self.headers = {'X-Actor-Id': 'clinician-a'}

    def create(self, source='demo'):
        response = self.client.post('/radar/sessions', json=dict(patientId='p1', source=source), headers=self.headers)
        self.assertEqual(response.status_code, 201, response.json)
        return response.json

    def test_ownership_export_and_manual_step(self):
        state = self.create('manual')
        self.assertEqual(state['readings'], [])
        path = '/radar/sessions/' + state['id']
        self.assertEqual(self.client.get(path, headers={'X-Actor-Id': 'clinician-b'}).status_code, 404)
        self.assertEqual(self.client.get(path+'/export', headers={'X-Actor-Id': 'clinician-b'}).status_code, 404)
        self.assertEqual(self.client.post(path+'/step', headers=self.headers).status_code, 400)
        exported = self.client.get(path+'/export', headers=self.headers)
        self.assertNotIn('owner', exported.json)
        self.assertIn('attachment', exported.headers['Content-Disposition'])

    def test_batch_rollback_persisted(self):
        state = self.create('manual')
        path = '/radar/sessions/' + state['id']
        batch = readings(2)
        batch[-1]['heart_rate'] = 500
        self.assertEqual(self.client.post(path+'/readings', json={'readings': batch}, headers=self.headers).status_code, 400)
        self.assertEqual(self.client.get(path, headers=self.headers).json['totalReadings'], 0)
        self.assertEqual(self.client.post(path+'/readings', json={'readings': readings(16)}, headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get(path, headers=self.headers).json['totalReadings'], 16)

    def test_forecast_prefix_cache_and_replay_score(self):
        state = self.create()
        path = '/radar/sessions/' + state['id']
        import numpy as np
        from test_radar_forecast import BoundaryPipeline
        pipeline = BoundaryPipeline()
        with patch.object(radar.radar_forecast, '_load_pipeline', return_value=pipeline):
            first = self.client.post(path+'/forecast', json={'cursor': 12}, headers=self.headers)
            self.assertEqual(first.status_code, 200, first.json)
            self.client.post(path+'/forecast', json={'cursor': 12}, headers=self.headers)
            self.assertEqual(len(pipeline.calls), 1)
            self.assertEqual(pipeline.context.shape, (6, 12))
            expected = np.asarray([[r[name] for r in state['readings'][:12]] for name in radar.VITALS], dtype=np.float32)
            np.testing.assert_array_equal(pipeline.context, expected)
            self.assertEqual(first.json['readings'], state['readings'][:12])
            exported = self.client.get(path+'/export', headers=self.headers).json
            self.assertEqual(len(exported['generatedForecasts']), 1)
            self.assertEqual(exported['generatedForecasts'][0]['cursor'], 12)
            self.assertEqual(exported['generatedForecasts'][0]['forecast']['steps'], 6)
            self.client.post(path+'/step', headers=self.headers)
            self.client.post(path+'/forecast', json={'cursor': 12}, headers=self.headers)
            self.assertEqual(len(pipeline.calls), 2)
            np.testing.assert_array_equal(pipeline.calls[0], pipeline.calls[1])

    def test_slow_forecast_does_not_block_other_session_or_lose_same_session_update(self):
        from concurrent.futures import ThreadPoolExecutor
        import threading
        from test_radar_forecast import BoundaryPipeline
        entered = threading.Event()
        release = threading.Event()
        updated_other = threading.Event()
        class WaitingPipeline(BoundaryPipeline):
            def predict_quantiles(self, *args, **kwargs):
                entered.set()
                if not release.wait(5):
                    raise RuntimeError('test inference was never released')
                return super().predict_quantiles(*args, **kwargs)
        target = self.create()
        other = self.create('manual')
        target_path = '/radar/sessions/' + target['id']
        other_path = '/radar/sessions/' + other['id']
        def request_forecast():
            return self.app.test_client().post(target_path+'/forecast', json={'cursor': 12}, headers=self.headers)
        def append_other():
            response = self.app.test_client().post(other_path+'/readings', json={'readings': readings(1)}, headers=self.headers)
            updated_other.set()
            return response
        def step_same():
            return self.app.test_client().post(target_path+'/step', headers=self.headers)
        with patch.object(radar.radar_forecast, '_load_pipeline', return_value=WaitingPipeline()):
            with ThreadPoolExecutor(max_workers=3) as pool:
                forecasting = pool.submit(request_forecast)
                try:
                    self.assertTrue(entered.wait(2), 'forecast did not reach external inference')
                    appending = pool.submit(append_other)
                    stepping = pool.submit(step_same)
                    self.assertTrue(updated_other.wait(.5), 'another session was blocked by inference')
                    self.assertEqual(appending.result().status_code, 200)
                finally:
                    release.set()
                self.assertEqual(forecasting.result(timeout=2).status_code, 200)
                self.assertEqual(stepping.result(timeout=2).status_code, 200)
        self.assertEqual(self.client.get(target_path, headers=self.headers).json['totalReadings'], 17)
        self.assertEqual(self.client.get(other_path, headers=self.headers).json['totalReadings'], 1)


if __name__ == '__main__':
    unittest.main()
