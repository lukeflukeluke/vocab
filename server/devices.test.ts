import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { sqliteDb } from './sqlite';
import { handleSync, type SyncDb } from './sync';
import { VocabDB } from '../src/lib/db/db';
import { EventLog } from '../src/lib/db/eventLog';
import type { EventBody } from '../src/lib/events/types';
import { replay } from '../src/lib/state/reducer';
import { META, syncOnce, SyncError, type Fetch, type SyncStore } from '../src/lib/sync/engine';

// Two devices with their own databases and clocks, syncing through the real server code
// (server/sync.ts) on an in-memory SQLite database.

const opened: VocabDB[] = [];
let counter = 0;
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

const KEY = 'ABCDEFGHJKMNPQRSTVWXYZ012';

async function device(clock: () => number) {
  counter += 1;
  const db = new VocabDB(`sync-test-${counter}`);
  opened.push(db);
  const log = await EventLog.open(db, clock);
  const store: SyncStore = {
    getMeta: (k) => log.getMeta(k),
    setMeta: (k, v) => log.setMeta(k, v),
    eventsSince: (t) => log.since(t),
    importEvents: async (events) => (await log.import(events)).length,
  };
  const record = (body: EventBody) => log.append(body);
  const state = async () => replay(await log.all());
  return { log, store, record, state };
}

function server(db: SyncDb = sqliteDb()): Fetch & { calls: number } {
  const f = Object.assign(
    async (url: string, init: RequestInit) => {
      f.calls += 1;
      return handleSync(new Request(`https://app${url}`, init), db, Date.now());
    },
    { calls: 0 },
  );
  return f;
}

describe('syncOnce', () => {
  it('two devices end up with the same state, whatever their clocks say', async () => {
    const net = server();
    // The PC's clock is 5 minutes behind the phone's.
    let phoneClock = 10_000_000;
    let pcClock = phoneClock - 300_000;
    const phone = await device(() => phoneClock++);
    const pc = await device(() => pcClock++);

    await phone.record({ type: 'word_added', entryId: 'posit#v', source: 'bank' });
    await phone.record({
      type: 'review',
      entryId: 'posit#v',
      track: 'recognition',
      exercise: 'R1',
      correct: true,
      rating: 3,
      ms: 4000,
      hintsUsed: 0,
    });
    expect(await syncOnce(phone.store, net, KEY)).toEqual({ pushed: 2, received: 0 });

    await pc.record({ type: 'word_added', entryId: 'tacit#adj', source: 'bank' });
    expect(await syncOnce(pc.store, net, KEY)).toEqual({ pushed: 1, received: 2 });
    expect(await syncOnce(phone.store, net, KEY)).toMatchObject({ received: 1 });

    const [a, b] = [await phone.state(), await pc.state()];
    expect(Object.keys(a.words).sort()).toEqual(['posit#v', 'tacit#adj']);
    expect(b).toEqual(a);
  });

  it('only sends new events after the first sync', async () => {
    const net = server();
    let t = 1000;
    const phone = await device(() => t++);
    for (let i = 0; i < 3; i++) {
      await phone.record({ type: 'word_added', entryId: `w${i}#n`, source: 'bank' });
    }
    expect((await syncOnce(phone.store, net, KEY)).pushed).toBe(3);
    // Nothing new: only the boundary event goes again (the server ignores it).
    expect((await syncOnce(phone.store, net, KEY)).pushed).toBeLessThanOrEqual(1);
    await phone.record({ type: 'word_added', entryId: 'new#n', source: 'bank' });
    const again = await syncOnce(phone.store, net, KEY);
    expect(again.pushed).toBeLessThanOrEqual(2);
    expect(again.received).toBe(0);
  });

  it('sends the whole log again when told to (after restoring a backup)', async () => {
    const net = server();
    let t = 1000;
    const phone = await device(() => t++);
    await phone.record({ type: 'word_added', entryId: 'a#n', source: 'bank' });
    await phone.record({ type: 'word_added', entryId: 'b#n', source: 'bank' });
    await syncOnce(phone.store, net, KEY);
    await phone.store.setMeta(META.pushed, null);
    expect((await syncOnce(phone.store, net, KEY)).pushed).toBe(2);
  });

  it('handles a long history in several requests', async () => {
    const net = server();
    let t = 1;
    const phone = await device(() => t++);
    for (let i = 0; i < 1200; i++) {
      await phone.record({ type: 'word_added', entryId: `w${i}#n`, source: 'bank' });
    }
    await syncOnce(phone.store, net, KEY);
    const pc = await device(() => t++);
    expect((await syncOnce(pc.store, net, KEY)).received).toBe(1200);
    expect(Object.keys((await pc.state()).words)).toHaveLength(1200);
  });

  it('says why it failed', async () => {
    let t = 1;
    const phone = await device(() => t++);
    const fail =
      (status: number): Fetch =>
      async () =>
        new Response('{}', { status });
    const offline: Fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const reason = (f: Fetch) =>
      syncOnce(phone.store, f, KEY).then(
        () => null,
        (e: SyncError) => e.reason,
      );
    expect(await reason(fail(503))).toBe('not-set-up');
    expect(await reason(fail(401))).toBe('bad-key');
    expect(await reason(fail(500))).toBe('server');
    expect(await reason(offline)).toBe('offline');
  });
});
