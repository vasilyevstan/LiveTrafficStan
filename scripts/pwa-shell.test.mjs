import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import {
  assertShellBudget,
  classifyShellRequest,
  collectShellEntries,
  ownedCachesToDelete,
  renderRetirementServiceWorker,
  renderServiceWorker,
  shellVersion,
} from './pwa-shell.mjs'

const createWorkerHarness = ({
  initialCaches = {},
  activeCacheName,
  initialCacheHeaders = {},
  failAddAll = false,
} = {}) => {
  const listeners = new Map()
  const stores = new Map(
    Object.entries(initialCaches).map(([name, urls]) => [
      name,
      new Set(urls),
    ]),
  )
  const responseHeaders = new Map(
    [...stores.keys()].map((name) => [
      name,
      new Map(
        [
          ...Object.entries(initialCacheHeaders[name] ?? {}),
          ...(name === activeCacheName
            ? [['x-livetrafficstan-active-cache', '1']]
            : []),
        ],
      ),
    ]),
  )
  class Headers {
    constructor(initial = undefined) {
      this.values = new Map()
      if (initial instanceof Headers) {
        this.values = new Map(initial.values)
      } else if (
        initial &&
        typeof initial[Symbol.iterator] === 'function'
      ) {
        for (const [name, value] of initial) {
          this.set(name, value)
        }
      } else if (initial) {
        for (const [name, value] of Object.entries(initial)) {
          this.set(name, value)
        }
      }
    }

    delete(name) {
      this.values.delete(name.toLowerCase())
    }

    get(name) {
      return this.values.get(name.toLowerCase()) ?? null
    }

    set(name, value) {
      this.values.set(name.toLowerCase(), String(value))
    }
  }
  class Response {
    constructor(
      body = new ArrayBuffer(0),
      { status = 200, statusText = 'OK', headers = undefined } = {},
    ) {
      this.body = body
      this.status = status
      this.statusText = statusText
      this.headers =
        headers instanceof Headers ? headers : new Headers(headers)
    }

    async arrayBuffer() {
      return this.body instanceof ArrayBuffer
        ? this.body
        : new ArrayBuffer(0)
    }
  }
  const claims = vi.fn(async () => undefined)
  const skipWaiting = vi.fn(async () => undefined)
  const unregister = vi.fn(async () => true)
  const windows = [
    {
      url: 'https://example.test/',
      postMessage: vi.fn(),
      navigate: vi.fn(async () => undefined),
    },
  ]
  const cacheFor = (name) => ({
    addAll: async (urls) => {
      if (failAddAll) throw new Error('precache failed')
      const store = stores.get(name)
      for (const url of urls) store.add(url)
    },
    match: async (request) => {
      const key = typeof request === 'string' ? request : request.url
      if (!stores.get(name).has(key)) return undefined
      return new Response(new ArrayBuffer(0), {
        headers:
          key === '/'
            ? new Headers(responseHeaders.get(name))
            : undefined,
      })
    },
    put: async (request, response) => {
      const key = typeof request === 'string' ? request : request.url
      stores.get(name).add(key)
      if (key === '/') {
        responseHeaders.set(name, new Map(response.headers.values))
      }
    },
  })
  const context = {
    URL,
    Headers,
    Response,
    Set,
    Promise,
    Error,
    fetch: vi.fn(async (request) => ({ network: request.url })),
    setTimeout: (callback) => {
      callback()
      return 0
    },
    caches: {
      keys: async () => [...stores.keys()],
      open: async (name) => {
        if (!stores.has(name)) {
          stores.set(name, new Set())
          responseHeaders.set(name, new Map())
        }
        return cacheFor(name)
      },
      delete: async (name) => {
        responseHeaders.delete(name)
        return stores.delete(name)
      },
    },
    self: {
      location: { origin: 'https://example.test' },
      registration: { unregister },
      clients: {
        claim: claims,
        matchAll: vi.fn(async () => windows),
      },
      skipWaiting,
      addEventListener: (type, listener) => listeners.set(type, listener),
    },
  }
  const dispatch = async (type, event = {}) => {
    const waits = []
    listeners.get(type)?.({
      ...event,
      waitUntil: (promise) => waits.push(promise),
    })
    await Promise.allSettled(waits).then((results) => {
      const rejected = results.find((result) => result.status === 'rejected')
      if (rejected) throw rejected.reason
    })
  }
  return {
    context,
    dispatch,
    stores,
    claims,
    skipWaiting,
    unregister,
    windows,
    responseHeaders,
  }
}

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'livetrafficstan-pwa-'))
  await mkdir(join(root, 'assets'), { recursive: true })
  await mkdir(join(root, 'icons'), { recursive: true })
  await Promise.all([
    writeFile(join(root, 'index.html'), '<main>shell</main>'),
    writeFile(join(root, 'manifest.webmanifest'), '{}'),
    writeFile(join(root, 'favicon.svg'), '<svg/>'),
    writeFile(join(root, 'icons/livetrafficstan-192-v1.png'), '192'),
    writeFile(join(root, 'icons/livetrafficstan-512-v1.png'), '512'),
    writeFile(join(root, 'assets/app-ABC.js'), 'app'),
    writeFile(join(root, 'assets/map-worker-XYZ.js'), 'worker'),
  ])
  return root
}

describe('PWA shell generation', () => {
  it('builds a deterministic allowlist without private or provider data', async () => {
    const root = await createFixture()
    const entries = await collectShellEntries(root)
    const urls = entries.map((entry) => entry.url)

    expect(urls).toEqual([
      '/',
      '/assets/app-ABC.js',
      '/assets/map-worker-XYZ.js',
      '/favicon.svg',
      '/icons/livetrafficstan-192-v1.png',
      '/icons/livetrafficstan-512-v1.png',
      '/index.html',
      '/manifest.webmanifest',
    ])
    expect(shellVersion(entries)).toMatch(/^[0-9a-f]{20}$/)
    expect(shellVersion(entries, 'policy-a')).not.toBe(
      shellVersion(entries, 'policy-b'),
    )
    expect(assertShellBudget(entries, 1_024)).toBeGreaterThan(0)
    expect(() => assertShellBudget(entries, 1)).toThrow(
      /Application shell/,
    )

    const source = renderServiceWorker({
      version: shellVersion(entries),
      urls,
    })
    expect(source).not.toContain('/api/')
    expect(source).not.toContain('/aircraft-metadata/')
    expect(source).not.toContain('/airports/')
    expect(source).not.toContain('/ports/')
    expect(source).not.toContain('api.planespotters.net')
    expect(source).not.toContain('cdn.planespotters.net')
  })

  it('routes only the root document and exact shell assets', () => {
    const input = {
      method: 'GET',
      origin: 'https://example.test',
      currentShellPaths: [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/assets/app-ABC.js',
      ],
    }
    expect(
      classifyShellRequest({
        ...input,
        requestUrl: 'https://example.test/',
        mode: 'navigate',
      }),
    ).toBe('navigation')
    expect(
      classifyShellRequest({
        ...input,
        requestUrl: 'https://example.test/elsewhere',
        mode: 'navigate',
      }),
    ).toBe('bypass')
    expect(
      classifyShellRequest({
        ...input,
        requestUrl: 'https://example.test/assets/old-DEF.js',
        mode: 'no-cors',
      }),
    ).toBe('shell')
    expect(
      classifyShellRequest({
        ...input,
        requestUrl: 'https://example.test/api/aircraft',
        mode: 'cors',
      }),
    ).toBe('bypass')
    expect(
      classifyShellRequest({
        ...input,
        requestUrl: 'https://tiles.example/style.json',
        mode: 'cors',
      }),
    ).toBe('bypass')
    expect(
      classifyShellRequest({
        ...input,
        requestUrl:
          'https://api.planespotters.net/pub/photos/hex/ABC123',
        mode: 'cors',
      }),
    ).toBe('bypass')
    expect(
      classifyShellRequest({
        ...input,
        requestUrl:
          'https://cdn.planespotters.net/example/photo.jpg',
        mode: 'no-cors',
      }),
    ).toBe('bypass')
    expect(
      classifyShellRequest({
        ...input,
        requestUrl: 'https://example.test/manifest.webmanifest?stale=1',
        mode: 'cors',
      }),
    ).toBe('bypass')
  })

  it('retains only the current and recorded active predecessor caches', () => {
    expect(
      ownedCachesToDelete(
        [
          'unrelated',
          'livetrafficstan-shell-a',
          'livetrafficstan-shell-b',
          'livetrafficstan-shell-c',
        ],
        'livetrafficstan-shell-c',
        'livetrafficstan-shell-a',
      ),
    ).toEqual(['livetrafficstan-shell-b'])
  })

  it('installs atomically and claims clients only after authorization', async () => {
    const source = renderServiceWorker({
      version: 'current',
      urls: ['/', '/index.html', '/assets/app.js'],
    })
    const harness = createWorkerHarness({
      initialCaches: {
        unrelated: ['/keep'],
        'livetrafficstan-shell-oldest': ['/oldest'],
        'livetrafficstan-shell-previous': [
          '/',
          '/index.html',
          '/previous',
        ],
      },
      activeCacheName: 'livetrafficstan-shell-previous',
    })
    runInNewContext(source, harness.context)

    await harness.dispatch('install')
    expect(
      [...harness.stores.get('livetrafficstan-shell-current')],
    ).toEqual(['/', '/index.html', '/assets/app.js'])
    await harness.dispatch('activate')
    expect([...harness.stores.keys()]).toEqual([
      'unrelated',
      'livetrafficstan-shell-previous',
      'livetrafficstan-shell-current',
    ])
    expect(harness.claims).not.toHaveBeenCalled()

    await harness.dispatch('message', {
      data: { type: 'ACTIVATE_UPDATE' },
    })
    await harness.dispatch('activate')
    expect(harness.skipWaiting).toHaveBeenCalledOnce()
    expect(harness.claims).toHaveBeenCalledOnce()
  })

  it('ignores a superseded waiting cache when retaining the predecessor', async () => {
    const source = renderServiceWorker({
      version: 'current',
      urls: ['/', '/index.html', '/assets/current.js'],
    })
    const harness = createWorkerHarness({
      initialCaches: {
        'livetrafficstan-shell-active': [
          '/',
          '/index.html',
          '/assets/active.js',
        ],
        'livetrafficstan-shell-superseded': [
          '/',
          '/index.html',
          '/assets/superseded.js',
        ],
      },
      activeCacheName: 'livetrafficstan-shell-active',
    })
    runInNewContext(source, harness.context)

    await harness.dispatch('install')
    expect(
      harness.responseHeaders
        .get('livetrafficstan-shell-current')
        .get('x-livetrafficstan-predecessor-cache'),
    ).toBe('livetrafficstan-shell-active')

    await harness.dispatch('message', {
      data: { type: 'ACTIVATE_UPDATE' },
    })
    await harness.dispatch('activate')
    expect([...harness.stores.keys()]).toEqual([
      'livetrafficstan-shell-active',
      'livetrafficstan-shell-current',
    ])
    expect(
      harness.responseHeaders
        .get('livetrafficstan-shell-current')
        .get('x-livetrafficstan-active-cache'),
    ).toBe('1')
    expect(
      harness.responseHeaders
        .get('livetrafficstan-shell-active')
        .has('x-livetrafficstan-active-cache'),
    ).toBe(false)
  })

  it('preserves active metadata across a same-cache worker-only update', async () => {
    const activeCache = 'livetrafficstan-shell-active'
    const predecessorCache = 'livetrafficstan-shell-predecessor'
    const workerOnlySource = renderServiceWorker({
      version: 'active',
      urls: ['/', '/index.html', '/assets/active.js'],
    })
    const workerOnlyHarness = createWorkerHarness({
      initialCaches: {
        [predecessorCache]: [
          '/',
          '/index.html',
          '/assets/predecessor.js',
        ],
        [activeCache]: ['/', '/index.html', '/assets/active.js'],
      },
      activeCacheName: activeCache,
      initialCacheHeaders: {
        [activeCache]: {
          'x-livetrafficstan-predecessor-cache': predecessorCache,
        },
      },
    })
    runInNewContext(workerOnlySource, workerOnlyHarness.context)

    await workerOnlyHarness.dispatch('install')
    expect(
      workerOnlyHarness.responseHeaders
        .get(activeCache)
        .get('x-livetrafficstan-active-cache'),
    ).toBe('1')
    expect(
      workerOnlyHarness.responseHeaders
        .get(activeCache)
        .get('x-livetrafficstan-predecessor-cache'),
    ).toBe(predecessorCache)

    const nextSource = renderServiceWorker({
      version: 'next',
      urls: ['/', '/index.html', '/assets/next.js'],
    })
    const nextHarness = createWorkerHarness({
      initialCaches: Object.fromEntries(
        [...workerOnlyHarness.stores].map(([name, urls]) => [
          name,
          [...urls],
        ]),
      ),
      initialCacheHeaders: Object.fromEntries(
        [...workerOnlyHarness.responseHeaders].map(([name, headers]) => [
          name,
          Object.fromEntries(headers),
        ]),
      ),
    })
    runInNewContext(nextSource, nextHarness.context)

    await nextHarness.dispatch('install')
    await nextHarness.dispatch('message', {
      data: { type: 'ACTIVATE_UPDATE' },
    })
    await nextHarness.dispatch('activate')
    expect([...nextHarness.stores.keys()]).toEqual([
      activeCache,
      'livetrafficstan-shell-next',
    ])
  })

  it('leaves the active generation unchanged after a failed precache', async () => {
    const source = renderServiceWorker({
      version: 'broken',
      urls: ['/', '/missing.js'],
    })
    const harness = createWorkerHarness({
      initialCaches: {
        'livetrafficstan-shell-active': ['/', '/index.html'],
      },
      failAddAll: true,
    })
    runInNewContext(source, harness.context)

    await expect(harness.dispatch('install')).rejects.toThrow(
      'precache failed',
    )
    expect([...harness.stores.keys()]).toEqual([
      'livetrafficstan-shell-active',
    ])
  })

  it('rebuilds an interrupted inactive cache with the same identity', async () => {
    const source = renderServiceWorker({
      version: 'current',
      urls: ['/', '/index.html', '/assets/current.js'],
    })
    const harness = createWorkerHarness({
      initialCaches: {
        'livetrafficstan-shell-current': ['/', '/index.html'],
      },
    })
    runInNewContext(source, harness.context)

    await harness.dispatch('install')
    expect(
      [...harness.stores.get('livetrafficstan-shell-current')],
    ).toEqual(['/', '/index.html', '/assets/current.js'])
  })

  it('does not replace an incomplete cache marked as active', async () => {
    const source = renderServiceWorker({
      version: 'current',
      urls: ['/', '/index.html', '/assets/current.js'],
    })
    const harness = createWorkerHarness({
      initialCaches: {
        'livetrafficstan-shell-current': ['/', '/index.html'],
      },
      activeCacheName: 'livetrafficstan-shell-current',
    })
    runInNewContext(source, harness.context)

    await expect(harness.dispatch('install')).rejects.toThrow(
      'Active application-shell cache is incomplete',
    )
    expect(
      [...harness.stores.get('livetrafficstan-shell-current')],
    ).toEqual(['/', '/index.html'])
    expect(
      harness.responseHeaders
        .get('livetrafficstan-shell-current')
        .get('x-livetrafficstan-active-cache'),
    ).toBe('1')
  })

  it('emits an idempotent owned-cache-only retirement worker', async () => {
    const source = renderRetirementServiceWorker()
    expect(source).toContain('self.registration.unregister()')
    expect(source).toContain("type: 'window'")
    expect(source).toContain('name.startsWith(CACHE_PREFIX)')
    expect(source).not.toContain('indexedDB')
    expect(source).not.toContain('localStorage')

    const root = await createFixture()
    await writeFile(join(root, 'sw.js'), source)
    expect(await readFile(join(root, 'sw.js'), 'utf8')).toBe(source)

    const harness = createWorkerHarness({
      initialCaches: {
        unrelated: ['/keep'],
        'livetrafficstan-shell-a': ['/'],
        'livetrafficstan-shell-b': ['/'],
      },
    })
    runInNewContext(source, harness.context)
    await harness.dispatch('install')
    await harness.dispatch('activate')

    expect(harness.skipWaiting).toHaveBeenCalledOnce()
    expect([...harness.stores.keys()]).toEqual(['unrelated'])
    expect(harness.unregister).toHaveBeenCalledOnce()
    expect(harness.windows[0].postMessage).toHaveBeenCalledWith({
      type: 'APP_SHELL_RETIRED',
    })
    expect(harness.windows[0].navigate).toHaveBeenCalledWith(
      'https://example.test/',
    )
  })
})
