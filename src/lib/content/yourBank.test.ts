import { describe, expect, it } from 'vitest';
import type { EventBody } from '../events/types';
import { buildSession } from '../session/build';
import { planToday } from '../session/today';
import { replay } from '../state/reducer';
import { sampleBank } from '../testing/bank';
import { makeEvent } from '../testing/factories';
import { entryFromSense } from './capture';
import { yourBank } from './yourBank';

const base = sampleBank();
const NOW = Date.UTC(2026, 9, 10, 12);

function stateWith(...bodies: EventBody[]) {
  return replay(bodies.map((b, i) => makeEvent(b, { t: NOW - 1000 + i })));
}

describe('yourBank', () => {
  it('is the shipped bank until you capture something', () => {
    expect(yourBank(base, stateWith())).toBe(base);
  });

  it('adds entries made for captured words, and they are learned first', () => {
    const entry = entryFromSense({
      headword: 'sabayon',
      pos: 'n',
      definition: 'light foamy custard-like dessert',
      context: 'We had sabayon for pudding.',
      form: 'sabayon',
    });
    const state = stateWith(
      { type: 'entry_created', entry },
      { type: 'word_added', entryId: entry.id, source: 'captured', context: 'We had sabayon for pudding.' },
    );
    const bank = yourBank(base, state);
    expect(bank.byId.get(entry.id)).toMatchObject({ headword: 'sabayon', band: null });
    expect(yourBank(base, state)).toBe(bank);

    const plan = planToday(state, bank, NOW, 0);
    expect(plan.newWords[0]).toBe(entry.id);
    const { steps } = buildSession({ plan, state, bank, now: NOW, tzOffsetMinutes: 0 });
    expect(steps[0]).toMatchObject({ kind: 'guess', entryId: entry.id, promptId: 'ex0' });
  });

  it('adds your sentence to a bank word, and you guess from it', () => {
    const word = base.entries[0]!;
    const mine = `I first met ${word.headword} in a novel.`;
    const state = stateWith({ type: 'word_added', entryId: word.id, source: 'captured', context: mine });
    const bank = yourBank(base, state);
    const examples = bank.byId.get(word.id)!.examples;
    expect(examples.at(-1)).toEqual({ text: mine, form: word.headword, setting: 'captured' });
    const plan = planToday(state, bank, NOW, 0);
    const { steps } = buildSession({ plan, state, bank, now: NOW, tzOffsetMinutes: 0 });
    expect(steps[0]).toMatchObject({
      kind: 'guess',
      entryId: word.id,
      promptId: `ex${examples.length - 1}`,
    });
  });
});
