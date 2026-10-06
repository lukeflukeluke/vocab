import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventBody } from '../events/types';
import { replay } from '../state/reducer';
import { seededRandom, shuffled } from '../testing/factories';
import { VocabDB } from './db';
import { EventLog } from './eventLog';

const opened: VocabDB[] = [];
let dbCounter = 0;

function freshDb(): VocabDB {
  dbCounter += 1;
  const db = new VocabDB(`test-${dbCounter}`);
  opened.push(db);
  return db;
}

afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});

/** A clock the test controls. */
function clock(start: number) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const added = (entryId: string): EventBody => ({ type: 'word_added', entryId, source: 'bank' });

describe('EventLog', () => {
  it('keeps the same device id across reopenings', async () => {
    const db = freshDb();
    const first = await EventLog.open(db);
    const second = await EventLog.open(db);
    expect(first.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.deviceId).toBe(first.deviceId);
  });

  it('appends events in order, even if the clock goes backwards', async () => {
    const time = clock(5000);
    const log = await EventLog.open(freshDb(), time.now);
    const a = await log.append(added('a'));
    time.advance(-3000);
    const b = await log.append(added('b'));
    expect(a.t).toBe(5000);
    expect(b.t).toBe(5001);
    expect(await log.all()).toEqual([a, b]);
  });

  it('carries on after the latest stored event when reopened', async () => {
    const db = freshDb();
    const log = await EventLog.open(db, () => 9000);
    await log.append(added('a'));
    const reopened = await EventLog.open(db, () => 100);
    expect((await reopened.append(added('b'))).t).toBe(9001);
  });

  it('imports only events it does not have yet', async () => {
    const phone = await EventLog.open(freshDb());
    const pc = await EventLog.open(freshDb());
    const a = await phone.append(added('a'));
    const b = await phone.append(added('b'));
    expect(await pc.import([a, b, a])).toEqual([a, b]);
    expect(await pc.import([a, b])).toEqual([]);
    expect(await pc.count()).toBe(2);
  });

  it('two devices with different clocks end up with identical state', async () => {
    const random = seededRandom(7);
    const phoneClock = clock(1_000_000);
    const pcClock = clock(1_000_000 - 5 * 60_000); // PC clock five minutes behind
    const phone = await EventLog.open(freshDb(), phoneClock.now);
    const pc = await EventLog.open(freshDb(), pcClock.now);

    const sync = async () => {
      await pc.import(await phone.all());
      await phone.import(await pc.all());
    };

    // The phone adds a word; after syncing, the PC (whose clock is behind) marks it known.
    await phone.append(added('posit#v'));
    await sync();
    await pc.append({ type: 'word_status_set', entryId: 'posit#v', status: 'known' });

    // Then both devices work offline for a while, syncing now and then.
    const words = ['corroborate#v', 'salient#adj', 'tenuous#adj'];
    for (const word of words) await phone.append(added(word));
    await sync();
    for (let i = 0; i < 120; i++) {
      const device = random() < 0.5 ? phone : pc;
      (device === phone ? phoneClock : pcClock).advance(Math.floor(random() * 5000));
      const word = words[Math.floor(random() * words.length)]!;
      await device.append({
        type: 'review',
        entryId: word,
        track: random() < 0.5 ? 'recognition' : 'production',
        exercise: 'R1',
        correct: random() < 0.8,
        rating: 3,
        ms: 1000 + Math.floor(random() * 4000),
        hintsUsed: 0,
      });
      if (random() < 0.1) await sync();
    }
    await sync();

    const phoneEvents = await phone.all();
    const pcEvents = await pc.all();
    expect(pcEvents).toEqual(phoneEvents);

    const state = replay(phoneEvents);
    expect(replay(pcEvents)).toEqual(state);
    expect(replay(shuffled(phoneEvents, random))).toEqual(state);
    // The PC's edit counts even though its clock said it happened "before" the add.
    expect(state.words['posit#v']!.status).toBe('known');
    expect(state.eventCount).toBe(1 + 1 + words.length + 120);
  });
});
