import { z } from 'zod';

const fieldRegex = /^[a-zA-Z0-9_]*(\.[a-zA-Z0-9_]*)*$/;
export const FieldName = z
  .string()
  .min(1)
  .regex(fieldRegex, 'Invalid field name');
export type FieldName = z.TypeOf<typeof FieldName>;
