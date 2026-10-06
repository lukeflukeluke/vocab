// A word-bank entry: everything the app needs to teach one sense of one word (PLAN 11.2).
// Entries live in content/entries/*.json and must pass validateEntries (validate.ts).
// content/GUIDE.md explains how to write each field.

export type EntryPos = 'n' | 'v' | 'adj' | 'adv' | 'conj' | 'prep';
export type Register = 'formal' | 'neutral' | 'informal';
export type Setting = 'conversation' | 'news' | 'fiction' | 'academic' | 'formal';

export interface Example {
  text: string;
  /** The exact form of the word used in the text (the headword or one of `forms`). */
  form: string;
  setting: Setting;
}

export interface Cloze {
  /** A sentence with "___" where the word goes. */
  text: string;
  /** The form that fills the gap. */
  answer: string;
}

export interface Misuse {
  /** A plausible sentence that uses the word wrongly. */
  text: string;
  why: string;
}

export interface Entry {
  /** headword#pos, plus .2, .3... for further senses: "posit#v", "temper#v.2". */
  id: string;
  headword: string;
  pos: EntryPos;
  /** The meaning taught, in a few words, to tell senses apart. */
  sense: string;
  /** Inflected forms other than the headword ("posits", "posited", "positing"). */
  forms: string[];
  /** A plain definition as one full sentence, 20 words at most. */
  definition: string;
  register: Register;
  /** 2-3 sentences: tone, formality, when to use it. */
  nuance: string;
  /** The closest everyday word or short phrase (exercise R4). */
  everyday: string;
  /** Six sentences; the first is the "guess first" sentence (PLAN 4). */
  examples: Example[];
  /** Three fill-in-the-blank sentences (exercise P1). */
  cloze: Cloze[];
  /** Two misuse sentences (exercise R2). */
  misuse: Misuse[];
  /** Common word partners ("a laconic reply"). */
  partners: string[];
  /** Essay-ready phrases ("posit that..."). */
  phrases: string[];
  /** Related words in other parts of speech. */
  family: string[];
  /** Near-synonyms with how each differs (the "vs" box). */
  synonyms: { word: string; vs: string }[];
  antonyms: string[];
  /** Look-alike words people mix up with this one. */
  confusables: { word: string; note: string }[];
  roots: { part: string; meaning: string }[];
  /** Other words sharing a root. */
  siblings: string[];
  /** A short origin story, only when the writer is sure of it. */
  origin?: string;
  /** 1-3 topic tags, e.g. the editorial group. */
  tags: string[];
  /** Set when the headword is deliberately not in content/candidates.json. */
  offList?: boolean;
}
