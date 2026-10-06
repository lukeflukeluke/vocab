import { createEmptyCard, fsrs, generatorParameters, type Grade } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import type { Rating } from '../events/types';
import { DAY_MS, dueTime, intervalDays, remember, retrievability, type Memory } from './memory';

const T0 = Date.UTC(2026, 0, 5, 19);

function history(steps: [days: number, rating: Rating][]): Memory {
  let memory: Memory | null = null;
  for (const [days, rating] of steps) memory = remember(memory, T0 + days * DAY_MS, rating);
  return memory!;
}

describe('remember', () => {
  it('matches ts-fsrs run directly, card to card', () => {
    const f = fsrs(
      generatorParameters({
        enable_fuzz: false,
        enable_short_term: true,
        learning_steps: [],
        relearning_steps: [],
      }),
    );
    const steps: [number, Rating][] = [
      [0, 3],
      [0.01, 3],
      [2, 3],
      [9, 1],
      [10, 3],
      [25, 4],
    ];
    let card = createEmptyCard(new Date(T0));
    for (const [days, rating] of steps) {
      card = f.next(card, new Date(T0 + days * DAY_MS), rating as Grade).card;
    }
    const memory = history(steps);
    expect(memory.stability).toBeCloseTo(card.stability, 10);
    expect(memory.difficulty).toBeCloseTo(card.difficulty, 10);
    expect(memory.reps).toBe(steps.length);
  });

  it('grows stability with successful spaced reviews', () => {
    const first = history([[0, 3]]);
    const second = history([
      [0, 3],
      [2, 3],
    ]);
    const third = history([
      [0, 3],
      [2, 3],
      [12, 3],
    ]);
    expect(second.stability).toBeGreaterThan(first.stability);
    expect(third.stability).toBeGreaterThan(second.stability);
  });

  it('counts only failed scheduled reviews as lapses', () => {
    const inSession = history([
      [0, 3],
      [0.01, 1],
    ]);
    expect(inSession.lapses).toBe(0);
    const scheduled = history([
      [0, 3],
      [3, 1],
    ]);
    expect(scheduled.lapses).toBe(1);
  });

  it('keeps the first and last review times', () => {
    const memory = history([
      [0, 3],
      [2, 3],
    ]);
    expect(memory.firstReview).toBe(T0);
    expect(memory.lastReview).toBe(T0 + 2 * DAY_MS);
  });
});

describe('retrievability', () => {
  it('starts near 1 and falls over time, reaching 90% at the stability', () => {
    const memory = history([
      [0, 3],
      [2, 3],
    ]);
    expect(retrievability(memory, memory.lastReview)).toBeCloseTo(1, 5);
    const atStability = memory.lastReview + memory.stability * DAY_MS;
    expect(retrievability(memory, atStability)).toBeCloseTo(0.9, 3);
    expect(retrievability(memory, atStability + DAY_MS)).toBeLessThan(0.9);
  });
});

describe('intervalDays and dueTime', () => {
  it('waits longer for a lower target retention', () => {
    const memory = history([
      [0, 3],
      [2, 3],
    ]);
    expect(intervalDays(memory, 0.85)).toBeGreaterThan(intervalDays(memory, 0.9));
    expect(intervalDays(memory, 0.95)).toBeLessThan(intervalDays(memory, 0.9));
    expect(dueTime(memory, 0.9)).toBe(memory.lastReview + intervalDays(memory, 0.9) * DAY_MS);
  });

  it('is at least one day', () => {
    expect(intervalDays(history([[0, 1]]), 0.9)).toBeGreaterThanOrEqual(1);
  });
});
