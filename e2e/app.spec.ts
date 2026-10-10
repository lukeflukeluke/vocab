import { expect, test } from '@playwright/test';

test('first launch shows the welcome, then Today', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to Wordhoard' })).toBeVisible();
  await page.getByTestId('skip-test').click();
  await expect(page.getByRole('heading', { name: 'Your daily time' })).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByTestId('placement-card')).toBeVisible();
  // The daily time was saved, so the welcome does not come back.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('event-count')).toHaveText('1');
});

test('keeps the device id across reloads (on-device storage works)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vocab.onboarded', '1'));
  await page.goto('/');
  await page.getByTestId('tab-settings').click();
  const deviceId = page.getByTestId('device-id');
  await expect(deviceId).toHaveAttribute('data-device-id', /^[0-9a-f-]{36}$/);
  const first = await deviceId.getAttribute('data-device-id');
  await page.reload();
  await page.getByTestId('tab-settings').click();
  await expect(deviceId).toHaveAttribute('data-device-id', first!);
});

test('serves an installable web app manifest', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: 'Wordhoard', display: 'standalone', start_url: '/' });
  const sizes = (manifest.icons as { sizes: string }[]).map((icon) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const path of ['/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png']) {
    expect((await request.get(path)).ok(), path).toBe(true);
  }
});

test('works offline once loaded, word bank included', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('vocab.onboarded', '1'));
  await page.goto('/');
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('offline-status')).toHaveText('Ready');
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  // The word bank is a separate file: starting a session proves it came from the cache.
  await page.getByTestId('start').click();
  await expect(page.getByTestId('step')).toBeVisible();
});

test('a new version takes over without closing every window', async ({ request }) => {
  // Without these, an installed app stayed on its old version until fully closed.
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).toContain('skipWaiting()');
  expect(sw).toContain('clientsClaim()');
});

test('the service worker shows reminders and leaves the server alone', async ({ request }) => {
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).toContain('importScripts("push-sw.js")');
  const push = await (await request.get('/push-sw.js')).text();
  expect(push).toContain("addEventListener('push'");
  expect(push).toContain("addEventListener('notificationclick'");
  // /api/ page loads are never answered with the app.
  expect(sw).toMatch(/denylist:\[\/\^\\\/api\\\/\/\]/);
});

test('light and dark: the top-bar button and Settings, remembered on this device', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('vocab.onboarded', '1'));
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');
  // Dark Reader is asked to leave the app's own colours alone.
  await expect(page.locator('meta[name="darkreader-lock"]')).toHaveCount(1);

  await page.getByTestId('theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  // Automatic follows the device.
  await page.getByTestId('tab-settings').click();
  await page.locator('[data-theme-choice="system"]').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.locator('[data-theme-choice="light"]').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-theme-choice="light"]')).toHaveAttribute('aria-checked', 'true');
});
