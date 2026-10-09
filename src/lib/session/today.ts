import type { Bank } from '../content/bank';
import { orderCandidates } from '../content/candidates';
import { planDay, type DayPlan } from '../scheduler/planner';
import type { State } from '../state/state';
import { buildSession } from './build';
import { startSession, type Session } from './runner';

/** Today's plan, with new words chosen for your level (PLAN 3.4). */
export function planToday(state: State, bank: Bank, now: number, tz: number): DayPlan {
  const candidates = orderCandidates(bank, state, now, tz);
  return planDay({ state, now, tzOffsetMinutes: tz, candidates });
}

/** A session for what is left of today, or a 2-minute one. */
export function todaysSession(
  state: State,
  bank: Bank,
  now: number,
  tz: number,
  quick = false,
): Session {
  const plan = planToday(state, bank, now, tz);
  return startSession(buildSession({ plan, state, bank, now, tzOffsetMinutes: tz, quick }), now);
}
