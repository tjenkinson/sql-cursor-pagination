import z from 'zod';
import { FieldName } from './field-name';
import { FieldNameWithAlias } from './field-name-with-alias';
import { Order } from './order';

export const FieldWithOrder = z
  .object({
    field: FieldName.or(FieldNameWithAlias),
    order: Order,
  })
  .readonly();
export type FieldWithOrder = z.TypeOf<typeof FieldWithOrder>;
