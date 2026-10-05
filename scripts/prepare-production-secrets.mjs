import { writeFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'

const output = process.env.SECRETS_FILE
if (!output || !isAbsolute(output)) {
  throw new Error('An absolute production secrets path is required')
}
const secrets = {}
if (process.env.AIRCRAFT_DELIVERY === 'oci-private-relay') {
  const token = process.env.AIRCRAFT_RELAY_AUTH_TOKEN
  if (!token || token.length < 32) {
    throw new Error('Private relay secret is missing or too short')
  }
  secrets.AIRCRAFT_RELAY_AUTH_TOKEN = token
}
if (process.env.MARINE_ENABLED === 'true') {
  for (const name of ['AISSTREAM_API_KEY', 'OPENWATERS_AIS_TOKEN']) {
    if (!process.env[name]) throw new Error(`Missing ${name}`)
    secrets[name] = process.env[name]
  }
}
if (Object.keys(secrets).length === 0) {
  throw new Error('No production secrets were selected')
}
writeFileSync(output, `${JSON.stringify(secrets)}\n`, {
  mode: 0o600,
  flag: 'wx',
})
console.log('Prepared protected production secrets')
