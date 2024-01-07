import { z } from 'zod';
import { FieldName } from './field-name';
import { FieldValue } from './field-value';
import { QueryName } from './query-name';

export const Cursor = z
  .object({
    fields: z.record(FieldName, FieldValue),
    queryName: QueryName,
  })
  .strict()
  .readonly();
export type Cursor = z.TypeOf<typeof Cursor>;
