import { describe, expect, it } from 'vitest';
import { formatKey, isValidKey, newSyncKey, normalizeKey } from './key';

describe('sync keys', () => {
  it('makes valid random keys', () => {
    const a = newSyncKey();
    const b = newSyncKey();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(25);
    expect(isValidKey(a)).toBe(true);
  });

  it('accepts the key however it is typed', () => {
    const key = newSyncKey();
    expect(isValidKey(formatKey(key))).toBe(true);
    expect(isValidKey(formatKey(key).toLowerCase())).toBe(true);
    expect(isValidKey(formatKey(key).replace(/-/g, ' '))).toBe(true);
    expect(normalizeKey('o0-Il 1')).toBe('00111');
  });

  it('catches typos with the check character', () => {
    const key = newSyncKey(() => new Uint8Array(24).fill(7));
    let caught = 0;
    for (let i = 0; i < 24; i++) {
      const wrong = key.slice(0, i) + (key[i] === '8' ? '9' : '8') + key.slice(i + 1);
      if (!isValidKey(wrong)) caught += 1;
    }
    expect(caught).toBe(24);
    expect(isValidKey(key.slice(0, -1))).toBe(false);
  });

  it('shows the key in groups of five', () => {
    expect(formatKey('ABCDEFGHJKMNPQRSTVWXYZ012')).toBe('ABCDE-FGHJK-MNPQR-STVWX-YZ012');
  });
});
