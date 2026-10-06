import type { EventBody, Rating, Track, VocabEvent } from '../events/types';
import { seededRandom } from '../random';
import { applyEvents } from '../state/reducer';
import { emptyState, type State } from '../state/state';
import { OVERHEAD_SECONDS } from './budget';
import { DAY_MS, retrievability } from './memory';
import { planDay, type PlanMode } from './planner';
import { stageOf } from './stages';

// A virtual learner for tuning the planner (S2). Its memory follows the FSRS model, with
// each word given its own hardness, and production harder than recognition. It runs the
// real planner and reducer, so it also tests them working together.

export interface SimOptions {
  days: number;
  minutes: number;
  /** Overrides the new-words target from the time table. */
  newWordsPerDay?: number;
  seed: number;
  /** Chance of studying on a given day (default 0.85, about six days a week). */
  studyChance?: number;
  /** The last this-many days count as steady state in the summary (default 60). */
  steadyDays?: number;
  /** Inclusive ranges of days with no study at all, e.g. a holiday. */
  skipDays?: readonly (readonly [from: number, to: number])[];
}

export interface SimDay {
  day: number;
  studied: boolean;
  minutes: number;
  reviews: number;
  newWords: number;
  writing: number;
  mode: PlanMode | null;
  backlog: number;
}

export interface SimSummary {
  /** Averages over study days in the steady window. */
  minutesPerStudyDay: number;
  p90Minutes: number;
  reviewsPerStudyDay: number;
  newWordsPerStudyDay: number;
  writingPerStudyDay: number;
  /** Share of steady-window study days in catch-up mode. */
  catchUpShare: number;
  /** Counts at the end. */
  started: number;
  use: number;
  owned: number;
  /** Share of scheduled reviews passed (introduction checks excluded). */
  retention: number;
}

export interface SimResult {
  days: SimDay[];
  summary: SimSummary;
  state: State;
  /** Every event the learner produced, in order. */
  events: VocabEvent[];
}

/** Midnight UTC on Monday 5 January 2026; the simulated learner lives on UTC. */
const START = Date.UTC(2026, 0, 5);
const INTRO_STEP_RECALL = [0.85, 0.8, 0.9];
const RETRY_RECALL = 0.95;
const FIRST_PRODUCTION_RECALL = 0.75;
const PRODUCTION_HARDER = 1.2;
const SENTENCE_ACCEPTED = 0.85;

export function simulate(options: SimOptions): SimResult {
  const studyChance = options.studyChance ?? 0.85;
  const steadyDays = options.steadyDays ?? 60;
  const random = seededRandom(options.seed);
  const base = emptyState();
  let state: State = { ...base, settings: { ...base.settings, dailyMinutes: options.minutes } };
  const hardness = new Map<string, number>();
  const days: SimDay[] = [];
  const allEvents: VocabEvent[] = [];
  const skipped = (day: number) =>
    (options.skipDays ?? []).some(([from, to]) => day >= from && day <= to);
  let nextWord = 0;
  let eventCount = 0;
  let scheduled = 0;
  let passed = 0;

  for (let day = 0; day < options.days; day++) {
    if (random() >= studyChance || skipped(day)) {
      days.push({
        day,
        studied: false,
        minutes: 0,
        reviews: 0,
        newWords: 0,
        writing: 0,
        mode: null,
        backlog: 0,
      });
      continue;
    }
    let t = START + day * DAY_MS + (18 + random() * 3) * 3_600_000;
    const candidates = Array.from({ length: 40 }, (_, i) => `w${nextWord + i}`);
    const plan = planDay({
      state,
      now: t,
      tzOffsetMinutes: 0,
      candidates,
      ...(options.newWordsPerDay !== undefined && { newWordsPerDay: options.newWordsPerDay }),
    });

    const events: VocabEvent[] = [];
    let seconds = 0;
    const spend = (s: number) => {
      t += s * 1000;
      seconds += s;
    };
    const emit = (body: EventBody) => {
      eventCount += 1;
      events.push({
        id: `sim${String(eventCount).padStart(8, '0')}`,
        t,
        device: 'sim',
        v: 1,
        ...body,
      });
    };
    const review = (entryId: string, track: Track, correct: boolean) => {
      const answerSeconds = track === 'production' ? 6 + random() * 8 : 4 + random() * 5;
      emit({
        type: 'review',
        entryId,
        track,
        exercise: track === 'production' ? 'P1' : 'R1',
        correct,
        rating: correct ? passRating(track, random) : 1,
        ms: Math.round(answerSeconds * 1000),
        hintsUsed: 0,
      });
      spend(answerSeconds + OVERHEAD_SECONDS);
    };

    for (const item of plan.reviews) {
      const memory = state.words[item.entryId]!.memory[item.track];
      const k = hardness.get(item.entryId)! * (item.track === 'production' ? PRODUCTION_HARDER : 1);
      const recall = (memory ? retrievability(memory, t) : FIRST_PRODUCTION_RECALL) ** k;
      const correct = random() < recall;
      scheduled += 1;
      if (correct) passed += 1;
      review(item.entryId, item.track, correct);
    }

    for (const entryId of plan.writing) {
      emit({
        type: 'sentence_written',
        entryId,
        exercise: 'U1',
        text: 'simulated',
        accepted: random() < SENTENCE_ACCEPTED,
      });
      spend(60 + random() * 40);
    }

    for (const entryId of plan.newWords) {
      nextWord += 1;
      const k = 0.6 + random() * 0.8;
      hardness.set(entryId, k);
      emit({ type: 'word_added', entryId, source: 'bank' });
      spend(25 + random() * 20); // guess and word page
      for (const p of INTRO_STEP_RECALL) {
        const correct = random() < p ** k;
        review(entryId, 'recognition', correct);
        if (!correct) review(entryId, 'recognition', random() < RETRY_RECALL);
      }
    }

    state = applyEvents(state, events);
    allEvents.push(...events);
    days.push({
      day,
      studied: true,
      minutes: seconds / 60,
      reviews: plan.reviews.length,
      newWords: plan.newWords.length,
      writing: plan.writing.length,
      mode: plan.mode,
      backlog: plan.backlog,
    });
  }

  return {
    days,
    state,
    events: allEvents,
    summary: summarise(days, state, options.days, steadyDays, scheduled, passed),
  };
}

function passRating(track: Track, random: () => number): Rating {
  const r = random();
  if (track === 'production') return r < 0.1 ? 4 : r < 0.25 ? 2 : 3;
  return r < 0.15 ? 2 : 3;
}

function summarise(
  days: SimDay[],
  state: State,
  totalDays: number,
  steadyDays: number,
  scheduled: number,
  passed: number,
): SimSummary {
  const steady = days.filter((d) => d.studied && d.day >= totalDays - steadyDays);
  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const minutes = steady.map((d) => d.minutes).sort((a, b) => a - b);
  const lastDay = Math.floor((START + totalDays * DAY_MS) / DAY_MS) - 1;
  const stages = Object.values(state.words).map((w) => stageOf(w, lastDay, 0));
  return {
    minutesPerStudyDay: mean(minutes),
    p90Minutes: minutes[Math.floor(minutes.length * 0.9)] ?? 0,
    reviewsPerStudyDay: mean(steady.map((d) => d.reviews)),
    newWordsPerStudyDay: mean(steady.map((d) => d.newWords)),
    writingPerStudyDay: mean(steady.map((d) => d.writing)),
    catchUpShare: steady.length
      ? steady.filter((d) => d.mode === 'catch-up').length / steady.length
      : 0,
    started: stages.filter((s) => s !== 'queued').length,
    use: stages.filter((s) => s === 'use').length,
    owned: stages.filter((s) => s === 'owned').length,
    retention: scheduled ? passed / scheduled : 0,
  };
}
