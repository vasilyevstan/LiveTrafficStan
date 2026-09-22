interface DurableObjectSqlCursor<Row> extends Iterable<Row> {
  toArray(): Row[]
}

interface DurableObjectStorage {
  readonly sql: {
    exec<Row>(
      query: string,
      ...bindings: Array<string | number | null>
    ): DurableObjectSqlCursor<Row>
  }
  transactionSync<Result>(callback: () => Result): Result
}

interface DurableObjectState {
  readonly storage: DurableObjectStorage
}
