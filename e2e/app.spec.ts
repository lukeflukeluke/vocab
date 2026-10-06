import { expect, test } from '@playwright/test';

test('shows the home screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByTestId('event-count')).toHaveText('0');
});

test('keeps the device id across reloads (on-device storage works)', async ({ page }) => {
  await page.goto('/');
  const deviceId = page.getByTestId('device-id');
  await expect(deviceId).toHaveAttribute('data-device-id', /^[0-9a-f-]{36}$/);
  const first = await deviceId.getAttribute('data-device-id');
  await page.reload();
  await expect(deviceId).toHaveAttribute('data-device-id', first!);
});

test('serves an installable web app manifest', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: 'Vocab', display: 'standalone', start_url: '/' });
  const sizes = (manifest.icons as { sizes: string }[]).map((icon) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const path of ['/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png']) {
    expect((await request.get(path)).ok(), path).toBe(true);
  }
});

test('works offline once loaded', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('offline-status')).toHaveText('Ready');
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByTestId('offline-status')).toHaveText('Ready');
});
