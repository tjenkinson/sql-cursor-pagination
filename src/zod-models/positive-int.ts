import { z } from 'zod';

export const PositiveInt = z.number().int().min(1);
export type PositiveInt = z.TypeOf<typeof PositiveInt>;
