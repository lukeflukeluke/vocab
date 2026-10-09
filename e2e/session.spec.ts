import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Full learning sessions, driven the way a person would. The step container says which
// word and sentence it shows (data-entry-id, data-prompt-id), so the test can look up the
// right answer in the word-bank entries.

interface BankEntry {
  id: string;
  cloze: { text: string; answer: string }[];
}
const entriesDir = new URL('../content/entries/', import.meta.url);
const entries = new Map(
  readdirSync(entriesDir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => JSON.parse(readFileSync(new URL(f, entriesDir), 'utf8')) as BankEntry[])
    .map((e) => [e.id, e]),
);

// These tests start past the first-launch welcome (e2e/onboarding.spec.ts covers it).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vocab.onboarded', '1'));
});

interface StepInfo {
  kind: string;
  role: string;
  entryId: string;
  promptId: string;
}

async function stepInfo(page: Page): Promise<StepInfo> {
  const step = page.getByTestId('step');
  await expect(step).toBeVisible();
  const [kind, role, entryId, promptId] = await Promise.all(
    ['data-kind', 'data-role', 'data-entry-id', 'data-prompt-id'].map(
      async (name) => (await step.getAttribute(name)) ?? '',
    ),
  );
  return { kind: kind!, role: role!, entryId: entryId!, promptId: promptId! };
}

function answerFor(step: StepInfo): string {
  const entry = entries.get(step.entryId)!;
  return entry.cloze[Number(step.promptId.slice(2))]!.answer;
}

/** Answers the current step correctly by tapping. */
async function answerRight(page: Page, step: StepInfo) {
  if (step.kind === 'page') {
    await page.getByTestId('continue').click();
  } else if (step.kind === 'P1') {
    await page.locator('[data-answer]').fill(answerFor(step));
    await page.getByRole('button', { name: 'Check' }).click();
    await page.getByTestId('continue').click();
  } else if (step.kind === 'R3') {
    await page.getByTestId('reveal').click();
    await page.locator('[data-grade="got"]').click();
  } else {
    await page.locator(`[data-option-id="${step.entryId}"]`).click();
    await page.getByTestId('continue').click();
  }
}

/** Steps through until the summary, answering everything right. Returns the steps seen. */
async function finish(page: Page): Promise<StepInfo[]> {
  const seen: StepInfo[] = [];
  for (let i = 0; i < 80; i++) {
    if (await page.getByTestId('summary').isVisible()) return seen;
    const step = await stepInfo(page);
    seen.push(step);
    await answerRight(page, step);
  }
  throw new Error('The session did not end');
}

test('a first session: five new words, start to finish', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('today-plan')).toContainText('5 new words');
  await page.getByTestId('start').click();

  const seen = await finish(page);
  const words = [...new Set(seen.map((s) => s.entryId))];
  expect(words).toHaveLength(5);
  // Each word: guess, page, check, fill-in-the-blank with the first letter, final check.
  for (const word of words) {
    expect(seen.filter((s) => s.entryId === word).map((s) => s.role)).toEqual([
      'guess',
      'page',
      'check',
      'blank',
      'final',
    ]);
  }

  await expect(page.getByTestId('summary')).toContainText('15 of 15 right');
  await page.getByTestId('done').click();
  await expect(page.getByTestId('today-done')).toBeVisible();
  // 5 words added and 15 answers saved, and they survive a reload.
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('event-count')).toHaveText('20');
  await page.reload();
  await expect(page.getByTestId('today-done')).toBeVisible();
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('event-count')).toHaveText('20');
});

test('a miss: "I don\'t know", retype the answer, and it comes back later', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();

  // Get to the first fill-in-the-blank.
  let step = await stepInfo(page);
  while (step.role !== 'blank') {
    await answerRight(page, step);
    step = await stepInfo(page);
  }
  const missed = step;
  const answer = answerFor(step);
  await expect(page.getByTestId('step')).toContainText(`${answer[0]}...`); // First letter shown.

  await page.getByTestId('hint').click(); // Letter count.
  await page.getByTestId('unknown').click();
  await expect(page.getByRole('status')).toContainText(`The answer is ${answer}`);
  const next = page.getByTestId('continue');
  await expect(next).toBeDisabled();
  await page.locator('[data-answer]').fill(answer.toUpperCase());
  await expect(next).toBeEnabled();
  await next.click();

  // It comes back with another sentence.
  let repeat: StepInfo | null = null;
  for (let i = 0; i < 10 && !repeat; i++) {
    step = await stepInfo(page);
    if (step.role === 'repeat') repeat = step;
    else await answerRight(page, step);
  }
  expect(repeat).toMatchObject({ entryId: missed.entryId, kind: 'P1' });
  expect(repeat!.promptId).not.toBe(missed.promptId);

  await finish(page);
  await expect(page.getByTestId('summary')).toContainText('15 of 16 right');
  await expect(page.getByTestId('summary')).toContainText('Worth another look');
});

test('a one-letter slip counts, and shows the spelling', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  let step = await stepInfo(page);
  while (step.role !== 'blank') {
    await answerRight(page, step);
    step = await stepInfo(page);
  }
  const answer = answerFor(step);
  // Swap two letters in the middle: one slip.
  const slip = answer.slice(0, 2) + answer[3] + answer[2] + answer.slice(4);
  await page.locator('[data-answer]').fill(slip);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('status')).toContainText(`Nearly! It's spelled ${answer}`);
  await expect(page.getByTestId('continue')).toBeEnabled();
});

test('pausing keeps your place', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  const first = await stepInfo(page);
  for (const role of ['guess', 'page', 'check']) {
    const step = await stepInfo(page);
    expect(step.role).toBe(role);
    await answerRight(page, step);
  }
  await page.getByTestId('pause').click();

  await expect(page.getByTestId('today-plan')).toContainText('4 new words');
  await expect(page.getByTestId('start')).toHaveText('Continue');
  await page.reload();
  await page.getByTestId('start').click();

  const seen = await finish(page);
  // The first word is not met again, but its fill-in-the-blank and final check still come.
  const firstWord = seen.filter((s) => s.entryId === first.entryId).map((s) => s.role);
  expect(firstWord).toEqual(['blank', 'final']);
  expect(new Set(seen.filter((s) => s.role === 'guess').map((s) => s.entryId)).size).toBe(4);
});

test('"I know this word" asks for proof, then brings in another word', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  const first = await stepInfo(page);
  await page.getByTestId('know-it').click();

  const check = await stepInfo(page);
  expect(check).toMatchObject({ role: 'known', kind: 'P1', entryId: first.entryId });
  await expect(page.getByTestId('hint')).toHaveCount(0);
  await page.locator('[data-answer]').fill(answerFor(check));
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByTestId('continue').click();

  const next = await stepInfo(page);
  expect(next.role).toBe('guess');
  expect(next.entryId).not.toBe(first.entryId);

  const seen = await finish(page);
  expect(seen.some((s) => s.entryId === first.entryId)).toBe(false);
  await expect(page.getByTestId('summary')).toContainText('Already known');
  // Still five new words.
  expect(new Set(seen.filter((s) => s.role === 'guess').map((s) => s.entryId)).size).toBe(5);
});

test('the answer box is above the keyboard and turns off autocorrect', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  let step = await stepInfo(page);
  while (step.kind !== 'P1') {
    await answerRight(page, step);
    step = await stepInfo(page);
  }
  const input = page.locator('[data-answer]');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('autocorrect', 'off');
  await expect(input).toHaveAttribute('autocapitalize', 'none');
  await expect(input).toHaveAttribute('spellcheck', 'false');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  const fontSize = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
  // Near the top half of the screen, where an on-screen keyboard cannot cover it.
  const box = (await input.boundingBox())!;
  const height = page.viewportSize()!.height;
  expect(box.y + box.height).toBeLessThan(height * 0.6);
});

test('works with the keyboard alone on a PC', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard shortcuts are for PC');
  await page.goto('/');
  await page.getByTestId('start').click();

  for (let i = 0; i < 80; i++) {
    if (await page.getByTestId('summary').isVisible()) break;
    const step = await stepInfo(page);
    if (step.kind === 'page') {
      await page.keyboard.press('Enter');
    } else if (step.kind === 'P1') {
      await page.keyboard.type(answerFor(step));
      await page.keyboard.press('Enter');
      await expect(page.getByRole('status')).toContainText('Right');
      await page.keyboard.press('Enter');
    } else {
      const ids = await page
        .locator('[data-option-id]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-option-id')));
      await page.keyboard.press(String(ids.indexOf(step.entryId) + 1));
      await expect(page.getByTestId('continue')).toBeVisible();
      await page.keyboard.press('Enter');
    }
  }
  await expect(page.getByTestId('summary')).toContainText('15 of 15 right');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('today-done')).toBeVisible();
});

/** Writes events straight into the app's database, as if studied on earlier days. */
async function seed(page: Page, events: Record<string, unknown>[]) {
  await page.goto('/');
  await expect(page.getByTestId('start')).toBeVisible();
  await page.evaluate(async (rows) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vocab');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('events', 'readwrite');
    for (const row of rows) tx.objectStore('events').add(row);
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
  }, events);
  await page.reload();
}

/** Five words met 20 days ago, two of them reviewed again later. */
function laterDayEvents() {
  const day = 86_400_000;
  const start = Date.now() - 20 * day;
  const words = ['laconic#adj', 'salient#adj', 'tenuous#adj', 'cogent#adj', 'tacit#adj'];
  let n = 0;
  const event = (t: number, body: Record<string, unknown>) => ({
    id: `seed-${String(++n).padStart(4, '0')}`,
    t,
    device: 'seed',
    v: 1,
    ...body,
  });
  const review = (entryId: string, t: number) =>
    event(t, {
      type: 'review',
      entryId,
      track: 'recognition',
      exercise: 'R1',
      correct: true,
      rating: 3,
      ms: 4000,
      hintsUsed: 0,
    });
  const events = words.flatMap((entryId, i) => [
    event(start + i * 1000, { type: 'word_added', entryId, source: 'bank' }),
    review(entryId, start + i * 1000 + 100),
    review(entryId, start + i * 1000 + 200),
    review(entryId, start + i * 1000 + 300),
  ]);
  // Two words were reviewed again later, so their production track has opened.
  events.push(review('laconic#adj', start + 3 * day), review('salient#adj', start + 3 * day));
  return events;
}

test('later days: quick recall (R3) and "which word fits?" (P3)', async ({ page }) => {
  await seed(page, laterDayEvents());

  await expect(page.getByTestId('today-plan')).toContainText('5 reviews');
  await page.getByTestId('start').click();
  const seen = await finish(page);
  const reviews = seen.filter((s) => s.role === 'review');
  expect(reviews.map((s) => s.kind).sort()).toEqual(['P3', 'P3', 'R3', 'R3', 'R3']);
  expect(
    reviews
      .filter((s) => s.kind === 'P3')
      .map((s) => s.entryId)
      .sort(),
  ).toEqual(['laconic#adj', 'salient#adj']);
});

test('2-minute mode: only the most at-risk reviews', async ({ page }) => {
  await seed(page, laterDayEvents());
  await page.getByTestId('quick').click();
  const seen = await finish(page);
  expect(seen.length).toBe(5);
  expect(seen.every((s) => s.role === 'review')).toBe(true);
  await expect(page.getByTestId('summary')).toContainText('5 of 5 right');
});
