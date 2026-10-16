interface DurableObjectSqlCursor<Row> extends Iterable<Row> {
  toArray(): Row[]
}

interface DurableObjectStorage {
  get(key: string): Promise<unknown>
  put(key: string, value: unknown): Promise<void>
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

interface WebSocket {
  accept(): void
}

declare const WebSocketPair: {
  new(): { 0: WebSocket; 1: WebSocket }
}

interface Response {
  readonly webSocket?: WebSocket | null
}

interface ResponseInit {
  webSocket?: WebSocket | null
}
