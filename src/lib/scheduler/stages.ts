import type { UserWord } from '../state/state';
import { studyDay } from './day';

/** Where a word is on the ladder (PLAN 2), plus the side states. */
export type Stage =
  | 'queued'
  | 'learning'
  | 'recognise'
  | 'recall'
  | 'use'
  | 'owned'
  | 'known'
  | 'suspended'
  | 'ignored';

/** Stability thresholds, in days. */
export const UNLOCK_PRODUCTION_STABILITY = 4;
export const WRITING_READY_STABILITY = 10;
export const OWNED_STABILITY = 60;

export function productionUnlocked(word: UserWord): boolean {
  const recognition = word.memory.recognition;
  return (
    word.memory.production !== null ||
    (recognition !== null && recognition.stability >= UNLOCK_PRODUCTION_STABILITY)
  );
}

export function hasAcceptedSentence(word: UserWord): boolean {
  return word.sentences.some((sentence) => sentence.accepted);
}

/** True when the word should get a writing task (U1) to move up to Use. */
export function writingReady(word: UserWord): boolean {
  const production = word.memory.production;
  return (
    word.status === 'active' &&
    production !== null &&
    production.stability >= WRITING_READY_STABILITY &&
    !hasAcceptedSentence(word)
  );
}

/**
 * The word's stage today. It is worked out from current memory, so it goes down as well
 * as up: a word whose production stability falls back under 10 days drops to Recall.
 */
export function stageOf(word: UserWord, today: number, tzOffsetMinutes: number): Stage {
  if (word.status !== 'active') return word.status;
  const recognition = word.memory.recognition;
  if (!recognition) return 'queued';
  if (studyDay(recognition.firstReview, tzOffsetMinutes) === today) return 'learning';
  if (!productionUnlocked(word)) return 'recognise';

  const production = word.memory.production;
  if (production && hasAcceptedSentence(word)) {
    if (production.stability >= OWNED_STABILITY) return 'owned';
    if (production.stability >= WRITING_READY_STABILITY) return 'use';
  }
  return 'recall';
}
