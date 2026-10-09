import { describe, expect, it } from 'vitest';
import { entryFromSense } from '../content/capture';
import type { EventBody } from '../events/types';
import { replay } from '../state/reducer';
import { sampleBank } from '../testing/bank';
import { makeEvent } from '../testing/factories';
import { sortCapture, unsorted } from './inbox';

const bank = sampleBank();
const bankWord = bank.entries[0]!;

function stateWith(...bodies: EventBody[]) {
  return replay(bodies.map((b, i) => makeEvent(b, { t: (i + 1) * 10, id: `e${i}` })));
}

const capture = (word: string, context?: string): EventBody => ({
  type: 'word_captured',
  word,
  source: 'app',
  ...(context && { context }),
});

describe('the Inbox', () => {
  it('lists unsorted captures, newest first', () => {
    const state = stateWith(capture('one'), capture('two'), {
      type: 'capture_sorted',
      captureId: 'e0',
      decision: 'ignore',
    });
    expect(unsorted(state).map((c) => c.word)).toEqual(['two']);
  });

  it('learning a bank word adds it as captured, with your sentence', () => {
    const state = stateWith(capture(bankWord.headword, 'My sentence.'));
    const c = unsorted(state)[0]!;
    const events = sortCapture(state, bank, c, 'learn', { kind: 'bank', entryId: bankWord.id });
    expect(events).toEqual([
      { type: 'word_added', entryId: bankWord.id, source: 'captured', context: 'My sentence.' },
      { type: 'capture_sorted', captureId: c.id, decision: 'learn', entryId: bankWord.id },
    ]);
    const after = replay(events.map((e, i) => makeEvent(e, { t: 100 + i })));
    expect(after.words[bankWord.id]!.source).toBe('captured');
  });

  it('learning a word not in the bank makes its entry first', () => {
    const state = stateWith(capture('posited', 'She posited it.'));
    const c = unsorted(state)[0]!;
    const entry = entryFromSense({
      headword: 'posit',
      pos: 'v',
      definition: 'assume',
      context: c.context,
      form: c.word,
    });
    const events = sortCapture(state, bank, c, 'learn', { kind: 'new', entry });
    expect(events.map((e) => e.type)).toEqual(['entry_created', 'word_added', 'capture_sorted']);
  });

  it('already knowing a bank word marks it known; for other words it just clears it', () => {
    const state = stateWith(capture(bankWord.headword));
    const c = unsorted(state)[0]!;
    expect(
      sortCapture(state, bank, c, 'known', { kind: 'bank', entryId: bankWord.id }).map(
        (e) => e.type,
      ),
    ).toEqual(['word_added', 'word_status_set', 'capture_sorted']);
    const entry = entryFromSense({ headword: 'zzz', pos: 'n', definition: 'a sound' });
    expect(sortCapture(state, bank, c, 'known', { kind: 'new', entry })).toEqual([
      { type: 'capture_sorted', captureId: c.id, decision: 'known' },
    ]);
    expect(sortCapture(state, bank, c, 'ignore', null)).toEqual([
      { type: 'capture_sorted', captureId: c.id, decision: 'ignore' },
    ]);
  });

  it('a word you already learn only gains the sentence; a known one comes back', () => {
    const state = stateWith(
      { type: 'word_added', entryId: bankWord.id, source: 'bank' },
      { type: 'word_status_set', entryId: bankWord.id, status: 'known' },
      capture(bankWord.headword),
    );
    const c = unsorted(state)[0]!;
    expect(sortCapture(state, bank, c, 'learn', { kind: 'bank', entryId: bankWord.id })).toEqual([
      { type: 'word_status_set', entryId: bankWord.id, status: 'active' },
      { type: 'capture_sorted', captureId: c.id, decision: 'learn', entryId: bankWord.id },
    ]);
  });
});
