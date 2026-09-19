export type HistoryInvalidationOperation =
  | 'write'
  | 'clear'
  | 'disable'
  | 'enable'
  | 'retention'

export interface HistoryInvalidationMessage {
  version: 1
  source: string
  revision: number
  operation: HistoryInvalidationOperation
  epoch?: number
  clearedAt?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isOperation = (
  value: unknown,
): value is HistoryInvalidationOperation =>
  value === 'write' ||
  value === 'clear' ||
  value === 'disable' ||
  value === 'enable' ||
  value === 'retention'

export const parseHistoryInvalidation = (
  value: unknown,
): HistoryInvalidationMessage | undefined => {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.source !== 'string' ||
    value.source.length === 0 ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 1 ||
    !isOperation(value.operation)
  ) {
    return undefined
  }

  const epoch =
    Number.isInteger(value.epoch) && (value.epoch as number) >= 0
      ? (value.epoch as number)
      : undefined
  const clearedAt =
    typeof value.clearedAt === 'number' &&
    Number.isFinite(value.clearedAt) &&
    value.clearedAt > 0
      ? value.clearedAt
      : undefined

  if (
    (value.operation === 'clear' && clearedAt === undefined) ||
    ((value.operation === 'clear' || value.operation === 'disable') &&
      epoch === undefined)
  ) {
    return undefined
  }

  return {
    version: 1,
    source: value.source,
    revision: value.revision as number,
    operation: value.operation,
    epoch,
    clearedAt,
  }
}

export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
