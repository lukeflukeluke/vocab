import { describe, expect, it } from 'vitest';
import { sampleBank } from '../testing/bank';
import { pageExamples, pickPrompt, promptIds } from './prompts';

const laconic = sampleBank().byId.get('laconic#adj')!;

describe('prompts', () => {
  it('uses the guess sentence last in reviews', () => {
    expect(promptIds(laconic, 'example')).toEqual(['ex1', 'ex2', 'ex3', 'ex4', 'ex5', 'ex0']);
    expect(promptIds(laconic, 'cloze')).toEqual(['cz0', 'cz1', 'cz2']);
  });

  it('skips sentences from the last 3 reviews and from this session', () => {
    expect(pickPrompt(laconic, 'example', ['ex1', 'ex2'], ['ex3'])).toBe('ex4');
    expect(pickPrompt(laconic, 'example', ['ex1', 'ex2', 'ex3', 'ex4'], [])).toBe('ex1');
  });

  it('takes the one used longest ago when all were used recently', () => {
    expect(pickPrompt(laconic, 'cloze', ['cz2', 'cz0', 'cz1'], [])).toBe('cz2');
    expect(pickPrompt(laconic, 'cloze', ['cz0'], ['cz1', 'cz2'])).toBe('cz0');
  });

  it('puts two examples from different settings on the word page', () => {
    const [a, b] = pageExamples(laconic);
    const setting = (id: string) => laconic.examples[Number(id.slice(2))]!.setting;
    expect(a).toBe('ex1');
    expect(setting(b!)).not.toBe(setting(a!));
  });
});
