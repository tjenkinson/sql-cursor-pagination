import pMap from 'p-map';
import { areArraysEqual } from './arrays';
import { notNull } from './assert';
import { RawCursor, buildCursor, encryptCursor, resolveCursor } from './cursor';
import { CursorSecret } from './cursor-secret';
import {
  ErrAfterCursorInvalid,
  ErrAfterCursorWrongQuery,
  ErrAfterCursorWrongSortConfig,
  ErrBeforeCursorInvalid,
  ErrBeforeCursorWrongQuery,
  ErrBeforeCursorWrongSortConfig,
  ErrFirstNotGreaterThanLast,
  ErrFirstNotInteger,
  ErrFirstOrLastRequired,
  ErrFirstOutOfRange,
  ErrLastNotInteger,
  ErrLastOutOfRange,
  ErrTooManyNodes,
  ErrUnexpected,
} from './errors';
import { parseFieldName } from './field-name';
import { MaybePromise } from './maybe-promise';
import { FragmentBuilder, QueryBuilder } from './query-builder';
import { Cursor } from './zod-models/cursor';
import { FieldWithOrder } from './zod-models/field-with-order';
import { GenericQueryResult } from './zod-models/generic-query-result';
import { Asc, Desc, Order } from './zod-models/order';
import { PositiveInt } from './zod-models/positive-int';
import { QueryName } from './zod-models/query-name';
import { SortFields } from './zod-models/sort-fields';

export type { Cursor } from './zod-models/cursor';
export type { FieldWithOrder } from './zod-models/field-with-order';

/**
 * Used to access the edges containing a `rawCursor` property, which is the
 * unencrypted version of the cursor.
 */
export const edgesWithRawCursorSymbol = Symbol('edgesWithRawCursor');

export type QueryContent = {
  orderByFragmentBuilder: FragmentBuilder;
  whereFragmentBuilder: FragmentBuilder;
  limit: number;
};

export type WithPaginationInputQuery<TGenerateCursor extends boolean = true> = {
  /* The number of rows to fetch from the start of the window. */
  first?: number | null;
  /* The number of rows to fetch from the end of the window. */
  last?: number | null;
  /**
   * This takes an array of objects which have `field` and `order` properties.
   *
   * The order can be `asc` or `desc`.
   *
   * There must be at least one entry and you must include an entry that maps to a unique key,
   * otherwise it's possible for there to be cursor collisions, which will result  in an exception.
   */
  sortFields: readonly FieldWithOrder[];
  /**
   * The window will cover the row after the provided cursor, and later rows.
   *
   * This takes the string `cursor` from a previous result, or you can provide a raw cursor
   * object by wrapping the object with `rawCursor(object)`.
   */
  afterCursor?:
    | (TGenerateCursor extends true ? string : never)
    | RawCursor
    | null;
  /**
   * The window will cover the row before the provided cursor, and earlier rows.
   *
   * This takes the string `cursor` from a previous result, or you can provide a raw cursor
   * object by wrapping the object with `rawCursor(object)`.
   */
  beforeCursor?:
    | (TGenerateCursor extends true ? string : never)
    | RawCursor
    | null;
};

export type WithPaginationInputSetup<
  TNode extends Record<string, unknown> = Record<string, unknown>,
  TGenerateCursor extends boolean = true,
> = {
  /**
   * The maximum number of allowed rows in the response before the `ErrTooManyNodes` error is returned.
   *
   * Default: 100
   */
  maxNodes?: number;
  /**
   * This function is responsible for running the database query, and returning the array of rows.
   *
   * It is provided with a `QueryContent` object which contains a `WHERE` fragment, `ORDER BY` fragment and `limit`,
   * which must be included in the query.
   */
  runQuery: (queryContent: QueryContent) => Promise<readonly TNode[]>;
  /**
   * A name for this query.
   *
   * It should be unique to the query, and is used to bind the cursors to it.
   *
   * This prevents a cursor that was created for another query being used for this one.
   */
  queryName: string;
} & (TGenerateCursor extends true
  ? {
      /**
       * The number of cursors to generate in parallel.
       *
       * Default: 10
       */
      cursorGenerationConcurrency?: number;
      /**
       * The secret that is used to encrypt the cursor, created from `buildCursorSecret(secret: string)`.
       *
       * Must be at least 30 characters.
       *
       * Generate one with `npx -p sql-cursor-pagination generate-secret`.
       */
      cursorSecret: MaybePromise<CursorSecret>;
    }
  : { cursorGenerationConcurrency?: undefined; cursorSecret?: null });

export type WithPaginationInput<
  TNode extends Record<string, unknown> = Record<string, unknown>,
  TGenerateCursor extends boolean = true,
> = {
  query: WithPaginationInputQuery<TGenerateCursor>;
  setup: WithPaginationInputSetup<TNode, TGenerateCursor>;
};

export type WithPaginationResultEdge<
  TNode,
  TIncludeCursor extends boolean,
  TIncludeRawCursor extends boolean,
> = {
  node: TNode;
} & (TIncludeCursor extends true
  ? { cursor: string }
  : { cursor?: undefined }) &
  (TIncludeRawCursor extends true
    ? { rawCursor: Cursor }
    : { rawCursor?: undefined });

export type WithPaginationResultPageInfo = {
  /**
   * `true` if there are more items following the last one and the request was for `first`.
   *
   * Otherwise this will be `false`.
   */
  hasNextPage: boolean;
  /**
   * `true` if there are more items before the first oneand the request was for `last`.
   *
   * Otherwise this will be `false`.
   */
  hasPreviousPage: boolean;
};

export type WithPaginationResult<TNode, TGenerateCursor extends boolean> = {
  /**
   * Contains `hasNextPage`/`hasPreviousPage`.
   */
  pageInfo: WithPaginationResultPageInfo;
  /**
   * An entry for each row in the result, that contains the row and cursor.
   */
  edges: WithPaginationResultEdge<TNode, TGenerateCursor, false>[];
  [edgesWithRawCursorSymbol]: WithPaginationResultEdge<
    TNode,
    TGenerateCursor,
    true
  >[];
};

function maybeFlip(order: Order, flipDirection: boolean): Order {
  if (!flipDirection) return order;
  return order === Asc ? Desc : Asc;
}

function quoteField(field: string): string {
  return field
    .split('.')
    .map((part) => `\`${part}\``)
    .join('.');
}

export async function withPagination<
  TNode extends Record<string, unknown> = Record<string, unknown>,
>(
  input: WithPaginationInput<TNode, true>,
): Promise<WithPaginationResult<TNode, true>>;
export async function withPagination<
  TNode extends Record<string, unknown> = Record<string, unknown>,
>(
  input: WithPaginationInput<TNode, false>,
): Promise<WithPaginationResult<TNode, false>>;
export async function withPagination<
  TNode extends Record<string, unknown> = Record<string, unknown>,
>({
  query: {
    first = null,
    last = null,
    beforeCursor: beforeCursorInput = null,
    afterCursor: afterCursorInput = null,
    sortFields: _sortFields,
  },
  setup: {
    cursorGenerationConcurrency: _cursorGenerationConcurrency = 10,
    cursorSecret = null,
    maxNodes = 100,
    runQuery,
    queryName: _queryName,
  },
}: WithPaginationInput<TNode, boolean>): Promise<
  WithPaginationResult<TNode, boolean>
> {
  const sortFields = SortFields.parse(_sortFields);
  const queryName = QueryName.parse(_queryName);
  const cursorGenerationConcurrency = PositiveInt.parse(
    _cursorGenerationConcurrency,
  );

  if (first === null && last === null) {
    throw new ErrFirstOrLastRequired();
  }

  if (
    first !== null &&
    !Number.isSafeInteger(first + 1) &&
    first !== Infinity
  ) {
    throw new ErrFirstNotInteger();
  }

  if (last !== null && !Number.isSafeInteger(last + 1) && last !== Infinity) {
    throw new ErrLastNotInteger();
  }

  if (first !== null && first <= 0) {
    throw new ErrFirstOutOfRange();
  }

  if (last !== null && last <= 0) {
    throw new ErrLastOutOfRange();
  }

  if (first !== null && last !== null && first <= last) {
    throw new ErrFirstNotGreaterThanLast();
  }

  const resolvedBeforeCursor = await resolveCursor({
    cursor: beforeCursorInput,
    cursorSecret,
  });
  if (!resolvedBeforeCursor.success) {
    throw new ErrBeforeCursorInvalid();
  }
  const beforeCursor = resolvedBeforeCursor.cursor;

  const resolvedAfterCursor = await resolveCursor({
    cursor: afterCursorInput,
    cursorSecret,
  });
  if (!resolvedAfterCursor.success) {
    throw new ErrAfterCursorInvalid();
  }
  const afterCursor = resolvedAfterCursor.cursor;

  const requestedCount = first !== null ? first : notNull(last);
  if (requestedCount > maxNodes) {
    throw new ErrTooManyNodes({ maxNodes });
  }

  // +1 to know if there's another page
  const limit = requestedCount + 1;

  // if we're only selecting last X then need to flip direction and reverse results
  const flipDirection = first === null;

  const orderByQuery = new QueryBuilder();

  for (const [i, { field, order }] of sortFields.entries()) {
    if (i > 0) orderByQuery.appendText(', ');
    orderByQuery
      .appendText(quoteField(parseFieldName(field).name))
      .appendText(' ')
      .appendText(maybeFlip(order, flipDirection) === Asc ? Asc : Desc);
  }

  const whereQuery = new QueryBuilder();
  for (const [type, cursor] of [
    ['before', beforeCursor],
    ['after', afterCursor],
  ] as const) {
    if (!cursor) continue;

    if (queryName !== cursor.queryName) {
      if (type === 'before') {
        throw new ErrBeforeCursorWrongQuery();
      } else {
        throw new ErrAfterCursorWrongQuery();
      }
    }

    // fields in the cursor must match the ones being requested
    if (
      !areArraysEqual(
        sortFields.map(({ field }) => parseFieldName(field).name),
        cursor.fields.map(({ field }) => field),
      )
    ) {
      if (type === 'before') {
        throw new ErrBeforeCursorWrongSortConfig();
      } else {
        throw new ErrAfterCursorWrongSortConfig();
      }
    }
  }

  if (beforeCursor || afterCursor) {
    whereQuery.appendText(`(`);

    const build = (type: 'after' | 'before', c: Cursor): void => {
      for (let i = 0; i < sortFields.length; i++) {
        if (i > 0) whereQuery.appendText(` OR `);
        whereQuery.appendText(`(`);
        for (let j = 0; j <= i; j++) {
          const { field, order } = sortFields[j];
          const { value } = c.fields[j];
          const sign =
            i === j
              ? maybeFlip(order, type === 'before') === Asc
                ? `>`
                : `<`
              : `=`;

          if (j > 0) whereQuery.appendText(` AND `);
          whereQuery
            .appendText(`${quoteField(parseFieldName(field).name)}${sign}`)
            .appendValue(value);
        }
        whereQuery.appendText(`)`);
      }
    };

    if (afterCursor) {
      whereQuery.appendText(`(`);
      build('after', afterCursor);
      whereQuery.appendText(`)`);
    }
    if (beforeCursor) {
      if (afterCursor) whereQuery.appendText(` AND `);
      whereQuery.appendText(`(`);
      build('before', beforeCursor);
      whereQuery.appendText(`)`);
    }
    whereQuery.appendText(`)`);
  } else {
    whereQuery.appendText(`1`);
  }

  let limitRequested = false;
  let orderByRequested = false;
  let whereRequested = false;

  const rowsWithExtra = GenericQueryResult.parse(
    await runQuery({
      get limit() {
        limitRequested = true;
        return limit;
      },
      orderByFragmentBuilder: orderByQuery.getFragmentBuilder(
        () => (orderByRequested = true),
      ),
      whereFragmentBuilder: whereQuery.getFragmentBuilder(
        () => (whereRequested = true),
      ),
    }),
  ) as readonly TNode[];

  if (!limitRequested as boolean) {
    throw new ErrUnexpected(
      'You need to request the limit from `limit` and add it to the query',
    );
  }

  if (!orderByRequested as boolean) {
    throw new ErrUnexpected(
      'You need to request the `ORDER BY` fragment from `orderByFragmentBuilder` and add it to the query',
    );
  }

  if (!whereRequested as boolean) {
    throw new ErrUnexpected(
      'You need to request the `WHERE` fragment from `whereFragmentBuilder` and add it to the query',
    );
  }

  if (rowsWithExtra.length > limit) {
    throw new ErrUnexpected(
      'Query returned too many rows. Did you forget to add the `LIMIT`?',
    );
  }
  const rows = rowsWithExtra.slice(0, requestedCount);
  const overflowed = rowsWithExtra.length > requestedCount;

  if (flipDirection) rows.reverse();

  const firstNodes: readonly TNode[] =
    first !== null ? rows.slice(0, first) : rows;
  const lastNodes: readonly TNode[] =
    last !== null ? firstNodes.slice(-1 * last) : firstNodes;

  const hasNextPage = first !== null ? overflowed : false;
  const hasPreviousPage =
    last !== null
      ? flipDirection
        ? overflowed
        : lastNodes.length < firstNodes.length
      : false;

  const seenCursors: Set<string> = new Set();
  const edgesWithRawCursor: WithPaginationResultEdge<TNode, boolean, true>[] =
    await pMap(
      lastNodes,
      async (node) => {
        const rawCursor = buildCursor({
          node,
          queryName,
          sortFields,
        });
        const stringifiedCursor = JSON.stringify(rawCursor);
        if (seenCursors.has(stringifiedCursor)) {
          throw new ErrUnexpected(
            'Duplicate cursor. Cursors must be unique. Ensure you are including a unique field in `sortFields`. E.g. the primary `id` field',
          );
        }
        seenCursors.add(stringifiedCursor);
        return {
          ...(cursorSecret !== null && {
            cursor: await encryptCursor({
              cursorRaw: rawCursor,
              secret: cursorSecret,
            }),
          }),
          node,
          rawCursor,
        };
      },
      { concurrency: cursorGenerationConcurrency },
    );

  const edges: WithPaginationResultEdge<TNode, boolean, false>[] =
    edgesWithRawCursor.map(({ cursor, node }) => {
      return { ...(cursor !== undefined ? { cursor } : {}), node };
    });

  return {
    edges,
    [edgesWithRawCursorSymbol]: edgesWithRawCursor,
    pageInfo: {
      hasNextPage,
      hasPreviousPage,
    },
  };
}
