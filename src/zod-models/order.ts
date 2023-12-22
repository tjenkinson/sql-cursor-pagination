import { z } from 'zod';

export const Asc = 'asc';
export const Desc = 'desc';

export const Order = z.enum([Asc, Desc]);
export type Order = z.TypeOf<typeof Order>;
