import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// S5: onboarding with the placement test, settings, backups, 2-minute mode and time
// travel, driven as a person would at iPhone size and on a desktop.

/** Answers the yes/no part: yes to real words up to `knownShare` of the way through. */
async function takeYesNo(page: Page) {
  const word = page.getByTestId('test-word');
  await expect(word).toBeVisible();
  let i = 0;
  while (await word.isVisible().catch(() => false)) {
    const fake = (await word.getAttribute('data-fake')) === 'true';
    // Someone who knows most real words but not all: every fourth one is a "no".
    await page.getByTestId(!fake && i++ % 4 !== 0 ? 'say-yes' : 'say-no').click();
  }
}

/** Answers every meaning check correctly. */
async function takeChecks(page: Page) {
  const word = page.getByTestId('check-word');
  await expect(word).toBeVisible();
  while (await word.isVisible().catch(() => false)) {
    const before = await word.textContent();
    await page.locator('[data-right="true"]').click();
    await expect(word.or(page.getByTestId('placement-result'))).not.toHaveText(before!);
  }
}

test('first launch: placement test, daily time, then the first session', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('begin-test').click();
  await takeYesNo(page);
  await takeChecks(page);

  await expect(page.getByTestId('vocab-size')).toHaveText(/About [\d,]+ words/);
  await page.getByTestId('placement-continue').click();

  await page.locator('[data-minutes="20"]').first().click();
  await page.getByText('Different time at weekends').click();
  await page.locator('fieldset').nth(1).locator('[data-minutes="10"]').click();
  await page.getByTestId('start-first').click();
  await expect(page.getByTestId('step')).toBeVisible();

  // The choices were saved.
  await page.getByTestId('pause').click();
  await page.getByTestId('tab-settings').click();
  await expect(page.locator('[data-minutes="20"]').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('fieldset').nth(1).locator('[data-minutes="10"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // And the test result is on the Progress tab.
  await page.getByTestId('tab-progress').click();
  await expect(page.getByText(/About [\d,]+ words/)).toBeVisible();
});

test('the placement test can be stopped and taken later from Today', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('begin-test').click();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByTestId('skip-test').click();
  await page.getByRole('button', { name: 'Not now' }).click();

  await page.getByTestId('take-placement').click();
  await takeYesNo(page);
  await takeChecks(page);
  await page.getByTestId('placement-continue').click();
  await expect(page.getByTestId('placement-card')).toHaveCount(0);
});

test.describe('after the welcome', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('vocab.onboarded', '1'));
  });

  test('changing the daily time changes today', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('today-plan')).toContainText('5 new words');
    await page.getByTestId('tab-settings').click();
    await page.locator('[data-minutes="5"]').first().click();
    await page.locator('[data-retention="0.95"]').click();
    await expect(page.locator('[data-retention="0.95"]')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('tab-today').click();
    await expect(page.getByTestId('today-plan')).toContainText('3 new words');
  });

  test('a busy period pauses new words', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-settings').click();
    const today = new Date();
    const inDays = (n: number) =>
      new Date(today.getTime() + n * 86_400_000).toISOString().slice(0, 10);
    await page.getByTestId('busy-start').fill(inDays(2));
    await page.getByTestId('busy-end').fill(inDays(9));
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('settings-message')).toContainText('Busy period saved');
    await page.getByTestId('tab-today').click();
    await expect(page.getByTestId('today-done')).toBeVisible();
    await expect(page.getByText('Busy period: no new words')).toBeVisible();
  });

  test('export a backup and import it on a fresh device', async ({ page, browser, isMobile }) => {
    test.skip(isMobile, 'File download and upload are the same on both screen sizes');
    await page.goto('/');
    await page.getByTestId('tab-settings').click();
    await page.locator('[data-minutes="30"]').first().click();
    const download = page.waitForEvent('download');
    await page.getByTestId('export').click();
    const file = await (await download).path();
    const backup = JSON.parse(readFileSync(file, 'utf8')) as { events: unknown[] };
    expect(backup.events).toHaveLength(1);

    const other = await browser.newContext();
    const fresh = await other.newPage();
    await fresh.addInitScript(() => localStorage.setItem('vocab.onboarded', '1'));
    await fresh.goto('/');
    await fresh.getByTestId('tab-settings').click();
    await fresh.getByTestId('import').setInputFiles(file);
    await expect(fresh.getByTestId('settings-message')).toContainText('Imported 1 events');
    await expect(fresh.locator('[data-minutes="30"]').first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Importing again adds nothing.
    await fresh.getByTestId('import').setInputFiles(file);
    await expect(fresh.getByTestId('settings-message')).toContainText('Nothing new');
    await other.close();
  });

  test('time travel uses separate test data and moves the days on', async ({ page }) => {
    await page.goto('/');
    // Real data: one session's first word, then pause.
    await page.getByTestId('start').click();
    await page.getByTestId('pause').click();
    await page.getByTestId('tab-settings').click();
    const realCount = await page.getByTestId('event-count').textContent();

    // Hidden: tap the version 7 times.
    await expect(page.getByTestId('time-travel')).toHaveCount(0);
    for (let i = 0; i < 7; i++) await page.getByTestId('version').click();
    await page.getByTestId('travel-on').click();
    await expect(page.getByTestId('test-mode')).toHaveText(/day \+0/);
    await expect(page.getByTestId('today-plan')).toContainText('5 new words');

    // A first session in test mode, then a week later the words are due for review.
    await page.getByTestId('tab-settings').click();
    await expect(page.getByTestId('event-count')).toHaveText('0');
    await page.getByTestId('tab-today').click();
    await page.getByTestId('start').click();
    await page.getByTestId('pause').click();
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('travel-week').click();
    await expect(page.getByTestId('test-mode')).toHaveText(/day \+7/);
    await expect(page.getByTestId('today-plan')).toBeVisible();

    // Back to real data, untouched.
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('travel-off').click();
    await expect(page.getByTestId('test-mode')).toHaveCount(0);
    await page.getByTestId('tab-settings').click();
    await expect(page.getByTestId('event-count')).toHaveText(realCount!);
  });

  test('the Progress tab shows the ladder', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-progress').click();
    await expect(page.getByTestId('owned')).toHaveText('0');
    await expect(page.getByTestId('stage-learning')).toHaveText('0');
    await page.getByTestId('tab-today').click();
    await page.getByTestId('start').click();
    // Meet one word: guess, page, check.
    const step = page.getByTestId('step');
    const id = await step.getAttribute('data-entry-id');
    await page.locator(`[data-option-id="${id}"]`).click();
    await page.getByTestId('continue').click();
    await page.getByTestId('continue').click();
    await page.locator(`[data-option-id="${id}"]`).click();
    await page.getByTestId('pause').click();
    await page.getByTestId('tab-progress').click();
    await expect(page.getByTestId('stage-learning')).toHaveText('1');
  });
});
