import { describe, expect, it } from 'vitest';
import type { DayPlan } from '../scheduler/planner';
import { planDay } from '../scheduler/planner';
import { replay } from '../state/reducer';
import { sampleBank } from '../testing/bank';
import { added, at, introduced, reviewed } from '../testing/history';
import {
  BLANK_GAP,
  buildSession,
  OPENING_REVIEWS,
  QUICK_REVIEWS,
  reviewExercise,
  unfinishedIntros,
} from './build';
import type { Step } from './steps';

const bank = sampleBank();
const ids = bank.candidates;

function plan(parts: Partial<DayPlan>): DayPlan {
  return {
    day: 0,
    minutes: 15,
    mode: 'normal',
    reviews: [],
    writing: [],
    newWords: [],
    newWordsTarget: 5,
    newWordsReason: 'on-target',
    backlog: 0,
    spentSeconds: 0,
    estimatedSeconds: 0,
    ...parts,
  };
}

const describeStep = (s: Step) =>
  s.kind === 'exercise' ? `${s.role}:${s.exercise}:${s.entryId}` : `${s.kind}:${s.entryId}`;

/** No step is wedged inside another word's guess, page and check. */
function expectBlocksIntact(steps: Step[]) {
  const seen = new Set<string>();
  steps.forEach((s, i) => {
    if (i > 0 && steps[i - 1]!.block !== s.block) {
      expect(seen.has(s.block), `block ${s.block} split`).toBe(false);
    }
    seen.add(s.block);
  });
}

describe('buildSession', () => {
  it('runs a first session: each new word with its guess, page, check, blank and final', () => {
    const state = replay([]);
    const now = at(0);
    const today = planDay({ state, now, tzOffsetMinutes: 0, candidates: ids });
    expect(today.newWords).toHaveLength(5);
    const { steps } = buildSession({ plan: today, state, bank, now, tzOffsetMinutes: 0 });

    expect(steps).toHaveLength(25);
    expectBlocksIntact(steps);
    for (const id of today.newWords) {
      const mine = steps.filter((s) => s.entryId === id).map(describeStep);
      expect(mine).toEqual([
        `guess:${id}`,
        `page:${id}`,
        `check:R1:${id}`,
        `blank:P1:${id}`,
        `final:R1:${id}`,
      ]);
      const check = steps.findIndex((s) => describeStep(s) === `check:R1:${id}`);
      const blank = steps.findIndex((s) => describeStep(s) === `blank:P1:${id}`);
      const final = steps.findIndex((s) => describeStep(s) === `final:R1:${id}`);
      expect(blank).toBeGreaterThan(check + 2);
      expect(final).toBeGreaterThan(blank + 1);
    }
    // The first words get the full gap; the last ones fit in among the final checks.
    const gap = (id: string) =>
      steps.findIndex((s) => describeStep(s) === `blank:P1:${id}`) -
      steps.findIndex((s) => describeStep(s) === `check:R1:${id}`);
    for (const id of today.newWords.slice(0, 3)) expect(gap(id)).toBeGreaterThan(BLANK_GAP);
  });

  it('never shows the same sentence twice to one word in a session', () => {
    const state = replay([]);
    const today = plan({ newWords: ids.slice(0, 3) });
    const { steps } = buildSession({ plan: today, state, bank, now: at(0), tzOffsetMinutes: 0 });
    for (const id of today.newWords) {
      const prompts = steps
        .filter((s) => s.entryId === id)
        .flatMap((s) => (s.kind === 'page' ? s.promptIds : [s.promptId]));
      expect(new Set(prompts).size).toBe(prompts.length);
    }
  });

  it('opens with reviews, then puts reviews between new words', () => {
    const reviewIds = ids.slice(5, 17);
    const state = replay(reviewIds.flatMap((id) => introduced(id, 0)));
    const today = plan({
      day: 3,
      reviews: reviewIds.map((entryId) => ({
        entryId,
        track: 'recognition',
        retrievability: 0.8,
        overdueDays: 0,
      })),
      newWords: ids.slice(0, 2),
    });
    const { steps } = buildSession({ plan: today, state, bank, now: at(3), tzOffsetMinutes: 0 });
    const kinds = steps.map((s) => (s.kind === 'exercise' ? s.role : s.kind));
    expect(kinds.slice(0, OPENING_REVIEWS)).toEqual(Array(OPENING_REVIEWS).fill('review'));
    expect(kinds.slice(OPENING_REVIEWS, OPENING_REVIEWS + 3)).toEqual(['guess', 'page', 'check']);
    expect(kinds.filter((k) => k === 'review')).toHaveLength(12);
    expect(kinds.slice(-2)).toEqual(['final', 'final']);
    expectBlocksIntact(steps);
  });

  it('finishes introductions left over from a paused session', () => {
    const [a, b] = [ids[0]!, ids[1]!];
    const state = replay([
      added(a, 0),
      reviewed(a, 'recognition', at(0), 3),
      added(b, 0),
      reviewed(b, 'recognition', at(0), 3),
      Object.assign(reviewed(b, 'recognition', at(0) + 60_000, 3), { exercise: 'P1' }),
    ]);
    expect(unfinishedIntros(state, at(0, 21), 0)).toEqual(
      expect.arrayContaining([
        { entryId: a, needsBlank: true, needsFinal: true },
        { entryId: b, needsBlank: false, needsFinal: true },
      ]),
    );
    // The next day they are just words in the review queue.
    expect(unfinishedIntros(state, at(1, 21), 0)).toEqual([]);

    const { steps } = buildSession({
      plan: plan({}),
      state,
      bank,
      now: at(0, 21),
      tzOffsetMinutes: 0,
    });
    expect(steps.map(describeStep).sort()).toEqual(
      [`blank:P1:${a}`, `final:R1:${a}`, `final:R1:${b}`].sort(),
    );
    expect(steps[0]!.kind === 'exercise' && steps[0]!.role).toBe('blank');
  });

  it('2-minute mode: the most at-risk reviews only, no new words', () => {
    const reviewIds = ids.slice(5, 17);
    const state = replay(reviewIds.flatMap((id) => introduced(id, 0)));
    const today = plan({
      reviews: reviewIds.map((entryId) => ({
        entryId,
        track: 'recognition',
        retrievability: 0.8,
        overdueDays: 0,
      })),
      newWords: ids.slice(0, 2),
    });
    const { steps } = buildSession({
      plan: today,
      state,
      bank,
      now: at(3),
      tzOffsetMinutes: 0,
      quick: true,
    });
    expect(steps.map(describeStep)).toEqual(
      reviewIds.slice(0, QUICK_REVIEWS).map((id) => expect.stringMatching(`^review:R.:${id}$`)),
    );
  });

  it('leaves out words the bank does not have', () => {
    const today = plan({ newWords: ['nonesuch#n', ids[0]!] });
    const { steps } = buildSession({
      plan: today,
      state: replay([]),
      bank,
      now: at(0),
      tzOffsetMinutes: 0,
    });
    expect(steps.every((s) => s.entryId === ids[0])).toBe(true);
  });
});

describe('reviewExercise', () => {
  const id = ids[0]!;

  it('alternates R1 and R3 for recognition, repeating a failed R1', () => {
    const word = (rating: 1 | 3) =>
      replay([...introduced(id, 0), reviewed(id, 'recognition', at(2), rating)]).words[id]!;
    expect(reviewExercise(word(3), 'recognition', 5).exercise).toBe('R3');
    expect(reviewExercise(word(1), 'recognition', 5).exercise).toBe('R1');
  });

  it('starts production with P3 when you have enough words, then P1 with a first letter', () => {
    const fresh = replay(introduced(id, 0)).words[id]!;
    expect(reviewExercise(fresh, 'production', 4)).toEqual({ exercise: 'P3', firstLetter: false });
    expect(reviewExercise(fresh, 'production', 3)).toEqual({ exercise: 'P1', firstLetter: true });
    const once = replay([...introduced(id, 0), reviewed(id, 'production', at(5), 3)]).words[id]!;
    expect(reviewExercise(once, 'production', 9)).toEqual({ exercise: 'P1', firstLetter: true });
    const twice = replay([
      ...introduced(id, 0),
      reviewed(id, 'production', at(5), 3),
      reviewed(id, 'production', at(9), 3),
    ]).words[id]!;
    expect(reviewExercise(twice, 'production', 9)).toEqual({ exercise: 'P1', firstLetter: false });
  });
});
