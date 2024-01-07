# SQL Cursor Pagination

Are you running a service, using an SQL database, and want to support cursor style pagination? This library can help!

## How it works

1. When a request comes in you call the library with a `query` object containing how many items to fetch (`first`/`last`), where to fetch from (`beforeCursor`/`afterCursor`) and the sort config (`sortFields`), along with a `setup` object.
2. The `runQuery` function you provided in `setup` is invoked, and provided with a `limit`, `whereFragmentBuilder` and `orderByFragmentBuilder`. You integrate these into your query, run it, and then return the results.
3. The library takes the results, and for each one it generates a unique `cursor`, which it then returns alongside each row. It also returns `hasNextPage`/`hasPreviousPage` properties.

## What is cursor pagination?

Cursor pagination was made popular by GraphQL, and this library conforms to the [GraphQL Cursor Connections Specification
](https://relay.dev/graphql/connections.htm) meaning it's compatible wtih [Relay](https://relay.dev/). However it is also useful outside of GraphQL.

- First you specify the sort config. This contains a list of field names with their orders. It must contain a unique key.
- Then you request how many items you would like to fetch with `first`.
- Each item you get back also contains an opaque string cursor. The cursor is an encrypted string that contains the sort config along with the value of each field in the sort config.
- To fetch the next set of items you make a new request with `first` and `afterCursor` being the cursor of the last item you received.

If you want to fetch items in reverse order you can use `last` and `beforeCursor` instead.

The use of cursors means if items are added/removed between requests, the user will never see the same item twice.

## Usage

The following shows how you could use this library with [knex](https://github.com/knex/knex) as an example, but it should be possible with any query builder, or even raw SQL providing you are using prepared statements.

```ts
import knex from 'knex';
import {
  withPagination,
  Order,
  buildCursorSecret,
} from 'sql-cursor-pagination';

const db = knex({
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

// Imagine this gets called from a user request and the user was able to
// choose a sort order and also whether it should show admins or none admins.
// They also request now many rows they want and the cursor to start from.
async function fetchUsers(userInput: {
  order: Order;
  admins: boolean;
  first?: number;
  last?: number;
  beforeCursor?: string;
  afterCursor?: string;
}) {
  const query = db('users').where('admin', userInput.admins);

  const { edges, pageInfo } = await withPagination({
    query: {
      sortFields: [
        { field: 'first_name', order: userInput.order },
        { field: 'last_name', order: userInput.order },
        { field: 'id', order: userInput.order },
      ],
      first: userInput.first,
      last: userInput.last,
      beforeCursor: userInput.beforeCursor,
      afterCursor: userInput.afterCursor,
    },
    setup: {
      // generate one with `npx -p sql-cursor-pagination generate-secret`
      cursorSecret: buildCursorSecret('somethingSecret'),
      queryName: 'users',
      runQuery: async ({
        limit,
        whereFragmentBuilder,
        orderByFragmentBuilder,
      }) => {
        const whereFragment = whereFragmentBuilder.withArrayBindings();
        const orderByFragment = orderByFragmentBuilder.withArrayBindings();

        const rows = await query
          .limit(limit)
          .whereRaw(whereFragment.sql, where.bindings)
          .orderByRaw(orderByFragment.sql, orderBy.bindings)
          .select();

        return rows;
      },
    },
  });

  return { edges, pageInfo };
}
```

## Return value

The result is a promise that resolves with an object containing `edges` and `pageInfo` properties.

`edges` is an array of objects containing `cursor` and `node` properties, where `cursor` is the generated cursor for the `node`, and `node` is the object you returned for the row from `runQuery`.

`pageInfo` contains `hasNextPage` and `hasPreviousPage` properties.

E.g.

```json
{
  "edges": [
    {
      "cursor": "SuWlzjWxdtSVDzgPp_mVdQH7S4pbbIpNqmJJFWwXOws.9732ntsWW_36ePfEiU1_85i4VHGpnlt60LcekRaV6hZiIfLaDEJyTxv4_mT0gVYjC05he25PbktssRXIQMdfnwfl2PkS47CW75s-XwbfYuhuaZJZfUpZLW5O7xVWf5R2YD7FEdd53lDlXJDbEE5TvRvM8TNkhCSh8LTnJEFNqADHkbWz-H7pDPOaOBsLE3n_EUYcf498pgjPJCRN",
      "node": {
        "id": 1,
        "first_name": "Joe",
        "last_name": "Bloggs",
        "admin": false
      }
    }
  ],
  "pageInfo": {
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

## Input

### Query

| Property       | Type                                          | Required                  | Description                                                                                                                                                                                                                                                       |
| -------------- | --------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first`        | `number`                                      | If `last` isn't present.  | The number of rows to fetch from the start of the window.                                                                                                                                                                                                         |
| `last`         | `number`                                      | If `first` isn't present. | The number of rows to fetch from the end of the window.                                                                                                                                                                                                           |
| `sortFields`   | `{ field: string, order: 'asc' \| 'desc' }[]` | Yes                       | This takes an array of objects which have `field` and `order` properties. There must be at least one entry and you must include an entry that maps to a unique key, otherwise it's possible for there to be cursor collisions, which will result in an exception. |
| `afterCursor`  | `string`                                      | No                        | The window will cover the row after the provided cursor, and later rows. This takes the string `cursor` from a previous result`.                                                                                                                                  |
| `beforeCursor` | `string`                                      | No                        | The window will cover the row before the provided cursor, and earlier rows. This takes the string `cursor` from a previous result.                                                                                                                                |

### Setup

| Property                      | Type           | Required | Description                                                                                                                                                                                                                                        |
| ----------------------------- | -------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runQuery`                    | `function`     | Yes      | This function is responsible for running the database query, and returning the array of rows. It is provided with a `QueryContent` object which contains a `WHERE` fragment, `ORDER BY` fragment and `limit`, which must be included in the query. |
| `queryName`                   | `string`       | Yes      | A name for this query. It should be unique to the query, and is used to bind the cursors to it. This prevents a cursor that was created for another query being used for this one.                                                                 |
| `cursorSecret`                | `CursorSecret` | Yes      | The secret that is used to encrypt the cursor, created from `buildCursorSecret(secret: string)`. Must be at least 30 characters. Generate one with `npx -p sql-cursor-pagination generate-secret`.                                                 |
| `maxNodes`                    | `number`       | No       | The maximum number of allowed rows in the response before the `ErrTooManyNodes` error is thrown. _Default: 100_                                                                                                                                    |
| `cursorGenerationConcurrency` | `number`       | No       | The maximum number of cursors to generate in parallel. _Default: 10_                                                                                                                                                                               |

## Query Fragments

The `whereFragmentBuilder`/`orderByFragmentBuilder` objects provide the following functions:

- `withArrayBindings`: This returns `bindings` as an array. The first argument takes a string placeholder (default: `?`), or a function that receives the index and returns a string.
- `withObjectBindings`: This returns a `bindings` object. You need to provide a function that receives the index and returns a string.

## Errors

This library exports various error objects. `SqlCursorPaginationQueryError` will be thrown if the `first`/`last`/`beforeCursor`/`afterCursor` properties are the correct javascript type, but the contents is not valid.

E.g. `ErrFirstNotInteger` is thrown if `first` was a `number`, but not an integer. `ErrBeforeCursorWrongQuery` is thrown if the provided `beforeCursor` was a valid cursor, but for a different query. You may want to map these errors to HTTP 400 responses.

## I want the raw cursor

If you want the raw cursor, maybe to build a string version yourself, you can access this by using the exported `edgesWithRawCursorSymbol` symbol on the returned object. The objects in this array will expose a `rawCursor` property.

```ts
const edgesWithRawCursor = res[edgesWithRawCursorSymbol];
console.log(edgesWithRawCursor[0].rawCursor);
```

This can then be provided to `beforeCursor`/`afterCursor` by wrapping the object with `rawCursor(object)`.

You can also omit the `cursorSecret` and `cursor` will not be generated.
