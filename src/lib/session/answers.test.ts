import { describe, expect, it } from 'vitest';
import { sampleBank } from '../testing/bank';
import { checkTyped, editDistance, enteredWord, normalize } from './answers';

const bank = sampleBank();
const posit = bank.byId.get('posit#v')!;
const tacit = bank.byId.get('tacit#adj')!;

describe('normalize', () => {
  it('ignores case, spaces, curly apostrophes and a full stop', () => {
    expect(normalize('  Posited. ')).toBe('posited');
    expect(normalize('it’s  ok')).toBe("it's ok");
  });
});

describe('editDistance', () => {
  it('counts a swap of neighbouring letters as one edit', () => {
    expect(editDistance('posited', 'psoited')).toBe(1);
    expect(editDistance('posited', 'posted')).toBe(1);
    expect(editDistance('posited', 'positted')).toBe(1);
    expect(editDistance('posited', 'posits')).toBe(2);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('checkTyped', () => {
  it('accepts the exact form whatever the case', () => {
    expect(checkTyped('POSITED', 'posited', posit)).toMatchObject({
      verdict: 'exact',
      correct: true,
    });
  });

  it('accepts the right word in another form and says so', () => {
    expect(checkTyped('posit', 'posited', posit)).toMatchObject({ verdict: 'form', correct: true });
  });

  it('accepts a one-letter slip on longer words only', () => {
    expect(checkTyped('posted', 'posited', posit)).toMatchObject({
      verdict: 'near',
      correct: true,
    });
    expect(checkTyped('tacet', 'tacit', tacit).verdict).toBe('near');
    expect(checkTyped('tacut', 'tacit', tacit).correct).toBe(true);
    const short = { ...tacit, headword: 'tact', forms: [] };
    expect(checkTyped('tacy', 'tact', short).verdict).toBe('wrong');
  });

  it('rejects other words and empty answers', () => {
    expect(checkTyped('suggest', 'posited', posit)).toMatchObject({
      verdict: 'wrong',
      correct: false,
    });
    expect(checkTyped('   ', 'posited', posit).verdict).toBe('empty');
  });

  it('accepts British and American spellings', () => {
    const entry = {
      ...posit,
      headword: 'idolise',
      forms: ['idolises', 'idolised', 'idolising'],
      spellings: { uk: 'idolise', us: 'idolize' },
    };
    expect(checkTyped('idolized', 'idolised', entry).verdict).toBe('exact');
    expect(checkTyped('idolize', 'idolised', entry).verdict).toBe('form');
    expect(checkTyped('idolzed', 'idolised', entry).verdict).toBe('near');
  });
});

describe('enteredWord', () => {
  it('finds which other bank word was typed', () => {
    expect(enteredWord('Mitigated', bank, 'exacerbate#v')).toBe('mitigate#v');
    expect(enteredWord('mitigate', bank, 'mitigate#v')).toBeUndefined();
    expect(enteredWord('banana', bank, 'mitigate#v')).toBeUndefined();
  });
});
