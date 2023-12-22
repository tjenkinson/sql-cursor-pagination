import z from 'zod';

export const GenericQueryResult = z.array(z.record(z.unknown()));
export type GenericQueryResult = z.TypeOf<typeof GenericQueryResult>;
