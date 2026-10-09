import { beforeEach, describe, expect, it } from 'vitest';
import { parseBackup } from '../src/lib/backup';
import { studyDay } from '../src/lib/scheduler/day';
import { newSyncKey } from '../src/lib/sync/key';
import {
  handlePush,
  handleTick,
  isDue,
  resetReminderSchemaCache,
  vapidKeys,
  type BackupBucket,
} from './reminders';
import { sqliteDb } from './sqlite';
import { accountOf, sync } from './sync';

const key = newSyncKey();
// 2026-10-10 18:00 UTC; with tz +60 it is 19:00 local.
const SIX_PM = Date.UTC(2026, 9, 10, 18, 0);
const TZ = 60;
const MIN = 60_000;

function post(path: string, body: unknown, auth = `Bearer ${key}`) {
  return new Request(`https://vocab.test/api/${path}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const subscription = (n = 1) => ({
  endpoint: `https://push.example.com/send/${n}`,
  keys: {
    // A real P-256 public key is needed to encrypt; any valid one works for these tests.
    p256dh:
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  },
});

/** A push service that records what it is sent and answers with `status`. */
function pushService(status = 201) {
  const sent: Request[] = [];
  return {
    sent,
    fetcher: async (request: Request) => {
      sent.push(request);
      return new Response(null, { status });
    },
  };
}

async function subscribe(db: ReturnType<typeof sqliteDb>, minute = 19 * 60, n = 1) {
  const res = await handlePush(
    'subscribe',
    post('push/subscribe', { subscription: subscription(n), minute, tz: TZ }),
    { DB: db },
    0,
  );
  expect(res.status).toBe(200);
}

beforeEach(() => resetReminderSchemaCache());

describe('isDue', () => {
  const sub = { minute: 19 * 60, tz: TZ, last_day: -1 };
  it('is due from the chosen time for three hours, once a day', () => {
    expect(isDue(sub, -1, SIX_PM - MIN)).toBe(false);
    expect(isDue(sub, -1, SIX_PM)).toBe(true);
    expect(isDue(sub, -1, SIX_PM + 179 * MIN)).toBe(true);
    expect(isDue(sub, -1, SIX_PM + 180 * MIN)).toBe(false);
    const today = studyDay(SIX_PM, TZ);
    expect(isDue({ ...sub, last_day: today }, -1, SIX_PM)).toBe(false);
    expect(isDue({ ...sub, last_day: today - 1 }, -1, SIX_PM)).toBe(true);
  });

  it('is not due when today is already done', () => {
    expect(isDue(sub, studyDay(SIX_PM, TZ), SIX_PM)).toBe(false);
    expect(isDue(sub, studyDay(SIX_PM, TZ) - 1, SIX_PM)).toBe(true);
  });
});

describe('reminders', () => {
  it('gives the same public key every time', async () => {
    const db = sqliteDb();
    const a = await handlePush(
      'key',
      new Request('https://vocab.test/api/push/key'),
      { DB: db },
      0,
    );
    const { publicKey } = (await a.json()) as { publicKey: string };
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect((await vapidKeys(db)).publicKey).toBe(publicKey);
  });

  it('sends a due reminder once, signed and encrypted', async () => {
    const db = sqliteDb();
    await subscribe(db);
    const push = pushService();
    const tick = () => handleTick(post('tick', {}), { DB: db }, SIX_PM + 5 * MIN, push.fetcher);
    expect(await (await tick()).json()).toEqual({ reminders: 1, backups: null });
    expect(await (await tick()).json()).toEqual({ reminders: 0, backups: null });
    const [request] = push.sent;
    expect(request!.url).toBe(subscription().endpoint);
    expect(request!.headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(request!.headers.get('Authorization')).toMatch(/^vapid t=.+, k=.+$/);
  });

  it('skips the day once the session is done, on any device', async () => {
    const db = sqliteDb();
    await subscribe(db);
    const day = studyDay(SIX_PM, TZ);
    expect((await handlePush('done', post('push/done', { day }), { DB: db }, 0)).status).toBe(200);
    const push = pushService();
    await handleTick(post('tick', {}), { DB: db }, SIX_PM + 5 * MIN, push.fetcher);
    expect(push.sent).toHaveLength(0);
    // The next day it is due again.
    await handleTick(post('tick', {}), { DB: db }, SIX_PM + 1440 * MIN, push.fetcher);
    expect(push.sent).toHaveLength(1);
  });

  it('forgets a subscription the push service says is gone, and retries other failures', async () => {
    const db = sqliteDb();
    await subscribe(db);
    const down = pushService(500);
    await handleTick(post('tick', {}), { DB: db }, SIX_PM, down.fetcher);
    await handleTick(post('tick', {}), { DB: db }, SIX_PM + 10 * MIN, down.fetcher);
    expect(down.sent).toHaveLength(2);
    const gone = pushService(410);
    await handleTick(post('tick', {}), { DB: db }, SIX_PM + 20 * MIN, gone.fetcher);
    await handleTick(post('tick', {}), { DB: db }, SIX_PM + 30 * MIN, gone.fetcher);
    expect(gone.sent).toHaveLength(1);
  });

  it('sends a test reminder now, to your own subscription only', async () => {
    const db = sqliteDb();
    await subscribe(db);
    const push = pushService();
    const endpoint = subscription().endpoint;
    const ok = await handlePush(
      'test',
      post('push/test', { endpoint }),
      { DB: db },
      0,
      push.fetcher,
    );
    expect(ok.status).toBe(200);
    const other = `Bearer ${newSyncKey()}`;
    const res = await handlePush('test', post('push/test', { endpoint }, other), { DB: db }, 0);
    expect(res.status).toBe(404);
  });

  it('turns away bad input and unsubscribes', async () => {
    const db = sqliteDb();
    const bad = (body: unknown) =>
      handlePush('subscribe', post('push/subscribe', body), { DB: db }, 0).then((r) => r.status);
    expect(await bad({ subscription: subscription(), minute: 3 * 60, tz: TZ })).toBe(400);
    expect(await bad({ subscription: { endpoint: 'http://x' }, minute: 1200, tz: TZ })).toBe(400);
    expect(
      (await handlePush('subscribe', post('push/subscribe', {}, 'Bearer nope'), { DB: db }, 0))
        .status,
    ).toBe(401);
    await subscribe(db);
    await handlePush(
      'unsubscribe',
      post('push/unsubscribe', { endpoint: subscription().endpoint }),
      { DB: db },
      0,
    );
    const push = pushService();
    await handleTick(post('tick', {}), { DB: db }, SIX_PM, push.fetcher);
    expect(push.sent).toHaveLength(0);
  });

  it('says so when there is no database', async () => {
    expect((await handleTick(post('tick', {}), {}, 0)).status).toBe(503);
  });
});

describe('weekly backups', () => {
  it("writes each account's whole log to the bucket once a week", async () => {
    const db = sqliteDb();
    const account = await accountOf(key);
    const event = {
      id: 'e1',
      t: 1,
      device: 'phone',
      v: 1 as const,
      type: 'word_added',
      entryId: 'posit#v',
    };
    await sync(db, account, { cursor: 0, events: [event] }, 0);
    const files = new Map<string, string>();
    const bucket: BackupBucket = {
      put: async (k, v) => {
        files.set(k, v);
      },
    };
    const run = (now: number) =>
      handleTick(post('tick', {}), { DB: db, BACKUPS: bucket }, now, pushService().fetcher);
    expect(await (await run(SIX_PM)).json()).toEqual({ reminders: 0, backups: 1 });
    expect(await (await run(SIX_PM + 86_400_000)).json()).toEqual({ reminders: 0, backups: 0 });
    expect(await (await run(SIX_PM + 7 * 86_400_000)).json()).toEqual({ reminders: 0, backups: 1 });
    expect([...files.keys()]).toEqual([
      `${account.slice(0, 16)}/vocab-backup-2026-10-10.json`,
      `${account.slice(0, 16)}/vocab-backup-2026-10-17.json`,
    ]);
    // The file is a normal backup: Settings, Import reads it.
    expect(parseBackup(files.values().next().value!)).toEqual([event]);
  });
});
