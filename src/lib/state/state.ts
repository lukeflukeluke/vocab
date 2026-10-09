import type {
  NoteField,
  PlacementAnswer,
  PlacementResult,
  Rating,
  Settings,
  Track,
  WordSource,
  WordStatus,
} from '../events/types';
import type { Memory } from '../scheduler/memory';

/** Everything the app knows, rebuilt by replaying the event log. Never stored. */
export interface State {
  settings: Settings;
  /** Your words, keyed by word-bank entry id. */
  words: Record<string, UserWord>;
  /** Placement tests taken, oldest first. */
  placements: PlacementRecord[];
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
  /** FSRS memory per track, or null before the track's first review. */
  memory: Record<Track, Memory | null>;
  /** Sentences written for usage tasks, oldest first. */
  sentences: SentenceRecord[];
}

export interface ReviewRecord {
  t: number;
  /** Device the review was done on (typing speed differs between phone and PC). */
  device: string;
  exercise: string;
  correct: boolean;
  rating: Rating;
  ms: number;
  hintsUsed: number;
  answer?: string;
  promptId?: string;
  chose?: string;
}

export interface PlacementRecord {
  t: number;
  answers: PlacementAnswer[];
  result: PlacementResult;
}

export interface SentenceRecord {
  t: number;
  exercise: string;
  text: string;
  accepted: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  dailyMinutes: 15,
  weekendMinutes: null,
  targetRetention: 0.9,
  busyStart: null,
  busyEnd: null,
};

export function emptyState(): State {
  return {
    settings: { ...DEFAULT_SETTINGS },
    words: {},
    placements: [],
    eventCount: 0,
    latestEventTime: 0,
  };
}
