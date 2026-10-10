// A small Web Push sender (RFC 8030 push, RFC 8291 message encryption, RFC 8188 aes128gcm,
// RFC 8292 VAPID). It uses only the WebCrypto that Cloudflare Workers and Node 22 provide, so
// it needs no packages. The server builds a `Request` with `pushRequest` and sends it with
// `fetch` to the push service address the browser gave us (the subscription's endpoint).

const encoder = new TextEncoder();

/** base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Joins byte arrays end to end. */
function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export interface VapidKeys {
  /** Uncompressed P-256 public key (65 bytes, starts 0x04), base64url. Used as the app's applicationServerKey. */
  publicKey: string;
  /** The ECDSA P-256 private key as a JWK (includes x, y, d). */
  privateJwk: JsonWebKey;
}

/** Makes a new VAPID key pair (server/reminders.ts keeps it in the database). */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: toBase64Url(raw), privateJwk };
}

/** base64url of a JSON value, as used in the parts of a JWT. */
function jsonPart(value: unknown): string {
  return toBase64Url(encoder.encode(JSON.stringify(value)));
}

/**
 * The Authorization header value for a push to `endpoint` (RFC 8292):
 * `vapid t=<JWT>, k=<publicKey>`. The JWT proves the sender owns the key the browser
 * subscribed with; it names the push service (aud) and lasts 12 hours.
 */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now: number,
): Promise<string> {
  const header = jsonPart({ typ: 'JWT', alg: 'ES256' });
  const claims = jsonPart({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 3600,
    sub: subject,
  });
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'jwk',
    keys.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto returns the signature as raw r || s (64 bytes), which is what JWT wants.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput),
  );
  return `vapid t=${signingInput}.${toBase64Url(new Uint8Array(signature))}, k=${keys.publicKey}`;
}

/** Options for tests: fixed salt and fixed sender (application server) key pair. */
export interface EncryptOptions {
  salt?: Uint8Array; // 16 bytes
  senderKeys?: CryptoKeyPair; // ECDH P-256
}

/** HKDF-SHA-256 (extract and expand in one step) returning `length` bytes. */
async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Encrypts a push message body per RFC 8291 with the aes128gcm content coding (RFC 8188),
 * one record, record size 4096. `p256dh` (65-byte uncompressed public key) and `auth` (16 bytes)
 * are the subscription's keys, base64url. Returns the full body: header (salt 16 | rs uint32 BE 4096 |
 * idlen 1 byte = 65 | keyid = sender public key 65 bytes) followed by the ciphertext of
 * (plaintext || 0x02) with AES-128-GCM (16-byte tag appended).
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  p256dh: string,
  auth: string,
  options: EncryptOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const recordSize = 4096;
  // One record holds the padding delimiter (1 byte) and the tag (16 bytes) too.
  if (plaintext.length > recordSize - 17) throw new Error('Push payload is too large');

  const uaPublic = fromBase64Url(p256dh);
  const authSecret = fromBase64Url(auth);
  const salt = new Uint8Array(options.salt ?? crypto.getRandomValues(new Uint8Array(16)));
  const senderKeys =
    options.senderKeys ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeys.publicKey));

  // Shared secret between our one-off key and the browser's subscription key.
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, senderKeys.privateKey, 256),
  );

  // Mix in the auth secret (RFC 8291 section 3.4), then derive the content key and nonce.
  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  // 0x02 marks the last (here the only) record.
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      concat(plaintext, new Uint8Array([2])),
    ),
  );

  // Header: salt, record size (uint32 big-endian), key id length, key id (sender public key).
  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * A ready-to-send Request: POST to target.endpoint with the encrypted payload and the
 * headers a push service expects. `ttlSeconds` is how long the service may hold the
 * message while the device is offline.
 */
export async function pushRequest(
  target: PushTarget,
  payload: string,
  keys: VapidKeys,
  subject: string,
  now: number,
  ttlSeconds = 3600,
): Promise<Request> {
  const body = await encryptPayload(encoder.encode(payload), target.p256dh, target.auth);
  const authorization = await vapidAuthorization(target.endpoint, keys, subject, now);
  return new Request(target.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(ttlSeconds),
      Urgency: 'normal',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: authorization,
    },
    body: body as BodyInit,
  });
}
