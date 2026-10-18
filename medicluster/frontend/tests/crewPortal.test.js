import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { buildAppCatalog } from '../src/data/appCatalog.js';

let server, Selector, FAQ;
const patient = { versionName: '9.8.7', sizeBytes: 12345, sha256: 'a'.repeat(64) };
const crew = { versionName: '1.0.0', sizeBytes: 23456, sha256: 'b'.repeat(64) };
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: { server: createHttpServer() } }, appType: 'custom' });
  Selector = (await server.ssrLoadModule('/src/components/download/ApplicationSelector.tsx')).default;
  FAQ = (await server.ssrLoadModule('/src/components/download/LandingSections.tsx')).LandingFAQ;
});
after(async () => { await server?.close(); });

function panels(crewRelease) {
  const html = renderToStaticMarkup(React.createElement(Selector, {
    apps: buildAppCatalog('https://dispatch.example.com'), release: patient, crewRelease, onInstall() {},
  }));
  return { patient: html.split('id="application-panel-patient"')[1].split('id="application-panel-dispatch"')[0], crew: html.split('id="application-panel-crew"')[1] };
}

test('Crew primary action downloads Android and web remains secondary with its own release', () => {
  const html = panels(crew);
  assert.match(html.crew, /class="download-pill download-pill-dark"[^>]*aria-label="Download Crew app for Android"/);
  assert.match(html.crew, /href="https:\/\/dispatch.example.com\/#\/driver\/login"/);
  assert.match(html.crew, /Version 1.0.0/);
  assert.doesNotMatch(html.crew, /9\.8\.7|Patient app for Android/);
  assert.match(html.patient, /aria-label="Download Patient app for Android"/);
});

test('missing Crew metadata never borrows the Patient release or enables Crew download', () => {
  const html = panels(null);
  assert.match(html.crew, /Android download unavailable/);
  assert.doesNotMatch(html.crew, /Download Crew app for Android|9\.8\.7/);
  assert.match(html.patient, /Download Patient app for Android/);
});

test('installation guide covers both APKs and returns to selected Crew app with Crew metadata', () => {
  const html = renderToStaticMarkup(React.createElement(FAQ, {
    release: patient, crewRelease: crew, installApp: 'crew', installOpen: true, setInstallOpen() {},
  }));
  assert.match(html, /Patient and Crew apps/);
  assert.match(html, /href="#crew"/);
  assert.match(html, /Crew app · Version 1.0.0/);
  assert.doesNotMatch(html, /9\.8\.7/);
});
