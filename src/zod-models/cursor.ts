import { z } from 'zod';
import { FieldWithValue } from './field-with-value';
import { QueryName } from './query-name';

export const Cursor = z
  .object({
    fields: z.array(FieldWithValue).min(1),
    queryName: QueryName,
  })
  .strict()
  .readonly();
export type Cursor = z.TypeOf<typeof Cursor>;
