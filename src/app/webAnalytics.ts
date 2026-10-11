import { WEB_ANALYTICS_CONFIG } from '../config/appConfig'

const attemptedDocuments = new WeakSet<Document>()
const loadFailure = 'Cloudflare Web Analytics could not load; the application remains usable.'

export const installWebAnalytics = (
  production: boolean,
  origin: string,
  config: Pick<typeof WEB_ANALYTICS_CONFIG, 'enabled' | 'siteToken'> = WEB_ANALYTICS_CONFIG,
) => {
  if (!production || origin !== WEB_ANALYTICS_CONFIG.origin || !config.enabled) return
  if (attemptedDocuments.has(document)) return
  attemptedDocuments.add(document)
  if (!/^[0-9a-f]{32}$/.test(config.siteToken)) {
    console.warn('Cloudflare Web Analytics configuration is invalid; no beacon was loaded.')
    return
  }
  try {
    if (document.querySelector('script[data-cf-beacon]')) {
      console.warn('A Web Analytics beacon is already installed; TrackStan did not add another.')
      return
    }
    const script = document.createElement('script')
    script.id = 'trackstan-web-analytics'
    script.type = 'module'
    script.async = true
    script.crossOrigin = 'anonymous'
    script.referrerPolicy = 'origin'
    script.src = WEB_ANALYTICS_CONFIG.scriptUrl
    script.setAttribute('data-cf-beacon', JSON.stringify({ token: config.siteToken, spa: false }))
    script.addEventListener('error', () => console.warn(loadFailure), { once: true })
    document.head.append(script)
  } catch {
    console.warn(loadFailure)
  }
}
