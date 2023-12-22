export class SqlCursorPaginationError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

export class ErrUnexpected extends SqlCursorPaginationError {
  constructor(message: string) {
    super('ErrUnexpected', message);
  }
}

export class SqlCursorPaginationQueryError extends SqlCursorPaginationError {}

export class ErrFirstOrLastRequired extends SqlCursorPaginationQueryError {
  constructor() {
    super('ErrFirstOrLastRequired', 'One of `first`/`last` required');
  }
}

export class ErrFirstNotInteger extends SqlCursorPaginationQueryError {
  constructor() {
    super('ErrFirstNotInteger', '`first` must be an integer');
  }
}

export class ErrLastNotInteger extends SqlCursorPaginationQueryError {
  constructor() {
    super('ErrLastNotInteger', '`last` must be an integer');
  }
}

export class ErrFirstOutOfRange extends SqlCursorPaginationQueryError {
  constructor() {
    super('ErrFirstOutOfRange', '`first` must be > 0');
  }
}

export class ErrLastOutOfRange extends SqlCursorPaginationQueryError {
  constructor() {
    super('ErrLastOutOfRange', '`last` must be > 0');
  }
}

export class ErrFirstNotGreaterThanLast extends SqlCursorPaginationQueryError {
  constructor() {
    super('ErrFirstNotGreaterThanLast', '`first` must be > `last`');
  }
}

export class ErrBeforeCursorInvalid extends SqlCursorPaginationQueryError {
  constructor() {
    super('ErrBeforeCursorInvalid', '`beforeCursor` invalid');
  }
}

export class ErrAfterCursorInvalid extends SqlCursorPaginationQueryError {
  constructor() {
    super('ErrAfterCursorInvalid', '`afterCursor` invalid');
  }
}

export class ErrTooManyNodes extends SqlCursorPaginationQueryError {
  constructor({ maxNodes }: { maxNodes: number }) {
    super(
      'ErrTooManyNodes',
      `Too many nodes requested. The limit is ${maxNodes}`,
    );
  }
}

export class ErrBeforeCursorWrongQuery extends SqlCursorPaginationQueryError {
  constructor() {
    super(
      'ErrBeforeCursorWrongQuery',
      '`beforeCursor` created for different query',
    );
  }
}

export class ErrAfterCursorWrongQuery extends SqlCursorPaginationQueryError {
  constructor() {
    super(
      'ErrAfterCursorWrongQuery',
      '`afterCursor` created for different query',
    );
  }
}

export class ErrBeforeCursorWrongSortConfig extends SqlCursorPaginationQueryError {
  constructor() {
    super(
      'ErrBeforeCursorWrongSortConfig',
      '`beforeCursor` cursor created for different sort configuration',
    );
  }
}

export class ErrAfterCursorWrongSortConfig extends SqlCursorPaginationQueryError {
  constructor() {
    super(
      'ErrAfterCursorWrongSortConfig',
      '`afterCursor` cursor created for different sort configuration',
    );
  }
}
