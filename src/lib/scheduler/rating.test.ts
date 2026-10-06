import { describe, expect, it } from 'vitest';
import type { EventBody } from '../events/types';
import { replay } from '../state/reducer';
import { makeEvent } from '../testing/factories';
import { rateAnswer, usualResponseMs, type Answer } from './rating';

const typed = (over: Partial<Answer> = {}): Answer => ({
  kind: 'typed',
  correct: true,
  hintsUsed: 0,
  ms: 5000,
  usualMs: 5000,
  ...over,
});

describe('rateAnswer', () => {
  it('rates wrong answers and "I don\'t know" as Again', () => {
    expect(rateAnswer(typed({ correct: false }))).toBe(1);
    expect(rateAnswer({ ...typed({ correct: false }), kind: 'choice' })).toBe(1);
  });

  it('rates hints, near misses and slow answers as Hard', () => {
    expect(rateAnswer(typed({ hintsUsed: 1 }))).toBe(2);
    expect(rateAnswer(typed({ nearMiss: true }))).toBe(2);
    expect(rateAnswer(typed({ ms: 10_001 }))).toBe(2);
    expect(rateAnswer(typed({ ms: 10_000 }))).toBe(3);
  });

  it('rates fast typed answers as Easy, but never multiple choice', () => {
    expect(rateAnswer(typed({ ms: 2900 }))).toBe(4);
    expect(rateAnswer({ ...typed({ ms: 2900 }), kind: 'choice' })).toBe(3);
  });

  it('ignores speed until there is a usual time', () => {
    expect(rateAnswer(typed({ ms: 100_000, usualMs: null }))).toBe(3);
    expect(rateAnswer(typed({ ms: 100, usualMs: null }))).toBe(3);
  });

  it('maps self-grades without ever giving Easy', () => {
    const self = (selfGrade: Answer['selfGrade']) =>
      rateAnswer({ ...typed(), kind: 'self', ...(selfGrade && { selfGrade }) });
    expect(self('missed')).toBe(1);
    expect(self('fuzzy')).toBe(2);
    expect(self('got')).toBe(3);
    expect(() => self(undefined)).toThrow();
  });
});

describe('usualResponseMs', () => {
  const answers = (device: string, exercise: string, times: number[], start: number) =>
    times.map((ms, i) =>
      makeEvent(
        {
          type: 'review',
          entryId: 'w',
          track: 'recognition',
          exercise,
          correct: true,
          rating: 3,
          ms,
          hintsUsed: 0,
        } as EventBody,
        { t: start + i, device },
      ),
    );

  it('is the median per exercise and device, once there are 10 answers', () => {
    const added = makeEvent({ type: 'word_added', entryId: 'w', source: 'bank' }, { t: 0 });
    const phone = answers(
      'phone',
      'R1',
      [9, 1, 8, 2, 7, 3, 6, 4, 5].map((s) => s * 1000),
      10,
    );
    const state9 = replay([added, ...phone]);
    expect(usualResponseMs(state9, 'R1', 'phone')).toBeNull();

    const more = answers('phone', 'R1', [10_000], 100);
    const pc = answers('pc', 'R1', Array(12).fill(1000), 200);
    const other = answers('phone', 'P1', Array(12).fill(20_000), 300);
    const state = replay([added, ...phone, ...more, ...pc, ...other]);
    expect(usualResponseMs(state, 'R1', 'phone')).toBe(5500);
    expect(usualResponseMs(state, 'R1', 'pc')).toBe(1000);
    expect(usualResponseMs(state, 'P1', 'phone')).toBe(20_000);
  });
});
