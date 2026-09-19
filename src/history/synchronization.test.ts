import { describe, expect, it } from 'vitest'
import {
  parseHistoryInvalidation,
  SerialTaskQueue,
} from './synchronization'

describe('history synchronization', () => {
  it('accepts typed destructive invalidations and rejects incomplete ones', () => {
    expect(
      parseHistoryInvalidation({
        version: 1,
        source: 'tab-a',
        revision: 2,
        operation: 'clear',
        epoch: 3,
        clearedAt: 10_000,
      }),
    ).toMatchObject({
      operation: 'clear',
      epoch: 3,
      clearedAt: 10_000,
    })
    expect(
      parseHistoryInvalidation({
        version: 1,
        source: 'tab-a',
        revision: 3,
        operation: 'clear',
      }),
    ).toBeUndefined()
    expect(
      parseHistoryInvalidation({
        version: 1,
        source: 'tab-a',
        revision: 4,
        operation: 'disable',
      }),
    ).toBeUndefined()
  })

  it('serializes passive and explicit repository work in request order', async () => {
    const queue = new SerialTaskQueue()
    const order: string[] = []
    let releasePassive: () => void = () => undefined
    const passiveGate = new Promise<void>((resolve) => {
      releasePassive = resolve
    })

    const passive = queue.run(async () => {
      order.push('passive-start')
      await passiveGate
      order.push('passive-end')
    })
    const mutation = queue.run(async () => {
      order.push('mutation')
    })

    await Promise.resolve()
    expect(order).toEqual(['passive-start'])
    releasePassive()
    await Promise.all([passive, mutation])
    expect(order).toEqual([
      'passive-start',
      'passive-end',
      'mutation',
    ])
  })
})
