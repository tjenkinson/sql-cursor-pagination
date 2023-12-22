import { z } from 'zod';

export const QueryName = z.string().min(1);
export type QueryName = z.TypeOf<typeof QueryName>;
