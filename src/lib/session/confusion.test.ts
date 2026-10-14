import { describe, expect, it } from 'vitest';
import type { EventBody } from '../events/types';
import { replay } from '../state/reducer';
import { makeEvent } from '../testing/factories';
import { at, introduced } from '../testing/history';
import { confusionPairs, drillPartner, drillPrompt } from './confusion';

const A = 'imply#v';
const B = 'infer#v';

const review = (entryId: string, extra: Partial<EventBody & { type: 'review' }>): EventBody => ({
  type: 'review',
  entryId,
  track: 'recognition',
  exercise: 'R1',
  correct: false,
  rating: 1,
  ms: 3000,
  hintsUsed: 0,
  ...extra,
});

function stateWith(...bodies: EventBody[]) {
  return replay([
    ...introduced(A, 0),
    ...introduced(B, 0),
    ...bodies.map((b, i) => makeEvent(b, { t: at(2) + i * 1000 })),
  ]);
}

describe('confusion pairs', () => {
  it('two mix-ups, either way round, make a pair', () => {
    expect(confusionPairs(stateWith(review(A, { chose: B }))).size).toBe(0);
    const state = stateWith(review(A, { chose: B }), review(B, { chose: A }));
    expect(confusionPairs(state).get(A)).toEqual([B]);
    expect(confusionPairs(state).get(B)).toEqual([A]);
  });

  it('a pair is drilled until two drills are passed after the latest mix-up', () => {
    const mixed = [review(A, { chose: B }), review(A, { chose: B })];
    const drill = (entryId: string, other: string, correct: boolean) =>
      review(entryId, {
        exercise: 'P4',
        correct,
        rating: correct ? 3 : 1,
        promptId: drillPrompt(other),
      });
    expect(drillPartner(stateWith(...mixed), A)).toBe(B);
    expect(drillPartner(stateWith(...mixed, drill(A, B, true)), A)).toBe(B);
    expect(drillPartner(stateWith(...mixed, drill(A, B, true), drill(B, A, true)), A)).toBeNull();
    // A new mix-up opens it again.
    expect(
      drillPartner(
        stateWith(...mixed, drill(A, B, true), drill(B, A, true), review(B, { chose: A })),
        A,
      ),
    ).toBe(B);
  });
});
