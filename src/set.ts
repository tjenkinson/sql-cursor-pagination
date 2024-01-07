export function areSetsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const _a of a) if (!b.has(_a)) return false;
  return true;
}
