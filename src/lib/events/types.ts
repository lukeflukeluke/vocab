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

export interface SettingsChanged {
  type: 'settings_changed';
  patch: Partial<Settings>;
}

export type EventBody = WordAdded | WordStatusSet | NoteSet | ReviewDone | SettingsChanged;

export type VocabEvent = EventMeta & EventBody;

export type EventType = EventBody['type'];
