export const SPACE_TRACK_LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
export const SPACE_TRACK_GP_ROOT =
  'https://www.space-track.org/basicspacedata/query/class/gp/'

export class SpaceTrackProtocolError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'SpaceTrackProtocolError'
    this.code = code
  }
}

export const spaceTrackNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (
    typeof value !== 'string' ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(value)
  ) return
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export const spaceTrackLoginAcknowledgment = (text: string) => {
  const input = text.trim()
  if (!input) return 'empty-body'
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch {
    throw new SpaceTrackProtocolError('authentication-response-unrecognized')
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if ('Login' in value && value.Login === 'Success') return 'explicit-success'
    if (Object.keys(value).length === 0) return 'empty-object'
  }
  if (Array.isArray(value) && value.length === 0) return 'empty-array'
  if (value === '') return 'empty-string'
  throw new SpaceTrackProtocolError('authentication-not-confirmed')
}

const cookieValues = (headers: Headers): string[] => {
  let values: unknown
  if ('getSetCookie' in headers && typeof headers.getSetCookie === 'function') {
    values = headers.getSetCookie()
  } else if ('getAll' in headers && typeof headers.getAll === 'function') {
    values = headers.getAll('Set-Cookie')
  }
  if (
    !Array.isArray(values) || values.length === 0 || values.length > 8 ||
    !values.every((value): value is string => typeof value === 'string')
  ) throw new SpaceTrackProtocolError('authentication-cookie-invalid')
  return values
}

export const spaceTrackSessionCookies = (
  headers: Headers,
  now: number,
  targetUrl = SPACE_TRACK_GP_ROOT,
) => {
  const target = new URL(targetUrl)
  if (
    target.origin !== 'https://www.space-track.org' ||
    !target.pathname.startsWith('/basicspacedata/query/class/gp/')
  ) throw new SpaceTrackProtocolError('authentication-cookie-scope-invalid')
  const encoder = new TextEncoder()
  const pairs: string[] = []
  const names = new Set<string>()
  for (const value of cookieValues(headers)) {
    if (encoder.encode(value).byteLength > 4 * 1_024) {
      throw new SpaceTrackProtocolError('authentication-cookie-oversized')
    }
    const [pair, ...attributes] = value.split(';').map((part) => part.trim())
    const separator = pair.indexOf('=')
    const name = pair.slice(0, separator)
    const cookieValue = pair.slice(separator + 1)
    const octets = cookieValue.startsWith('"') && cookieValue.endsWith('"')
      ? cookieValue.slice(1, -1) : cookieValue
    if (
      separator < 1 || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) ||
      !cookieValue ||
      !/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+$/.test(octets) ||
      names.has(name)
    ) throw new SpaceTrackProtocolError('authentication-cookie-invalid')
    names.add(name)
    let path = '/ajaxauth'
    let scoped = true
    let maxAge: number | undefined
    let expiresAt: number | undefined
    for (const attribute of attributes) {
      const equals = attribute.indexOf('=')
      const key = (equals < 0 ? attribute : attribute.slice(0, equals)).toLowerCase()
      const entry = equals < 0 ? '' : attribute.slice(equals + 1)
      if (key === 'domain') {
        const domain = entry.toLowerCase().replace(/^\./, '')
        if (!['space-track.org', 'www.space-track.org'].includes(domain)) scoped = false
      }
      if (key === 'path') path = entry
      if (key === 'max-age') maxAge = /^-?\d+$/.test(entry) ? Number(entry) : Number.NaN
      if (key === 'expires') expiresAt = Date.parse(entry)
    }
    if (
      !scoped || !path.startsWith('/') ||
      (target.pathname !== path && !target.pathname.startsWith(
        path.endsWith('/') ? path : `${path}/`,
      )) ||
      (maxAge !== undefined
        ? !Number.isFinite(maxAge) || maxAge <= 0
        : expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= now))
    ) continue
    pairs.push(pair)
  }
  if (pairs.length === 0) throw new SpaceTrackProtocolError('authentication-cookie-scope-invalid')
  const cookie = pairs.join('; ')
  if (encoder.encode(cookie).byteLength > 4 * 1_024) {
    throw new SpaceTrackProtocolError('authentication-cookie-oversized')
  }
  return cookie
}
