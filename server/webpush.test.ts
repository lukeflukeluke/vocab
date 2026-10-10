import { describe, expect, it } from 'vitest';
import {
  encryptPayload,
  fromBase64Url,
  generateVapidKeys,
  pushRequest,
  toBase64Url,
  vapidAuthorization,
} from './webpush';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** Builds an ECDH key pair from a raw 65-byte public key and a private scalar (base64url). */
async function pairFromRaw(publicKey: string, privateScalar: string): Promise<CryptoKeyPair> {
  const raw = fromBase64Url(publicKey);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(raw.slice(1, 33)),
    y: toBase64Url(raw.slice(33, 65)),
  };
  return {
    publicKey: await crypto.subtle.importKey('jwk', jwk, ECDH, true, []),
    privateKey: await crypto.subtle.importKey('jwk', { ...jwk, d: privateScalar }, ECDH, false, [
      'deriveBits',
    ]),
  };
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: string | Uint8Array<ArrayBuffer>,
  bytes: number,
) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const infoBytes = typeof info === 'string' ? new TextEncoder().encode(info) : info;
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: infoBytes },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** Test-only receiver side of RFC 8291: what the browser does with a push body. */
async function decryptPayload(
  body: Uint8Array<ArrayBuffer>,
  uaKeys: CryptoKeyPair,
  auth: string,
): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const idLen = body[20] ?? 0;
  const asPublic = body.slice(21, 21 + idLen);
  const ciphertext = body.slice(21 + idLen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey));
  const asKey = await crypto.subtle.importKey('raw', asPublic, ECDH, false, []);
  const secret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256),
  );
  const info = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\0'),
    ...uaPublic,
    ...asPublic,
  ]);
  const ikm = await hkdf(fromBase64Url(auth), secret, info, 32);
  const cek = await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16);
  const nonce = await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext),
  );
  // Strip the padding: zeros after the 0x02 delimiter would be dropped here too.
  let end = padded.length;
  while (end > 0 && padded[end - 1] === 0) end--;
  expect(padded[end - 1]).toBe(2);
  return padded.slice(0, end - 1);
}

async function newSubscription() {
  const uaKeys = (await crypto.subtle.generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const p256dh = toBase64Url(
    new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey)),
  );
  const auth = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  return { uaKeys, p256dh, auth };
}

describe('base64url', () => {
  it('round trips bytes of every length, without padding or unsafe characters', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = crypto.getRandomValues(new Uint8Array(n));
      const text = toBase64Url(bytes);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect([...fromBase64Url(text)]).toEqual([...bytes]);
    }
    expect(toBase64Url(new Uint8Array([251, 255, 254]))).toBe('-__-');
  });
});

describe('encryptPayload', () => {
  it('matches the RFC 8291 Appendix A test vector', async () => {
    const uaPublic =
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
    const asPublic =
      'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
    const senderKeys = await pairFromRaw(asPublic, 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw');
    const body = await encryptPayload(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      uaPublic,
      'BTBZMqHH6r4Tts7J_aSIgg',
      { salt: fromBase64Url('DGv6ra1nlYgDCS1FRnbzlw'), senderKeys },
    );
    expect(toBase64Url(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );

    // The receiver in the RFC can read it back.
    const uaKeys = await pairFromRaw(uaPublic, 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94');
    const plain = await decryptPayload(body, uaKeys, 'BTBZMqHH6r4Tts7J_aSIgg');
    expect(new TextDecoder().decode(plain)).toBe('When I grow up, I want to be a watermelon');
  });

  it('round trips with random keys and writes the header layout', async () => {
    const { uaKeys, p256dh, auth } = await newSubscription();
    const text = 'Hello, wörld \u{1F600}';
    const body = await encryptPayload(new TextEncoder().encode(text), p256dh, auth);
    expect([...body.slice(16, 20)]).toEqual([0, 0, 16, 0]); // record size 4096
    expect(body[20]).toBe(65);
    expect(body[21]).toBe(0x04);
    const plain = await decryptPayload(body, uaKeys, auth);
    expect(new TextDecoder().decode(plain)).toBe(text);
  });

  it('uses a fresh salt and sender key each time', async () => {
    const { p256dh, auth } = await newSubscription();
    const data = new TextEncoder().encode('same');
    const a = await encryptPayload(data, p256dh, auth);
    const b = await encryptPayload(data, p256dh, auth);
    expect(toBase64Url(a)).not.toBe(toBase64Url(b));
  });

  it('refuses a payload that does not fit one record', async () => {
    const { p256dh, auth } = await newSubscription();
    await expect(encryptPayload(new Uint8Array(4096), p256dh, auth)).rejects.toThrow();
  });
});

describe('vapidAuthorization', () => {
  it('builds a signed ES256 token for the push service origin', async () => {
    const keys = await generateVapidKeys();
    expect(fromBase64Url(keys.publicKey)).toHaveLength(65);
    expect(fromBase64Url(keys.publicKey)[0]).toBe(0x04);
    expect(keys.privateJwk.d).toBeTruthy();

    const now = 1_700_000_000_123;
    const value = await vapidAuthorization(
      'https://push.example.com:8443/send/abc123',
      keys,
      'mailto:me@example.com',
      now,
    );
    const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(value);
    expect(match).not.toBeNull();
    const [, header = '', claims = '', signature = '', k = ''] = match ?? [];
    expect(k).toBe(keys.publicKey);

    const decode = (part: string) => JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
    expect(decode(header)).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(decode(claims)).toEqual({
      aud: 'https://push.example.com:8443',
      exp: 1_700_000_000 + 12 * 3600,
      sub: 'mailto:me@example.com',
    });

    const publicKey = await crypto.subtle.importKey(
      'raw',
      fromBase64Url(k),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const sig = fromBase64Url(signature);
    expect(sig).toHaveLength(64);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      sig,
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(ok).toBe(true);
  });
});

describe('pushRequest', () => {
  it('makes a POST with the push headers and a body the device can read', async () => {
    const keys = await generateVapidKeys();
    const { uaKeys, p256dh, auth } = await newSubscription();
    const endpoint = 'https://updates.push.example.net/wpush/v2/token';
    const payload = JSON.stringify({ title: 'Time for your words', body: '12 are due' });
    const now = 1_700_000_000_000;

    const request = await pushRequest(
      { endpoint, p256dh, auth },
      payload,
      keys,
      'mailto:me@example.com',
      now,
    );
    expect(request.method).toBe('POST');
    expect(request.url).toBe(endpoint);
    expect(request.headers.get('TTL')).toBe('3600');
    expect(request.headers.get('Urgency')).toBe('normal');
    expect(request.headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(request.headers.get('Content-Type')).toBe('application/octet-stream');
    // ECDSA signatures are random, so compare the token without its signature.
    const authorization = request.headers.get('Authorization') ?? '';
    const expected = await vapidAuthorization(endpoint, keys, 'mailto:me@example.com', now);
    const unsigned = (value: string) => value.slice(0, value.lastIndexOf('.'));
    expect(unsigned(authorization)).toBe(unsigned(expected));
    expect(authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);

    const body = new Uint8Array(await request.arrayBuffer());
    const plain = await decryptPayload(body, uaKeys, auth);
    expect(new TextDecoder().decode(plain)).toBe(payload);
  });

  it('uses the TTL it is given', async () => {
    const keys = await generateVapidKeys();
    const { p256dh, auth } = await newSubscription();
    const request = await pushRequest(
      { endpoint: 'https://push.example.com/x', p256dh, auth },
      'hi',
      keys,
      'mailto:me@example.com',
      0,
      60,
    );
    expect(request.headers.get('TTL')).toBe('60');
  });
});
