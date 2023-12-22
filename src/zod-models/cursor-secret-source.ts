import { z } from 'zod';

export const CursorSecretSource = z.string().min(30);
export type CursorSecretSource = z.TypeOf<typeof CursorSecretSource>;
