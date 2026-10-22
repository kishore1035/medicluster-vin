import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as downloads from '../src/patient-app/patientDownload.js';
import { createCrewDownloader } from '../src/crew-app/crewDownload.js';

// Distinct fixtures catch accidentally routing Crew through the Patient endpoint.
const crewBytes = Buffer.from('PK crew Android fixture');
const release = { versionName: '1.0.0', sizeBytes: crewBytes.length, sha256: createHash('sha256').update(crewBytes).digest('hex') };
const apk = (bytes = crewBytes) => new Response(bytes, { headers: { 'Content-Type': 'application/vnd.android.package-archive' } });

test('Crew rapid clicks fetch and save one verified Crew APK with its own filename', async () => {
  assert.equal(typeof downloads.createAndroidDownloader, 'function');
  let resolveResponse;
  let requests = 0;
  const saved = [];
  const download = createCrewDownloader({
    fetchImpl: async (url, options) => {
      requests++;
      assert.equal(url, '/downloads/medicluster-crew.apk');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers['X-MediCluster-Installer'], '1');
      assert.equal(options.redirect, 'error');
      return new Promise(resolve => { resolveResponse = resolve; });
    },
    saveBlob: (blob, filename) => saved.push({ blob, filename }),
  });
  const first = download(release);
  assert.equal(await download(release), false);
  resolveResponse(apk());
  assert.equal(await first, true);
  assert.equal(requests, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].filename, 'MediCluster-Crew.apk');
  assert.deepEqual(Buffer.from(await saved[0].blob.arrayBuffer()), crewBytes);
});

test('Crew rejects HTML and corrupt or truncated APKs, then permits a deliberate retry', async () => {
  assert.equal(typeof downloads.createAndroidDownloader, 'function');
  let response = new Response('<html>Starting</html>', { headers: { 'Content-Type': 'text/html' } });
  let saves = 0;
  const download = createCrewDownloader({ fetchImpl: async () => response, saveBlob: () => saves++ });
  await assert.rejects(download(release), /not ready/i);
  const corrupt = Buffer.from(crewBytes);
  corrupt[0] ^= 1;
  response = apk(corrupt);
  await assert.rejects(download(release), /verification/i);
  response = apk(crewBytes.subarray(1));
  await assert.rejects(download(release), /verification/i);
  assert.equal(saves, 0);
  response = apk();
  assert.equal(await download(release), true);
  assert.equal(saves, 1);
});

test('a pending Patient download does not block Crew and unsupported app IDs cannot select files', async () => {
  assert.equal(typeof downloads.createAndroidDownloader, 'function');
  let finishPatient;
  const patient = downloads.createPatientDownloader({ fetchImpl: () => new Promise(resolve => { finishPatient = resolve; }), saveBlob: () => {} });
  const crew = createCrewDownloader({ fetchImpl: async () => apk(), saveBlob: () => {} });
  const patientPending = patient(release);
  assert.equal(await crew(release), true);
  finishPatient(apk());
  assert.equal(await patientPending, true);
  assert.throws(() => downloads.createAndroidDownloader('../../secret'), /unsupported/i);
});
