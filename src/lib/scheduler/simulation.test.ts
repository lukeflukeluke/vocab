import { describe, expect, it } from 'vitest';
import { replay } from '../state/reducer';
import { simulate } from './simulation';

describe('simulate', () => {
  const result = simulate({ days: 90, minutes: 15, seed: 11, steadyDays: 30 });
  const studied = result.days.filter((d) => d.studied);

  it('is repeatable', () => {
    const again = simulate({ days: 90, minutes: 15, seed: 11, steadyDays: 30 });
    expect(again.summary).toEqual(result.summary);
  });

  it('keeps sessions close to the chosen time', () => {
    // The planner estimates from your pace, so a real session can run a little over.
    for (const day of studied) expect(day.minutes).toBeLessThan(15 * 1.25);
    expect(result.summary.minutesPerStudyDay).toBeLessThanOrEqual(15);
    expect(result.summary.minutesPerStudyDay).toBeGreaterThan(12);
  });

  it('keeps recall near the target and moves words up the ladder', () => {
    expect(result.summary.retention).toBeGreaterThan(0.75);
    expect(result.summary.retention).toBeLessThan(0.95);
    expect(result.summary.started).toBeGreaterThan(150);
    expect(result.summary.use + result.summary.owned).toBeGreaterThan(40);
    expect(result.summary.catchUpShare).toBeLessThan(0.1);
  });

  it('recovers from a two-week break with catch-up days, then adds new words again', () => {
    const withBreak = simulate({ days: 120, minutes: 10, seed: 3, studyChance: 1, steadyDays: 30 });
    expect(withBreak.days.every((d) => d.mode !== 'catch-up')).toBe(true);
    // Rerun, skipping days 60 to 73.
    const skipped = simulate({
      days: 120,
      minutes: 10,
      seed: 3,
      studyChance: 1,
      steadyDays: 30,
      skipDays: [[60, 73]],
    });
    const after = skipped.days.slice(74);
    const catchUp = after.filter((d) => d.mode === 'catch-up');
    expect(catchUp.length).toBeGreaterThan(0);
    expect(catchUp.every((d) => d.newWords === 0)).toBe(true);
    // Back to normal within two weeks, with new words again.
    expect(after.slice(14).some((d) => d.mode === 'normal' && d.newWords > 0)).toBe(true);
    expect(after.slice(14).every((d) => d.mode !== 'catch-up')).toBe(true);
  });

  it('ends with the same state a full replay of its events gives', () => {
    expect(replay(result.events)).toEqual(result.state);
  });
});
