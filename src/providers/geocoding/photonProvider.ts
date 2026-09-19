import type { AppCenter } from '../../config/appConfig'
import { centerFromCoordinates } from '../../domain/center'
import { isValidCoordinate } from '../../domain/geo'
import {
  ProviderError,
  responseError,
} from '../errors'

export interface PlaceSearchResult {
  id: string
  label: string
  center: AppCenter
}

export interface PlaceSearchProvider {
  search(
    query: string,
    signal: AbortSignal,
  ): Promise<readonly PlaceSearchResult[]>
}

type PlaceSearchFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

interface PhotonPlaceSearchProviderOptions {
  endpointBaseUrl: string
  resultLimit: number
  coordinatePrecision: number
  fetchImpl?: PlaceSearchFetch
  origin?: string
}

const MAX_RESPONSE_CHARACTERS = 256_000
const MAX_PROPERTY_CHARACTERS = 100
const MAX_LABEL_CHARACTERS = 240

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const textProperty = (
  properties: Record<string, unknown>,
  name: string,
) => {
  const value = properties[name]
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  return text.slice(0, MAX_PROPERTY_CHARACTERS)
}

const resultLabel = (properties: Record<string, unknown>) => {
  const name =
    textProperty(properties, 'name') ??
    textProperty(properties, 'street') ??
    textProperty(properties, 'city') ??
    textProperty(properties, 'country')
  if (!name) return undefined

  const street = textProperty(properties, 'street')
  const houseNumber = textProperty(properties, 'housenumber')
  const streetAddress =
    street && houseNumber ? `${houseNumber} ${street}` : street
  const locality =
    textProperty(properties, 'city') ??
    textProperty(properties, 'district') ??
    textProperty(properties, 'county')
  const parts = [
    name,
    streetAddress,
    locality,
    textProperty(properties, 'state'),
    textProperty(properties, 'country'),
  ].filter((part, index, values): part is string => {
    if (!part) return false
    return values.findIndex((value) => value === part) === index
  })

  return parts.join(', ').slice(0, MAX_LABEL_CHARACTERS)
}

const resultId = (
  properties: Record<string, unknown>,
  latitude: number,
  longitude: number,
  label: string,
) => {
  const osmType = textProperty(properties, 'osm_type')
  const osmId = properties.osm_id
  if (
    osmType &&
    (typeof osmId === 'string' || typeof osmId === 'number')
  ) {
    return `photon:${osmType}:${String(osmId)}`
  }

  return `photon:${latitude}:${longitude}:${label}`
}

const parseFeature = (
  value: unknown,
  coordinatePrecision: number,
): PlaceSearchResult | null => {
  if (!isRecord(value) || value.type !== 'Feature') return null
  if (!isRecord(value.geometry) || value.geometry.type !== 'Point') return null
  if (!Array.isArray(value.geometry.coordinates)) return null

  const [longitude, latitude] = value.geometry.coordinates
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !isValidCoordinate(latitude, longitude) ||
    !isRecord(value.properties)
  ) {
    return null
  }

  const label = resultLabel(value.properties)
  if (!label) return null
  const center = centerFromCoordinates(
    { latitude, longitude },
    coordinatePrecision,
    label,
  )

  return {
    id: resultId(
      value.properties,
      center.latitude,
      center.longitude,
      label,
    ),
    label,
    center,
  }
}

export class PhotonPlaceSearchProvider implements PlaceSearchProvider {
  private readonly endpointBaseUrl: string
  private readonly resultLimit: number
  private readonly coordinatePrecision: number
  private readonly fetchImpl: PlaceSearchFetch
  private readonly origin?: string

  constructor(options: PhotonPlaceSearchProviderOptions) {
    this.endpointBaseUrl = options.endpointBaseUrl
    this.resultLimit = options.resultLimit
    this.coordinatePrecision = options.coordinatePrecision
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => globalThis.fetch(input, init))
    this.origin = options.origin
  }

  async search(query: string, signal: AbortSignal) {
    const browserOrigin =
      this.origin ??
      (typeof location === 'undefined' ? undefined : location.origin)
    const url = this.endpointBaseUrl.startsWith('/')
      ? new URL(this.endpointBaseUrl, browserOrigin)
      : new URL(this.endpointBaseUrl)
    url.search = new URLSearchParams({
      q: query,
      limit: String(this.resultLimit),
    }).toString()

    const response = await this.fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'follow',
      signal,
      headers: {
        Accept: 'application/json',
      },
    })
    if (!response.ok) throw await responseError('Photon', response)

    const body = await response.text()
    if (body.length > MAX_RESPONSE_CHARACTERS) {
      throw new ProviderError('Photon returned an oversized response')
    }

    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      throw new ProviderError('Photon returned invalid JSON')
    }
    if (
      !isRecord(payload) ||
      payload.type !== 'FeatureCollection' ||
      !Array.isArray(payload.features)
    ) {
      throw new ProviderError('Photon returned an invalid search response')
    }

    const results: PlaceSearchResult[] = []
    const seen = new Set<string>()
    for (const feature of payload.features) {
      const result = parseFeature(feature, this.coordinatePrecision)
      if (!result || seen.has(result.id)) continue
      seen.add(result.id)
      results.push(result)
      if (results.length >= this.resultLimit) break
    }

    if (payload.features.length > 0 && results.length === 0) {
      throw new ProviderError('Photon returned no valid search results')
    }
    return results
  }
}
