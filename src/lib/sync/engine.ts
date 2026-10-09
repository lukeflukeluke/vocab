import type { VocabEvent } from '../events/types';

// The sync engine (PLAN 13.3): push the events the server may not have, pull everything
// after our cursor, import it. Merging needs no conflict handling: the log is a set of
// events, and state is replayed from it in a fixed order.

/** What the engine needs from the device: its log and a few device-only settings. */
export interface SyncStore {
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string | null): Promise<void>;
  /** Events at or after time `t`, oldest first. */
  eventsSince(t: number): Promise<VocabEvent[]>;
  /** Adds events from elsewhere; returns how many were new. */
  importEvents(events: readonly VocabEvent[]): Promise<number>;
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export const META = {
  key: 'sync.key',
  /** Last server sequence number seen. */
  cursor: 'sync.cursor',
  /** Time of the newest event pushed; events at or after it are sent next time. */
  pushed: 'sync.pushed',
} as const;

/** Events sent in one request (the server takes up to 500). */
const BATCH = 400;

export type SyncFailure = 'not-set-up' | 'bad-key' | 'offline' | 'server';

export class SyncError extends Error {
  constructor(
    readonly reason: SyncFailure,
    message: string,
  ) {
    super(message);
  }
}

export interface SyncResult {
  pushed: number;
  /** Events new to this device. */
  received: number;
}

interface Reply {
  cursor: number;
  events: VocabEvent[];
  more: boolean;
}

/** One full sync: push everything pending, pull everything new. */
export async function syncOnce(store: SyncStore, fetcher: Fetch, key: string): Promise<SyncResult> {
  let cursor = Number((await store.getMeta(META.cursor)) ?? 0);
  const pushedUpTo = await store.getMeta(META.pushed);
  // Nothing pushed yet (a new key, or a restored backup): send the whole log once.
  const pending = await store.eventsSince(
    pushedUpTo === undefined ? -Infinity : Number(pushedUpTo),
  );
  let sent = 0;
  let received = 0;
  let more = true;
  while (sent < pending.length || more) {
    const batch = pending.slice(sent, sent + BATCH);
    let res: Response;
    try {
      res = await fetcher('/api/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor, events: batch }),
      });
    } catch {
      throw new SyncError('offline', 'No connection');
    }
    if (res.status === 503) throw new SyncError('not-set-up', 'The sync server is not set up yet');
    if (res.status === 401) throw new SyncError('bad-key', 'The sync key was not accepted');
    if (!res.ok) throw new SyncError('server', `The server answered ${res.status}`);
    const reply = (await res.json()) as Reply;
    received += await store.importEvents(reply.events);
    cursor = reply.cursor;
    await store.setMeta(META.cursor, String(cursor));
    if (batch.length) await store.setMeta(META.pushed, String(batch[batch.length - 1]!.t));
    sent += batch.length;
    more = reply.more;
  }
  return { pushed: sent, received };
}
