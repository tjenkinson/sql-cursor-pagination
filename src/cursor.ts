import { getCrypto } from './crypto';
import { CursorSecret, extractKeys } from './cursor-secret';
import { ErrUnexpected } from './errors';
import { parseFieldName } from './field-name';
import { MaybePromise } from './maybe-promise';
import { Cursor } from './zod-models/cursor';
import { FieldValue } from './zod-models/field-value';
import { FieldWithOrder } from './zod-models/field-with-order';

const ivCipherTextRegex = /^([^.]+)\.([^.]+)$/;

const rawCursorSymbol = Symbol('rawCursor');

export type RawCursor = Cursor & { [rawCursorSymbol]: true };

export function rawCursor(cursor: Cursor): RawCursor {
  return { ...Cursor.parse(cursor), [rawCursorSymbol]: true };
}

function u8ToString(u8: Uint8Array): string {
  return String.fromCharCode(...u8);
}

function b64ToUrlEncoded(str: string): string {
  return str.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function arrayBufferToString(input: ArrayBuffer): string {
  return b64ToUrlEncoded(btoa(u8ToString(new Uint8Array(input))));
}

function base64UrlToUint8Array(base64Url: string): Uint8Array | null {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding)
    .replaceAll('-', '+')
    .replaceAll('_', '/');

  try {
    const rawData = atob(base64);
    const buffer = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      buffer[i] = rawData.charCodeAt(i);
    }

    return buffer;
    /* c8 ignore next 3 */
  } catch {
    return null;
  }
}

export async function encryptCursor({
  cursorRaw,
  secret,
}: {
  cursorRaw: Cursor;
  secret: MaybePromise<CursorSecret>;
}): Promise<string> {
  const crypto = await getCrypto();
  const { aesGcmKey, hmacKey } = await extractKeys(secret);
  const cursor = new TextEncoder().encode(JSON.stringify(cursorRaw));
  const iv = await crypto.subtle.sign('HMAC', hmacKey, cursor);
  const ivString = arrayBufferToString(iv);
  const cipherTextString = arrayBufferToString(
    await crypto.subtle.encrypt({ iv, name: 'AES-GCM' }, aesGcmKey, cursor),
  );

  return `${ivString}.${cipherTextString}`;
}

export async function decryptCursor({
  encodedCursor,
  secret,
}: {
  encodedCursor: string;
  secret: MaybePromise<CursorSecret>;
}): Promise<Cursor | null> {
  const crypto = await getCrypto();
  const parts = ivCipherTextRegex.exec(encodedCursor);
  if (!parts) return null;

  const [, ivString, cipherTextString] = parts;

  const { aesGcmKey } = await extractKeys(secret);

  const cipherText = base64UrlToUint8Array(cipherTextString);
  /* c8 ignore next */
  if (!cipherText) return null;

  const iv = base64UrlToUint8Array(ivString);
  /* c8 ignore next */
  if (!iv) return null;

  try {
    return Cursor.parse(
      JSON.parse(
        new TextDecoder().decode(
          await crypto.subtle.decrypt(
            { iv, name: 'AES-GCM' },
            aesGcmKey,
            cipherText,
          ),
        ),
      ),
    );
    /* c8 ignore next 3 */
  } catch {
    return null;
  }
}

export async function resolveCursor({
  cursor,
  cursorSecret,
}: {
  cursor: string | RawCursor | null;
  cursorSecret: MaybePromise<CursorSecret> | null;
}): Promise<{ cursor: Cursor | null; success: true } | { success: false }> {
  if (typeof cursor === 'string') {
    if (cursorSecret === null) {
      throw new ErrUnexpected(
        'String cursor not supported when no `cursorSecret` is provided',
      );
    }
    const res = await decryptCursor({
      encodedCursor: cursor,
      secret: cursorSecret,
    });
    return res ? { cursor: res, success: true } : { success: false };
  } else if (cursor?.[rawCursorSymbol]) {
    return { cursor, success: true };
  } else if (cursor === null) {
    return { cursor: null, success: true };
  }

  throw new ErrUnexpected(
    'Invalid cursor. Raw cursors must be wrapped with `rawCursor()`',
  );
}

export function buildCursor<TNode extends Record<string, unknown>>({
  queryName,
  node,
  sortFields,
}: {
  queryName: string;
  node: TNode;
  sortFields: readonly FieldWithOrder[];
}): Cursor {
  const fields: Cursor['fields'] = {};

  for (const { field } of sortFields) {
    const { alias } = parseFieldName(field);
    if (!(alias in node)) {
      throw new ErrUnexpected(`"${alias}" field is missing`);
    }
    fields[alias] = FieldValue.parse(node[alias]);
  }

  return { fields, queryName };
}
