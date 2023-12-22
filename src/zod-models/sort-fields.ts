import z from 'zod';
import { FieldWithOrder } from './field-with-order';

export const SortFields = z
  .array(FieldWithOrder)
  .min(1)
  .refine((input) => {
    const seen = new Set();
    for (const { field } of input) {
      if (seen.has(field)) {
        return false;
      }
      seen.add(field);
    }
    return true;
  }, 'Duplicate fields are not allowed');
export type SortFields = z.TypeOf<typeof SortFields>;
