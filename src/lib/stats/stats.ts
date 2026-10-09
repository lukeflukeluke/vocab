import type { Track } from '../events/types';
import { studyDay } from '../scheduler/day';
import { dueDay } from '../scheduler/planner';
import { productionUnlocked, stageOf, type Stage } from '../scheduler/stages';
import type { State } from '../state/state';

// Progress you can trust (PLAN 10): Words Owned, the stage funnel, recall on real reviews,
// the review forecast and a weekly streak. All worked out from state; nothing is stored.

export const LADDER: readonly Stage[] = ['learning', 'recognise', 'recall', 'use', 'owned'];

export type Funnel = Record<Stage, number>;

export function funnel(state: State, today: number, tz: number): Funnel {
  const counts: Funnel = {
    queued: 0,
    learning: 0,
    recognise: 0,
    recall: 0,
    use: 0,
    owned: 0,
    known: 0,
    suspended: 0,
    ignored: 0,
  };
  for (const word of Object.values(state.words)) counts[stageOf(word, today, tz)] += 1;
  return counts;
}

export interface Retention {
  track: Track;
  passed: number;
  total: number;
}

/**
 * The share of real reviews passed in the last `days` days, per track. Only each word's
 * first review of a day counts, and not on the day it was met: in-session repeats and the
 * introduction's checks would flatter the number.
 */
export function retention(state: State, today: number, tz: number, days = 30): Retention[] {
  return (['recognition', 'production'] as const).map((track) => {
    let passed = 0;
    let total = 0;
    for (const word of Object.values(state.words)) {
      const met = word.memory.recognition?.firstReview;
      const metDay = met === undefined ? null : studyDay(met, tz);
      const seen = new Set<number>();
      for (const r of word.reviews[track]) {
        const day = studyDay(r.t, tz);
        if (day === metDay || day <= today - days || day > today || seen.has(day)) continue;
        seen.add(day);
        total += 1;
        if (r.correct) passed += 1;
      }
    }
    return { track, passed, total };
  });
}

/**
 * Reviews falling due on each of the next `days` study days (today first; anything
 * overdue counts as today). Follows the planner's rules: production when it is open,
 * recognition until production has been passed once.
 */
export function forecast(state: State, today: number, tz: number, days = 30): number[] {
  const counts = Array<number>(days).fill(0);
  const retention = state.settings.targetRetention;
  for (const word of Object.values(state.words)) {
    const recognition = word.memory.recognition;
    if (word.status !== 'active' || !recognition) continue;
    const production = word.memory.production;
    let due: number;
    if (production) due = dueDay(production, retention, tz);
    else if (productionUnlocked(word)) due = today;
    else due = dueDay(recognition, retention, tz);
    const offset = Math.max(0, due - today);
    if (offset < days) counts[offset]! += 1;
  }
  return counts;
}

/** Monday-based week number of a study day (study day 0 was a Thursday). */
export function weekOf(day: number): number {
  return Math.floor((day + 3) / 7);
}

/** Days a week needs to count towards the streak. */
export const STREAK_DAYS = 5;

export interface Streak {
  /** Weeks in a row with 5 or more study days, including this week once it has 5. */
  weeks: number;
  /** Study days so far this week (Monday to Sunday). */
  thisWeek: number;
  /** Which days of this week (Monday first) you studied. */
  days: boolean[];
}

export function streak(state: State, today: number, tz: number): Streak {
  const studied = new Set<number>();
  for (const word of Object.values(state.words)) {
    for (const r of [...word.reviews.recognition, ...word.reviews.production]) {
      studied.add(studyDay(r.t, tz));
    }
    for (const s of word.sentences) studied.add(studyDay(s.t, tz));
  }
  const perWeek = new Map<number, number>();
  for (const day of studied) perWeek.set(weekOf(day), (perWeek.get(weekOf(day)) ?? 0) + 1);

  const current = weekOf(today);
  const thisWeek = perWeek.get(current) ?? 0;
  let weeks = thisWeek >= STREAK_DAYS ? 1 : 0;
  for (let w = current - 1; (perWeek.get(w) ?? 0) >= STREAK_DAYS; w--) weeks += 1;
  const monday = current * 7 - 3;
  const days = Array.from({ length: 7 }, (_, i) => studied.has(monday + i));
  return { weeks, thisWeek, days };
}
