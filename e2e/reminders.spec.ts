import { expect, test } from '@playwright/test';
import { handleTick } from '../server/reminders';
import { sqliteDb } from '../server/sqlite';
import { serve } from './server';

// S8: daily reminders. The browser's push subscription is faked (a test browser cannot
// reach a real push service); everything else is the real app and server code.

test.beforeEach(async ({ context, isMobile }) => {
  test.skip(isMobile, 'The same on both screen sizes');
  await context.addInitScript(() => {
    localStorage.setItem('vocab.onboarded', '1');
    let current: PushSubscription | null = null;
    const fake = {
      endpoint: 'https://push.example.com/send/abc',
      toJSON: () => ({
        endpoint: 'https://push.example.com/send/abc',
        keys: {
          p256dh:
            'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
          auth: 'BTBZMqHH6r4Tts7J_aSIgg',
        },
      }),
      unsubscribe: async () => {
        current = null;
        return true;
      },
    } as unknown as PushSubscription;
    // Headless Chromium reports notifications as blocked whatever the permission.
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
    Notification.requestPermission = async () => 'granted';
    PushManager.prototype.subscribe = async () => (current = fake);
    PushManager.prototype.getSubscription = async () => current;
  });
});

function pushService() {
  const sent: Request[] = [];
  return {
    sent,
    fetcher: async (request: Request) => {
      sent.push(request);
      return new Response(null, { status: 201 });
    },
  };
}

const tick = (db: ReturnType<typeof sqliteDb>, fetcher: (r: Request) => Promise<Response>) => {
  const now = new Date();
  now.setUTCHours(19, 5, 0, 0); // 19:05 in the test browser's time zone (UTC)
  return handleTick(new Request('https://vocab.test/api/tick'), { DB: db }, now.getTime(), fetcher);
};

test('turn on a daily reminder, test it, and turn it off', async ({ page, context }) => {
  const db = sqliteDb();
  const push = pushService();
  await serve(context, db, push.fetcher);
  await page.goto('/');
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('reminder-card')).toContainText('Turn on sync first');
  await page.getByTestId('make-key').click();
  await page.getByTestId('use-new-key').click();
  await expect(page.getByTestId('sync-status')).toContainText('Synced');

  await page.getByTestId('reminder-on').click();
  await expect(page.getByTestId('reminder-status')).toHaveText('On, at 19:00.');
  await page.getByTestId('reminder-test').click();
  await expect(page.getByText('Sent. It should arrive in a few seconds.')).toBeVisible();
  expect(push.sent.map((r) => r.url)).toEqual(['https://push.example.com/send/abc']);

  // Today's session is not done, so the 19:00 reminder goes out.
  const due = pushService();
  expect(await (await tick(db, due.fetcher)).json()).toMatchObject({ reminders: 1 });

  // A new time is saved straight away.
  await page.getByTestId('reminder-time').selectOption({ label: '21:30' });
  await expect(page.getByTestId('reminder-status')).toHaveText('On, at 21:30.');

  await page.getByTestId('reminder-off').click();
  await expect(page.getByTestId('reminder-on')).toBeVisible();
  await page.reload();
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('reminder-on')).toBeVisible();
});

test('no reminder on a day with nothing left to do', async ({ page, context }) => {
  const db = sqliteDb();
  await serve(context, db, pushService().fetcher);
  await page.goto('/');
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('make-key').click();
  await page.getByTestId('use-new-key').click();
  await page.getByTestId('reminder-on').click();
  await expect(page.getByTestId('reminder-status')).toBeVisible();

  // A busy period from today: no new words and no reviews, so today is done.
  const today = new Date().toISOString().slice(0, 10);
  await page.getByTestId('busy-start').fill(today);
  await page.getByTestId('busy-end').fill(today);
  await page.getByRole('button', { name: 'Save' }).click();
  const done = page.waitForRequest('**/api/push/done');
  await page.getByTestId('tab-today').click();
  await expect(page.getByTestId('today-done')).toBeVisible();
  await (await done).response();

  const push = pushService();
  expect(await (await tick(db, push.fetcher)).json()).toMatchObject({ reminders: 0 });
});
