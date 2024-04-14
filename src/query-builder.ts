import { FieldValue } from './zod-models/field-value';
import { Placeholder } from './zod-models/placeholder';

const placeholder = Symbol('placeholder');

export type Fragment<TValues> = {
  sql: string;
  bindings: TValues;
};

export type RawFragment = {
  strings: string[];
  bindings: string[];
};

export type FragmentBuilderPlaceholderFn = (index: number) => Placeholder;

export type FragmentBuilderArrayInput = {
  placeholder?: string | FragmentBuilderPlaceholderFn;
};
export type FragmentBuilderObjectInput = {
  placeholder: FragmentBuilderPlaceholderFn;
};

export type FragmentBuilder = {
  /**
   * This returns a fragment, which is an object containing an `sql` property
   * which is an sql string containing placeholders, and an array of strings on
   * a `binding` property that map to the placeholders.
   *
   * The placeholder defaults to `?` but can be customized by providing a string,
   * or a function that receives the index and is responsible for returning a
   * placeholder string.
   */
  withArrayBindings: (input?: FragmentBuilderArrayInput) => Fragment<string[]>;
  /**
   * This returns a fragment, which is an object containing an `sql` property
   * which is an sql string containing placeholders, and an object on a `binding`
   * property, where each key maps to a placeholder, and the value is the placeholder
   * value.
   *
   * You must provide a function that receives the index and is responsible for
   * returning a unique placeholder string.
   */
  withObjectBindings: (
    input: FragmentBuilderObjectInput,
  ) => Fragment<Record<string, string>>;
  /**
   * This is intended to take a tagged template tag function.
   */
  toTaggedTemplate: <T>(
    tag: (strings: TemplateStringsArray, ...bindings: string[]) => T,
  ) => T;
  toRaw: () => RawFragment;
};

function valueToString(value: FieldValue): string {
  if (typeof value === 'string') return value;
  /* c8 ignore next */
  if (typeof value === 'boolean') return value ? '1' : '0';

  value satisfies number;
  return `${value}`;
}

export class QueryBuilder {
  private parts: (string | typeof placeholder)[] = [];
  private bindings: string[] = [];

  public appendText(text: string): this {
    this.parts.push(text);
    return this;
  }

  public appendValue(value: FieldValue): this {
    this.parts.push(placeholder);
    this.bindings.push(valueToString(value));
    return this;
  }

  public getFragmentBuilder(onUsage: () => void): FragmentBuilder {
    const { parts, bindings } = this;

    const buildStrings = () => {
      const strings: string[] = [];
      let current: string[] = [];

      const push = () => {
        /* c8 ignore next */
        if (current.length === 0) return;

        strings.push(current.join(''));
        current = [];
      };

      for (const part of parts) {
        if (part === placeholder) {
          push();
        } else {
          current.push(part);
        }
      }
      push();
      return strings;
    };

    return {
      toRaw: () => {
        onUsage();

        return {
          bindings: [...bindings],
          strings: buildStrings(),
        };
      },
      toTaggedTemplate: <T>(
        tag: (strings: TemplateStringsArray, ..._bindings: string[]) => T,
      ) => {
        onUsage();

        const raw = buildStrings();
        const strings = [...raw] as string[] & { raw: string[] };
        strings.raw = raw;
        return tag(strings, ...bindings);
      },
      withArrayBindings: ({ placeholder: userPlaceholder = '?' } = {}) => {
        if (typeof userPlaceholder !== 'function') {
          Placeholder.parse(userPlaceholder);
        }

        let index = 0;
        let sql = '';
        for (const part of parts) {
          if (part === placeholder) {
            const placeholderName =
              typeof userPlaceholder === 'function'
                ? Placeholder.parse(userPlaceholder(index))
                : userPlaceholder;
            sql += placeholderName;
            index++;
          } else {
            sql += part;
          }
        }

        onUsage();

        return {
          bindings: [...bindings],
          sql,
        };
      },
      withObjectBindings: ({ placeholder: userPlaceholder }) => {
        let index = 0;
        let sql = '';
        const bindingsObject: Record<string, string> = {};
        const valueToName: Map<string, string> = new Map();
        for (const part of parts) {
          if (part === placeholder) {
            const value = bindings[index];
            const existingName = valueToName.get(value);
            const placeholderName = existingName
              ? existingName
              : Placeholder.parse(userPlaceholder(valueToName.size));
            sql += placeholderName;
            if (!existingName) {
              bindingsObject[placeholderName] = value;
              valueToName.set(value, placeholderName);
            }
            index++;
          } else {
            sql += part;
          }
        }

        onUsage();

        return { bindings: bindingsObject, sql };
      },
    };
  }
}
