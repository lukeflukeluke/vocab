import type { Rating, Track } from '../events/types';
import { BLANK_GAP, insertLater, REPEAT_GAP, type Built, type StepMaker } from './build';
import type { ExerciseId, Role, Step } from './steps';

// Moving through a session. These functions return a new Session and leave the old one
// alone, so the screen can keep it in a plain state variable.

/** A word can come back after a miss this many times in one session. */
export const MAX_REPEATS = 2;
/** Words marked "I know this" can be replaced by other new words this many times. */
export const MAX_REPLACEMENTS = 5;

export interface StepResult {
  key: string;
  entryId: string;
  kind: Step['kind'];
  exercise?: ExerciseId;
  track?: Track;
  role?: Role;
  correct: boolean;
  rating?: Rating;
}

export interface Session {
  steps: readonly Step[];
  /** The step being shown; equal to steps.length when the session is over. */
  index: number;
  results: readonly StepResult[];
  repeats: Readonly<Record<string, number>>;
  /** Words passed with "I know this" this session. */
  known: readonly string[];
  replacements: number;
  startedAt: number;
  maker: StepMaker;
}

export function startSession(built: Built, now: number): Session {
  return {
    steps: built.steps,
    index: 0,
    results: [],
    repeats: {},
    known: [],
    replacements: 0,
    startedAt: now,
    maker: built.maker,
  };
}

export function currentStep(session: Session): Step | undefined {
  return session.steps[session.index];
}

export function isFinished(session: Session): boolean {
  return session.index >= session.steps.length;
}

/** Share of the session done, from 0 to 1. */
export function progress(session: Session): number {
  return session.steps.length ? session.index / session.steps.length : 1;
}

/**
 * Finishes the current step. A missed exercise comes back a few items later with a
 * different sentence (PLAN 4), at most twice per word.
 */
export function completeStep(
  session: Session,
  outcome: { correct: boolean; rating?: Rating },
): Session {
  const step = currentStep(session);
  if (!step) return session;
  const steps = [...session.steps];
  const repeats = { ...session.repeats };
  const result: StepResult = {
    key: step.key,
    entryId: step.entryId,
    kind: step.kind,
    correct: outcome.correct,
    ...(outcome.rating !== undefined && { rating: outcome.rating }),
  };
  if (step.kind === 'exercise') {
    Object.assign(result, { exercise: step.exercise, track: step.track, role: step.role });
    const used = repeats[step.entryId] ?? 0;
    if (!outcome.correct && step.role !== 'known' && used < MAX_REPEATS) {
      repeats[step.entryId] = used + 1;
      insertLater(steps, session.index, REPEAT_GAP, [session.maker.repeat(step)]);
    }
  }
  return {
    ...session,
    steps,
    repeats,
    results: [...session.results, result],
    index: session.index + 1,
  };
}

/**
 * "I know this word" on the guess screen (PLAN 3.5): the rest of the word's introduction
 * is replaced by one typed fill-in-the-blank, without the first letter.
 */
export function claimKnown(session: Session): Session {
  const step = currentStep(session);
  if (!step || step.kind !== 'guess') return session;
  const check = session.maker.exercise(step.entryId, 'recognition', 'P1', 'known', false);
  const steps = session.steps.filter((s, i) => i <= session.index || s.entryId !== step.entryId);
  steps.splice(session.index + 1, 0, check);
  return completeStep({ ...session, steps }, { correct: true });
}

/**
 * After the "I know this" check. Passed: the word is known, and another new word takes
 * its place if one is offered. Failed: the word is learned as normal, from its page.
 */
export function afterKnownCheck(
  session: Session,
  passed: boolean,
  replacement: string | null,
): Session {
  const step = currentStep(session);
  if (!step || step.kind !== 'exercise' || step.role !== 'known') return session;
  let next = completeStep(session, { correct: passed });
  const steps = [...next.steps];
  const maker = session.maker;
  if (passed) {
    next = { ...next, known: [...next.known, step.entryId] };
    if (replacement && next.replacements < MAX_REPLACEMENTS) {
      next = { ...next, replacements: next.replacements + 1 };
      addIntroduction(steps, next.index, replacement, maker, maker.introduction(replacement));
    }
  } else {
    addIntroduction(steps, next.index, step.entryId, maker, maker.pageAndCheck(step.entryId));
  }
  return { ...next, steps };
}

function addIntroduction(
  steps: Step[],
  at: number,
  entryId: string,
  maker: StepMaker,
  intro: Step[],
): void {
  const start = insertLater(steps, at - 1, 0, intro);
  const check = start + intro.length - 1;
  insertLater(steps, check, BLANK_GAP, [
    maker.exercise(entryId, 'recognition', 'P1', 'blank', true),
  ]);
  steps.push(maker.exercise(entryId, 'recognition', 'R1', 'final', false));
}

export interface SessionSummary {
  answered: number;
  correct: number;
  /** Words met for the first time this session. */
  newWords: string[];
  known: string[];
  /** Words reviewed (not new today). */
  reviewed: string[];
  /** Words missed at least once, in the order they were first missed. */
  missed: string[];
}

export function summarize(session: Session): SessionSummary {
  const exercises = session.results.filter((r) => r.kind === 'exercise' && r.role !== 'known');
  const unique = (ids: string[]) => [...new Set(ids)];
  const newWords = unique(session.results.filter((r) => r.kind === 'page').map((r) => r.entryId));
  return {
    answered: exercises.length,
    correct: exercises.filter((r) => r.correct).length,
    newWords,
    known: [...session.known],
    reviewed: unique(exercises.filter((r) => r.role === 'review').map((r) => r.entryId)),
    missed: unique(exercises.filter((r) => !r.correct).map((r) => r.entryId)),
  };
}
