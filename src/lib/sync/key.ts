// Sync keys: the one secret that links your devices (PLAN 13.2). 24 random characters
// (120 bits) plus a check character, from Crockford's base 32 (no I, L, O or U, so it is
// hard to misread), shown in groups of five: "K7QM3-XRT9A-...". The check character
// catches almost every typo before anything is sent.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RANDOM_CHARS = 24;

function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (i + 1) * ALPHABET.indexOf(body[i]!);
  return ALPHABET[sum % 32]!;
}

/** A new random key, without separators (25 characters). */
export function newSyncKey(random: (n: number) => Uint8Array = defaultRandom): string {
  const bytes = random(RANDOM_CHARS);
  let body = '';
  for (const b of bytes) body += ALPHABET[b % 32];
  return body + checkChar(body);
}

function defaultRandom(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Upper case, no spaces or dashes, and look-alike letters read as digits (O as 0, I/L as 1). */
export function normalizeKey(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

/** True for a well-formed key whose check character matches. */
export function isValidKey(input: string): boolean {
  const key = normalizeKey(input);
  if (key.length !== RANDOM_CHARS + 1) return false;
  if ([...key].some((c) => !ALPHABET.includes(c))) return false;
  return checkChar(key.slice(0, -1)) === key.slice(-1);
}

/** "K7QM3-XRT9A-...": groups of five for reading and typing. */
export function formatKey(key: string): string {
  return (
    normalizeKey(key)
      .match(/.{1,5}/g)
      ?.join('-') ?? ''
  );
}
