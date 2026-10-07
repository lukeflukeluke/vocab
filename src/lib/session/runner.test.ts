import { describe, expect, it } from 'vitest';
import { replay } from '../state/reducer';
import { sampleBank } from '../testing/bank';
import { at } from '../testing/history';
import { buildSession, REPEAT_GAP } from './build';
import {
  afterKnownCheck,
  claimKnown,
  completeStep,
  currentStep,
  isFinished,
  MAX_REPEATS,
  progress,
  startSession,
  summarize,
  type Session,
} from './runner';
import type { DayPlan } from '../scheduler/planner';

const bank = sampleBank();
const [first, second, third] = bank.candidates as [string, string, string];

function session(newWords: string[]): Session {
  const plan = { reviews: [], newWords } as unknown as DayPlan;
  const state = replay([]);
  return startSession(buildSession({ plan, state, bank, now: at(0), tzOffsetMinutes: 0 }), at(0));
}

/** Answers every step correctly until `stop` says to stop. */
function runUntil(s: Session, stop: (s: Session) => boolean): Session {
  while (!isFinished(s) && !stop(s)) s = completeStep(s, { correct: true, rating: 3 });
  return s;
}

const role = (s: Session) => {
  const step = currentStep(s);
  return step?.kind === 'exercise' ? step.role : step?.kind;
};

describe('runner', () => {
  it('works through every step and tracks progress', () => {
    let s = session([first]);
    expect(progress(s)).toBe(0);
    s = runUntil(s, () => false);
    expect(isFinished(s)).toBe(true);
    expect(progress(s)).toBe(1);
    expect(summarize(s)).toEqual({
      answered: 3,
      correct: 3,
      newWords: [first],
      known: [],
      reviewed: [],
      missed: [],
    });
  });

  it('brings a missed exercise back a few items later with another sentence', () => {
    let s = runUntil(session([first, second, third]), (x) => role(x) === 'check');
    const missed = currentStep(s)!;
    const length = s.steps.length;
    s = completeStep(s, { correct: false, rating: 1 });
    expect(s.steps).toHaveLength(length + 1);
    const again = s.steps.findIndex((x, i) => i > s.index - 1 && x.entryId === missed.entryId);
    const repeat = s.steps[again]!;
    expect(repeat.kind === 'exercise' && repeat.role).toBe('repeat');
    expect(again - (s.index - 1)).toBeGreaterThan(REPEAT_GAP);
    expect(repeat.kind === 'exercise' && missed.kind === 'exercise' && repeat.promptId).not.toBe(
      missed.kind === 'exercise' && missed.promptId,
    );
    expect(summarize(s).missed).toEqual([first]);
  });

  it('stops repeating a word after a few misses', () => {
    let s = session([first]);
    while (!isFinished(s)) {
      const step = currentStep(s)!;
      s = completeStep(s, { correct: step.kind !== 'exercise' });
    }
    // Check, blank and final, plus the repeats.
    expect(summarize(s).answered).toBe(3 + MAX_REPEATS);
  });

  it('turns "I know this" into a typed check', () => {
    let s = claimKnown(session([first, second]));
    const step = currentStep(s)!;
    expect(step.kind === 'exercise' && [step.role, step.exercise, step.firstLetter]).toEqual([
      'known',
      'P1',
      false,
    ]);
    // The rest of the first word's introduction is gone.
    expect(s.steps.filter((x) => x.entryId === first)).toHaveLength(2);
    s = afterKnownCheck(s, true, third);
    expect(currentStep(s)).toMatchObject({ kind: 'guess', entryId: third });
    expect(s.steps.filter((x) => x.entryId === third).map((x) => x.kind)).toEqual([
      'guess',
      'page',
      'exercise',
      'exercise',
      'exercise',
    ]);
    s = runUntil(s, () => false);
    expect(summarize(s)).toMatchObject({ known: [first], newWords: [third, second] });
  });

  it('teaches the word as normal when the "I know this" check fails', () => {
    let s = claimKnown(session([first]));
    s = afterKnownCheck(s, false, second);
    expect(currentStep(s)).toMatchObject({ kind: 'page', entryId: first });
    expect(s.steps.filter((x) => x.entryId === second)).toHaveLength(0);
    s = runUntil(s, () => false);
    expect(summarize(s)).toMatchObject({ known: [], newWords: [first], answered: 3 });
  });
});
