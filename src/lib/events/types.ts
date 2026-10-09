// Every change to your data is an event appended to the log. The log is the only source
// of truth: progress, schedules and stats are all rebuilt by replaying it (see
// src/lib/state/reducer.ts). Stored events are never edited or deleted.
//
// Changing an existing payload shape breaks replay of old events. Add a new event type
// instead, and keep the reducer able to read every type ever written.

export type Track = 'recognition' | 'production';

/** FSRS ratings: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type Rating = 1 | 2 | 3 | 4;

/** Where a word entered your pool. */
export type WordSource = 'bank' | 'captured';

/** Active words are being learned. The others are out of the learning queue. */
export type WordStatus = 'active' | 'known' | 'suspended' | 'ignored';

/** Free-text fields you can write on a word. */
export type NoteField = 'note' | 'mnemonic';

export interface Settings {
  /** Minutes per day on weekdays (and on weekends when weekendMinutes is null). */
  dailyMinutes: number;
  /** Minutes per day on Saturday and Sunday, or null to use dailyMinutes. */
  weekendMinutes: number | null;
  /** Target probability of recall when a review falls due. */
  targetRetention: number;
  /**
   * "Busy week ahead": local dates (YYYY-MM-DD) of a busy period, or null. New words
   * pause a few days before it starts and until it ends, so the busy days stay light.
   */
  busyStart: string | null;
  busyEnd: string | null;
}

export interface EventMeta {
  /** Random UUID. */
  id: string;
  /**
   * Milliseconds since the Unix epoch. Never earlier than any event this device had
   * already seen, so causes always sort before effects even when device clocks disagree.
   */
  t: number;
  /** Id of the device that created the event. */
  device: string;
  /** Schema version of the event envelope. */
  v: 1;
}

export interface WordAdded {
  type: 'word_added';
  /** Word-bank entry id (one sense of one word). */
  entryId: string;
  source: WordSource;
  /** The sentence the word was captured from, if any. */
  context?: string;
}

export interface WordStatusSet {
  type: 'word_status_set';
  entryId: string;
  status: WordStatus;
}

export interface NoteSet {
  type: 'note_set';
  entryId: string;
  field: NoteField;
  text: string;
}

export interface ReviewDone {
  type: 'review';
  entryId: string;
  track: Track;
  /** Exercise id from PLAN.md section 5, e.g. "R1" or "P1". */
  exercise: string;
  correct: boolean;
  rating: Rating;
  /** Time from showing the prompt to answering. */
  ms: number;
  hintsUsed: number;
  /** What was typed or picked. */
  answer?: string;
  /** Which example or cloze sentence was shown, so it is not repeated soon. */
  promptId?: string;
  /** Entry id of the wrong word that was chosen, for confusion tracking. */
  chose?: string;
}

/** A sentence written for a usage task (U1 or U3), with its verdict. */
export interface SentenceWritten {
  type: 'sentence_written';
  entryId: string;
  /** Exercise id from PLAN.md section 5: "U1" or "U3". */
  exercise: string;
  text: string;
  /** Whether it used the word correctly (from the self-check or AI feedback). */
  accepted: boolean;
}

/** One item of the placement test (PLAN 3.1). */
export interface PlacementAnswer {
  word: string;
  /** Frequency band (1-16) of a real word; absent for a fake word. */
  band?: number;
  /** "Yes, I know it". */
  yes: boolean;
  /** The meaning check on a "yes" word: true passed, false failed, absent if not asked. */
  checked?: boolean;
}

/** The result worked out from the answers (src/lib/placement/score.ts). */
export interface PlacementResult {
  /** Share of each band's words you know, after corrections, 0 to 1. */
  bands: { band: number; known: number }[];
  /** Estimated vocabulary size (words) and a likely range. */
  size: number;
  low: number;
  high: number;
  /** Share of fake words you said yes to. */
  falseAlarms: number;
  /** Bands where you know roughly 30-80%: where new words come from. */
  frontier: number[];
}

/** A finished placement test. The answers are kept so the result can be worked out again. */
export interface PlacementDone {
  type: 'placement_done';
  answers: PlacementAnswer[];
  result: PlacementResult;
}

export interface SettingsChanged {
  type: 'settings_changed';
  patch: Partial<Settings>;
}

export type EventBody =
  | WordAdded
  | WordStatusSet
  | NoteSet
  | ReviewDone
  | SentenceWritten
  | SettingsChanged
  | PlacementDone;

export type VocabEvent = EventMeta & EventBody;

export type EventType = EventBody['type'];
