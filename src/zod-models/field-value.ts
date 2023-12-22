import { z } from 'zod';

export const FieldValue = z.union([z.string(), z.number(), z.boolean()]);
export type FieldValue = z.TypeOf<typeof FieldValue>;
