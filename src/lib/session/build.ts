import type { Bank, BankEntry } from '../content/bank';
import type { Track } from '../events/types';
import type { DayPlan } from '../scheduler/planner';
import { studyDay } from '../scheduler/day';
import type { ReviewRecord, State, UserWord } from '../state/state';
import { confusionPairs, drillPartner, drillPrompt } from './confusion';
import {
  capturedPrompt,
  pageExamples,
  pickPrompt,
  promptHistory,
  type PromptKind,
} from './prompts';
import type { ExerciseId, ExerciseStep, Role, Step } from './steps';

// Turns today's plan into a session (PLAN 7): about 10 reviews, then each new word with
// about 5 reviews after it, the rest of the reviews, and a last check on each new word.
// Writing tasks (U1) come in S10, so they are left out for now.

/** Reviews before the first new word. */
export const OPENING_REVIEWS = 10;
/** Reviews between new words. */
export const REVIEWS_BETWEEN = 5;
/** Items between a new word's check and its fill-in-the-blank (PLAN 4, step 4). */
export const BLANK_GAP = 5;
/** Items before a missed exercise comes back. */
export const REPEAT_GAP = 3;
/** P3 needs this many of your own words besides the one being tested. */
export const P3_MIN_OTHERS = 3;
/** Production stability (days) from which P2 joins P1 (PLAN 5). */
export const P2_FROM_STABILITY = 21;
/** Lapses on a track that make it a leech, and that bring the offer to park it (PLAN 6.5). */
export const LEECH_LAPSES = 5;
export const PARK_LAPSES = 8;
/** How long a parked word is left alone. */
export const PARK_DAYS = 30;

/** Builds steps and keeps track of the sentences each word has used this session. */
export class StepMaker {
  used: Record<string, string[]>;
  #count = 0;

  constructor(
    private bank: Bank,
    private state: State,
    used: Record<string, string[]> = {},
    count = 0,
  ) {
    this.used = structuredClone(used);
    this.#count = count;
  }

  get count(): number {
    return this.#count;
  }

  #key(kind: string, entryId: string): string {
    this.#count += 1;
    return `${this.#count}:${kind}:${entryId}`;
  }

  #prompt(entry: BankEntry, kind: PromptKind): string {
    const used = (this.used[entry.id] ??= []);
    const id = pickPrompt(entry, kind, promptHistory(this.state.words[entry.id]), used);
    used.push(id);
    return id;
  }

  #entry(entryId: string): BankEntry {
    const entry = this.bank.byId.get(entryId);
    if (!entry) throw new Error(`No word-bank entry ${entryId}`);
    return entry;
  }

  /** Guess, word page and immediate check, kept together as one block. */
  introduction(entryId: string): Step[] {
    const entry = this.#entry(entryId);
    const block = this.#key('intro', entryId);
    // A word you captured is guessed from your own sentence (PLAN 3.3).
    const guess = capturedPrompt(entry) ?? 'ex0';
    const page = pageExamples(entry);
    (this.used[entryId] ??= []).push(guess, ...page);
    return [
      { kind: 'guess', key: this.#key('guess', entryId), entryId, block, promptId: guess },
      { kind: 'page', key: this.#key('page', entryId), entryId, block, promptIds: page },
      this.exercise(entryId, 'recognition', 'R1', 'check', false, block),
    ];
  }

  /** The word page and check again, after a failed "I know this" check. */
  pageAndCheck(entryId: string): Step[] {
    const entry = this.#entry(entryId);
    const block = this.#key('intro', entryId);
    const page = pageExamples(entry);
    return [
      { kind: 'page', key: this.#key('page', entryId), entryId, block, promptIds: page },
      this.exercise(entryId, 'recognition', 'R1', 'check', false, block),
    ];
  }

  exercise(
    entryId: string,
    track: Track,
    exercise: ExerciseId,
    role: Role,
    firstLetter: boolean,
    block?: string,
    partner?: string,
  ): ExerciseStep {
    const entry = this.#entry(entryId);
    const typed = exercise === 'P1' || exercise === 'P3';
    const key = this.#key(exercise, entryId);
    const promptId =
      exercise === 'P2'
        ? 'def'
        : exercise === 'P4' && partner
          ? drillPrompt(partner)
          : this.#prompt(entry, typed ? 'cloze' : 'example');
    return {
      kind: 'exercise',
      key,
      entryId,
      block: block ?? key,
      track,
      exercise,
      role,
      promptId,
      firstLetter,
      ...(partner && { partner }),
    };
  }

  /** The same exercise again with a different sentence, after a miss. */
  repeat(step: ExerciseStep): ExerciseStep {
    return this.exercise(
      step.entryId,
      step.track,
      step.exercise,
      'repeat',
      step.firstLetter,
      undefined,
      step.partner,
    );
  }

  /**
   * A track that keeps slipping (PLAN 6.5): the leech step, a contrast drill if the word
   * is mixed up with another, then the review itself, kept together.
   */
  leech(
    entryId: string,
    track: Track,
    lapses: number,
    review: { exercise: ExerciseId; firstLetter: boolean },
    partner: string | null,
  ): Step[] {
    const entry = this.#entry(entryId);
    const block = this.#key('leech', entryId);
    const steps: Step[] = [
      {
        kind: 'leech',
        key: this.#key('slipping', entryId),
        entryId,
        block,
        track,
        lapses,
        park: lapses >= PARK_LAPSES,
        promptIds: pageExamples(entry),
      },
    ];
    if (partner) {
      steps.push(this.exercise(entryId, track, 'P4', 'review', false, block, partner));
    }
    steps.push(this.exercise(entryId, track, review.exercise, 'review', review.firstLetter, block));
    return steps;
  }
}

export interface ExerciseChoice {
  exercise: ExerciseId;
  firstLetter: boolean;
  /** P4: the word to drill against. */
  partner?: string;
}

export interface ChoiceContext {
  /** The word's entry, to know which exercises it can support. */
  entry?: BankEntry;
  /** 2-minute mode: quick recall (R3) for recognition. */
  quick?: boolean;
  /** A word this one is mixed up with and still needs drilling against (PLAN 6.6). */
  partner?: string | null;
}

/**
 * Variety (PLAN 5): never the same type twice in a row, and a type failed in the word's
 * last few reviews comes back first; otherwise the type used least so far.
 */
export function varied(options: readonly ExerciseId[], history: readonly ReviewRecord[]) {
  if (options.length === 1) return options[0]!;
  const last = history.at(-1)?.exercise;
  const pool = options.filter((o) => o !== last);
  const failed = history
    .slice(-5)
    .filter((r) => !r.correct)
    .map((r) => r.exercise)
    .reverse()
    .find((e) => pool.includes(e as ExerciseId));
  if (failed) return failed as ExerciseId;
  const used = (e: ExerciseId) => history.filter((r) => r.exercise === e).length;
  return [...pool].sort((a, b) => used(a) - used(b))[0]!;
}

/** Recognition exercises an entry can support: R2 needs misuse sentences, R4 an everyday word. */
export function recognitionOptions(entry?: BankEntry): ExerciseId[] {
  const options: ExerciseId[] = ['R1'];
  if (entry?.misuse.length && entry.examples.some((x) => x.setting !== 'captured')) {
    options.push('R2');
  }
  if (entry?.everyday) options.push('R4');
  return options;
}

/** Which exercise a review uses (PLAN 5, "Which exercise a review uses"). */
export function reviewExercise(
  word: UserWord,
  track: Track,
  ownWords: number,
  context: ChoiceContext = {},
): ExerciseChoice {
  const history = word.reviews[track];
  // A pair you mix up gets a contrast drill, every other review until it is settled.
  if (context.partner && history.at(-1)?.exercise !== 'P4') {
    return { exercise: 'P4', firstLetter: false, partner: context.partner };
  }
  if (track === 'recognition') {
    if (context.quick) return { exercise: 'R3', firstLetter: false };
    return { exercise: varied(recognitionOptions(context.entry), history), firstLetter: false };
  }
  const done = history.length;
  if (done === 0 && ownWords - 1 >= P3_MIN_OTHERS) return { exercise: 'P3', firstLetter: false };
  // The first one or two production reviews show the first letter.
  if (done < 2) return { exercise: 'P1', firstLetter: true };
  const stability = word.memory.production?.stability ?? 0;
  if (stability < P2_FROM_STABILITY) return { exercise: 'P1', firstLetter: false };
  return { exercise: varied(['P1', 'P2'], history), firstLetter: false };
}

/** The leech threshold a track has reached and not yet had its step for, or 0. */
export function leechDue(word: UserWord, track: Track): number {
  const lapses = word.memory[track]?.lapses ?? 0;
  const threshold = lapses >= PARK_LAPSES ? PARK_LAPSES : lapses >= LEECH_LAPSES ? LEECH_LAPSES : 0;
  return threshold && (word.leechSeen?.[track] ?? 0) < threshold ? threshold : 0;
}

/** Words met today whose introduction was left unfinished (the session was paused). */
export interface UnfinishedIntro {
  entryId: string;
  needsBlank: boolean;
  needsFinal: boolean;
}

export function unfinishedIntros(state: State, now: number, tz: number): UnfinishedIntro[] {
  const today = studyDay(now, tz);
  const found: UnfinishedIntro[] = [];
  for (const word of Object.values(state.words)) {
    const memory = word.memory.recognition;
    if (word.status !== 'active' || !memory || studyDay(memory.firstReview, tz) !== today) {
      continue;
    }
    const todays = word.reviews.recognition.filter((r) => studyDay(r.t, tz) === today);
    let blankAt = -1;
    todays.forEach((r, i) => {
      if (r.exercise === 'P1') blankAt = i;
    });
    const needsBlank = blankAt === -1;
    const needsFinal = needsBlank || !todays.slice(blankAt + 1).some((r) => r.exercise === 'R1');
    if (needsFinal) found.push({ entryId: word.entryId, needsBlank, needsFinal });
  }
  return found.sort((a, b) => a.entryId.localeCompare(b.entryId));
}

export interface BuildInput {
  plan: DayPlan;
  state: State;
  bank: Bank;
  now: number;
  tzOffsetMinutes: number;
  /** 2-minute mode (PLAN 7): the most at-risk due reviews only, no new words. */
  quick?: boolean;
}

/** Reviews in a 2-minute session. */
export const QUICK_REVIEWS = 7;

export interface Built {
  steps: Step[];
  maker: StepMaker;
}

/**
 * Puts `items` `gap` steps after `from` (or at `limit` if that comes first), without
 * splitting a block.
 */
export function insertLater(
  steps: Step[],
  from: number,
  gap: number,
  items: Step[],
  limit = steps.length,
): number {
  let at = Math.min(from + 1 + gap, limit);
  while (at < steps.length && at > 0 && steps[at]!.block === steps[at - 1]!.block) at++;
  steps.splice(at, 0, ...items);
  return at;
}

export function buildSession(input: BuildInput): Built {
  const { plan, state, bank } = input;
  const maker = new StepMaker(bank, state);
  const inBank = (id: string) => bank.byId.has(id);
  const ownWords = Object.values(state.words).filter(
    (w) => w.status === 'active' && w.memory.recognition && inBank(w.entryId),
  ).length;

  const pairs = confusionPairs(state);
  const reviews: Step[] = [];
  for (const item of input.quick ? plan.reviews.slice(0, QUICK_REVIEWS) : plan.reviews) {
    const word = state.words[item.entryId];
    if (!word || !inBank(item.entryId)) continue;
    const partner = drillPartner(state, item.entryId, pairs);
    const usable = partner && inBank(partner) ? partner : null;
    if (!input.quick && leechDue(word, item.track)) {
      const restart =
        item.track === 'recognition'
          ? { exercise: 'R1' as const, firstLetter: false }
          : { exercise: 'P1' as const, firstLetter: true };
      const lapses = word.memory[item.track]?.lapses ?? 0;
      reviews.push(...maker.leech(item.entryId, item.track, lapses, restart, usable));
      continue;
    }
    const choice = reviewExercise(word, item.track, ownWords, {
      entry: bank.byId.get(item.entryId),
      quick: input.quick,
      partner: usable,
    });
    reviews.push(
      maker.exercise(
        item.entryId,
        item.track,
        choice.exercise,
        'review',
        choice.firstLetter,
        undefined,
        choice.partner,
      ),
    );
  }

  const steps: Step[] = [];
  if (input.quick) return { steps: reviews, maker };
  const unfinished = unfinishedIntros(state, input.now, input.tzOffsetMinutes).filter((u) =>
    inBank(u.entryId),
  );
  const newWords = plan.newWords.filter(inBank);

  // Reviews first, with blanks left over from a paused session among them.
  steps.push(...reviews.splice(0, OPENING_REVIEWS));
  const leftover = unfinished.filter((u) => u.needsBlank);
  leftover.forEach((u, i) => {
    const blank = maker.exercise(u.entryId, 'recognition', 'P1', 'blank', true);
    insertLater(steps, 1 + i * 3, 0, [blank]);
  });

  // New words, each followed by a few reviews.
  const checks: number[] = [];
  for (const entryId of newWords) {
    steps.push(...maker.introduction(entryId));
    checks.push(steps.length - 1);
    steps.push(...reviews.splice(0, REVIEWS_BETWEEN));
  }
  steps.push(...reviews);

  // A last recognition check on each word met today (PLAN 4, step 5).
  const met = [...unfinished.map((u) => u.entryId), ...newWords];
  for (const entryId of met) {
    steps.push(maker.exercise(entryId, 'recognition', 'R1', 'final', false));
  }

  // Each new word's fill-in-the-blank, about 5 items after its check but before its final
  // check. Inserting shifts later steps along, so look each one up again by key.
  const checkKeys = checks.map((i) => steps[i]!.key);
  newWords.forEach((entryId, i) => {
    const check = steps.findIndex((s) => s.key === checkKeys[i]);
    const final = steps.findIndex(
      (s) => s.entryId === entryId && s.kind === 'exercise' && s.role === 'final',
    );
    const blank = maker.exercise(entryId, 'recognition', 'P1', 'blank', true);
    // Leave a step between the blank and the final check when there is room.
    insertLater(steps, check, BLANK_GAP, [blank], Math.max(check + 1, final - 1));
  });
  return { steps, maker };
}
