import test from 'node:test';
import assert from 'node:assert/strict';
import { isPatientAndroid, readPatientRelease, PATIENT_APK_PATH, patientApkUrl } from '../src/patient-app/patientPlatform.js';

test('recognizes Android patient shell without changing ordinary browser sessions', () => {
  assert.equal(isPatientAndroid('Mozilla/5.0 Android MediClusterPatient/1.0'), true);
  assert.equal(isPatientAndroid('Mozilla/5.0 Android Chrome/130.0'), false);
  assert.equal(isPatientAndroid('Mozilla/5.0 iPhone'), false);
  assert.equal(isPatientAndroid('NotMediClusterPatient/1.0'), false);
});

test('new releases bypass cached APKs and link to their displayed checksum', () => {
  const first = {sha256: 'a'.repeat(64)};
  const second = {sha256: 'b'.repeat(64)};
  assert.notEqual(patientApkUrl(first), patientApkUrl(second));
  assert.equal(patientApkUrl(second), `${PATIENT_APK_PATH}?sha256=${second.sha256}`);
});

test('download metadata requires a real version, size and checksum', () => {
  const release = { versionName: '1.0.1', sizeBytes: 28000, sha256: 'a'.repeat(64) };
  assert.deepEqual(readPatientRelease(release), release);
  for (const invalid of [null, {}, { ...release, sizeBytes: 0 }, { ...release, sha256: '' }, { ...release, versionName: '<script>' }]) {
    assert.equal(readPatientRelease(invalid), null);
  }
  assert.equal(PATIENT_APK_PATH, '/downloads/medicluster-patient.apk');
});
