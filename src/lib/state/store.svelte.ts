import { databaseName, now as clockNow } from '../clock';
import { VocabDB } from '../db/db';
import { EventLog } from '../db/eventLog';
import type { EventBody, VocabEvent } from '../events/types';
import { applyEvent, replay } from './reducer';
import { emptyState, type State } from './state';

/** The app's live data: the event log on this device and the state replayed from it. */
class VocabStore {
  state = $state.raw<State>(emptyState());
  deviceId = $state<string | null>(null);
  ready = $state(false);
  error = $state<string | null>(null);

  #log: EventLog | null = null;
  /** Writes run one at a time, so a sync import cannot replay over a fresh answer. */
  #queue: Promise<unknown> = Promise.resolve();

  #serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(work);
    this.#queue = result.catch(() => undefined);
    return result;
  }

  async init(
    db: VocabDB = new VocabDB(databaseName()),
    now: () => number = clockNow,
  ): Promise<void> {
    try {
      this.#log = await EventLog.open(db, now);
      this.deviceId = this.#log.deviceId;
      this.state = replay(await this.#log.all());
      this.ready = true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  /** Records something the user just did and updates the state. */
  record(body: EventBody): Promise<VocabEvent> {
    const log = this.#log;
    if (!log) return Promise.reject(new Error('The event log is not open yet'));
    // A plain copy: screens may pass reactive objects, which the database cannot store.
    // It also drops undefined fields, which would not survive the trip to another device.
    const plain = JSON.parse(JSON.stringify(body)) as EventBody;
    return this.#serial(async () => {
      const event = await log.append(plain);
      // A new local event always sorts last, so it can be applied without a full replay.
      this.state = applyEvent(this.state, event);
      return event;
    });
  }

  /** Every event on this device, for a backup file. */
  async allEvents(): Promise<VocabEvent[]> {
    if (!this.#log) throw new Error('The event log is not open yet');
    return this.#log.all();
  }

  /** Events at or after time `t` (for sync). */
  async eventsSince(t: number): Promise<VocabEvent[]> {
    if (!this.#log) throw new Error('The event log is not open yet');
    return this.#log.since(t);
  }

  async getMeta(key: string): Promise<string | undefined> {
    return this.#log?.getMeta(key);
  }

  async setMeta(key: string, value: string | null): Promise<void> {
    if (!this.#log) throw new Error('The event log is not open yet');
    await this.#log.setMeta(key, value);
  }

  /**
   * Adds events from a backup file (or another device). Events already here are skipped,
   * so importing the same file twice changes nothing. Returns how many were new.
   */
  importEvents(events: readonly VocabEvent[]): Promise<number> {
    const log = this.#log;
    if (!log) return Promise.reject(new Error('The event log is not open yet'));
    return this.#serial(async () => {
      const fresh = await log.import(events);
      if (fresh.length) this.state = replay(await log.all());
      return fresh.length;
    });
  }
}

export const vocab = new VocabStore();
