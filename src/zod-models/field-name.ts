import { z } from 'zod';
import { Subtype } from '../subtype';

const fieldRegex = /^[a-zA-Z0-9_]*(\.[a-zA-Z0-9_]*)*$/;

export type FullyQualifiedName<TName extends string> = `${string}.${TName}`;
export type MaybeFullyQualifiedName<TName extends string> =
  | TName
  | FullyQualifiedName<TName>;

export const FieldName = z
  .string()
  .min(1)
  .regex(fieldRegex, 'Invalid field name');

export type FieldName<TNode> = Subtype<
  MaybeFullyQualifiedName<string & keyof TNode>,
  z.TypeOf<typeof FieldName>
>;
