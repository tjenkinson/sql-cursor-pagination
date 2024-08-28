import { describe, expect, it } from 'vitest';
import { buildCursor } from './cursor';
import { Asc } from './zod-models/order';

describe('buildCursor', () => {
  it('buildCursor to parse date values', () => {
    // this use case is from mysql dateString: false

    expect(
      buildCursor({
        node: { id: 1, invited_at: new Date() },
        queryName: 'test1',
        sortFields: [{ field: 'invited_at', order: Asc }],
      }),
    ).not.toThrowError();
  });
});
