import { ErrUnexpected } from './errors';

export function notNull<T>(input: T | null | undefined): T {
  /* c8 ignore next 3 */
  if (input === null || input === undefined) {
    throw new ErrUnexpected('Input was undefined');
  }
  return input;
}
