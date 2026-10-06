import type { Rating } from '../events/types';
import type { State } from '../state/state';

/**
 * How an exercise is answered. Multiple choice can be guessed, so it never earns Easy;
 * self-graded answers (R3) use the learner's own Missed / Fuzzy / Got it.
 */
export type AnswerKind = 'choice' | 'typed' | 'self';

export type SelfGrade = 'missed' | 'fuzzy' | 'got';

export interface Answer {
  kind: AnswerKind;
  /** False for a wrong answer or "I don't know". */
  correct: boolean;
  hintsUsed: number;
  /** Right word with a one-letter slip (typed answers). */
  nearMiss?: boolean;
  ms: number;
  /** Usual time for this exercise on this device, or null while there is too little history. */
  usualMs: number | null;
  /** Required when kind is 'self'. */
  selfGrade?: SelfGrade;
}

const SLOW = 2;
const FAST = 0.6;

/** Turns what happened into an FSRS rating (PLAN 6.2). */
export function rateAnswer(answer: Answer): Rating {
  if (answer.kind === 'self') {
    if (!answer.selfGrade) throw new Error('A self-graded answer needs selfGrade');
    return answer.selfGrade === 'got' ? 3 : answer.selfGrade === 'fuzzy' ? 2 : 1;
  }
  if (!answer.correct) return 1;
  const slow = answer.usualMs !== null && answer.ms > SLOW * answer.usualMs;
  if (answer.hintsUsed > 0 || answer.nearMiss || slow) return 2;
  const fast = answer.usualMs !== null && answer.ms < FAST * answer.usualMs;
  return answer.kind === 'typed' && fast ? 4 : 3;
}

/** Recent answers used for the usual time, and how many are needed before it counts. */
const USUAL_WINDOW = 50;
const USUAL_MIN_SAMPLES = 10;

/**
 * The median answer time for an exercise on a device, over the latest 50 such answers.
 * Null until there are at least 10.
 */
export function usualResponseMs(state: State, exercise: string, device: string): number | null {
  const samples: { t: number; ms: number }[] = [];
  for (const word of Object.values(state.words)) {
    for (const record of [...word.reviews.recognition, ...word.reviews.production]) {
      if (record.exercise === exercise && record.device === device) samples.push(record);
    }
  }
  if (samples.length < USUAL_MIN_SAMPLES) return null;
  const recent = samples
    .sort((a, b) => a.t - b.t)
    .slice(-USUAL_WINDOW)
    .map((s) => s.ms)
    .sort((a, b) => a - b);
  const mid = recent.length >> 1;
  return recent.length % 2 ? recent[mid]! : (recent[mid - 1]! + recent[mid]!) / 2;
}
