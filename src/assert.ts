export function notNull<T>(input: T | null): T {
  /* c8 ignore next */
  if (input === null) throw new Error('Input was undefined');
  return input;
}
