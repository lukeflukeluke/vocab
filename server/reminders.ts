// Daily reminders and weekly backups (PLAN 13.4, ROADMAP S8).
//
// Reminders are Web Push messages. A device that turns them on sends its push
// subscription, the reminder time and its time zone. Whenever a device finds today's
// session done, it says so. A tick every 10 minutes (a scheduled GitHub Action calling
// POST /api/tick, because Pages Functions cannot run on a timer) sends each reminder that
// is due, once a day, unless that day's session is already done.
//
// The same tick writes a weekly copy of each account's event log to Cloudflare R2, when a
// bucket is bound as BACKUPS (optional; see docs/SETUP-REMINDERS.md).
//
// The VAPID key pair that signs pushes is made on first use and kept in the database, so
// there is no secret to set up by hand.

import { makeBackup } from '../src/lib/backup';
import type { VocabEvent } from '../src/lib/events/types';
import { studyDay } from '../src/lib/scheduler/day';
import { isValidKey, normalizeKey } from '../src/lib/sync/key';
import { accountOf, ensureSchema, type SyncDb } from './sync';
import { generateVapidKeys, pushRequest, type PushTarget, type VapidKeys } from './webpush';

/** The part of Cloudflare R2's bucket interface used here. */
export interface BackupBucket {
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
}

export interface ReminderEnv {
  DB?: SyncDb;
  BACKUPS?: BackupBucket;
}

export type Fetcher = (request: Request) => Promise<Response>;

/** Reminder times allowed: 6:00 to 23:30, so a reminder never falls before the 4am day start. */
export const EARLIEST = 6 * 60;
export const LATEST = 23 * 60 + 30;
/** A reminder more than this late (the tick was down) is skipped for the day. */
const LATE_MINUTES = 180;
const WEEK_MS = 7 * 86_400_000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS config (name TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    minute INTEGER NOT NULL,
    tz INTEGER NOT NULL,
    last_day INTEGER NOT NULL DEFAULT -1,
    updated INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS done_days (account TEXT PRIMARY KEY, day INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS backups (account TEXT PRIMARY KEY, last INTEGER NOT NULL)`,
];

let ready: WeakSet<object> = new WeakSet();

async function ensureTables(db: SyncDb): Promise<void> {
  await ensureSchema(db);
  if (ready.has(db)) return;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  ready.add(db);
}

/** For tests: forget which databases already have their tables. */
export function resetReminderSchemaCache(): void {
  ready = new WeakSet();
}

/** The server's VAPID keys, made and saved on first use. */
export async function vapidKeys(db: SyncDb): Promise<VapidKeys> {
  await ensureTables(db);
  const { results } = await db
    .prepare('SELECT value FROM config WHERE name = ?')
    .bind('vapid')
    .all<{ value: string }>();
  if (results[0]) return JSON.parse(results[0].value) as VapidKeys;
  const keys = await generateVapidKeys();
  // Two first requests at once: the first insert wins and both read it back.
  await db
    .prepare('INSERT OR IGNORE INTO config (name, value) VALUES (?, ?)')
    .bind('vapid', JSON.stringify(keys))
    .run();
  return vapidKeys(db);
}

/** A reminder is due when it is past its time today and nothing has been sent today. */
export function isDue(
  sub: { minute: number; tz: number; last_day: number },
  doneDay: number,
  now: number,
): boolean {
  const day = studyDay(now, sub.tz);
  if (sub.last_day >= day || doneDay >= day) return false;
  const local = (((Math.floor(now / 60_000) + sub.tz) % 1440) + 1440) % 1440;
  return local >= sub.minute && local < sub.minute + LATE_MINUTES;
}

const REMINDER = {
  title: 'Wordhoard',
  body: "Today's words are waiting. A few minutes keeps them.",
  url: '/',
};

async function send(
  target: PushTarget,
  message: object,
  keys: VapidKeys,
  subject: string,
  now: number,
  fetcher: Fetcher,
): Promise<'sent' | 'gone' | 'failed'> {
  try {
    const res = await fetcher(
      await pushRequest(target, JSON.stringify(message), keys, subject, now),
    );
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

interface SubRow {
  endpoint: string;
  account: string;
  p256dh: string;
  auth: string;
  minute: number;
  tz: number;
  last_day: number;
}

/** Sends every reminder that is due. Returns how many were sent. */
export async function sendDueReminders(
  db: SyncDb,
  now: number,
  subject: string,
  fetcher: Fetcher,
): Promise<number> {
  await ensureTables(db);
  const { results: subs } = await db
    .prepare(
      `SELECT s.endpoint, s.account, s.p256dh, s.auth, s.minute, s.tz, s.last_day,
        COALESCE(d.day, -1) AS done_day
       FROM push_subs s LEFT JOIN done_days d ON d.account = s.account`,
    )
    .all<SubRow & { done_day: number }>();
  const due = subs.filter((s) => isDue(s, Number(s.done_day), now));
  if (!due.length) return 0;
  const keys = await vapidKeys(db);
  let sent = 0;
  for (const sub of due) {
    const result = await send(sub, REMINDER, keys, subject, now, fetcher);
    if (result === 'gone') {
      await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run();
    } else if (result === 'sent') {
      sent += 1;
      await db
        .prepare('UPDATE push_subs SET last_day = ? WHERE endpoint = ?')
        .bind(studyDay(now, sub.tz), sub.endpoint)
        .run();
    }
    // 'failed': left as it is, so the next tick tries again.
  }
  return sent;
}

/** Writes a backup file for each account whose last one is a week old or more. */
export async function weeklyBackups(
  db: SyncDb,
  bucket: BackupBucket,
  now: number,
): Promise<number> {
  await ensureTables(db);
  const { results: accounts } = await db
    .prepare(
      `SELECT DISTINCT e.account FROM events e LEFT JOIN backups b ON b.account = e.account
       WHERE b.last IS NULL OR b.last <= ?`,
    )
    .bind(now - WEEK_MS)
    .all<{ account: string }>();
  for (const { account } of accounts) {
    const { results } = await db
      .prepare('SELECT body FROM events WHERE account = ? ORDER BY seq')
      .bind(account)
      .all<{ body: string }>();
    const events = results.map((r) => JSON.parse(r.body) as VocabEvent);
    const date = new Date(now).toISOString().slice(0, 10);
    await bucket.put(
      `${account.slice(0, 16)}/vocab-backup-${date}.json`,
      makeBackup(events, 'server', now),
      {
        httpMetadata: { contentType: 'application/json' },
      },
    );
    await db
      .prepare(
        'INSERT INTO backups (account, last) VALUES (?, ?) ON CONFLICT(account) DO UPDATE SET last = excluded.last',
      )
      .bind(account, now)
      .run();
  }
  return accounts.length;
}

// HTTP

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function accountFrom(request: Request): Promise<string | null> {
  const raw = (request.headers.get('Authorization') ?? '').replace(/^\s*Bearer\s*/i, '');
  return isValidKey(raw) ? accountOf(normalizeKey(raw)) : null;
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

const isText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;

/** Who the pushes say they come from (RFC 8292 asks for a contact URL). */
const subjectOf = (request: Request) => new URL(request.url).origin;

/**
 * /api/push/key (GET), /api/push/subscribe, /api/push/unsubscribe, /api/push/done and
 * /api/push/test (POST, with the sync key).
 */
export async function handlePush(
  action: string,
  request: Request,
  env: ReminderEnv,
  now: number,
  fetcher: Fetcher = (r) => fetch(r),
): Promise<Response> {
  const db = env.DB;
  if (!db) return json({ error: 'no-database' }, 503);
  if (action === 'key') return json({ publicKey: (await vapidKeys(db)).publicKey });
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const account = await accountFrom(request);
  if (!account) return json({ error: 'missing-key' }, 401);
  await ensureTables(db);
  const input = await body(request);

  if (action === 'subscribe') {
    const sub = input.subscription as
      { endpoint?: unknown; keys?: Record<string, unknown> } | undefined;
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (
      !isText(endpoint, 2000) ||
      !endpoint.startsWith('https://') ||
      !isText(p256dh, 200) ||
      !isText(auth, 100) ||
      !isInt(input.minute, EARLIEST, LATEST) ||
      !isInt(input.tz, -14 * 60, 14 * 60)
    ) {
      return json({ error: 'bad-subscription' }, 400);
    }
    await db
      .prepare(
        `INSERT INTO push_subs (endpoint, account, p256dh, auth, minute, tz, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET account = excluded.account, p256dh = excluded.p256dh,
           auth = excluded.auth, minute = excluded.minute, tz = excluded.tz, updated = excluded.updated`,
      )
      .bind(endpoint, account, p256dh, auth, input.minute, input.tz, now)
      .run();
    return json({ ok: true });
  }

  if (action === 'unsubscribe') {
    if (!isText(input.endpoint, 2000)) return json({ error: 'bad-endpoint' }, 400);
    await db
      .prepare('DELETE FROM push_subs WHERE endpoint = ? AND account = ?')
      .bind(input.endpoint, account)
      .run();
    return json({ ok: true });
  }

  if (action === 'done') {
    if (!isInt(input.day, 0, 1_000_000)) return json({ error: 'bad-day' }, 400);
    await db
      .prepare(
        `INSERT INTO done_days (account, day) VALUES (?, ?)
         ON CONFLICT(account) DO UPDATE SET day = MAX(day, excluded.day)`,
      )
      .bind(account, input.day)
      .run();
    return json({ ok: true });
  }

  if (action === 'test') {
    const { results } = await db
      .prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE endpoint = ? AND account = ?')
      .bind(input.endpoint, account)
      .all<PushTarget>();
    const target = results[0];
    if (!target) return json({ error: 'not-subscribed' }, 404);
    const message = { title: 'Wordhoard', body: 'Reminders are working.', url: '/' };
    const result = await send(
      target,
      message,
      await vapidKeys(db),
      subjectOf(request),
      now,
      fetcher,
    );
    if (result === 'gone') {
      await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(target.endpoint).run();
    }
    return json({ result }, result === 'sent' ? 200 : 502);
  }

  return json({ error: 'not-found' }, 404);
}

/** POST /api/tick: sends due reminders and makes weekly backups. Safe to call any time. */
export async function handleTick(
  request: Request,
  env: ReminderEnv,
  now: number,
  fetcher: Fetcher = (r) => fetch(r),
): Promise<Response> {
  const db = env.DB;
  if (!db) return json({ error: 'no-database' }, 503);
  const reminders = await sendDueReminders(db, now, subjectOf(request), fetcher);
  const backups = env.BACKUPS ? await weeklyBackups(db, env.BACKUPS, now) : null;
  return json({ reminders, backups });
}
