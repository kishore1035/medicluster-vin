import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
let server, folder, product;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: { server: createHttpServer() } }, appType: 'custom' });
  folder = await server.ssrLoadModule('/src/components/ui/glass-folder-cards.tsx');
  product = await server.ssrLoadModule('/src/components/download/ProductFolderCard.tsx');
});
after(async () => { await server?.close(); });

test('artwork stays deterministic across frame batches and changes with seed', () => {
  const first = folder.createArtJob(24, 18, folder.ART_PRESETS.aurora, 3);
  const batched = folder.createArtJob(24, 18, folder.ART_PRESETS.aurora, 3);
  const other = folder.createArtJob(24, 18, folder.ART_PRESETS.aurora, 4);
  first.step(1000); other.step(1000);
  let passes = 0;
  while (!batched.step(2)) { assert.ok(++passes < 100); }
  assert.deepEqual(first.pixels, batched.pixels);
  assert.notDeepEqual(first.pixels, other.pixels);
  assert.equal(first.pixels.length, 24 * 18 * 4);
  assert.ok(new Set(first.pixels).size > 20);
  for (let i = 3; i < first.pixels.length; i += 4) assert.equal(first.pixels[i], 255);
});

test('open files fan symmetrically and single files remain centered', () => {
  assert.deepEqual([0, 1, 2].map(i => folder.fanSlot(i, 3)), [-1, 0, 1]);
  assert.equal(folder.fanSlot(0, 1), 0);
});

test('folders expose newest four files and keep closed contents out of tab order', () => {
  const html = renderToStaticMarkup(React.createElement(folder.default, {
    label: 'Care apps', art: 'none', appear: false,
    files: Array.from({ length: 6 }, (_, i) => ({ name: `App ${i}`, href: `/app-${i}` })),
  }));
  assert.doesNotMatch(html, /href="\/app-[01]"/);
  assert.match(html, /href="\/app-5"/);
  assert.equal((html.match(/role="listitem"/g) || []).length, 4);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /6 items/);
  assert.equal((html.match(/class="gf-sheet" tabindex="-1"/g) || []).length, 4);
});

test('patient APK stays a click action while web files use real URLs', () => {
  const app = { id: 'patient', name: 'Patient app', webHref: '/app', android: true };
  const release = { versionName: '1.0.3', sizeBytes: 14000, sha256: 'a'.repeat(64) };
  const files = product.productFolderFiles(app, release);
  assert.equal(files.find(file => file.name === 'Open web app').href, '/app');
  assert.equal(files.find(file => file.name === 'Download Android').href, undefined);
  assert.equal(product.productFolderFiles(app, null).some(file => file.name === 'Download Android'), false);
  const unavailable = product.productFolderFiles({ id: 'crew', webHref: null, android: false }, release);
  assert.deepEqual(unavailable.map(file => [file.name, file.disabled, file.href]), [['Coming soon', true, undefined]]);
});

test('Crew folder describes Crew web access and keeps published Android available without web configuration', () => {
  const release = { versionName: '1.0.0', sizeBytes: 24000, sha256: 'b'.repeat(64) };
  const crew = { id: 'crew', name: 'Crew app', webHref: 'https://dispatch.example/#/driver/login', android: true };
  const files = product.productFolderFiles(crew, release);
  assert.equal(files.find(file => file.name === 'Open web app').meta, 'Crew workspace');
  const androidOnly = product.productFolderFiles({ ...crew, webHref: null }, release);
  assert.deepEqual(androidOnly.map(file => file.name), ['Download Android', 'How to install']);
});
