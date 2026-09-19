import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const aircraftProxy = {
  target: 'https://api.adsb.lol',
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/api\/aircraft/, ''),
}

const metarProxy = {
  target: 'https://aviationweather.gov',
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => {
    const requestUrl = new URL(path, 'http://localhost')
    const ids = requestUrl.searchParams.get('ids') ?? ''
    return `/api/data/metar?${new URLSearchParams({
      ids,
      format: 'json',
    })}`
  },
  configure: (proxy: {
    on(
      event: 'proxyReq',
      listener: (proxyRequest: {
        removeHeader(name: string): void
        setHeader(name: string, value: string): void
      }) => void,
    ): void
  }) => {
    proxy.on('proxyReq', (proxyRequest) => {
      for (const header of [
        'authorization',
        'cookie',
        'forwarded',
        'origin',
        'referer',
        'x-forwarded-for',
        'x-real-ip',
      ]) {
        proxyRequest.removeHeader(header)
      }
      proxyRequest.setHeader('Accept', 'application/json')
      proxyRequest.setHeader(
        'User-Agent',
        'LiveTrafficStan (+https://github.com/vasilyevstan/LiveTrafficStan)',
      )
    })
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/aircraft': aircraftProxy,
      '/api/weather/metar': metarProxy,
    },
  },
  preview: {
    proxy: {
      '/api/aircraft': aircraftProxy,
      '/api/weather/metar': metarProxy,
    },
  },
})
