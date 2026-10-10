import { devices, expect, test, type Page } from '@playwright/test';
import { handleCapture } from '../server/capture';
import { sqliteDb } from '../server/sqlite';
import { serve } from './server';

// S7: capturing words (PLAN 3.3, 13.5): the Inbox's quick-add box, sorting with the meaning
// picker, the iOS Shortcut (through the real server code) and the PC bookmarklet.

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('vocab.onboarded', '1'));
});

async function add(page: Page, word: string, context = '') {
  await page.getByTestId('tab-inbox').click();
  await page.getByTestId('inbox-word').fill(word);
  if (context) await page.getByTestId('inbox-context').fill(context);
  await page.getByTestId('inbox-add').click();
  await expect(page.getByTestId('sort-capture')).toBeVisible();
}

test('a word from the bank, with your sentence, comes first in the next session', async ({
  page,
}) => {
  await page.goto('/');
  await add(page, 'laconic', 'Her reply was laconic, almost rude.');
  await expect(page.locator('[data-testid="sort-capture"] .context mark')).toHaveText('laconic');
  await page.locator('[data-testid="meaning"][data-entry-id="laconic#adj"]').check();
  await page.getByTestId('sort-learn').click();
  await expect(page.getByTestId('inbox-empty')).toBeVisible();
  await expect(page.getByText('Learning')).toBeVisible();

  // It is introduced first, guessed from your own sentence.
  await page.getByTestId('tab-today').click();
  await page.getByTestId('start').click();
  const step = page.getByTestId('step');
  await expect(step).toHaveAttribute('data-entry-id', 'laconic#adj');
  await expect(step).toHaveAttribute('data-kind', 'guess');
  await expect(step).toContainText('Her reply was laconic, almost rude.');
});

test('a word not in the bank is learned from the dictionary', async ({ page }) => {
  await page.goto('/');
  await add(page, 'sabayon');
  // One meaning in the dictionary, so it is already picked.
  await expect(page.getByTestId('meaning').first()).toBeChecked();
  await page.getByTestId('sort-learn').click();
  await expect(page.getByTestId('inbox-badge')).toHaveCount(0);

  await page.getByTestId('tab-today').click();
  await expect(page.getByTestId('today-plan')).toContainText('new word');
  await page.getByTestId('start').click();
  const step = page.getByTestId('step');
  const id = (await step.getAttribute('data-entry-id'))!;
  expect(id).toMatch(/^my:sabayon#n\./);
  await page.locator(`[data-option-id="${id}"]`).click();
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('word-page')).toContainText(
    'Light foamy custard-like dessert served hot or chilled.',
  );
  await page.getByTestId('continue').click();
  await page.locator(`[data-option-id="${id}"]`).click();
  await page.getByTestId('pause').click();
  await page.getByTestId('tab-progress').click();
  await expect(page.getByTestId('stage-learning')).toHaveText('1');
});

test('a word in no dictionary can be learned with a meaning you write', async ({ page }) => {
  await page.goto('/');
  await add(page, 'gallimaufry', 'The menu was a gallimaufry of styles.');
  await expect(page.getByTestId('not-found')).toBeVisible();
  await expect(page.getByTestId('sort-learn')).toBeDisabled();
  await page.getByTestId('own-meaning').fill('a confused jumble');
  await page.getByTestId('sort-learn').click();
  await expect(page.getByText('Learning')).toBeVisible();
  await page.getByTestId('tab-today').click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('step')).toContainText('The menu was a gallimaufry of styles.');
});

test('the iOS Shortcut: a shared sentence lands in the Inbox on both devices', async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, 'One run covers both devices');
  const db = sqliteDb();
  const phoneContext = await browser.newContext({ ...devices['iPhone 13'] });
  await phoneContext.addInitScript(() => localStorage.setItem('vocab.onboarded', '1'));
  await serve(phoneContext, db);
  const phone = await phoneContext.newPage();
  await phone.goto('/');
  await phone.getByTestId('tab-settings').click();
  await phone.getByTestId('make-key').click();
  await phone.getByTestId('use-new-key').click();
  await expect(phone.getByTestId('sync-status')).toContainText('Synced');
  const auth = (await phone.getByTestId('capture-auth').textContent())!.trim();

  // What the Shortcut sends when you share a selected sentence from Safari.
  const sentence = 'His laconic answer told us nothing at all.';
  const res = await handleCapture(
    new Request('https://vocab.test/api/capture', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sentence }),
    }),
    db,
    Date.now(),
  );
  expect(await res.text()).toBe('Added to your Wordhoard Inbox. Pick the word there.');

  // The PC joins and sees it too.
  const pcContext = await browser.newContext({ ...devices['Desktop Chrome'] });
  await serve(pcContext, db);
  const pc = await pcContext.newPage();
  await pc.goto('/');
  await pc.getByTestId('join').click();
  await pc.getByTestId('join-key').fill(auth.replace('Bearer ', ''));
  await pc.getByTestId('join-go').click();
  await expect(pc.getByTestId('inbox-badge')).toHaveText('1');

  // On the iPhone: sync, pick the word from the sentence, learn it.
  await phone.getByTestId('sync-now').click();
  await expect(phone.getByTestId('inbox-badge')).toHaveText('1');
  await phone.getByTestId('tab-inbox').click();
  await phone.getByTestId('inbox-item').click();
  await phone.locator('[data-testid="pick-word"][data-word="laconic"]').click();
  await phone.locator('[data-testid="meaning"][data-entry-id="laconic#adj"]').check();
  await phone.getByTestId('sort-learn').click();
  await expect(phone.getByTestId('inbox-badge')).toHaveCount(0);

  // Sorted on the iPhone, gone from the PC's Inbox after its next sync.
  await phone.getByTestId('tab-settings').click();
  await phone.getByTestId('sync-now').click();
  await expect(phone.getByTestId('sync-status')).toContainText('Synced');
  await pc.getByTestId('tab-settings').click();
  await pc.getByTestId('sync-now').click();
  await expect(pc.getByTestId('inbox-badge')).toHaveCount(0);

  await phoneContext.close();
  await pcContext.close();
});

test('the PC bookmarklet saves the selected word and its sentence', async ({
  page,
  context,
  isMobile,
  baseURL,
}) => {
  test.skip(isMobile, 'A PC feature');
  await page.goto('/');
  await page.getByTestId('tab-settings').click();
  const href = (await page.getByTestId('bookmarklet').getAttribute('href'))!;
  expect(href.startsWith('javascript:')).toBe(true);

  // Some page you are reading, with "laconic" selected.
  const reading = await context.newPage();
  await reading.route('https://example.com/article', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<title>An article</title><p>It rained. The minister gave a laconic reply to every question. Then she left.</p>`,
    }),
  );
  await reading.goto('https://example.com/article');
  await reading.evaluate(() => {
    const p = document.querySelector('p')!;
    const text = p.firstChild!;
    const at = text.textContent!.indexOf('laconic');
    const range = document.createRange();
    range.setStart(text, at);
    range.setEnd(text, at + 'laconic'.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  const popup = context.waitForEvent('page');
  await reading.evaluate(decodeURIComponent(href.slice('javascript:'.length)));
  const capture = await popup;
  expect(capture.url().startsWith(baseURL!)).toBe(true);
  await expect(capture.getByTestId('capture-status')).toHaveText('In your Inbox.');

  await page.reload();
  await expect(page.getByTestId('inbox-badge')).toHaveText('1');
  await page.getByTestId('tab-inbox').click();
  const item = page.getByTestId('inbox-item');
  await expect(item).toContainText('laconic');
  await expect(item).toContainText('The minister gave a laconic reply to every question.');
  await expect(item).not.toContainText('It rained');
  await expect(item).toContainText('An article');
});
