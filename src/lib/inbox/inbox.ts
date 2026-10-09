import type { Bank } from '../content/bank';
import type { Entry } from '../content/types';
import type { CaptureSorted, EventBody } from '../events/types';
import type { Capture, State } from '../state/state';

// The Inbox (PLAN 3.3): captured words wait here until you sort them into Learn, Already
// know, or Ignore. Sorting is a few events; this file works out which.

/** Captures still to sort, newest first. */
export function unsorted(state: State): Capture[] {
  return Object.values(state.captures)
    .filter((c) => !c.sorted)
    .sort((a, b) => b.t - a.t || b.id.localeCompare(a.id));
}

/** The meaning chosen for a capture: a bank entry, or a new entry made for the word. */
export type Chosen = { kind: 'bank'; entryId: string } | { kind: 'new'; entry: Entry };

/**
 * The events that sort a capture. Learn adds the word (with your sentence, so it becomes an
 * example) and it jumps the queue of new words. Already know marks a bank word as known so
 * it is never offered. Ignore just clears it from the Inbox.
 */
export function sortCapture(
  state: State,
  bank: Bank,
  capture: Capture,
  decision: CaptureSorted['decision'],
  chosen: Chosen | null,
): EventBody[] {
  const sorted = (entryId?: string): EventBody => ({
    type: 'capture_sorted',
    captureId: capture.id,
    decision,
    ...(entryId && { entryId }),
  });
  if (decision === 'ignore' || !chosen) return [sorted()];
  if (decision === 'known' && chosen.kind === 'new') return [sorted()];

  const entryId = chosen.kind === 'bank' ? chosen.entryId : chosen.entry.id;
  const events: EventBody[] = [];
  if (chosen.kind === 'new' && !state.entries[entryId] && !bank.byId.has(entryId)) {
    events.push({ type: 'entry_created', entry: chosen.entry });
  }
  const word = state.words[entryId];
  if (!word || capture.context) {
    events.push({
      type: 'word_added',
      entryId,
      source: 'captured',
      ...(capture.context && { context: capture.context }),
    });
  }
  const status = decision === 'learn' ? 'active' : 'known';
  if ((word?.status ?? 'active') !== status) {
    events.push({ type: 'word_status_set', entryId, status });
  }
  events.push(sorted(entryId));
  return events;
}
