import { describe, expect, it } from 'vitest';
import { sqliteDb } from './sqlite';
import {
  accountOf,
  handleHealth,
  handleSync,
  MAX_PULL,
  MAX_PUSH,
  parseSyncRequest,
  sync,
  type WireEvent,
} from './sync';

let n = 0;
function event(device: string, t: number, extra: Record<string, unknown> = {}): WireEvent {
  n += 1;
  return { id: `ev-${n}`, t, device, v: 1, type: 'word_added', entryId: 'posit#v', ...extra };
}

const request = (body: unknown, key = 'ABCDEFGHJKMNPQRSTVWXYZ0123') =>
  new Request('https://x/api/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('sync', () => {
  it('relays events between two devices, each fetching what the other sent', async () => {
    const db = sqliteDb();
    const phone = [event('phone', 1), event('phone', 2)];
    const first = await sync(db, 'acct', { cursor: 0, events: phone }, 100);
    expect(first.events).toEqual(phone);

    const pc = [event('pc', 3)];
    const second = await sync(db, 'acct', { cursor: 0, events: pc }, 101);
    expect(second.events.map((e) => e.id)).toEqual([...phone, ...pc].map((e) => e.id));

    // The phone asks for what came after its cursor: just the PC's event.
    const third = await sync(db, 'acct', { cursor: first.cursor, events: [] }, 102);
    expect(third.events).toEqual(pc);
    expect(third.more).toBe(false);
  });

  it('ignores events it already has, so sending twice is safe', async () => {
    const db = sqliteDb();
    const e = event('phone', 1);
    await sync(db, 'acct', { cursor: 0, events: [e] }, 100);
    const again = await sync(db, 'acct', { cursor: 0, events: [e, e] }, 101);
    expect(again.events).toEqual([e]);
  });

  it('keeps accounts apart', async () => {
    const db = sqliteDb();
    await sync(db, 'mine', { cursor: 0, events: [event('phone', 1)] }, 100);
    const other = await sync(db, 'theirs', { cursor: 0, events: [] }, 101);
    expect(other.events).toEqual([]);
  });

  it('pages long histories', async () => {
    const db = sqliteDb();
    const all = Array.from({ length: MAX_PULL + 10 }, (_, i) => event('phone', i));
    for (let i = 0; i < all.length; i += MAX_PUSH) {
      await sync(db, 'acct', { cursor: 0, events: all.slice(i, i + MAX_PUSH) }, 100);
    }
    const page1 = await sync(db, 'acct', { cursor: 0, events: [] }, 101);
    expect(page1.events).toHaveLength(MAX_PULL);
    expect(page1.more).toBe(true);
    const page2 = await sync(db, 'acct', { cursor: page1.cursor, events: [] }, 102);
    expect(page2.events).toHaveLength(10);
    expect(page2.more).toBe(false);
  });
});

describe('parseSyncRequest', () => {
  it('rejects malformed requests', () => {
    expect(() => parseSyncRequest(null)).toThrow();
    expect(() => parseSyncRequest({ cursor: -1, events: [] })).toThrow('cursor');
    expect(() => parseSyncRequest({ cursor: 0, events: [{ id: 'x' }] })).toThrow('missing');
    const tooMany = Array.from({ length: MAX_PUSH + 1 }, () => event('a', 1));
    expect(() => parseSyncRequest({ cursor: 0, events: tooMany })).toThrow('At most');
    const huge = event('a', 1, { text: 'x'.repeat(30_000) });
    expect(() => parseSyncRequest({ cursor: 0, events: [huge] })).toThrow('too large');
  });
});

describe('HTTP handlers', () => {
  it('needs a database and a key', async () => {
    expect((await handleSync(request({ cursor: 0, events: [] }), undefined, 1)).status).toBe(503);
    const noKey = new Request('https://x/api/sync', { method: 'POST', body: '{}' });
    expect((await handleSync(noKey, sqliteDb(), 1)).status).toBe(401);
    expect((await handleHealth(undefined)).status).toBe(503);
    expect((await handleHealth(sqliteDb())).status).toBe(200);
  });

  it('syncs over HTTP, filed under a hash of the key', async () => {
    const db = sqliteDb();
    const e = event('phone', 5);
    const res = await handleSync(request({ cursor: 0, events: [e] }), db, 1);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { events: unknown[] }).events).toEqual([e]);
    // A different key sees nothing.
    const other = await handleSync(
      request({ cursor: 0, events: [] }, 'ZZZZZZZZZZZZZZZZZZZZZZZZZ'),
      db,
      2,
    );
    expect(((await other.json()) as { events: unknown[] }).events).toEqual([]);
    expect(await accountOf('A')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('answers 400 for bad input', async () => {
    const db = sqliteDb();
    const res = await handleSync(request({ cursor: 'x', events: [] }), db, 1);
    expect(res.status).toBe(400);
  });
});
