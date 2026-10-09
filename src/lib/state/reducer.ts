import { sortEvents } from '../events/order';
import type { ReviewDone, VocabEvent } from '../events/types';
import { DAY_MS, dueTime, remember } from '../scheduler/memory';
import { emptyState, type ReviewRecord, type State, type UserWord } from './state';

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
          memory: { recognition: null, production: null },
          sentences: [],
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
      if (word) state.words[event.entryId] = applyReview(word, event, state);
      return;
    }
    case 'sentence_written': {
      const word = state.words[event.entryId];
      if (word) {
        const sentence = {
          t: event.t,
          exercise: event.exercise,
          text: event.text,
          accepted: event.accepted,
        };
        state.words[event.entryId] = { ...word, sentences: [...word.sentences, sentence] };
      }
      return;
    }
    case 'placement_done': {
      const record = { t: event.t, answers: event.answers, result: event.result };
      state.placements = [...state.placements, record];
      return;
    }
    case 'word_captured': {
      state.captures = {
        ...state.captures,
        [event.id]: {
          id: event.id,
          t: event.t,
          word: event.word,
          source: event.source,
          ...(event.context !== undefined && { context: event.context }),
          ...(event.title !== undefined && { title: event.title }),
          ...(event.url !== undefined && { url: event.url }),
        },
      };
      return;
    }
    case 'capture_sorted': {
      // Sorted on two devices at once: the first decision stands.
      const capture = state.captures[event.captureId];
      if (!capture || capture.sorted) return;
      const sorted = {
        t: event.t,
        decision: event.decision,
        ...(event.entryId !== undefined && { entryId: event.entryId }),
      };
      state.captures = { ...state.captures, [event.captureId]: { ...capture, sorted } };
      return;
    }
    case 'entry_created': {
      // The same entry made on two devices: keep the first.
      if (!state.entries[event.entry.id]) {
        state.entries = { ...state.entries, [event.entry.id]: event.entry };
      }
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

function applyReview(word: UserWord, event: VocabEvent & ReviewDone, state: State): UserWord {
  const record: ReviewRecord = {
    t: event.t,
    device: event.device,
    exercise: event.exercise,
    correct: event.correct,
    rating: event.rating,
    ms: event.ms,
    hintsUsed: event.hintsUsed,
    ...(event.answer !== undefined && { answer: event.answer }),
    ...(event.promptId !== undefined && { promptId: event.promptId }),
    ...(event.chose !== undefined && { chose: event.chose }),
  };
  const memory = {
    ...word.memory,
    [event.track]: remember(word.memory[event.track], event.t, event.rating),
  };

  // Sibling rule (PLAN 6.3): producing a word proves you recognise it, so a passed
  // production review also counts as a recognition pass when recognition is due by then.
  const recognition = word.memory.recognition;
  if (
    event.track === 'production' &&
    event.correct &&
    recognition &&
    dueTime(recognition, state.settings.targetRetention) <= event.t + DAY_MS
  ) {
    memory.recognition = remember(recognition, event.t, 3);
  }

  return {
    ...word,
    reviews: { ...word.reviews, [event.track]: [...word.reviews[event.track], record] },
    memory,
  };
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
  return applyEvents(state, [event]);
}

/** `applyEvent` for a batch: copies the state once, however many events there are. */
export function applyEvents(state: State, events: readonly VocabEvent[]): State {
  const next: State = { ...state, words: { ...state.words } };
  for (const event of sortEvents(events)) applyInPlace(next, event);
  return next;
}
