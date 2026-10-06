import { nextEventTime, sortEvents } from '../events/order';
import type { EventBody, VocabEvent } from '../events/types';
import type { VocabDB } from './db';

const DEVICE_ID_KEY = 'deviceId';

/** Append-only event log stored on this device. */
export class EventLog {
  private constructor(
    private readonly db: VocabDB,
    readonly deviceId: string,
    private latestTime: number,
    private readonly now: () => number,
  ) {}

  /** Opens the log, creating this device's id on first use. */
  static async open(db: VocabDB, now: () => number = Date.now): Promise<EventLog> {
    const deviceId = await db.transaction('rw', db.meta, async () => {
      const row = await db.meta.get(DEVICE_ID_KEY);
      if (row) return row.value;
      const id = crypto.randomUUID();
      await db.meta.put({ key: DEVICE_ID_KEY, value: id });
      return id;
    });
    const latest = await db.events.orderBy('t').last();
    return new EventLog(db, deviceId, latest?.t ?? 0, now);
  }

  /** Records something that just happened on this device. */
  async append(body: EventBody): Promise<VocabEvent> {
    const event: VocabEvent = {
      ...body,
      id: crypto.randomUUID(),
      t: nextEventTime(this.now(), this.latestTime),
      device: this.deviceId,
      v: 1,
    };
    await this.db.events.add(event);
    this.latestTime = event.t;
    return event;
  }

  /** Adds events from another device. Returns the ones that were new here. */
  async import(events: readonly VocabEvent[]): Promise<VocabEvent[]> {
    const unique = [...new Map(events.map((event) => [event.id, event])).values()];
    const fresh = await this.db.transaction('rw', this.db.events, async () => {
      const existing = await this.db.events.bulkGet(unique.map((event) => event.id));
      const missing = unique.filter((_, i) => existing[i] === undefined);
      await this.db.events.bulkAdd(missing);
      return missing;
    });
    for (const event of fresh) this.latestTime = Math.max(this.latestTime, event.t);
    return sortEvents(fresh);
  }

  /** Every event, in canonical order. */
  async all(): Promise<VocabEvent[]> {
    return sortEvents(await this.db.events.toArray());
  }

  async count(): Promise<number> {
    return this.db.events.count();
  }
}
