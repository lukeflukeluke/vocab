import type { Track } from '../events/types';
import type { State, UserWord } from '../state/state';
import {
  answerSeconds,
  minutesForDay,
  newWordsFor,
  paceFromHistory,
  WORD_PAGE_SECONDS,
  type Pace,
} from './budget';
import { dayOfDate, studyDay } from './day';
import { intervalDays, retrievability, type Memory } from './memory';
import { productionUnlocked, writingReady } from './stages';

/** New words pause this many days before a busy period starts. */
export const BUSY_LEAD_DAYS = 5;
/** Days of history behind the "heavy day" comparison. */
const LOAD_WINDOW_DAYS = 14;
const HEAVY_DAY = 1.3;
const VERY_HEAVY_DAY = 2;

export interface PlanInput {
  state: State;
  now: number;
  /** Minutes to add to UTC for local time: `-new Date().getTimezoneOffset()`. */
  tzOffsetMinutes: number;
  /** Word-bank entry ids to take new words from, best first. Ones already in state are skipped. */
  candidates: readonly string[];
  /** Overrides the new-words target from the time table (the simulation uses this). */
  newWordsPerDay?: number;
}

export interface ReviewItem {
  entryId: string;
  track: Track;
  /** Current chance of recall, or null for a first production review. */
  retrievability: number | null;
  /** Days past the due day. */
  overdueDays: number;
}

export type PlanMode = 'normal' | 'catch-up' | 'busy';

export type NewWordsReason =
  | 'on-target'
  | 'done-for-today'
  | 'heavy-day'
  | 'very-heavy-day'
  | 'out-of-time'
  | 'catch-up'
  | 'busy';

export interface DayPlan {
  day: number;
  minutes: number;
  mode: PlanMode;
  /** Due reviews in the order to do them: most at risk of being forgotten first. */
  reviews: ReviewItem[];
  /** Words to write a sentence for (U1), oldest first. */
  writing: string[];
  /** Words to introduce. */
  newWords: string[];
  newWordsTarget: number;
  newWordsReason: NewWordsReason;
  /** Due reviews that did not fit today. They stay due and come first tomorrow. */
  backlog: number;
  /** Time already spent today. */
  spentSeconds: number;
  /** Time the planned items should take. */
  estimatedSeconds: number;
}

/**
 * Builds the rest of today's session (PLAN 6.4 and 6.7). Pure: everything it needs comes
 * in through `input`, including the time. Calling it again after studying gives what is
 * left for today.
 */
export function planDay(input: PlanInput): DayPlan {
  const { state, now, tzOffsetMinutes: tz } = input;
  const today = studyDay(now, tz);
  const settings = state.settings;
  const minutes = minutesForDay(settings, today);
  const pace = paceFromHistory(state);
  const retention = settings.targetRetention;
  const words = Object.values(state.words);

  const done = doneToday(words, today, tz, pace);
  const budget = Math.max(0, minutes * 60 - done.seconds);
  let used = 0;

  // 1. Due reviews, most at risk first.
  const due: ReviewItem[] = [];
  for (const word of words) {
    const recognition = word.memory.recognition;
    if (word.status !== 'active' || !recognition || done.reviewed.has(word.entryId)) continue;
    const production = word.memory.production;
    const productionDue = production
      ? dueDay(production, retention, tz) <= today
      : productionUnlocked(word);
    // Sibling rule (PLAN 6.3): producing a word proves you recognise it. When both tracks
    // are due, production alone is shown, and once a production review has been passed,
    // recognition is not reviewed on its own any more. The S2 simulation found this cuts
    // daily reviews by about a quarter without lowering retention.
    if (productionDue) {
      due.push(
        production
          ? reviewItem(word, 'production', production, now, today, retention, tz)
          : { entryId: word.entryId, track: 'production', retrievability: null, overdueDays: 0 },
      );
    } else if (
      !word.reviews.production.some((r) => r.correct) &&
      dueDay(recognition, retention, tz) <= today
    ) {
      due.push(reviewItem(word, 'recognition', recognition, now, today, retention, tz));
    }
  }
  due.sort(
    (a, b) =>
      (a.retrievability ?? 2) - (b.retrievability ?? 2) || a.entryId.localeCompare(b.entryId),
  );

  const reviews: ReviewItem[] = [];
  for (const item of due) {
    const cost = pace[item.track];
    if (used + cost > budget) break;
    reviews.push(item);
    used += cost;
  }
  const backlog = due.length - reviews.length;

  let mode: PlanMode = backlog > 0 ? 'catch-up' : 'normal';
  if (mode === 'normal' && isBusy(settings.busyStart, settings.busyEnd, today)) mode = 'busy';

  const newWordsTarget = input.newWordsPerDay ?? newWordsFor(minutes);

  // 2. Writing tasks, after reviews and before new words.
  const writing: string[] = [];
  if (mode !== 'catch-up') {
    const ready = words
      .filter((w) => writingReady(w) && !done.wrote.has(w.entryId) && !done.reviewed.has(w.entryId))
      .sort((a, b) => a.memory.production!.firstReview - b.memory.production!.firstReview);
    const cap = newWordsTarget + 2;
    for (const word of ready) {
      if (writing.length >= cap || used + pace.writing > budget) break;
      writing.push(word.entryId);
      used += pace.writing;
    }
  }

  // 3. New words, if the day allows.
  let target = newWordsTarget;
  let newWordsReason: NewWordsReason = 'on-target';
  if (mode === 'catch-up' || mode === 'busy') {
    target = 0;
    newWordsReason = mode;
  } else {
    const usual = usualReviewsPerDay(words, today, tz);
    if (usual !== null && due.length > VERY_HEAVY_DAY * usual) {
      target = 0;
      newWordsReason = 'very-heavy-day';
    } else if (usual !== null && due.length > HEAVY_DAY * usual) {
      target = Math.floor(target / 2);
      newWordsReason = 'heavy-day';
    }
  }
  let count = Math.max(0, target - done.introduced);
  if (count === 0 && newWordsReason === 'on-target' && done.introduced > 0) {
    newWordsReason = 'done-for-today';
  }
  const fit = Math.floor((budget - used) / pace.intro);
  if (fit < count) {
    count = Math.max(0, fit);
    newWordsReason = 'out-of-time';
  }
  const newWords = pickNewWords(words, input.candidates, state, count);
  used += newWords.length * pace.intro;

  return {
    day: today,
    minutes,
    mode,
    reviews,
    writing,
    newWords,
    newWordsTarget,
    newWordsReason,
    backlog,
    spentSeconds: done.seconds,
    estimatedSeconds: used,
  };
}

/** The study day a track falls due. */
export function dueDay(memory: Memory, retention: number, tzOffsetMinutes: number): number {
  return studyDay(memory.lastReview, tzOffsetMinutes) + intervalDays(memory, retention);
}

function reviewItem(
  word: UserWord,
  track: Track,
  memory: Memory,
  now: number,
  today: number,
  retention: number,
  tz: number,
): ReviewItem {
  return {
    entryId: word.entryId,
    track,
    retrievability: retrievability(memory, now),
    overdueDays: today - dueDay(memory, retention, tz),
  };
}

interface DoneToday {
  seconds: number;
  introduced: number;
  reviewed: Set<string>;
  wrote: Set<string>;
}

function doneToday(words: UserWord[], today: number, tz: number, pace: Pace): DoneToday {
  const done: DoneToday = { seconds: 0, introduced: 0, reviewed: new Set(), wrote: new Set() };
  for (const word of words) {
    for (const record of [...word.reviews.recognition, ...word.reviews.production]) {
      if (studyDay(record.t, tz) !== today) continue;
      done.seconds += answerSeconds(record.ms);
      done.reviewed.add(word.entryId);
    }
    const recognition = word.memory.recognition;
    if (recognition && studyDay(recognition.firstReview, tz) === today) {
      done.introduced += 1;
      done.seconds += WORD_PAGE_SECONDS;
    }
    for (const sentence of word.sentences) {
      if (studyDay(sentence.t, tz) !== today) continue;
      done.seconds += pace.writing;
      done.wrote.add(word.entryId);
    }
  }
  return done;
}

/**
 * Average reviews per study day over the last two weeks, not counting words' first days.
 * Null until there are two weeks of history.
 */
function usualReviewsPerDay(words: UserWord[], today: number, tz: number): number | null {
  const perDay = new Map<number, number>();
  let firstDay = Infinity;
  for (const word of words) {
    const recognition = word.memory.recognition;
    if (!recognition) continue;
    const introDay = studyDay(recognition.firstReview, tz);
    firstDay = Math.min(firstDay, introDay);
    for (const record of [...word.reviews.recognition, ...word.reviews.production]) {
      const day = studyDay(record.t, tz);
      if (day === introDay || day >= today || day < today - LOAD_WINDOW_DAYS) continue;
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
  }
  if (firstDay > today - LOAD_WINDOW_DAYS || perDay.size === 0) return null;
  let total = 0;
  for (const count of perDay.values()) total += count;
  return total / perDay.size;
}

function isBusy(start: string | null, end: string | null, today: number): boolean {
  if (!start || !end) return false;
  try {
    return today >= dayOfDate(start) - BUSY_LEAD_DAYS && today <= dayOfDate(end);
  } catch {
    return false; // A malformed date must not stop today's plan.
  }
}

/** Captured words first (newest first), then other queued words, then the bank. */
function pickNewWords(
  words: UserWord[],
  candidates: readonly string[],
  state: State,
  count: number,
): string[] {
  if (count <= 0) return [];
  const queued = words.filter((w) => w.status === 'active' && !w.memory.recognition);
  const captured = queued
    .filter((w) => w.source === 'captured')
    .sort((a, b) => b.addedAt - a.addedAt);
  const others = queued
    .filter((w) => w.source !== 'captured')
    .sort((a, b) => a.addedAt - b.addedAt);
  const picked = [...captured, ...others].slice(0, count).map((w) => w.entryId);
  for (const id of candidates) {
    if (picked.length >= count) break;
    if (!state.words[id] && !picked.includes(id)) picked.push(id);
  }
  return picked;
}
