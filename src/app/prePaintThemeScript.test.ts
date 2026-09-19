import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { resolvePrePaintTheme } from './prePaintTheme'

const html = readFileSync(
  new URL('../../index.html', import.meta.url),
  'utf8',
)
const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1]

if (!inlineScript) {
  throw new Error('The pre-paint theme script was not found')
}

const executeInlineScript = ({
  fragment,
  storedPreferences,
  legacyTheme,
  systemDark,
}: {
  fragment: string
  storedPreferences: string | null
  legacyTheme: string | null
  systemDark: boolean
}) => {
  const values = new Map<string, string>()
  if (storedPreferences !== null) {
    values.set('livetrafficstan.preferences.v1', storedPreferences)
  }
  if (legacyTheme !== null) {
    values.set('livetrafficstan.theme', legacyTheme)
  }
  const documentElement = {
    dataset: { theme: 'light' },
    style: { colorScheme: 'light' },
  }
  const meta = {
    content: '#dce8ec',
    setAttribute: (_name: string, value: string) => {
      meta.content = value
    },
  }
  runInNewContext(inlineScript, {
    URLSearchParams,
    location: { hash: fragment },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
    },
    matchMedia: () => ({ matches: systemDark }),
    document: {
      documentElement,
      querySelector: () => meta,
    },
  })
  return documentElement.dataset.theme
}

describe('inline pre-paint theme script', () => {
  it('matches the runtime resolver for precedence and invalid inputs', () => {
    const fixtures = [
      {
        fragment: '#v=1&theme=dark',
        storedPreferences: '{"version":1,"theme":"light"}',
        legacyTheme: 'light',
        systemDark: false,
      },
      {
        fragment: '#v=1&theme=dark&radius=50',
        storedPreferences: '{"version":1,"theme":"auto"}',
        legacyTheme: 'dark',
        systemDark: true,
      },
      {
        fragment:
          '#v=1&lat=59.437123&lon=24.754987&zoom=8.246&bearing=12.34&pitch=4.56&theme=dark',
        storedPreferences: '{"version":1,"theme":"light"}',
        legacyTheme: 'light',
        systemDark: false,
      },
      {
        fragment: '#v=1&theme=dark&vesselMinLength=25.0',
        storedPreferences: '{"version":1,"theme":"light"}',
        legacyTheme: 'dark',
        systemDark: false,
      },
      {
        fragment: '#v=1&theme=dark&vesselMaxLength=24.0',
        storedPreferences: '{"version":1,"theme":"light"}',
        legacyTheme: 'dark',
        systemDark: false,
      },
      {
        fragment: '#v=1&theme=dark&trailMinutes=15.0',
        storedPreferences: '{"version":1,"theme":"light"}',
        legacyTheme: 'dark',
        systemDark: false,
      },
      {
        fragment: '',
        storedPreferences: '{bad',
        legacyTheme: 'dark',
        systemDark: false,
      },
      {
        fragment: '',
        storedPreferences: null,
        legacyTheme: 'auto',
        systemDark: true,
      },
    ]

    for (const fixture of fixtures) {
      expect(executeInlineScript(fixture)).toBe(
        resolvePrePaintTheme(fixture),
      )
    }
  })
})
