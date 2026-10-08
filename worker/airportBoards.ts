import { DurableObject } from 'cloudflare:workers'
import { AIRPORT_BOARD_CONFIG as config } from '../src/config/airportBoardConfig.js'
import { isAirportBoardIcao } from '../src/providers/airportBoards/airportBoardNormalization.js'
import {
  AirportBoardRequestError,
  AirportBoardService,
  parseAirportBoardAdmission,
  type AirportBoardAdmission,
  type AirportBoardStateStore,
} from './airportBoardService.js'

export interface AirportBoardNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(request: Request): Promise<Response> }
}

export interface AirportBoardEnvironment {
  AIRPORT_BOARDS_ENABLED?: string
  AIRPORT_BOARD_COORDINATOR?: AirportBoardNamespace
  AERODATABOX_RAPIDAPI_KEY?: string
}

export const AIRPORT_BOARD_OBJECT_NAME = 'airport-boards-v1'

const response = (body: unknown, status: number, headers?: Record<string, string>) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  })

const parseRequest = (request: Request, env: AirportBoardEnvironment): string | Response => {
  if (env.AIRPORT_BOARDS_ENABLED !== 'true') return response({ error: 'Airport boards are disabled' }, 404)
  const url = new URL(request.url)
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405, { Allow: 'GET' })
  const icao = url.searchParams.get('icao')
  if (url.pathname !== config.path || !isAirportBoardIcao(icao) || url.search !== `?icao=${icao}`) {
    return response({ error: 'Expected one canonical ICAO airport code' }, 400)
  }
  const origin = request.headers.get('Origin')
  if ((origin !== null && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return response({ error: 'Cross-origin airport-board request rejected' }, 403)
  }
  if (request.signal.aborted) return response({ error: 'Airport-board request canceled' }, 499)
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(env.AERODATABOX_RAPIDAPI_KEY ?? '')) {
    return response({ error: 'Airport-board provider access unavailable' }, 503)
  }
  return icao
}

export const handleAirportBoards = async (request: Request, env: AirportBoardEnvironment) => {
  const parsed = parseRequest(request, env)
  if (parsed instanceof Response) return parsed
  const namespace = env.AIRPORT_BOARD_COORDINATOR
  if (!namespace) return response({ error: 'Airport-board coordinator unavailable' }, 503)
  try {
    return await namespace.get(namespace.idFromName(AIRPORT_BOARD_OBJECT_NAME)).fetch(
      new Request(request.url, { method: 'GET', signal: request.signal }),
    )
  } catch {
    return response(
      { error: 'Airport-board coordinator unavailable' }, 503,
      { 'Retry-After': String(config.retryFallbackMs / 1_000) },
    )
  }
}

export class SqlAirportBoardState implements AirportBoardStateStore {
  private readonly storage: DurableObjectStorage

  constructor(storage: DurableObjectStorage) {
    this.storage = storage
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS airport_board_admission (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1), value TEXT NOT NULL
    )`)
  }

  read() {
    const rows = this.storage.sql.exec<{ value: string }>(
      'SELECT value FROM airport_board_admission WHERE singleton = 1',
    ).toArray()
    if (rows.length > 1) throw new Error('Invalid airport-board admission rows')
    if (!rows.length) return undefined
    if (typeof rows[0]?.value !== 'string' || rows[0].value.length > 1_024) {
      throw new Error('Invalid airport-board admission record')
    }
    return parseAirportBoardAdmission(JSON.parse(rows[0].value))
  }

  write(state: AirportBoardAdmission) {
    const value = JSON.stringify(parseAirportBoardAdmission(state))
    this.storage.sql.exec(
      `INSERT INTO airport_board_admission (singleton, value) VALUES (1, ?)
       ON CONFLICT(singleton) DO UPDATE SET value = excluded.value`, value,
    )
  }
}

export class AirportBoardCoordinator extends DurableObject<AirportBoardEnvironment> {
  private readonly service: AirportBoardService

  constructor(ctx: DurableObjectState, env: AirportBoardEnvironment) {
    super(ctx, env)
    this.service = new AirportBoardService({
      state: new SqlAirportBoardState(ctx.storage),
      key: env.AERODATABOX_RAPIDAPI_KEY ?? '',
    })
  }

  async fetch(request: Request) {
    const parsed = parseRequest(request, this.env)
    if (parsed instanceof Response) return parsed
    try {
      const snapshot = await this.service.load(parsed, request.signal)
      if (request.signal.aborted) return response({ error: 'Airport-board request canceled' }, 499)
      return response(snapshot, 200)
    } catch (error) {
      if (!(error instanceof AirportBoardRequestError)) {
        return response({ error: 'Airport-board coordinator unavailable' }, 503)
      }
      const retry = error.retryAt === undefined ? undefined
        : { 'Retry-After': String(Math.max(1, Math.ceil((error.retryAt - Date.now()) / 1_000))) }
      return response({ error: error.message }, error.status, retry)
    }
  }
}
