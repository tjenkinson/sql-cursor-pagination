import { z } from 'zod';
import { FieldName } from './field-name';

export const FieldNameWithAlias = z
  .object({ alias: z.string().min(1), name: FieldName })
  .readonly();
export type FieldNameWithAlias = z.TypeOf<typeof FieldNameWithAlias>;
