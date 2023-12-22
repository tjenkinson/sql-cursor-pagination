import { ErrUnexpected } from './errors';

/* c8 ignore start */
let _crypto: Crypto | null = null;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (typeof globalThis === 'object' && globalThis.crypto) {
  _crypto = globalThis.crypto;
} else {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    _crypto = require('node:crypto');
    // eslint-disable-next-line no-empty
  } catch {}
}

if (!_crypto) {
  throw new ErrUnexpected('Crypto support missing');
}

export const crypto = _crypto;
