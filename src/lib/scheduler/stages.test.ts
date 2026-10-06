import { describe, expect, it } from 'vitest';
import type { VocabEvent } from '../events/types';
import { replay } from '../state/reducer';
import { makeEvent } from '../testing/factories';
import { added, at, DAY0, introduced, reviewed, sentence } from '../testing/history';
import { productionUnlocked, stageOf, writingReady } from './stages';

const stage = (events: VocabEvent[], day: number) =>
  stageOf(replay(events).words['w']!, DAY0 + day, 0);

/** Introduced on day 0, then passed recognition on day 2 and production on later days. */
function climbing(productionDays: number[]): VocabEvent[] {
  return [
    ...introduced('w', 0),
    reviewed('w', 'recognition', at(2), 3),
    ...productionDays.map((day) => reviewed('w', 'production', at(day), 3)),
  ];
}

describe('stageOf', () => {
  it('starts queued and is learning on its first day', () => {
    expect(stage([added('w', 0)], 0)).toBe('queued');
    expect(stage(introduced('w', 0), 0)).toBe('learning');
    expect(stage(introduced('w', 0), 1)).toBe('recognise');
  });

  it('reaches recall once recognition stability passes 4 days', () => {
    const events = climbing([]);
    expect(replay(events).words['w']!.memory.recognition!.stability).toBeGreaterThanOrEqual(4);
    expect(stage(events, 3)).toBe('recall');
    expect(productionUnlocked(replay(events).words['w']!)).toBe(true);
  });

  it('needs an accepted sentence as well as stability to reach use and owned', () => {
    const strong = climbing([3, 10, 40, 120]);
    const production = replay(strong).words['w']!.memory.production!;
    expect(production.stability).toBeGreaterThanOrEqual(60);
    expect(stage(strong, 121)).toBe('recall');
    expect(stage([...strong, sentence('w', 121, false)], 121)).toBe('recall');
    expect(stage([...strong, sentence('w', 121)], 121)).toBe('owned');

    const middling = climbing([3, 10]);
    const stability = replay(middling).words['w']!.memory.production!.stability;
    expect(stability).toBeGreaterThanOrEqual(10);
    expect(stability).toBeLessThan(60);
    expect(stage([...middling, sentence('w', 11)], 11)).toBe('use');
  });

  it('drops back down when production is failed', () => {
    const owned = [...climbing([3, 10, 40, 120]), sentence('w', 121)];
    expect(stage(owned, 121)).toBe('owned');
    const lapsed = [...owned, reviewed('w', 'production', at(300), 1)];
    expect(stage(lapsed, 300)).toBe('recall');
  });

  it('reports side states', () => {
    for (const status of ['known', 'suspended', 'ignored'] as const) {
      const events = [
        ...introduced('w', 0),
        makeEvent({ type: 'word_status_set', entryId: 'w', status }, { t: at(1) }),
      ];
      expect(stage(events, 1)).toBe(status);
    }
  });
});

describe('writingReady', () => {
  it('is true once production stability reaches 10 days, until a sentence is accepted', () => {
    const word = (events: VocabEvent[]) => replay(events).words['w']!;
    expect(writingReady(word(climbing([3])))).toBe(false);
    expect(writingReady(word(climbing([3, 10])))).toBe(true);
    expect(writingReady(word([...climbing([3, 10]), sentence('w', 11, false)]))).toBe(true);
    expect(writingReady(word([...climbing([3, 10]), sentence('w', 11)]))).toBe(false);
  });
});
