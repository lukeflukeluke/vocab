// The sync server (PLAN 13.2, 13.3). It only stores and relays events: every device pushes
// its new events and fetches everything after its cursor, in one request. Accounts are
// identified by a hash of the sync key, so the key itself is never stored.
//
// The database is Cloudflare D1 in production (functions/api/*.ts). `SyncDb` is the small
// part of D1's interface used here, so tests can run the same code on Node's SQLite.

export interface SyncStatement {
  bind(...values: unknown[]): SyncStatement;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface SyncDb {
  prepare(sql: string): SyncStatement;
  batch(statements: SyncStatement[]): Promise<unknown>;
}

/** Events accepted in one request, and returned in one response. */
export const MAX_PUSH = 500;
export const MAX_PULL = 1000;
const MAX_EVENT_CHARS = 20_000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    account TEXT NOT NULL,
    id TEXT NOT NULL,
    t INTEGER NOT NULL,
    body TEXT NOT NULL,
    received INTEGER NOT NULL,
    UNIQUE (account, id)
  )`,
  `CREATE INDEX IF NOT EXISTS events_by_account ON events (account, seq)`,
  // Captured words waiting to be sorted (build session S7).
  `CREATE TABLE IF NOT EXISTS inbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    account TEXT NOT NULL,
    id TEXT NOT NULL,
    word TEXT NOT NULL,
    context TEXT,
    source TEXT,
    created INTEGER NOT NULL,
    UNIQUE (account, id)
  )`,
];

let schemaReady: WeakSet<object> = new WeakSet();

/** Creates the tables on first use, so setting up the database needs no SQL by hand. */
export async function ensureSchema(db: SyncDb): Promise<void> {
  if (schemaReady.has(db)) return;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  schemaReady.add(db);
}

/** For tests: forget which databases already have their tables. */
export function resetSchemaCache(): void {
  schemaReady = new WeakSet();
}

/** The account id for a sync key: SHA-256 of the key, hex. */
export async function accountOf(key: string): Promise<string> {
  const data = new TextEncoder().encode(`vocab-sync:${key}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface WireEvent {
  id: string;
  t: number;
  device: string;
  v: 1;
  type: string;
  [field: string]: unknown;
}

export interface SyncRequest {
  /** The last server sequence number this device has seen (0 at first). */
  cursor: number;
  /** New events from this device (or ones it is not sure the server has). */
  events: WireEvent[];
}

export interface SyncResponse {
  cursor: number;
  events: WireEvent[];
  /** More events are waiting: ask again with the new cursor. */
  more: boolean;
}

export class BadRequest extends Error {}

function isWireEvent(value: unknown): value is WireEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    e.id.length > 0 &&
    e.id.length <= 64 &&
    typeof e.t === 'number' &&
    Number.isSafeInteger(e.t) &&
    typeof e.device === 'string' &&
    e.device.length <= 64 &&
    typeof e.type === 'string' &&
    e.type.length <= 40 &&
    e.v === 1
  );
}

/** Checks a request body and returns it typed, or throws BadRequest. */
export function parseSyncRequest(body: unknown): SyncRequest {
  if (!body || typeof body !== 'object') throw new BadRequest('Expected a JSON object');
  const { cursor, events } = body as Record<string, unknown>;
  if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0) {
    throw new BadRequest('cursor must be a whole number, 0 or more');
  }
  if (!Array.isArray(events)) throw new BadRequest('events must be a list');
  if (events.length > MAX_PUSH) throw new BadRequest(`At most ${MAX_PUSH} events per request`);
  for (const e of events) {
    if (!isWireEvent(e)) throw new BadRequest('An event is missing id, t, device, type or v');
    if (JSON.stringify(e).length > MAX_EVENT_CHARS) throw new BadRequest('An event is too large');
  }
  return { cursor, events: events as WireEvent[] };
}

/**
 * Stores the pushed events (ones already stored are ignored, so sending twice is safe),
 * then returns everything in the account after the cursor, including what was just sent.
 */
export async function sync(
  db: SyncDb,
  account: string,
  request: SyncRequest,
  now: number,
): Promise<SyncResponse> {
  await ensureSchema(db);
  if (request.events.length) {
    const insert = db.prepare(
      'INSERT OR IGNORE INTO events (account, id, t, body, received) VALUES (?, ?, ?, ?, ?)',
    );
    await db.batch(
      request.events.map((e) => insert.bind(account, e.id, e.t, JSON.stringify(e), now)),
    );
  }
  const { results } = await db
    .prepare('SELECT seq, body FROM events WHERE account = ? AND seq > ? ORDER BY seq LIMIT ?')
    .bind(account, request.cursor, MAX_PULL + 1)
    .all<{ seq: number; body: string }>();
  const page = results.slice(0, MAX_PULL);
  return {
    cursor: page.length ? Number(page[page.length - 1]!.seq) : request.cursor,
    events: page.map((r) => JSON.parse(r.body) as WireEvent),
    more: results.length > MAX_PULL,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** The sync key from "Authorization: Bearer KEY", or null. */
function keyFrom(request: Request): string | null {
  const match = /^Bearer\s+([A-Za-z0-9]{20,64})$/.exec(request.headers.get('Authorization') ?? '');
  return match ? match[1]! : null;
}

/** POST /api/sync, for any runtime with Request and Response. */
export async function handleSync(request: Request, db: SyncDb | undefined, now: number) {
  if (!db) return json({ error: 'no-database' }, 503);
  const key = keyFrom(request);
  if (!key) return json({ error: 'missing-key' }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected JSON' }, 400);
  }
  try {
    const parsed = parseSyncRequest(body);
    return json(await sync(db, await accountOf(key), parsed, now));
  } catch (err) {
    if (err instanceof BadRequest) return json({ error: err.message }, 400);
    throw err;
  }
}

/** GET /api/health: whether the database is connected. */
export async function handleHealth(db: SyncDb | undefined) {
  if (!db) return json({ ok: false, error: 'no-database' }, 503);
  await ensureSchema(db);
  return json({ ok: true });
}
