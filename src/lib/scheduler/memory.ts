import {
  createEmptyCard,
  forgetting_curve,
  fsrs,
  generatorParameters,
  State,
  type Card,
  type FSRS,
  type Grade,
} from 'ts-fsrs';
import type { Rating } from '../events/types';

export const DAY_MS = 86_400_000;

/** A failed review only counts as a lapse if it came this long after the one before. */
const LAPSE_GAP_MS = 12 * 3_600_000;

/** What FSRS knows about one track (recognition or production) of one word. */
export interface Memory {
  /** Days until the chance of recall falls to 90%. */
  stability: number;
  /** From 1 (easy) to 10 (hard). */
  difficulty: number;
  firstReview: number;
  lastReview: number;
  reps: number;
  /**
   * Failed reviews that came at least 12 hours after the previous review, i.e. failed
   * scheduled reviews. Misses during a word's first session do not count.
   */
  lapses: number;
}

// Minute-based learning steps are off: repeats inside a session are placed by the session
// runner, and FSRS-6 updates memory for same-day reviews itself. Fuzz is off so that
// replaying the same reviews always gives the same result.
const schedulers = new Map<number, FSRS>();

function scheduler(retention = 0.9): FSRS {
  let f = schedulers.get(retention);
  if (!f) {
    f = fsrs(
      generatorParameters({
        request_retention: retention,
        enable_fuzz: false,
        enable_short_term: true,
        learning_steps: [],
        relearning_steps: [],
      }),
    );
    schedulers.set(retention, f);
  }
  return f;
}

function toCard(memory: Memory): Card {
  const last = new Date(memory.lastReview);
  return {
    due: last,
    stability: memory.stability,
    difficulty: memory.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: memory.reps,
    lapses: memory.lapses,
    state: State.Review,
    last_review: last,
  };
}

/** The memory after one more review. Pure: same inputs, same result. */
export function remember(memory: Memory | null, t: number, rating: Rating): Memory {
  const now = new Date(t);
  const card = memory ? toCard(memory) : createEmptyCard(now);
  const next = scheduler().next(card, now, rating as Grade).card;
  const lapsed = memory !== null && rating === 1 && t - memory.lastReview >= LAPSE_GAP_MS;
  return {
    stability: next.stability,
    difficulty: next.difficulty,
    firstReview: memory?.firstReview ?? t,
    lastReview: t,
    reps: (memory?.reps ?? 0) + 1,
    lapses: (memory?.lapses ?? 0) + (lapsed ? 1 : 0),
  };
}

/** Chance of recall at time t, from 0 to 1. */
export function retrievability(memory: Memory, t: number): number {
  const elapsedDays = Math.max(0, (t - memory.lastReview) / DAY_MS);
  return forgetting_curve(scheduler().parameters.w, elapsedDays, memory.stability);
}

/** Whole days from the last review until recall is predicted to fall to `retention`. */
export function intervalDays(memory: Memory, retention: number): number {
  return scheduler(retention).next_interval(memory.stability, 0);
}

/** When the next review falls due. */
export function dueTime(memory: Memory, retention: number): number {
  return memory.lastReview + intervalDays(memory, retention) * DAY_MS;
}
