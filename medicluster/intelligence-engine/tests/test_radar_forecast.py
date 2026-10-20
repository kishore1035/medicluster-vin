"""Mock only pretrained inference; exercise actual adapter input and output handling."""
import unittest
from unittest.mock import patch
import numpy as np
import radar_forecast
from test_radar import readings


class ArrayTensor:
    def __init__(self, array): self.array = array
    def detach(self): return self
    def cpu(self): return self
    def numpy(self): return self.array


class BoundaryPipeline:
    def __init__(self):
        self.context = None
        self.calls = []
    def predict_quantiles(self, inputs, prediction_length, quantile_levels):
        self.context = inputs[0]
        self.calls.append(self.context.copy())
        self.levels = quantile_levels
        values = np.repeat(self.context[:, -1, None, None], prediction_length, axis=1)
        values = np.concatenate([values+2, values, values-2], axis=2)
        return [ArrayTensor(values)], []


class ForecastTests(unittest.TestCase):
    def test_multivariate_prefix_ordered_quantiles_and_horizon(self):
        pipeline = BoundaryPipeline()
        with patch.object(radar_forecast, '_load_pipeline', return_value=pipeline):
            result = radar_forecast.forecast(readings(12), 6)
        self.assertEqual(pipeline.context.shape, (6, 12))
        self.assertEqual(pipeline.levels, [.1, .5, .9])
        self.assertEqual(result['model'], 'amazon/chronos-2')
        self.assertEqual(result['intervalMinutes'], 5)
        self.assertEqual(len(result['timestamps']), 6)
        for series in result['series'].values():
            self.assertEqual(len(series['median']), 6)
            for lo, med, hi in zip(series['lower'], series['median'], series['upper']):
                self.assertLessEqual(lo, med)
                self.assertLessEqual(med, hi)

    def test_irregular_readings_are_next_observations_not_minutes(self):
        history = readings(12)
        history[-1]['timestamp'] = '2026-01-01T01:00:00+00:00'
        with patch.object(radar_forecast, '_load_pipeline', return_value=BoundaryPipeline()):
            result = radar_forecast.forecast(history, 2)
        self.assertIsNone(result['intervalMinutes'])
        self.assertIsNone(result['timestamps'])
        self.assertTrue(any('Irregular' in warning for warning in result['warnings']))

    def test_model_failure_is_not_replaced_with_extrapolation(self):
        with patch.object(radar_forecast, '_load_pipeline', side_effect=RuntimeError('offline')):
            with self.assertRaises(RuntimeError): radar_forecast.forecast(readings(), 6)
