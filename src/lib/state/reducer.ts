import { sortEvents } from '../events/order';
import type { VocabEvent } from '../events/types';
import { emptyState, type ReviewRecord, type State } from './state';

/**
 * Applies one event to a state, changing `state` and `state.words` in place. Nested
 * objects (a word, the settings) are always replaced rather than changed, which is what
 * lets `applyEvent` hand out new states cheaply.
 *
 * Events about words that were never added are ignored, as are event types this version
 * of the app does not know (a newer version on another device may have written them).
 */
function applyInPlace(state: State, event: VocabEvent): void {
  state.eventCount += 1;
  state.latestEventTime = Math.max(state.latestEventTime, event.t);

  switch (event.type) {
    case 'word_added': {
      const existing = state.words[event.entryId];
      if (!existing) {
        state.words[event.entryId] = {
          entryId: event.entryId,
          addedAt: event.t,
          source: event.source,
          status: 'active',
          contexts: event.context ? [event.context] : [],
          notes: {},
          reviews: { recognition: [], production: [] },
        };
      } else if (event.context && !existing.contexts.includes(event.context)) {
        // Added again, e.g. captured on two devices: keep the first, collect the sentence.
        state.words[event.entryId] = {
          ...existing,
          contexts: [...existing.contexts, event.context],
        };
      }
      return;
    }
    case 'word_status_set': {
      const word = state.words[event.entryId];
      if (word) state.words[event.entryId] = { ...word, status: event.status };
      return;
    }
    case 'note_set': {
      const word = state.words[event.entryId];
      if (word) {
        state.words[event.entryId] = {
          ...word,
          notes: { ...word.notes, [event.field]: event.text },
        };
      }
      return;
    }
    case 'review': {
      const word = state.words[event.entryId];
      if (!word) return;
      const record: ReviewRecord = {
        t: event.t,
        exercise: event.exercise,
        correct: event.correct,
        rating: event.rating,
        ms: event.ms,
        hintsUsed: event.hintsUsed,
        ...(event.answer !== undefined && { answer: event.answer }),
        ...(event.promptId !== undefined && { promptId: event.promptId }),
        ...(event.chose !== undefined && { chose: event.chose }),
      };
      state.words[event.entryId] = {
        ...word,
        reviews: { ...word.reviews, [event.track]: [...word.reviews[event.track], record] },
      };
      return;
    }
    case 'settings_changed': {
      // Skip undefined values: they would not survive the JSON trip to another device.
      const defined = Object.entries(event.patch).filter(([, value]) => value !== undefined);
      state.settings = { ...state.settings, ...Object.fromEntries(defined) };
      return;
    }
    default:
      return;
  }
}

/** Rebuilds the state from scratch. The input order does not matter. */
export function replay(events: readonly VocabEvent[]): State {
  const state = emptyState();
  for (const event of sortEvents(events)) applyInPlace(state, event);
  return state;
}

/**
 * Returns a new state with one more event applied, leaving `state` untouched. Only valid
 * for an event that sorts after every event already in `state`; otherwise replay instead.
 */
export function applyEvent(state: State, event: VocabEvent): State {
  const next: State = { ...state, words: { ...state.words } };
  applyInPlace(next, event);
  return next;
}
