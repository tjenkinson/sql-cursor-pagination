import { getCrypto } from './crypto';
import { MaybePromise } from './maybe-promise';
import { CursorSecretSource } from './zod-models/cursor-secret-source';

const keySymbol = Symbol('key');

export type Keys = {
  readonly hmacKey: CryptoKey;
  readonly aesGcmKey: CryptoKey;
};

export type CursorSecret = {
  readonly [keySymbol]: Keys;
};

async function secretKeyToAesGcmKey(key: ArrayBuffer): Promise<CryptoKey> {
  const crypto = await getCrypto();
  return crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function secretKeyToHmacKey(key: ArrayBuffer): Promise<CryptoKey> {
  const crypto = await getCrypto();
  return crypto.subtle.importKey(
    'raw',
    key,
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  );
}

export async function buildCursorSecret(
  _secretSource: CursorSecretSource,
): Promise<CursorSecret> {
  const crypto = await getCrypto();
  const secretSource = CursorSecretSource.parse(_secretSource);
  const key = await crypto.subtle.digest(
    { name: 'SHA-256' },
    new TextEncoder().encode(secretSource),
  );

  const [hmacKey, aesGcmKey] = await Promise.all([
    secretKeyToHmacKey(key),
    secretKeyToAesGcmKey(key),
  ]);

  return {
    [keySymbol]: { aesGcmKey, hmacKey },
  };
}

export async function extractKeys(
  secret: MaybePromise<CursorSecret>,
): Promise<Keys> {
  return (await secret)[keySymbol];
}
