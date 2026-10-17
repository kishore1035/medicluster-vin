import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPatientDownloader } from '../src/patient-app/patientDownload.js';

const bytes = await readFile(new URL('../public/downloads/medicluster-patient.apk', import.meta.url));
const release = JSON.parse(await readFile(new URL('../public/downloads/patient-app.json', import.meta.url)));
const apkResponse = () => new Response(bytes, { headers: { 'Content-Type': 'application/vnd.android.package-archive' } });

test('rapid clicks save one APK without navigating browser', async () => {
  let resolveResponse;
  let requests = 0;
  const saved = [];
  const download = createPatientDownloader({
    fetchImpl: async (url, options) => {
      requests++;
      assert.equal(url, '/api/patient-installer');
      assert.equal(options.method, 'POST');
      return new Promise((resolve) => { resolveResponse = resolve; });
    },
    saveBlob: (blob) => saved.push(blob),
  });
  const first = download(release);
  assert.equal(await download(release), false);
  resolveResponse(apkResponse());
  assert.equal(await first, true);
  assert.equal(requests, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].size, release.sizeBytes);
});

test('cold-start HTML never becomes APK and user can retry', async () => {
  let cold = true;
  let saves = 0;
  const download = createPatientDownloader({
    fetchImpl: async () => cold ? new Response('<html>Waking up</html>', { headers: { 'Content-Type': 'text/html' } }) : apkResponse(),
    saveBlob: () => { saves++; },
  });
  await assert.rejects(download(release), /not ready/i);
  assert.equal(saves, 0);
  cold = false;
  assert.equal(await download(release), true);
  assert.equal(saves, 1);
});

test('corrupt APK never downloads', async () => {
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 1] ^= 1;
  const download = createPatientDownloader({
    fetchImpl: async () => new Response(corrupt, { headers: { 'Content-Type': 'application/vnd.android.package-archive' } }),
    saveBlob: () => assert.fail('corrupt APK saved'),
  });
  await assert.rejects(download(release), /verification/i);
});
