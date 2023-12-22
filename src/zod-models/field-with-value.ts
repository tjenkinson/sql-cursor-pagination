import z from 'zod';
import { FieldName } from './field-name';
import { FieldValue } from './field-value';

export const FieldWithValue = z.object({
  field: FieldName,
  value: FieldValue,
});
export type FieldWithValue = z.TypeOf<typeof FieldWithValue>;
