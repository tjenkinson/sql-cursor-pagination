import { FieldName as FieldNameZod } from './zod-models/field-name';
import { FieldNameWithAlias as FieldNameWithAliasZod } from './zod-models/field-name-with-alias';

const regex = /[^.]*$/;

export type ParsedFieldName = {
  alias: string;
  name: string;
};

export function parseFieldName(
  fieldName: FieldNameZod | FieldNameWithAliasZod,
): ParsedFieldName {
  const name = typeof fieldName === 'string' ? fieldName : fieldName.name;
  const alias =
    typeof fieldName === 'string'
      ? fieldName.match(regex)![0]
      : fieldName.alias;
  return { alias, name };
}
