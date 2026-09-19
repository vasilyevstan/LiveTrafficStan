import { describe, expect, it } from 'vitest'
import { isFailedInitialInstall } from './useAppShell'

describe('application-shell lifecycle', () => {
  it('reports only a redundant first installation as failed', () => {
    expect(isFailedInitialInstall('redundant', false, false)).toBe(true)
    expect(isFailedInitialInstall('installed', false, false)).toBe(false)
    expect(isFailedInitialInstall('redundant', true, false)).toBe(false)
    expect(isFailedInitialInstall('redundant', false, true)).toBe(false)
  })
})
