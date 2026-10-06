import type { EventBody, VocabEvent } from '../events/types';

let counter = 0;

/** Builds an event for tests. Ids are padded counters so their order is predictable. */
export function makeEvent(
  body: EventBody,
  meta: Partial<Pick<VocabEvent, 'id' | 't' | 'device'>> = {},
): VocabEvent {
  counter += 1;
  return {
    id: meta.id ?? `e${String(counter).padStart(6, '0')}`,
    t: meta.t ?? counter,
    device: meta.device ?? 'test-device',
    v: 1,
    ...body,
  };
}

/** Small seeded random generator (mulberry32), so randomised tests are repeatable. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
