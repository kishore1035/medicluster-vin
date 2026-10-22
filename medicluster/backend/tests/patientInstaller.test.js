const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const installer = require('../routes/patientInstallerRoutes');

test('repeated APK navigations show portal; explicit asset fetch and POST return installer', async (t) => {
  const publicDir = path.resolve(__dirname, '../../frontend/public');
  const app = express();
  app.use(installer(publicDir));
  app.use(express.static(publicDir));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const suffix of ['', '?sha256=old', '']) {
    const response = await fetch(`${origin}/downloads/medicluster-patient.apk${suffix}`, { redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/download');
    assert.equal(response.headers.get('content-disposition'), null);
  }
  const asset = await fetch(`${origin}/downloads/medicluster-patient.apk`, { headers: { 'X-MediCluster-Installer': '1' }, redirect: 'error' });
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /application\/vnd.android.package-archive/);
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), fs.readFileSync(path.join(publicDir, 'downloads/medicluster-patient.apk')));
  const response = await fetch(`${origin}/api/patient-installer`, { method: 'POST' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/vnd.android.package-archive/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(publicDir, 'downloads/medicluster-patient.apk')));
});


test('Crew APK navigations stop at Crew portal; POST returns only the Crew artifact', async (t) => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-installer-'));
  fs.mkdirSync(path.join(publicDir, 'downloads'));
  const crewBytes = Buffer.from('PK crew installer fixture');
  fs.writeFileSync(path.join(publicDir, 'downloads/medicluster-crew.apk'), crewBytes);
  fs.writeFileSync(path.join(publicDir, 'downloads/medicluster-patient.apk'), 'PK patient fixture');
  const app = express();
  app.use(installer(publicDir));
  app.use(express.static(publicDir));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(publicDir, { recursive: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const suffix of ['', '?sha256=old', '']) {
    const response = await fetch(`${origin}/downloads/medicluster-crew.apk${suffix}`, { redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/download#crew');
    assert.equal(response.headers.get('content-disposition'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const response = await fetch(`${origin}/api/crew-installer?file=medicluster-patient.apk`, { method: 'POST' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/vnd.android.package-archive/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), crewBytes);
  assert.equal((await fetch(`${origin}/api/crew-installer`)).status, 404);
  assert.equal((await fetch(`${origin}/api/arbitrary-installer`, { method: 'POST' })).status, 404);
});
