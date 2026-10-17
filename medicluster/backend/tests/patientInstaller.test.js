const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const installer = require('../routes/patientInstallerRoutes');

test('repeated APK navigations show portal; only explicit POST returns installer', async (t) => {
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
  const response = await fetch(`${origin}/api/patient-installer`, { method: 'POST' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/vnd.android.package-archive/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join(publicDir, 'downloads/medicluster-patient.apk')));
});
