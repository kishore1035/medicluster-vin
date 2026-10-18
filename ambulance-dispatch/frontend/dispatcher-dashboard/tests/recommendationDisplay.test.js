import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDistanceKm, formatEta, formatHospitalScore } from '../src/services/recommendationDisplay.js';

test('API kilometre distances display directly including zero and fractional kilometres', () => {
  assert.equal(formatDistanceKm(10), '10.0 km');
  assert.equal(formatDistanceKm(0.25), '0.3 km');
  assert.equal(formatDistanceKm(0), '0.0 km');
  for (const value of [undefined, null, NaN, Infinity, -1]) assert.equal(formatDistanceKm(value), 'Unavailable');
});

test('missing travel ETA stays unavailable rather than inferred from straight-line distance', () => {
  assert.equal(formatEta(undefined), 'Unavailable');
  assert.equal(formatEta(0), '0 min');
  assert.equal(formatEta(12), '12 min');
});

test('hospital ranking points retain backend scale above ten', () => {
  assert.equal(formatHospitalScore(104), '104 points');
  assert.equal(formatHospitalScore(0), '0 points');
  assert.equal(formatHospitalScore(undefined), 'Unavailable');
});
