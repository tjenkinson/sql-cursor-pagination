import { z } from 'zod';
import { Subtype } from '../subtype';
import { FieldName } from './field-name';

export const FieldNameWithAlias = z
  .object({ alias: z.string().min(1), name: FieldName })
  .readonly();
export type FieldNameWithAlias<TNode extends Record<string, unknown>> = Subtype<
  {
    readonly alias: string & keyof TNode;
    readonly name: string;
  },
  z.TypeOf<typeof FieldNameWithAlias>
>;
