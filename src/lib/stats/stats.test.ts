import { describe, expect, it } from 'vitest';
import { weekday } from '../scheduler/day';
import { replay } from '../state/reducer';
import { added, at, DAY0, introduced, reviewed } from '../testing/history';
import { forecast, funnel, retention, streak, weekOf } from './stats';

// Test days are numbered from Monday 5 January 2026 (day 0); study days are DAY0 + n.

describe('funnel', () => {
  it('counts words at each stage', () => {
    const state = replay([
      added('queued#n', 0),
      ...introduced('new#adj', 3),
      ...introduced('older#v', 0),
    ]);
    const counts = funnel(state, DAY0 + 3, 0);
    expect(counts).toMatchObject({ queued: 1, learning: 1, recognise: 1, owned: 0 });
  });
});

describe('retention', () => {
  it('counts the first review of a day, not introduction checks or repeats', () => {
    const state = replay([
      ...introduced('a#n', 0),
      reviewed('a#n', 'recognition', at(3), 1),
      reviewed('a#n', 'recognition', at(3) + 600_000, 3), // in-session repeat
      reviewed('a#n', 'recognition', at(6), 3),
      ...introduced('b#n', 6),
    ]);
    expect(retention(state, DAY0 + 6, 0)).toEqual([
      { track: 'recognition', passed: 1, total: 2 },
      { track: 'production', passed: 0, total: 0 },
    ]);
    // Out of the 30-day window later on.
    expect(retention(state, DAY0 + 40, 0)[0]!.total).toBe(0);
  });
});

describe('forecast', () => {
  it('spreads due reviews over the coming days, overdue ones today', () => {
    const state = replay([...introduced('a#n', 0), ...introduced('b#n', 5)]);
    const counts = forecast(state, DAY0 + 20, 0, 7);
    expect(counts).toHaveLength(7);
    expect(counts[0]).toBe(2); // Both long overdue by day 20.
    const soon = forecast(replay(introduced('b#n', 5)), DAY0 + 5, 0, 30);
    expect(soon.reduce((a, b) => a + b, 0)).toBe(1);
    expect(soon[0]).toBe(0); // Met today, so not due again until a later day.
  });
});

describe('streak', () => {
  it('counts weeks with 5 or more study days', () => {
    expect(weekday(DAY0)).toBe(1); // A Monday.
    expect(weekOf(DAY0 + 6)).toBe(weekOf(DAY0));
    expect(weekOf(DAY0 + 7)).toBe(weekOf(DAY0) + 1);

    const studyOn = (days: number[]) =>
      replay([added('a#n', 0), ...days.map((d) => reviewed('a#n', 'recognition', at(d), 3))]);
    // Week 1: 5 days. Week 2: 6 days. Week 3 (this week): 2 days so far.
    const state = studyOn([0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 14, 15]);
    expect(streak(state, DAY0 + 15, 0)).toEqual({
      weeks: 2,
      thisWeek: 2,
      days: [true, true, false, false, false, false, false],
    });
    // A week with only 4 days breaks it.
    expect(streak(studyOn([0, 1, 2, 3, 7, 8]), DAY0 + 8, 0).weeks).toBe(0);
  });
});
