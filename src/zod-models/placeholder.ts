import { z } from 'zod';

const placeholderRegex = /^[a-zA-Z0-9_?:]*$/;
export const Placeholder = z.string().min(1).regex(placeholderRegex);
export type Placeholder = z.TypeOf<typeof Placeholder>;
