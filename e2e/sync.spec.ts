import { devices, expect, test, type Page } from '@playwright/test';
import { sqliteDb } from '../server/sqlite';
import { serve } from './server';

// Sync between an iPhone and a PC, each a separate browser with its own storage, through
// the real server code (e2e/server.ts).

async function eventCount(page: Page): Promise<string> {
  await page.getByTestId('tab-settings').click();
  return (await page.getByTestId('event-count').textContent())!.trim();
}

test('a session on the iPhone shows up on the PC, and back', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'One run covers both devices');
  const db = sqliteDb();

  const phoneContext = await browser.newContext({ ...devices['iPhone 13'] });
  await phoneContext.addInitScript(() => localStorage.setItem('vocab.onboarded', '1'));
  await serve(phoneContext, db);
  const phone = await phoneContext.newPage();
  await phone.goto('/');

  // iPhone: make a key and turn sync on.
  await phone.getByTestId('tab-settings').click();
  await phone.getByTestId('make-key').click();
  const key = (await phone.getByTestId('new-key').textContent())!.trim();
  expect(key).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
  await phone.getByTestId('use-new-key').click();
  await expect(phone.getByTestId('sync-status')).toContainText('Synced');
  await expect(phone.getByTestId('sync-badge')).toContainText('Synced');

  // iPhone: meet a word (guess, word page, check), then pause, which syncs.
  await phone.getByTestId('tab-today').click();
  await phone.getByTestId('start').click();
  const id = await phone.getByTestId('step').getAttribute('data-entry-id');
  await phone.locator(`[data-option-id="${id}"]`).click();
  await phone.getByTestId('continue').click();
  await phone.getByTestId('continue').click();
  await phone.locator(`[data-option-id="${id}"]`).click();
  await phone.getByTestId('continue').click();
  await phone.getByTestId('pause').click();
  await expect(phone.getByTestId('sync-badge')).toContainText('Synced');
  const phoneEvents = await eventCount(phone);
  // The word added (on its page) and the check's review; the guess is not recorded.
  expect(phoneEvents).toBe('2');

  // PC: first launch, "I already use Wordhoard on another device", enter the key.
  const pcContext = await browser.newContext({ ...devices['Desktop Chrome'] });
  await serve(pcContext, db);
  const pc = await pcContext.newPage();
  await pc.goto('/');
  await pc.getByTestId('join').click();
  await pc.getByTestId('join-key').fill(key.toLowerCase().replace(/-/g, ' '));
  await pc.getByTestId('join-go').click();
  await expect(pc.getByRole('heading', { name: 'Today' })).toBeVisible();
  expect(await eventCount(pc)).toBe(phoneEvents);
  await pc.getByTestId('tab-progress').click();
  await expect(pc.getByTestId('stage-learning')).toHaveText('1');

  // PC: change the daily time; the iPhone picks it up on its next sync.
  await pc.getByTestId('tab-settings').click();
  await pc.locator('[data-minutes="30"]').first().click();
  await pc.getByTestId('sync-now').click();
  await expect(pc.getByTestId('sync-status')).toContainText('Synced');
  await phone.getByTestId('sync-now').click();
  await expect(phone.locator('[data-minutes="30"]').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await phoneContext.close();
  await pcContext.close();
});

test('says so when the sync server is not set up yet', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'Same on both screen sizes');
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('vocab.onboarded', '1'));
  await serve(context, undefined);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('make-key').click();
  await page.getByTestId('use-new-key').click();
  await expect(page.getByTestId('sync-card')).toContainText("isn't set up yet");
  await expect(page.getByTestId('sync-badge')).toContainText('Not synced');
  await context.close();
});

test('a mistyped key is caught before anything is sent', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vocab.onboarded', '1'));
  await page.goto('/');
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('have-key').click();
  await page.getByTestId('key-input').fill('ABCDE-FGHJK-MNPQR-STVWX-YZ019');
  await expect(page.getByText("That key doesn't look right")).toBeVisible();
  await expect(page.getByTestId('use-typed-key')).toBeDisabled();
});
