import { FieldName as FieldNameType } from './zod-models/field-name';
import { FieldNameWithAlias as FieldNameWithAliasType } from './zod-models/field-name-with-alias';

const regex = /[^.]*$/;

export type ParsedFieldName<TNode extends Record<string, unknown>> = {
  alias: string & keyof TNode;
  name: string;
};

export function parseFieldName<TNode extends Record<string, unknown>>(
  fieldName: FieldNameType<TNode> | FieldNameWithAliasType<TNode>,
): ParsedFieldName<TNode> {
  const name = typeof fieldName === 'string' ? fieldName : fieldName.name;
  const alias =
    typeof fieldName === 'string'
      ? fieldName.match(regex)![0]
      : fieldName.alias;
  return { alias, name };
}
