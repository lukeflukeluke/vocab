import { timeTravelDays } from '../clock';
import { vocab } from '../state/store.svelte';
import { META, syncOnce, SyncError, type SyncFailure, type SyncStore } from './engine';
import { normalizeKey } from './key';

// Runs sync for the app: when it opens, every few minutes while it is open, when the
// connection comes back, and after each session (PLAN 13.3). Never while time
// travelling: the test database must not reach your real account.

export type SyncStatus =
  | { phase: 'off' }
  | { phase: 'test-mode' }
  | { phase: 'syncing' }
  | { phase: 'ok'; at: number; received: number }
  | { phase: 'error'; reason: SyncFailure; message: string };

const EVERY_MS = 3 * 60_000;

const store: SyncStore = {
  getMeta: (k) => vocab.getMeta(k),
  setMeta: (k, v) => vocab.setMeta(k, v),
  eventsSince: (t) => vocab.eventsSince(t),
  importEvents: (events) => vocab.importEvents(events),
};

class SyncController {
  status = $state<SyncStatus>({ phase: 'off' });
  key = $state<string | null>(null);
  #running: Promise<void> | null = null;
  #again = false;
  #timer: ReturnType<typeof setInterval> | null = null;

  /** Call once the event log is open. */
  async init(): Promise<void> {
    if (timeTravelDays() !== null) {
      this.status = { phase: 'test-mode' };
      return;
    }
    this.key = (await vocab.getMeta(META.key)) ?? null;
    if (this.key) this.#start();
  }

  /** Links this device to a sync key (new or from another device) and syncs. */
  async useKey(input: string): Promise<void> {
    if (this.status.phase === 'test-mode') return;
    const key = normalizeKey(input);
    await vocab.setMeta(META.key, key);
    // A new link: fetch the account from the start, and send this device's whole log.
    await vocab.setMeta(META.cursor, null);
    await vocab.setMeta(META.pushed, null);
    this.key = key;
    this.#start();
    await this.#running;
  }

  /** Unlinks this device. Its data stays; the account keeps everything already sent. */
  async turnOff(): Promise<void> {
    this.#stop();
    await this.#running;
    for (const k of [META.key, META.cursor, META.pushed]) await vocab.setMeta(k, null);
    this.key = null;
    this.status = { phase: 'off' };
  }

  /** After restoring a backup: its events may be older than anything sent so far. */
  async backupImported(): Promise<void> {
    await vocab.setMeta(META.pushed, null);
    await this.syncNow();
  }

  /** Syncs now (or right after the sync already running). */
  syncNow(): Promise<void> {
    if (!this.key || this.status.phase === 'test-mode') return Promise.resolve();
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = this.#run().finally(() => {
      this.#running = null;
      if (this.#again) {
        this.#again = false;
        void this.syncNow();
      }
    });
    return this.#running;
  }

  async #run(): Promise<void> {
    const key = this.key;
    if (!key) return;
    this.status = { phase: 'syncing' };
    try {
      const { received } = await syncOnce(store, (url, init) => fetch(url, init), key);
      this.status = { phase: 'ok', at: Date.now(), received };
    } catch (err) {
      this.status =
        err instanceof SyncError
          ? { phase: 'error', reason: err.reason, message: err.message }
          : { phase: 'error', reason: 'server', message: String(err) };
    }
  }

  #onVisible = () => {
    if (document.visibilityState === 'visible') void this.syncNow();
  };

  #onOnline = () => void this.syncNow();

  #start(): void {
    void this.syncNow();
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncNow();
    }, EVERY_MS);
    document.addEventListener('visibilitychange', this.#onVisible);
    window.addEventListener('online', this.#onOnline);
  }

  #stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    document.removeEventListener('visibilitychange', this.#onVisible);
    window.removeEventListener('online', this.#onOnline);
  }
}

export const syncer = new SyncController();
