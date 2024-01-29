import pMap from 'p-map';
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
import { areSetsEqual } from './set';
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

type _WithPaginationInputQuery<TGenerateCursor extends boolean = true> = {
  /* The number of rows to fetch from the start of the window. */
  first?: number | null;
  /* The number of rows to fetch from the end of the window. */
  last?: number | null;
  /**
   * The window will cover the row after the provided cursor, and later rows.
   *
   * This takes the string `cursor` from a previous result, or you can provide a raw cursor
   * object by wrapping the object with `rawCursor(object)`.
   */
  after?: (TGenerateCursor extends true ? string : never) | RawCursor | null;
  /**
   * The window will cover the row before the provided cursor, and earlier rows.
   *
   * This takes the string `cursor` from a previous result, or you can provide a raw cursor
   * object by wrapping the object with `rawCursor(object)`.
   */
  before?: (TGenerateCursor extends true ? string : never) | RawCursor | null;
};
export type WithPaginationInputQuery = _WithPaginationInputQuery<true>;
export type WithPaginationNoCursorInputQuery = _WithPaginationInputQuery<false>;

type _WithPaginationInputSetup<
  TNode extends Record<string, unknown>,
  TGenerateCursor extends boolean,
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
   * This takes an array of objects which have `field` and `order` properties.
   *
   * The order can be `asc` or `desc`.
   *
   * There must be at least one entry and you must include an entry that maps to a unique key,
   * otherwise it's possible for there to be cursor collisions, which will result  in an exception.
   */
  sortFields: readonly FieldWithOrder[];
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
  : { cursorGenerationConcurrency?: undefined; cursorSecret?: undefined });
export type WithPaginationInputSetup<TNode extends Record<string, unknown>> =
  _WithPaginationInputSetup<TNode, true>;
export type WithPaginationNoCursorInputSetup<
  TNode extends Record<string, unknown>,
> = _WithPaginationInputSetup<TNode, false>;

type _WithPaginationInput<
  TNode extends Record<string, unknown>,
  TGenerateCursor extends boolean,
> = {
  query: TGenerateCursor extends true
    ? WithPaginationInputQuery
    : WithPaginationNoCursorInputQuery;
  setup: TGenerateCursor extends true
    ? WithPaginationInputSetup<TNode>
    : WithPaginationNoCursorInputSetup<TNode>;
};
export type WithPaginationInput<
  TNode extends Record<string, unknown> = Record<string, unknown>,
> = _WithPaginationInput<TNode, true>;
export type WithPaginationNoCursorInput<
  TNode extends Record<string, unknown> = Record<string, unknown>,
> = _WithPaginationInput<TNode, false>;

type _WithPaginationResultEdge<
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

export type WithPaginationResultEdge<TNode extends Record<string, unknown>> =
  _WithPaginationResultEdge<TNode, true, false>;
export type WithPaginationResultEdgeWithRawCursor<
  TNode extends Record<string, unknown>,
> = _WithPaginationResultEdge<TNode, true, true>;
export type WithPaginationNoCursorResultEdge<
  TNode extends Record<string, unknown>,
> = _WithPaginationResultEdge<TNode, false, false>;
export type WithPaginationNoCursorResultEdgeWithRawCursor<
  TNode extends Record<string, unknown>,
> = _WithPaginationResultEdge<TNode, false, true>;

type _WithPaginationResultPageInfo<TIncludeCursor extends boolean> = {
  /**
   * `true` if there are more items following the last one and the request was for `first`.
   *
   * Otherwise this will be `false`.
   */
  hasNextPage: boolean;
  /**
   * `true` if there are more items before the first one and the request was for `last`.
   *
   * Otherwise this will be `false`.
   */
  hasPreviousPage: boolean;
} & (TIncludeCursor extends true
  ? { startCursor: string | null; endCursor: string | null }
  : {
      startCursor?: undefined;
      endCursor?: undefined;
    });

export type WithPaginationResultPageInfo = _WithPaginationResultPageInfo<true>;
export type WithPaginationNoCursorResultPageInfo =
  _WithPaginationResultPageInfo<false>;

type _WithPaginationResult<
  TNode extends Record<string, unknown>,
  TGenerateCursor extends boolean,
> = {
  /**
   * Contains `hasNextPage`/`hasPreviousPage`.
   */
  pageInfo: TGenerateCursor extends true
    ? WithPaginationResultPageInfo
    : WithPaginationNoCursorResultPageInfo;
  /**
   * An entry for each row in the result, that contains the row and cursor.
   */
  edges: TGenerateCursor extends true
    ? WithPaginationResultEdge<TNode>[]
    : WithPaginationNoCursorResultEdge<TNode>[];
  [edgesWithRawCursorSymbol]: TGenerateCursor extends true
    ? WithPaginationResultEdgeWithRawCursor<TNode>[]
    : WithPaginationNoCursorResultEdgeWithRawCursor<TNode>[];
};
export type WithPaginationResult<TNode extends Record<string, unknown>> =
  _WithPaginationResult<TNode, true>;
export type WithPaginationNoCursorResult<
  TNode extends Record<string, unknown>,
> = _WithPaginationResult<TNode, false>;

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

async function _withPagination<
  TNode extends Record<string, unknown>,
  TGenerateCursor extends boolean,
>(
  generateCursor: TGenerateCursor,
  {
    query: {
      first = null,
      last = null,
      before: beforeInput = null,
      after: afterInput = null,
    },
    setup: {
      cursorGenerationConcurrency: _cursorGenerationConcurrency = 10,
      cursorSecret: _cursorSecret,
      maxNodes = 100,
      runQuery,
      sortFields: _sortFields,
      queryName: _queryName,
    },
  }: _WithPaginationInput<TNode, TGenerateCursor>,
): Promise<_WithPaginationResult<TNode, TGenerateCursor>> {
  const sortFields = SortFields.parse(_sortFields);
  const queryName = QueryName.parse(_queryName);
  const cursorGenerationConcurrency = PositiveInt.parse(
    _cursorGenerationConcurrency,
  );
  /* c8 ignore next 1 */
  const cursorSecret = generateCursor ? _cursorSecret ?? null : null;

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
    cursor: beforeInput,
    cursorSecret,
  });
  if (!resolvedBeforeCursor.success) {
    throw new ErrBeforeCursorInvalid();
  }
  const before = resolvedBeforeCursor.cursor;

  const resolvedAfterCursor = await resolveCursor({
    cursor: afterInput,
    cursorSecret,
  });
  if (!resolvedAfterCursor.success) {
    throw new ErrAfterCursorInvalid();
  }
  const after = resolvedAfterCursor.cursor;

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
    ['before', before],
    ['after', after],
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
      !areSetsEqual(
        new Set(sortFields.map(({ field }) => parseFieldName(field).name)),
        new Set(Object.keys(cursor.fields)),
      )
    ) {
      if (type === 'before') {
        throw new ErrBeforeCursorWrongSortConfig();
      } else {
        throw new ErrAfterCursorWrongSortConfig();
      }
    }
  }

  if (before || after) {
    whereQuery.appendText(`(`);

    const build = (type: 'after' | 'before', c: Cursor): void => {
      for (let i = 0; i < sortFields.length; i++) {
        if (i > 0) whereQuery.appendText(` OR `);
        whereQuery.appendText(`(`);
        for (let j = 0; j <= i; j++) {
          const { field, order } = sortFields[j];
          const fieldName = parseFieldName(field).name;
          const value = c.fields[fieldName];
          const sign =
            i === j
              ? maybeFlip(order, type === 'before') === Asc
                ? `>`
                : `<`
              : `=`;

          if (j > 0) whereQuery.appendText(` AND `);
          whereQuery
            .appendText(`${quoteField(fieldName)}${sign}`)
            .appendValue(value);
        }
        whereQuery.appendText(`)`);
      }
    };

    if (after) {
      whereQuery.appendText(`(`);
      build('after', after);
      whereQuery.appendText(`)`);
    }
    if (before) {
      if (after) whereQuery.appendText(` AND `);
      whereQuery.appendText(`(`);
      build('before', before);
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
  const edgesWithRawCursor: _WithPaginationResultEdge<TNode, boolean, true>[] =
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

  const edges: _WithPaginationResultEdge<TNode, boolean, false>[] =
    edgesWithRawCursor.map(({ cursor, node }) => {
      return { ...(cursor !== undefined ? { cursor } : {}), node };
    });

  const pageInfo: _WithPaginationResultPageInfo<boolean> = {
    hasNextPage,
    hasPreviousPage,
    ...(cursorSecret !== null && {
      endCursor:
        edges.length > 0 ? notNull(edges[edges.length - 1].cursor) : null,
      startCursor: edges.length > 0 ? notNull(edges[0].cursor) : null,
    }),
  } as _WithPaginationResultPageInfo<boolean>;

  return {
    edges,
    [edgesWithRawCursorSymbol]: edgesWithRawCursor,
    pageInfo,
  } as _WithPaginationResult<TNode, TGenerateCursor>;
}

export async function withPagination<
  TNode extends Record<string, unknown> = Record<string, unknown>,
>(input: WithPaginationInput<TNode>): Promise<WithPaginationResult<TNode>> {
  return _withPagination<TNode, true>(true, input);
}

export async function withPaginationNoCursor<
  TNode extends Record<string, unknown> = Record<string, unknown>,
>(
  input: WithPaginationNoCursorInput<TNode>,
): Promise<WithPaginationNoCursorResult<TNode>> {
  return _withPagination<TNode, false>(false, input);
}
