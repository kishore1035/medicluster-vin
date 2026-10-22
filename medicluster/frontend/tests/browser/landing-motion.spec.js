import { test, expect } from '@playwright/test';

async function openLanding(page) {
  await page.goto('/download', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden({ timeout: 12_000 });
}

test('animated logo splash finishes then releases page interaction', async ({ page }) => {
  await page.goto('/download', { waitUntil: 'domcontentloaded' });
  const loader = page.getByRole('dialog', { name: 'Starting MediCluster' });
  await expect(loader).toBeVisible();
  await expect(loader.getByRole('img', { name: 'MediCluster', exact: true })).toBeVisible();
  await expect(loader).toBeHidden({ timeout: 12_000 });
  await expect(page.locator('#app-content')).not.toHaveAttribute('inert');
  await expect(page.getByLabel('Get the apps', { exact: true })).toBeVisible();
});

test('Escape skips loader without trapping keyboard focus', async ({ page }) => {
  await page.goto('/download', { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  await expect(page.locator('#app-content')).not.toHaveAttribute('inert');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to apps', exact: true })).toBeFocused();
});

test('four image cards preserve role-specific web and Android destinations', async ({ page }) => {
  await openLanding(page);
  const showcase = page.getByRole('region', { name: 'A workspace for every part of care.' });
  await showcase.scrollIntoViewIfNeeded();
  await expect(showcase.getByRole('link')).toHaveCount(4);
  await expect(showcase.getByRole('link', { name: 'Explore MediCluster' })).toHaveAttribute('href', '/login');
  await expect(showcase.getByRole('link', { name: 'Explore Patient app' })).toHaveAttribute('href', '/app');
  await expect(showcase.getByRole('link', { name: 'Explore Dispatch dashboard' })).toHaveAttribute('href', /#\/login$/);
  await expect(showcase.getByRole('link', { name: 'Explore Crew app' })).toHaveAttribute('href', '#crew');
  for (const image of await showcase.getByRole('img').all()) {
    await expect(image).toHaveJSProperty('complete', true);
    await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
  }
});

test('card hover animates preview and keyboard focus exposes same action', async ({ page }) => {
  await openLanding(page);
  const card = page.getByRole('link', { name: 'Explore Patient app' });
  await card.scrollIntoViewIfNeeded();
  const image = card.getByRole('img');
  const before = await image.evaluate(node => getComputedStyle(node).transform);
  await card.hover();
  await expect.poll(() => image.evaluate(node => getComputedStyle(node).transform)).not.toBe(before);
  await page.mouse.move(0, 0);
  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app$/);
});

test('mobile cards form one column without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLanding(page);
  const first = page.getByRole('link', { name: 'Explore MediCluster' });
  const second = page.getByRole('link', { name: 'Explore Patient app' });
  await first.scrollIntoViewIfNeeded();
  const a = await first.boundingBox(), b = await second.boundingBox();
  expect(b.y).toBeGreaterThan(a.y + a.height);
  expect(Math.abs(a.x - b.x)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('reduced motion gives fast loader exit and static card previews', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLanding(page);
  const card = page.getByRole('link', { name: 'Explore Patient app' });
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await expect.poll(() => card.getByRole('img').evaluate(node => getComputedStyle(node).transform)).toBe('none');
});

test('bending reel stays visible without corridor section and site pause stops playback', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.route('https://www.youtube-nocookie.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Video player</body></html>' }));
  await openLanding(page);
  const reel = page.getByRole('group', { name: 'MediCluster platform preview', exact: true });
  await reel.scrollIntoViewIfNeeded();
  await expect(page.locator('.mc-cinematic')).toHaveCount(0);
  await expect(reel.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play medical reel', exact: true }).click();
  const screen = await page.locator('.mc-platform-screen').boundingBox();
  const header = await page.locator('.download-header').boundingBox();
  expect(screen.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(screen.y + screen.height).toBeLessThanOrEqual(900);
  await expect(reel.locator('iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/4LrQ8V6offk\?/);
  await expect(reel.locator('iframe')).toHaveAttribute('title', 'Cleveland Clinic Main Campus Tour');
  await page.getByRole('button', { name: 'Pause animations', exact: true }).click();
  await expect(reel.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Different roles. One shared direction.' })).toHaveAttribute('data-playing', 'false');
});

test('reel expands and curves with scroll and stays flat for reduced motion', async ({ page }) => {
  await openLanding(page);
  const stage = page.locator('.mc-platform-film');
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.mc-platform-film').getBoundingClientRect().top + scrollY - innerHeight * .7));
  const path = page.locator('.mc-reel-clip path');
  const before = await path.getAttribute('d');
  const width = await stage.evaluate(node => node.style.getPropertyValue('--reel-width'));
  await page.mouse.wheel(0, 200);
  await expect(path).not.toHaveAttribute('d', before);
  await expect.poll(() => stage.evaluate(node => node.style.getPropertyValue('--reel-width'))).not.toBe(width);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(stage).toHaveAttribute('data-reel-motion', 'off');
  await expect.poll(() => stage.evaluate(node => node.style.getPropertyValue('--reel-width'))).toBe('100%');
  await expect(page.locator('.mc-platform-screen')).toHaveCSS('transform', 'none');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('splash has no visible skip control and backdrop still dismisses it', async ({ page }) => {
  await page.goto('/download', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Skip intro', exact: true })).toHaveCount(0);
  await page.getByRole('dialog', { name: 'Starting MediCluster' }).click({ position: { x: 30, y: 150 } });
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});


test('cards use full-bleed medical photography and respond to off-center pointer movement', async ({ page }) => {
  await openLanding(page);
  const card = page.getByRole('link', { name: 'Explore Patient app' });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('img')).toHaveAttribute('src', /medical-.*\.jpg$/);
  await expect.poll(() => card.getByRole('img').evaluate(node => getComputedStyle(node).objectFit)).toBe('cover');
  await card.hover({ position: { x: 40, y: 40 } });
  await expect.poll(() => card.evaluate(node => node.style.getPropertyValue('--depth-x'))).not.toBe('0.0000');
  await expect.poll(() => card.evaluate(node => node.style.getPropertyValue('--depth-x'))).not.toBe('');
});

test('editorial accents load readable medium-weight italic font', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLanding(page);
  const accent = page.locator('.download-hero em');
  await expect(accent).toHaveCSS('font-weight', '500');
  await expect(accent).toHaveCSS('font-family', /MediCluster Editorial/);
  expect(await page.evaluate(() => document.fonts.check('italic 500 64px "MediCluster Editorial"'))).toBe(true);
});

test('workspace cards follow reference proportions and aligned minimal captions', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLanding(page);
  const cards = page.locator('.mc-workspace-card');
  await cards.first().scrollIntoViewIfNeeded();
  const a = await cards.nth(0).locator('.mc-workspace-media').boundingBox();
  const b = await cards.nth(1).locator('.mc-workspace-media').boundingBox();
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(a.x).toBeCloseTo(96, 0);
  expect(a.width).toBeCloseTo(844.8, 0);
  expect(b.x - a.x - a.width).toBeCloseTo(38.4, 0);
  expect(a.width / a.height).toBeCloseTo(1 / .65, 2);
  await expect(cards.first().locator('.mc-workspace-role,.mc-workspace-open,.mc-workspace-description')).toHaveCount(0);
  await expect(cards.first().locator('.mc-workspace-title-mask')).toBeVisible();
});


test('card image depth responds to pointer while titles remain plain text', async ({ page }) => {
  await openLanding(page);
  const card = page.getByRole('link', { name: 'Explore Patient app', exact: true });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-depth-state', 'ready');
  await expect(card.locator('.mc-workspace-title-mask')).toHaveText('Patient app');
  await expect(card.locator('.mc-workspace-title-mask')).toHaveCSS('animation-name', 'none');
  await expect(card.locator('.mc-workspace-title-roll,.mc-workspace-letter')).toHaveCount(0);
  await expect(card.locator('.mc-workspace-title-mask')).toHaveCSS('font-family', /MediCluster Workspace/);
  const canvas = card.locator('canvas');
  await card.hover({ position: { x: 50, y: 80 } });
  await expect.poll(() => card.evaluate(node => Number(node.style.getPropertyValue('--depth-x')))).toBeLessThan(-.2);
  const before = await canvas.screenshot();
  const box = await card.locator('.mc-workspace-media').boundingBox();
  await card.hover({ position: { x: box.width - 50, y: 80 } });
  await expect.poll(() => card.evaluate(node => Number(node.style.getPropertyValue('--depth-x')))).toBeGreaterThan(.2);
  expect(before.equals(await canvas.screenshot())).toBe(false);
  await page.getByRole('button', { name: 'Pause animations', exact: true }).click();
  await expect(card).toHaveAttribute('data-depth-state', 'static');
  await expect(canvas).toHaveCSS('opacity', '0');
  await expect(card.getByRole('img')).toBeVisible();
});

test('card photograph remains usable when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return original.call(this, type, ...args);
    };
  });
  await openLanding(page);
  const card = page.getByRole('link', { name: 'Explore Patient app', exact: true });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-depth-state', 'fallback');
  await expect(card.getByRole('img')).toBeVisible();
  await expect(card.locator('canvas')).toHaveCSS('opacity', '0');
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app$/);
});
