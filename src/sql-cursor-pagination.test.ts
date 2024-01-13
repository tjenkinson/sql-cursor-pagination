import knex from 'knex';
import { expect, beforeEach } from 'vitest';
import { describe, it } from 'vitest';
import { rawCursor } from './cursor';
import { buildCursorSecret } from './cursor-secret';
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
} from './errors';
import { FragmentBuilder } from './query-builder';
import {
  QueryContent,
  WithPaginationInput,
  WithPaginationInputQuery,
  WithPaginationInputSetup,
  WithPaginationResult,
  edgesWithRawCursorSymbol,
  withPagination,
} from './sql-cursor-pagination';
import { Asc, Desc } from './zod-models/order';

describe('SqlCursorPagination', () => {
  type Row = {
    admin: boolean;
    created_at: number;
    email: string;
    email_alias: string;
    first_name: string;
    id: number;
    last_name: string;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: knex.Knex<any, unknown[]>;
  const mockCursorSecret = buildCursorSecret('0'.repeat(30));
  const mockQueryName = 'TestQuery';

  const mockRows = [
    {
      admin: false,
      created_at: 1662538189,
      email: 'rhoncus.donec@aol.edu',
      first_name: 'Anika',
      id: 1,
      last_name: 'Duncan',
    },
    {
      admin: false,
      created_at: 1679712324,
      email: 'ut.nisi@yahoo.org',
      first_name: 'Jermaine',
      id: 2,
      last_name: "O'connor",
    },
    {
      admin: true,
      created_at: 1647959350,
      email: 'eu@hotmail.ca',
      first_name: 'Joseph',
      id: 3,
      last_name: 'Rhodes',
    },
    {
      admin: false,
      created_at: 1604543417,
      email: 'purus.accumsan@icloud.com',
      first_name: 'Cooper',
      id: 4,
      last_name: 'Molina',
    },
    {
      admin: true,
      created_at: 1631332719,
      email: 'diam.vel@outlook.edu',
      first_name: 'Anika',
      id: 5,
      last_name: 'Molina',
    },
  ] satisfies Omit<Row, 'email_alias'>[];

  function snapshotQueryContent(input: QueryContent) {
    expect(input.limit).toMatchSnapshot();

    const snapshotFragment = (builder: FragmentBuilder): void => {
      expect(builder.withArrayBindings()).toMatchSnapshot();
      expect(builder.withArrayBindings({ placeholder: 'X' })).toMatchSnapshot();
      expect(
        builder.withArrayBindings({
          placeholder: (index) => `:${index}`,
        }),
      ).toMatchSnapshot();
      expect(
        builder.withObjectBindings({
          placeholder: (index) => `:${index}`,
        }),
      ).toMatchSnapshot();
    };

    snapshotFragment(input.orderByFragmentBuilder);
    snapshotFragment(input.whereFragmentBuilder);
  }

  function buildRunQuery() {
    return async (input: QueryContent): Promise<Row[]> => {
      snapshotQueryContent(input);

      const whereFragmentBuilder =
        input.whereFragmentBuilder.withArrayBindings();
      const orderByFragmentBuilder =
        input.orderByFragmentBuilder.withArrayBindings();
      const limit = input.limit;

      let query = db('users')
        .select(
          'id',
          'admin',
          'created_at',
          'first_name',
          'last_name',
          'email',
          'email as email_alias',
        )
        .whereRaw(whereFragmentBuilder.sql, whereFragmentBuilder.bindings)
        .orderByRaw(
          orderByFragmentBuilder.sql,
          orderByFragmentBuilder.bindings,
        );

      if (limit !== Infinity) {
        query = query.limit(limit);
      }

      const rows = (await query) as Row[];
      return rows;
    };
  }

  beforeEach(async () => {
    db = knex({
      client: 'sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
    });

    await db.schema.createTable('users', (table) => {
      table.integer('id').notNullable();
      table.integer('created_at').notNullable();
      table.string('first_name').notNullable();
      table.string('last_name').notNullable();
      table.string('email').notNullable();
      table.boolean('admin').notNullable();
    });

    await db('users').insert(mockRows);
  });

  async function go<TGenerateCursor extends boolean = true>({
    query = {},
    setup = {},
  }: {
    query?: Partial<WithPaginationInputQuery<TGenerateCursor>>;
    setup?: Partial<WithPaginationInputSetup<Row, TGenerateCursor>>;
  }): Promise<WithPaginationResult<Row, TGenerateCursor>> {
    const input: WithPaginationInput<Row, boolean> = {
      query: {
        sortFields: [
          { field: 'first_name', order: Asc },
          { field: 'last_name', order: Desc },
          { field: 'id', order: Asc },
        ],
        ...query,
      },
      setup: {
        cursorSecret: mockCursorSecret,
        maxNodes: Infinity,
        queryName: mockQueryName,
        runQuery: buildRunQuery(),
        ...setup,
      },
    };
    return withPagination<Row>(input) as Promise<
      WithPaginationResult<Row, TGenerateCursor>
    >;
  }

  it('selects the first infinity (all) items', async () => {
    const res = await go({
      query: {
        first: Infinity,
      },
    });

    expect(res.edges).toHaveLength(5);
    expect(res.edges[0].node.first_name).toBe('Anika');
    expect(res.pageInfo.hasPreviousPage).toBe(false);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res.pageInfo.startCursor).toBe(res.edges[0].cursor);
    expect(res.pageInfo.endCursor).toBe(res.edges[res.edges.length - 1].cursor);
    expect(res).toMatchSnapshot();
  });

  it('selects the last infinity (all) items', async () => {
    const res = await go({
      query: {
        last: Infinity,
      },
    });

    expect(res.edges).toHaveLength(5);
    expect(res.edges[0].node.first_name).toBe('Anika');
    expect(res.pageInfo.hasPreviousPage).toBe(false);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res).toMatchSnapshot();
  });

  it('selects the first 3 items', async () => {
    const res = await go({
      query: {
        first: 3,
      },
    });

    expect(res.edges).toHaveLength(3);
    expect(res.edges[0].node.first_name).toBe('Anika');
    expect(res.edges[0].node.last_name).toBe('Molina');
    expect(res.pageInfo.hasPreviousPage).toBe(false);
    expect(res.pageInfo.hasNextPage).toBe(true);
    expect(res).toMatchSnapshot();
  });

  it('selects the third row when selecting one after the second row', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        afterCursor: all.edges[1].cursor,
        first: 1,
      },
    });

    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]).toEqual(all.edges[2]);
    expect(res.pageInfo.hasPreviousPage).toBe(false);
    expect(res.pageInfo.hasNextPage).toBe(true);
    expect(res).toMatchSnapshot();
  });

  it('selects the second row when selecting one before the third row', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        beforeCursor: all.edges[2].cursor,
        last: 1,
      },
    });

    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]).toEqual(all.edges[1]);
    expect(res.pageInfo.hasPreviousPage).toBe(true);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res).toMatchSnapshot();
  });

  it('selects first 2 rows when selecting 2 before the third row', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        beforeCursor: all.edges[2].cursor,
        last: 2,
      },
    });

    expect(res.edges).toHaveLength(2);
    expect(res.edges[0]).toEqual(all.edges[0]);
    expect(res.pageInfo.hasPreviousPage).toBe(false);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res).toMatchSnapshot();
  });

  it('selects the last 3 items', async () => {
    const res = await go({
      query: {
        last: 3,
      },
    });

    expect(res.edges).toHaveLength(3);
    expect(res.edges[2].node.first_name).toBe('Joseph');
    expect(res.pageInfo.hasPreviousPage).toBe(true);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res).toMatchSnapshot();
  });

  it('selects the second row when selecting one before the third row', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        beforeCursor: all.edges[2].cursor,
        last: 1,
      },
    });

    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]).toEqual(all.edges[1]);
    expect(res.pageInfo.hasPreviousPage).toBe(true);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res).toMatchSnapshot();
  });

  it('returns nothing when selecting after the last row', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        afterCursor: all.edges[all.edges.length - 1].cursor,
        first: 1,
      },
    });

    expect(res.edges).toHaveLength(0);
    expect(res.pageInfo.hasPreviousPage).toBe(false);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res.pageInfo.startCursor).toBe(null);
    expect(res.pageInfo.endCursor).toBe(null);
    expect(res).toMatchSnapshot();
  });

  it('selects last 2 rows when selecting 2 after the third row', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        afterCursor: all.edges[2].cursor,
        first: 2,
      },
    });

    expect(res.edges).toHaveLength(2);
    expect(res.edges[1]).toEqual(all.edges[4]);
    expect(res.pageInfo.hasPreviousPage).toBe(false);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res).toMatchSnapshot();
  });

  it('selects rows 2-3 when requesting the last 2 of first 3', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        first: 3,
        last: 2,
      },
    });

    expect(res.edges).toHaveLength(2);
    expect(res.edges[0]).toEqual(all.edges[1]);
    expect(res.edges[1]).toEqual(all.edges[2]);
    expect(res.pageInfo.hasPreviousPage).toBe(true);
    expect(res.pageInfo.hasNextPage).toBe(true);
    expect(res).toMatchSnapshot();
  });

  it('selects rows 4-5 when requesting the last 2 of first 5', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        first: 5,
        last: 2,
      },
    });

    expect(res.edges).toHaveLength(2);
    expect(res.edges[0]).toEqual(all.edges[3]);
    expect(res.edges[1]).toEqual(all.edges[4]);
    expect(res.pageInfo.hasPreviousPage).toBe(true);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res).toMatchSnapshot();
  });

  it('selects the second row when selecting after the first row but before the third row', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        afterCursor: all.edges[0].cursor,
        beforeCursor: all.edges[2].cursor,
        first: Infinity,
      },
    });

    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]).toEqual(all.edges[1]);
    expect(res.pageInfo.hasPreviousPage).toBe(false);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res).toMatchSnapshot();
  });

  it('selects the second and third row when selecting after the first row but before the fourth row', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        afterCursor: all.edges[0].cursor,
        beforeCursor: all.edges[3].cursor,
        first: Infinity,
      },
    });

    expect(res.edges).toHaveLength(2);
    expect(res.edges[0]).toEqual(all.edges[1]);
    expect(res.edges[1]).toEqual(all.edges[2]);
    expect(res.pageInfo.hasPreviousPage).toBe(false);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res).toMatchSnapshot();
  });

  it('selects the second row when selecting the first one after the first row but before the fourth row', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        afterCursor: all.edges[0].cursor,
        beforeCursor: all.edges[3].cursor,
        first: 1,
      },
    });

    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]).toEqual(all.edges[1]);
    expect(res.pageInfo.hasPreviousPage).toBe(false);
    expect(res.pageInfo.hasNextPage).toBe(true);
    expect(res).toMatchSnapshot();
  });

  it('selects the third row when selecting the last one after the first row but before the fourth row', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        afterCursor: all.edges[0].cursor,
        beforeCursor: all.edges[3].cursor,
        last: 1,
      },
    });

    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]).toEqual(all.edges[2]);
    expect(res.pageInfo.hasPreviousPage).toBe(true);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res).toMatchSnapshot();
  });

  it('accepts a raw `beforeCursor`', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        beforeCursor: rawCursor(all[edgesWithRawCursorSymbol][3].rawCursor),
        last: 1,
      },
    });

    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]).toEqual(all.edges[2]);
    expect(res.pageInfo.hasPreviousPage).toBe(true);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res).toMatchSnapshot();
  });

  it('accepts a raw `afterCursor`', async () => {
    const all = await go({
      query: {
        first: Infinity,
      },
    });

    const res = await go({
      query: {
        afterCursor: rawCursor(all[edgesWithRawCursorSymbol][2].rawCursor),
        first: 1,
      },
    });

    expect(res.edges).toHaveLength(1);
    expect(res.edges[0]).toEqual(all.edges[3]);
    expect(res.pageInfo.hasPreviousPage).toBe(false);
    expect(res.pageInfo.hasNextPage).toBe(true);
    expect(res).toMatchSnapshot();
  });

  it('allows the `cursorSecret` to be omitted', async () => {
    const all = await go<false>({
      query: {
        first: Infinity,
      },
      setup: {
        cursorSecret: null,
      },
    });

    expect('cursor' in all.edges[0]).toBe(false);
    expect('startCursor' in all.pageInfo).toBe(false);
    expect('endCursor' in all.pageInfo).toBe(false);

    await expect(
      async () =>
        await go<false>({
          query: {
            // @ts-expect-error: cursor cannot be string when no secret
            beforeCursor: '',
            first: Infinity,
          },
          setup: {
            cursorSecret: null,
          },
        }),
    ).rejects.toThrowError(
      'String cursor not supported when no `cursorSecret` is provided',
    );
  });

  it('supports fully qualified column names', async () => {
    const res = await go({
      query: {
        first: 1,
        sortFields: [{ field: 'users.id', order: Asc }],
      },
    });

    expect(res.edges).toHaveLength(1);
    expect(res.edges[0].node.id).toBe(1);
    expect(res).toMatchSnapshot();
  });

  it('supports field aliases', async () => {
    const res = await go({
      query: {
        first: 1,
        sortFields: [
          { field: { alias: 'email_alias', name: 'email' }, order: Asc },
        ],
      },
    });

    expect(res.edges).toHaveLength(1);
    expect(res.edges[0].node.email_alias).toBe('diam.vel@outlook.edu');
    expect(res).toMatchSnapshot();
  });

  describe('errors', () => {
    it('throws an error if `afterCursor` was for a different sort config', async () => {
      const all = await go({
        query: {
          first: Infinity,
        },
      });

      await expect(
        async () =>
          await go({
            query: {
              afterCursor: all.edges[0].cursor,
              first: 1,
              sortFields: [{ field: 'email', order: Asc }],
            },
          }),
      ).rejects.toThrowError(ErrAfterCursorWrongSortConfig);
    });

    it('throws an error if `beforeCursor` was for a different sort config', async () => {
      const all = await go({
        query: {
          first: Infinity,
        },
      });

      await expect(
        async () =>
          await go({
            query: {
              beforeCursor: all.edges[0].cursor,
              last: 1,
              sortFields: [
                { field: 'email', order: Asc },
                { field: 'last_name', order: Asc },
                { field: 'id', order: Asc },
              ],
            },
          }),
      ).rejects.toThrowError(ErrBeforeCursorWrongSortConfig);
    });

    it('throws an error if `first` and `last` missing', async () => {
      await expect(
        async () =>
          await go({
            query: {},
          }),
      ).rejects.toThrowError(ErrFirstOrLastRequired);
    });

    it('throws an error if `first` not an integer', async () => {
      await expect(
        async () =>
          await go({
            query: {
              first: 0.5,
            },
          }),
      ).rejects.toThrowError(ErrFirstNotInteger);
    });

    it('throws an error if `last` not an integer', async () => {
      await expect(
        async () =>
          await go({
            query: {
              last: 0.5,
            },
          }),
      ).rejects.toThrowError(ErrLastNotInteger);
    });

    it('throws an error if `first` is out of range', async () => {
      await expect(
        async () =>
          await go({
            query: {
              first: 0,
            },
          }),
      ).rejects.toThrowError(ErrFirstOutOfRange);
    });

    it('throws an error if `last` is out of range', async () => {
      await expect(
        async () =>
          await go({
            query: {
              last: 0,
            },
          }),
      ).rejects.toThrowError(ErrLastOutOfRange);
    });

    it('throws an error if `first` is not greater than `last`', async () => {
      await expect(
        async () =>
          await go({
            query: {
              first: 2,
              last: 2,
            },
          }),
      ).rejects.toThrowError(ErrFirstNotGreaterThanLast);
    });

    it('throws an error if `beforeCursor` is invalid', async () => {
      await expect(
        async () =>
          await go({
            query: {
              beforeCursor: 'invalid',
              last: 1,
            },
          }),
      ).rejects.toThrowError(ErrBeforeCursorInvalid);
    });

    it('throws an error if `afterCursor` is invalid', async () => {
      await expect(
        async () =>
          await go({
            query: {
              afterCursor: 'invalid',
              first: 1,
            },
          }),
      ).rejects.toThrowError(ErrAfterCursorInvalid);
    });

    it('throws an error if raw cursor passed directly', async () => {
      const all = await go({
        query: {
          first: Infinity,
        },
      });

      await expect(
        async () =>
          await go({
            query: {
              // @ts-expect-error raw cursor not wrapped
              afterCursor: all[edgesWithRawCursorSymbol][0].rawCursor,
              first: 1,
            },
          }),
      ).rejects.toThrowError(
        'Invalid cursor. Raw cursors must be wrapped with `rawCursor()`',
      );

      await expect(
        async () =>
          await go({
            query: {
              // @ts-expect-error raw cursor not wrapped
              beforeCursor: all[edgesWithRawCursorSymbol][0].rawCursor,
              last: 1,
            },
          }),
      ).rejects.toThrowError(
        'Invalid cursor. Raw cursors must be wrapped with `rawCursor()`',
      );
    });

    it('throws an error if `beforeCursor` is for wrong query', async () => {
      const all = await go({
        query: {
          first: Infinity,
        },
      });

      await expect(
        async () =>
          await go({
            query: {
              beforeCursor: all.edges[0].cursor,
              last: 1,
            },
            setup: {
              queryName: 'AnotherQuery',
            },
          }),
      ).rejects.toThrowError(ErrBeforeCursorWrongQuery);
    });

    it('throws an error if `afterCursor` is for wrong query', async () => {
      const all = await go({
        query: {
          first: Infinity,
        },
      });

      await expect(
        async () =>
          await go({
            query: {
              afterCursor: all.edges[0].cursor,
              first: 1,
            },
            setup: {
              queryName: 'AnotherQuery',
            },
          }),
      ).rejects.toThrowError(ErrAfterCursorWrongQuery);
    });

    it('throws an error if too many nodes requested', async () => {
      await expect(
        async () =>
          await go({
            query: {
              first: 3,
              last: 2,
            },
            setup: {
              maxNodes: 2,
            },
          }),
      ).rejects.toThrowError(ErrTooManyNodes);
    });

    it('throws an error if `sortFields` is invalid', async () => {
      await expect(
        async () =>
          await go({
            query: {
              first: 1,
              sortFields: [],
            },
          }),
      ).rejects.toThrowError('Array must contain at least 1 element(s)');

      await expect(
        async () =>
          await go({
            query: {
              first: 1,
              sortFields: [{ field: '!', order: Asc }],
            },
          }),
      ).rejects.toThrowError('Invalid field name');

      await expect(
        async () =>
          await go({
            query: {
              first: 1,
              // @ts-expect-error invalid order
              sortFields: [{ field: 'a', order: 'oops' }],
            },
          }),
      ).rejects.toThrowError(
        "Invalid enum value. Expected 'asc' | 'desc', received 'oops'",
      );

      await expect(
        async () =>
          await go({
            query: {
              first: 1,
              sortFields: [
                { field: 'first_name', order: 'asc' },
                { field: 'first_name', order: 'asc' },
              ],
            },
          }),
      ).rejects.toThrowError('Duplicate fields are not allowed');
    });

    it('throws an error if a duplicate cursor is created', async () => {
      await expect(
        async () =>
          await go({
            query: {
              first: Infinity,
              sortFields: [{ field: 'first_name', order: Asc }],
            },
          }),
      ).rejects.toThrowError(
        'Duplicate cursor. Cursors must be unique. Ensure you are including a unique field in `sortFields`. E.g. the primary `id` field',
      );
    });

    it('throws an error if field missing', async () => {
      await expect(
        async () =>
          await go({
            query: {
              first: Infinity,
            },
            setup: {
              // @ts-expect-error missing row props
              runQuery: async ({
                limit,
                whereFragmentBuilder,
                orderByFragmentBuilder,
              }) => {
                void limit;
                whereFragmentBuilder.withArrayBindings();
                orderByFragmentBuilder.withArrayBindings();
                await Promise.resolve();
                return [{}];
              },
            },
          }),
      ).rejects.toThrowError('"first_name" field is missing');
    });

    it('throws an error if too many rows returned', async () => {
      await expect(
        async () =>
          await go({
            query: {
              first: 1,
            },
            setup: {
              runQuery: async ({
                limit,
                whereFragmentBuilder,
                orderByFragmentBuilder,
              }) => {
                void limit;
                whereFragmentBuilder.withArrayBindings();
                orderByFragmentBuilder.withArrayBindings();
                await Promise.resolve();
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
                return [{}, {}, {}] as any;
              },
            },
          }),
      ).rejects.toThrowError(
        'Query returned too many rows. Did you forget to add the `LIMIT`?',
      );
    });

    it('throws an error if limit is not requested', async () => {
      await expect(
        async () =>
          await go({
            query: {
              first: 1,
            },
            setup: {
              runQuery: async ({
                whereFragmentBuilder,
                orderByFragmentBuilder,
              }) => {
                whereFragmentBuilder.withArrayBindings();
                orderByFragmentBuilder.withArrayBindings();
                await Promise.resolve();
                return [];
              },
            },
          }),
      ).rejects.toThrowError(
        'You need to request the limit from `limit` and add it to the query',
      );
    });

    it('throws an error if the where fragment is not requested', async () => {
      await expect(
        async () =>
          await go({
            query: {
              first: 1,
            },
            setup: {
              runQuery: async ({ limit, orderByFragmentBuilder }) => {
                void limit;
                orderByFragmentBuilder.withArrayBindings();
                await Promise.resolve();
                return [];
              },
            },
          }),
      ).rejects.toThrowError(
        'You need to request the `WHERE` fragment from `whereFragmentBuilder` and add it to the query',
      );
    });

    it('throws an error if the order by fragment is not requested', async () => {
      await expect(
        async () =>
          await go({
            query: {
              first: 1,
            },
            setup: {
              runQuery: async ({ limit, whereFragmentBuilder }) => {
                void limit;
                whereFragmentBuilder.withArrayBindings();
                await Promise.resolve();
                return [];
              },
            },
          }),
      ).rejects.toThrowError(
        'You need to request the `ORDER BY` fragment from `orderByFragmentBuilder` and add it to the query',
      );
    });
  });
});
