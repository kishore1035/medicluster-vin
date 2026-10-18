import test from 'node:test';
import assert from 'node:assert/strict';

import * as platform from '../src/crew-app/crewPlatform.js';

test('Crew metadata is loaded from its own path and validates published releases', () => {
  assert.equal(platform.CREW_RELEASE_PATH, '/downloads/crew-app.json');
  const release = { versionName: '1.0.0', versionCode: 1, sizeBytes: 23456, sha256: 'b'.repeat(64) };
  assert.deepEqual(platform.readCrewRelease(release), { versionName: '1.0.0', sizeBytes: 23456, sha256: 'b'.repeat(64) });
  for (const bad of [null, {}, '<html>', { ...release, sha256: 'bad' }, { ...release, sizeBytes: 0 }, { ...release, versionName: '<script>' }]) {
    assert.equal(platform.readCrewRelease(bad), null);
  }
});
