import type { Rating, Track, VocabEvent, WordSource } from '../events/types';
import { DAY_MS } from '../scheduler/memory';
import { makeEvent } from './factories';

// Helpers for building a word's history in tests. Times are in UTC with tzOffsetMinutes 0,
// and day 0 is Monday 5 January 2026.

export const START = Date.UTC(2026, 0, 5);
export const DAY0 = START / DAY_MS;

/** A moment on day `day` (default 7pm). */
export function at(day: number, hour = 19): number {
  return START + day * DAY_MS + hour * 3_600_000;
}

export function added(entryId: string, day: number, source: WordSource = 'bank'): VocabEvent {
  return makeEvent({ type: 'word_added', entryId, source }, { t: at(day, 18) });
}

export function reviewed(
  entryId: string,
  track: Track,
  t: number,
  rating: Rating,
  ms = 5000,
): VocabEvent {
  return makeEvent(
    {
      type: 'review',
      entryId,
      track,
      exercise: track === 'production' ? 'P1' : 'R1',
      correct: rating > 1,
      rating,
      ms,
      hintsUsed: 0,
    },
    { t },
  );
}

/** Adds a word on `day` and passes its three introduction checks. */
export function introduced(entryId: string, day: number): VocabEvent[] {
  return [
    added(entryId, day),
    reviewed(entryId, 'recognition', at(day), 3),
    reviewed(entryId, 'recognition', at(day) + 180_000, 3),
    reviewed(entryId, 'recognition', at(day) + 600_000, 3),
  ];
}

export function sentence(entryId: string, day: number, accepted = true): VocabEvent {
  return makeEvent(
    {
      type: 'sentence_written',
      entryId,
      exercise: 'U1',
      text: `A sentence with ${entryId}.`,
      accepted,
    },
    { t: at(day, 20) },
  );
}
