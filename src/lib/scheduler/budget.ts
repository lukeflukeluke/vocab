import type { Settings, Track } from '../events/types';
import type { State } from '../state/state';
import { isWeekend } from './day';

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 45;

/**
 * The most new words to add in a day, for each daily time. Set from the scheduler
 * simulation (`npm run simulate`, results in docs/SIMULATION.md); on most days fewer fit,
 * because reviews and writing tasks come first. Times in between are interpolated.
 */
export const NEW_WORDS_BY_MINUTES: readonly (readonly [minutes: number, newWords: number])[] = [
  [5, 3],
  [10, 3],
  [15, 5],
  [20, 6],
  [30, 7],
  [45, 10],
];

/** Today's minutes: the weekend time on Saturday and Sunday if one is set. */
export function minutesForDay(settings: Settings, day: number): number {
  const minutes =
    isWeekend(day) && settings.weekendMinutes !== null
      ? settings.weekendMinutes
      : settings.dailyMinutes;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, minutes));
}

export function newWordsFor(minutes: number): number {
  const table = NEW_WORDS_BY_MINUTES;
  const first = table[0]!;
  const last = table[table.length - 1]!;
  if (minutes <= first[0]) return first[1];
  if (minutes >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [m1, n1] = table[i]!;
    const [m0, n0] = table[i - 1]!;
    if (minutes <= m1) return Math.round(n0 + ((minutes - m0) / (m1 - m0)) * (n1 - n0));
  }
  return last[1];
}

/** Seconds per item, used to fit a session into the day's minutes. */
export interface Pace {
  recognition: number;
  production: number;
  /** A whole new-word introduction: guess, word page and the in-session checks. */
  intro: number;
  writing: number;
}

/** Time on feedback and moving on, added to each answer's own time. */
export const OVERHEAD_SECONDS = 3;
/** Reading the guess screen and the word page during an introduction. */
export const WORD_PAGE_SECONDS = 35;
/** Checks during an introduction (PLAN 4, steps 3 to 5). */
export const INTRO_CHECKS = 3;

const DEFAULT_ANSWER_SECONDS = { recognition: 5, production: 9 };
const DEFAULT_WRITING_SECONDS = 75;
const PACE_WINDOW = 100;
const PACE_MIN_SAMPLES = 20;
const PACE_LOOKBACK_MS = 14 * 86_400_000;
/** Longer answers are capped so one distracted moment does not skew the average. */
const MAX_ANSWER_SECONDS = 60;

export function answerSeconds(ms: number): number {
  return Math.min(ms / 1000, MAX_ANSWER_SECONDS) + OVERHEAD_SECONDS;
}

/** Seconds per item from your own recent answers, or defaults until there are enough. */
export function paceFromHistory(state: State): Pace {
  // Only recent answers matter, so skip older ones unless that leaves too few.
  const collect = (since: number) => {
    const found: Record<Track, { t: number; ms: number }[]> = { recognition: [], production: [] };
    for (const word of Object.values(state.words)) {
      for (const track of ['recognition', 'production'] as const) {
        for (const record of word.reviews[track]) if (record.t >= since) found[track].push(record);
      }
    }
    return found;
  };
  let recent = collect(state.latestEventTime - PACE_LOOKBACK_MS);
  if (Math.min(recent.recognition.length, recent.production.length) < PACE_MIN_SAMPLES) {
    recent = collect(-Infinity);
  }
  const average = (track: Track) => {
    const records = recent[track];
    if (records.length < PACE_MIN_SAMPLES) return DEFAULT_ANSWER_SECONDS[track] + OVERHEAD_SECONDS;
    const latest = records.sort((a, b) => a.t - b.t).slice(-PACE_WINDOW);
    return latest.reduce((sum, r) => sum + answerSeconds(r.ms), 0) / latest.length;
  };
  const recognition = average('recognition');
  return {
    recognition,
    production: average('production'),
    intro: WORD_PAGE_SECONDS + INTRO_CHECKS * recognition,
    writing: DEFAULT_WRITING_SECONDS,
  };
}
