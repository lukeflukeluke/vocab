import { describe, expect, it } from 'vitest';
import type { EventBody, ReviewDone, VocabEvent } from '../events/types';
import { makeEvent, seededRandom, shuffled } from '../testing/factories';
import { applyEvent, replay } from './reducer';
import { DEFAULT_SETTINGS, emptyState } from './state';

const added = (entryId: string, context?: string): EventBody => ({
  type: 'word_added',
  entryId,
  source: context ? 'captured' : 'bank',
  ...(context && { context }),
});

const review = (entryId: string, correct: boolean): ReviewDone => ({
  type: 'review',
  entryId,
  track: 'recognition',
  exercise: 'R1',
  correct,
  rating: correct ? 3 : 1,
  ms: 2400,
  hintsUsed: 0,
});

describe('replay', () => {
  it('starts from defaults with no events', () => {
    expect(replay([])).toEqual(emptyState());
    expect(replay([]).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('adds words and records reviews on the right track', () => {
    const state = replay([
      makeEvent(added('laconic#adj'), { t: 10 }),
      makeEvent(review('laconic#adj', true), { t: 20 }),
      makeEvent(
        {
          ...review('laconic#adj', false),
          track: 'production',
          exercise: 'P1',
          chose: 'terse#adj',
        },
        { t: 30 },
      ),
    ]);
    const word = state.words['laconic#adj']!;
    expect(word.addedAt).toBe(10);
    expect(word.status).toBe('active');
    expect(word.reviews.recognition).toHaveLength(1);
    expect(word.reviews.production).toEqual([
      {
        t: 30,
        exercise: 'P1',
        correct: false,
        rating: 1,
        ms: 2400,
        hintsUsed: 0,
        chose: 'terse#adj',
      },
    ]);
    expect(state.eventCount).toBe(3);
    expect(state.latestEventTime).toBe(30);
  });

  it('keeps the first add and collects new capture sentences', () => {
    const state = replay([
      makeEvent(added('posit#v', 'They posit a link.'), { t: 1 }),
      makeEvent(added('posit#v', 'They posit a link.'), { t: 2 }),
      makeEvent(added('posit#v', 'Some posit otherwise.'), { t: 3 }),
    ]);
    expect(state.words['posit#v']!.addedAt).toBe(1);
    expect(state.words['posit#v']!.contexts).toEqual([
      'They posit a link.',
      'Some posit otherwise.',
    ]);
  });

  it('lets the latest status and note win', () => {
    const state = replay([
      makeEvent(added('tacit#adj'), { t: 1 }),
      makeEvent({ type: 'word_status_set', entryId: 'tacit#adj', status: 'suspended' }, { t: 2 }),
      makeEvent({ type: 'word_status_set', entryId: 'tacit#adj', status: 'active' }, { t: 3 }),
      makeEvent(
        { type: 'note_set', entryId: 'tacit#adj', field: 'mnemonic', text: 'old' },
        { t: 4 },
      ),
      makeEvent(
        { type: 'note_set', entryId: 'tacit#adj', field: 'mnemonic', text: 'new' },
        { t: 5 },
      ),
    ]);
    expect(state.words['tacit#adj']!.status).toBe('active');
    expect(state.words['tacit#adj']!.notes).toEqual({ mnemonic: 'new' });
  });

  it('ignores events about words that were never added', () => {
    const state = replay([
      makeEvent(review('ghost#n', true)),
      makeEvent({ type: 'word_status_set', entryId: 'ghost#n', status: 'known' }),
    ]);
    expect(state.words).toEqual({});
    expect(state.eventCount).toBe(2);
  });

  it('ignores event types it does not know', () => {
    const future = {
      ...makeEvent(added('a')),
      type: 'from_a_newer_version',
    } as unknown as VocabEvent;
    expect(replay([future]).words).toEqual({});
  });

  it('merges settings patches and skips undefined values', () => {
    const state = replay([
      makeEvent({ type: 'settings_changed', patch: { dailyMinutes: 20 } }, { t: 1 }),
      makeEvent(
        { type: 'settings_changed', patch: { dailyMinutes: undefined, weekendMinutes: 30 } },
        { t: 2 },
      ),
    ]);
    expect(state.settings).toEqual({ ...DEFAULT_SETTINGS, dailyMinutes: 20, weekendMinutes: 30 });
  });

  it('gives the same state whatever order the events arrive in', () => {
    const random = seededRandom(42);
    const words = ['a', 'b', 'c', 'd'];
    const events: VocabEvent[] = words.map((w, i) => makeEvent(added(w), { t: i }));
    for (let i = 0; i < 200; i++) {
      const word = words[Math.floor(random() * words.length)]!;
      const body: EventBody =
        random() < 0.7
          ? review(word, random() < 0.8)
          : { type: 'note_set', entryId: word, field: 'note', text: `note ${i}` };
      // Many events share a timestamp, so the id tie-break is exercised too.
      events.push(makeEvent(body, { t: 10 + Math.floor(i / 3) }));
    }
    const expected = replay(events);
    for (let round = 0; round < 20; round++) {
      expect(replay(shuffled(events, random))).toEqual(expected);
    }
  });
});

describe('applyEvent', () => {
  it('matches a full replay and leaves the previous state untouched', () => {
    const events = [
      makeEvent(added('salient#adj'), { t: 1 }),
      makeEvent(review('salient#adj', true), { t: 2 }),
      makeEvent({ type: 'settings_changed', patch: { dailyMinutes: 10 } }, { t: 3 }),
    ];
    const before = replay(events.slice(0, 2));
    const snapshot = structuredClone(before);
    const after = applyEvent(before, events[2]!);
    expect(after).toEqual(replay(events));
    expect(before).toEqual(snapshot);

    const next = applyEvent(after, makeEvent(review('salient#adj', false), { t: 4 }));
    expect(after.words['salient#adj']!.reviews.recognition).toHaveLength(1);
    expect(next.words['salient#adj']!.reviews.recognition).toHaveLength(2);
  });
});
