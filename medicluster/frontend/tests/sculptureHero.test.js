import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

let server;
let SculptureHero;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: { server: createHttpServer() } }, appType: 'custom' });
  ({ default: SculptureHero } = await server.ssrLoadModule('/src/components/ui/liquid-sculpture-hero.tsx'));
});
after(async () => { await server?.close(); });

test('decorative mode keeps static fallback without duplicate headings or navigation', () => {
  const html = renderToStaticMarkup(React.createElement(SculptureHero, {
    backgroundOnly: true,
    src: '/images/liquid-sculpture.webp',
    loadFonts: false,
  }));
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /class="sh-fallback"[^>]*src="\/images\/liquid-sculpture.webp"/);
  assert.doesNotMatch(html, /<h1|<nav|class="sh-credit"|Forma®/);
});

test('standalone component renders MediCluster multiline copy, accents and real destinations', () => {
  const html = renderToStaticMarkup(React.createElement(SculptureHero, {
    brand: 'MediCluster',
    navLinks: [{ label: 'Apps', href: '/download#apps' }],
    navCta: { label: 'Get the apps', href: '/download#apps' },
    eyebrow: '',
    headline: 'Better care.\nEverywhere you are.',
    headlineAccent: 'Everywhere you are.',
    body: 'One connected platform. The right app for every role.',
    primaryCta: { label: 'Explore apps', href: '#apps' },
    secondaryCta: { label: 'Patient portal', href: '/app' },
    themeToggle: false,
    showCredit: false,
    loadFonts: false,
  }));
  assert.match(html, /<span class="sh-line">Better care\.<\/span>/);
  assert.match(html, /<span class="sh-accent">Everywhere you are\.<\/span>/);
  assert.match(html, /class="sh-btn" href="#apps"/);
  assert.match(html, /class="sh-txt" href="\/app"/);
  assert.doesNotMatch(html, /Start a project|Selected work|Independent studio|<button/);
});
