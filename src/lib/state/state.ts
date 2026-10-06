import type { NoteField, Rating, Settings, Track, WordSource, WordStatus } from '../events/types';

/** Everything the app knows, rebuilt by replaying the event log. Never stored. */
export interface State {
  settings: Settings;
  /** Your words, keyed by word-bank entry id. */
  words: Record<string, UserWord>;
  /** Number of events replayed. */
  eventCount: number;
  /** Time of the latest event replayed, or 0 for an empty log. */
  latestEventTime: number;
}

export interface UserWord {
  entryId: string;
  addedAt: number;
  source: WordSource;
  status: WordStatus;
  /** Sentences the word was captured from, oldest first, without duplicates. */
  contexts: string[];
  notes: Partial<Record<NoteField, string>>;
  reviews: Record<Track, ReviewRecord[]>;
}

export interface ReviewRecord {
  t: number;
  exercise: string;
  correct: boolean;
  rating: Rating;
  ms: number;
  hintsUsed: number;
  answer?: string;
  promptId?: string;
  chose?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  dailyMinutes: 15,
  weekendMinutes: null,
  targetRetention: 0.9,
};

export function emptyState(): State {
  return { settings: { ...DEFAULT_SETTINGS }, words: {}, eventCount: 0, latestEventTime: 0 };
}
