import type { Track } from '../events/types';

// The items a session is made of. A session is a list of steps worked through in order;
// it lives only in memory. Everything it records goes into the event log, so pausing and
// coming back later simply builds a new session from what is left of today.

/** Exercises built so far (PLAN 5). */
export type ExerciseId = 'R1' | 'R3' | 'P1' | 'P3';

/**
 * Why an exercise is in the session:
 * - review: a due review from the planner
 * - check: the check straight after a new word's page (PLAN 4, step 3)
 * - blank: the fill-in-the-blank a few items later (step 4)
 * - final: the last recognition check at the end of the session (step 5)
 * - repeat: another go after a miss, with a different sentence
 * - known: the typed check after "I know this word" (PLAN 3.5)
 */
export type Role = 'review' | 'check' | 'blank' | 'final' | 'repeat' | 'known';

interface StepBase {
  /** Unique within the session. */
  key: string;
  entryId: string;
  /** Steps sharing a block stay together: nothing is inserted between them. */
  block: string;
}

/** "What do you think this word means?" before the word page (PLAN 4, step 1). */
export interface GuessStep extends StepBase {
  kind: 'guess';
  promptId: string;
}

/** The word page (PLAN 4, step 2). */
export interface PageStep extends StepBase {
  kind: 'page';
  /** Example sentences shown on the page. */
  promptIds: string[];
}

export interface ExerciseStep extends StepBase {
  kind: 'exercise';
  track: Track;
  exercise: ExerciseId;
  role: Role;
  promptId: string;
  /** Typed exercises: show the first letter from the start (not counted as a hint). */
  firstLetter: boolean;
}

export type Step = GuessStep | PageStep | ExerciseStep;
