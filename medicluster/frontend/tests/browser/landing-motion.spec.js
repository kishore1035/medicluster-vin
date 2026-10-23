import { test, expect } from '@playwright/test';

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

test('splash has no visible skip control and backdrop still dismisses it', async ({ page }) => {
  await page.goto('/download', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Skip intro', exact: true })).toHaveCount(0);
  await page.getByRole('dialog', { name: 'Starting MediCluster' }).click({ position: { x: 30, y: 150 } });
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('reduced motion releases startup quickly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/download', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('dialog', { name: 'Starting MediCluster' })).toBeHidden({ timeout: 3000 });
  await expect(page.locator('#app-content')).not.toHaveAttribute('inert');
});
