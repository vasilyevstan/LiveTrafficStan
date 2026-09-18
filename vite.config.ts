import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const aircraftProxy = {
  target: 'https://api.adsb.lol',
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/api\/aircraft/, ''),
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/aircraft': aircraftProxy,
    },
  },
  preview: {
    proxy: {
      '/api/aircraft': aircraftProxy,
    },
  },
})
