import { ErrUnexpected } from './errors';

/* c8 ignore start */

export async function getCrypto() {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof globalThis === 'object' && globalThis.crypto) {
    return globalThis.crypto;
  }
  try {
    // note this is rewritten in rollup to `require` for the cjs build
    const { default: crypto } = await import('node:crypto');
    return crypto;
  } catch {
    throw new ErrUnexpected('Crypto support missing');
  }
}
