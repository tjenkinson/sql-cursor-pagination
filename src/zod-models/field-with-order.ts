import z from 'zod';
import { Subtype } from '../subtype';
import { FieldName } from './field-name';
import { FieldNameWithAlias } from './field-name-with-alias';
import { Order } from './order';

export const FieldWithOrder = z
  .object({
    field: FieldName.or(FieldNameWithAlias),
    order: Order,
  })
  .readonly();

export type FieldWithOrder<TNode extends Record<string, unknown>> = Subtype<
  {
    readonly field: FieldName<TNode> | FieldNameWithAlias<TNode>;
    readonly order: Order;
  },
  z.TypeOf<typeof FieldWithOrder>
>;
