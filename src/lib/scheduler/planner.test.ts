import { describe, expect, it } from 'vitest';
import type { Settings, VocabEvent } from '../events/types';
import { replay } from '../state/reducer';
import { makeEvent } from '../testing/factories';
import { added, at, DAY0, introduced, reviewed, sentence } from '../testing/history';
import { newWordsFor } from './budget';
import { dueDay, planDay, type PlanInput } from './planner';

const settings = (patch: Partial<Settings>): VocabEvent =>
  makeEvent({ type: 'settings_changed', patch }, { t: at(-1) });

function plan(events: VocabEvent[], day: number, extra: Partial<PlanInput> = {}) {
  return planDay({
    state: replay(events),
    now: at(day),
    tzOffsetMinutes: 0,
    candidates: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'],
    ...extra,
  });
}

/** Introduced on day 0, passed recognition on day 2 (production unlocks). */
const unlocked = (id: string) => [...introduced(id, 0), reviewed(id, 'recognition', at(2), 3)];

describe('planDay: a first day', () => {
  it('introduces the target number of new words from the bank', () => {
    const p = plan([], 0);
    expect(p.day).toBe(DAY0);
    expect(p.minutes).toBe(15);
    expect(p.mode).toBe('normal');
    expect(p.reviews).toEqual([]);
    expect(p.newWords).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'].slice(0, newWordsFor(15)));
    expect(p.newWordsReason).toBe('on-target');
    expect(p.estimatedSeconds).toBeGreaterThan(0);
  });

  it('gives only what is left after studying today', () => {
    const today = ['c1', 'c2', 'c3', 'c4', 'c5'].flatMap((id) => introduced(id, 0));
    const p = plan(today, 0);
    expect(p.newWords).toEqual([]);
    expect(p.newWordsReason).toBe('done-for-today');
    expect(p.spentSeconds).toBeGreaterThan(0);
    expect(p.reviews).toEqual([]);
  });
});

describe('planDay: reviews', () => {
  it('orders due reviews by risk of forgetting, most at risk first', () => {
    const events = [...introduced('older', 0), ...introduced('newer', 2)];
    const p = plan(events, 6);
    expect(p.reviews.map((r) => r.entryId)).toEqual(['older', 'newer']);
    expect(p.reviews[0]!.retrievability!).toBeLessThan(p.reviews[1]!.retrievability!);
    expect(p.reviews[0]!.track).toBe('recognition');
  });

  it('starts production the day after it unlocks, after the at-risk reviews', () => {
    const events = [...unlocked('w'), ...introduced('other', 0)];
    expect(plan(events, 2).reviews.map((r) => r.entryId)).toEqual(['other']);
    const p = plan(events, 4);
    expect(p.reviews).toContainEqual({
      entryId: 'w',
      track: 'production',
      retrievability: null,
      overdueDays: 0,
    });
    expect(p.reviews[p.reviews.length - 1]!.entryId).toBe('w');
  });

  it('shows only production when both tracks are due (sibling rule)', () => {
    const events = [...unlocked('w'), reviewed('w', 'production', at(3), 1)];
    const state = replay(events);
    const word = state.words['w']!;
    const day =
      Math.max(dueDay(word.memory.recognition!, 0.9, 0), dueDay(word.memory.production!, 0.9, 0)) -
      DAY0;
    const p = plan(events, day);
    expect(p.reviews).toHaveLength(1);
    expect(p.reviews[0]!.track).toBe('production');
  });

  it('stops reviewing recognition on its own once production has been passed', () => {
    const events = [
      ...unlocked('w'),
      reviewed('w', 'production', at(3), 3),
      reviewed('w', 'production', at(6), 3),
    ];
    const word = replay(events).words['w']!;
    const recognitionDue = dueDay(word.memory.recognition!, 0.9, 0) - DAY0;
    const productionDue = dueDay(word.memory.production!, 0.9, 0) - DAY0;
    expect(recognitionDue).toBeLessThan(productionDue);
    expect(plan(events, recognitionDue).reviews).toEqual([]);
    expect(plan(events, productionDue).reviews.map((r) => r.track)).toEqual(['production']);
  });

  it('never reviews a word twice in a day, nor on the day it was introduced', () => {
    const events = [...introduced('w', 0)];
    expect(plan(events, 0).reviews).toEqual([]);
    const reviewedToday = [...events, reviewed('w', 'recognition', at(6), 1)];
    expect(plan(reviewedToday, 6).reviews).toEqual([]);
  });

  it('skips words that are not active', () => {
    const events = [
      ...introduced('w', 0),
      makeEvent({ type: 'word_status_set', entryId: 'w', status: 'suspended' }, { t: at(1) }),
    ];
    expect(plan(events, 6).reviews).toEqual([]);
  });
});

describe('planDay: fitting the time', () => {
  const many = (n: number, day = 0) =>
    Array.from({ length: n }, (_, i) => introduced(`w${String(i).padStart(3, '0')}`, day)).flat();

  it('switches to catch-up mode when due reviews do not fit', () => {
    const events = [settings({ dailyMinutes: 5 }), ...many(120)];
    const p = plan(events, 30);
    expect(p.mode).toBe('catch-up');
    expect(p.backlog).toBeGreaterThan(0);
    expect(p.reviews.length + p.backlog).toBe(120);
    expect(p.newWords).toEqual([]);
    expect(p.newWordsReason).toBe('catch-up');
    expect(p.writing).toEqual([]);
    expect(p.estimatedSeconds).toBeLessThanOrEqual(5 * 60);
  });

  it('adds fewer new words when reviews leave too little time', () => {
    const events = [settings({ dailyMinutes: 5 }), ...many(25)];
    const p = plan(events, 30);
    expect(p.mode).toBe('normal');
    expect(p.backlog).toBe(0);
    expect(p.newWords.length).toBeLessThan(newWordsFor(5));
    expect(p.newWordsReason).toBe('out-of-time');
    expect(p.estimatedSeconds).toBeLessThanOrEqual(5 * 60);
  });

  it('counts time already spent today', () => {
    const slow = [settings({ dailyMinutes: 5 }), ...introduced('w', 0)];
    for (let i = 0; i < 5; i++) slow.push(reviewed('w', 'recognition', at(1) + i, 3, 60_000));
    const p = plan(slow, 1);
    expect(p.spentSeconds).toBeGreaterThanOrEqual(5 * 60);
    expect(p.newWords).toEqual([]);
  });

  it('uses the weekend time on weekends', () => {
    const events = [settings({ dailyMinutes: 10, weekendMinutes: 30 })];
    expect(plan(events, 4).minutes).toBe(10); // Friday
    expect(plan(events, 5).minutes).toBe(30); // Saturday
  });
});

describe('planDay: heavy days and busy weeks', () => {
  /**
   * Two words with both tracks reviewed every day for two weeks: four reviews a day is
   * usual, and neither word is due on day 15.
   */
  function steadyHistory() {
    const events = [...introduced('x', 0), ...introduced('y', 0)];
    for (let day = 1; day <= 14; day++) {
      for (const [i, id] of ['x', 'y'].entries()) {
        events.push(
          reviewed(id, 'recognition', at(day) + i * 10, 3),
          reviewed(id, 'production', at(day) + i * 10 + 5, 3),
        );
      }
    }
    return events;
  }
  const dueOn15 = (n: number) =>
    Array.from({ length: n }, (_, i) => introduced(`d${i}`, 12)).flat();

  it('halves new words on a heavy day', () => {
    const p = plan([...steadyHistory(), ...dueOn15(6)], 15);
    expect(p.reviews.length).toBe(6);
    expect(p.newWordsReason).toBe('heavy-day');
    expect(p.newWords.length).toBe(Math.floor(newWordsFor(15) / 2));
  });

  it('adds no new words on a very heavy day', () => {
    const p = plan([...steadyHistory(), ...dueOn15(9)], 15);
    expect(p.reviews.length).toBe(9);
    expect(p.newWordsReason).toBe('very-heavy-day');
    expect(p.newWords).toEqual([]);
  });

  it('keeps the usual number of new words on a normal day', () => {
    const p = plan([...steadyHistory(), ...dueOn15(4)], 15);
    expect(p.reviews.length).toBe(4);
    expect(p.newWordsReason).toBe('on-target');
    expect(p.newWords.length).toBe(newWordsFor(15));
  });

  it('pauses new words before and during a busy period', () => {
    const busy = settings({ busyStart: '2026-01-20', busyEnd: '2026-01-25' }); // days 15 to 20
    expect(plan([busy], 9).newWords.length).toBeGreaterThan(0);
    for (const day of [10, 15, 20]) {
      const p = plan([busy], day);
      expect(p.mode).toBe('busy');
      expect(p.newWords).toEqual([]);
      expect(p.newWordsReason).toBe('busy');
    }
    expect(plan([busy], 21).mode).toBe('normal');
    const malformed = settings({ busyStart: 'next week', busyEnd: '2026-01-25' });
    expect(plan([malformed], 15).mode).toBe('normal');
  });
});

describe('planDay: choosing new words and writing tasks', () => {
  it('takes captured words first (newest first), then queued words, then the bank', () => {
    const events = [
      added('queued-bank', 0),
      added('captured-old', 1, 'captured'),
      added('captured-new', 2, 'captured'),
    ];
    const p = plan(events, 3, { candidates: ['queued-bank', 'c1', 'c2'] });
    expect(p.newWords).toEqual(['captured-new', 'captured-old', 'queued-bank', 'c1', 'c2']);
  });

  it('follows a target override', () => {
    expect(plan([], 0, { newWordsPerDay: 2 }).newWords).toEqual(['c1', 'c2']);
  });

  it('asks for a sentence once production stability reaches 10 days, until one is accepted', () => {
    const events = [
      ...unlocked('w'),
      reviewed('w', 'production', at(3), 3),
      reviewed('w', 'production', at(10), 3),
    ];
    expect(plan(events, 11).writing).toEqual(['w']);
    expect(plan([...events, sentence('w', 11, false)], 12).writing).toEqual(['w']);
    expect(plan([...events, sentence('w', 11)], 12).writing).toEqual([]);
  });
});
