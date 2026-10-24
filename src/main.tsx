import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App.tsx'
import { installWebAnalytics } from './app/webAnalytics'
import { startObjectShare } from './app/objectShareStartup'

const objectShareStartup = startObjectShare(window.location, window.history)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App objectShareStartup={objectShareStartup} />
  </StrictMode>,
)

installWebAnalytics(import.meta.env.PROD && import.meta.env.MODE !== 'pwa-retire', window.location.origin)
