import type { VocabEvent } from './types';

/**
 * The canonical order of events: by time, then by id. Ids are unique, so this is a total
 * order, and every device that holds the same events replays them identically.
 */
export function compareEvents(a: VocabEvent, b: VocabEvent): number {
  if (a.t !== b.t) return a.t - b.t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortEvents(events: readonly VocabEvent[]): VocabEvent[] {
  return [...events].sort(compareEvents);
}

/** Union of event lists, without duplicates, in canonical order. */
export function mergeEvents(...lists: readonly (readonly VocabEvent[])[]): VocabEvent[] {
  const byId = new Map<string, VocabEvent>();
  for (const list of lists) {
    for (const event of list) {
      if (!byId.has(event.id)) byId.set(event.id, event);
    }
  }
  return sortEvents([...byId.values()]);
}

/** Time for a new event: now, unless the log already holds an event at or after now. */
export function nextEventTime(now: number, latestSeen: number): number {
  return Math.max(now, latestSeen + 1);
}
