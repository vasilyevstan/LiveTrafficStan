import {
  parseOrbitalTimestamp,
  type OrbitalObject,
  type OrbitalObjectType,
  type OrbitalSourceGroup,
} from './orbital.ts'

const recordKeys = [
  'noradCatalogId', 'name', 'internationalDesignator', 'objectType', 'epoch',
  'meanMotion', 'eccentricity', 'inclination', 'rightAscensionOfAscendingNode',
  'argumentOfPericenter', 'meanAnomaly', 'ephemerisType', 'classificationType',
  'elementSetNumber', 'revolutionAtEpoch', 'bstar', 'meanMotionDot',
  'meanMotionDdot', 'sourceGroups', 'displayOrder',
] as const

export const orbitalObjectDigestInput = (record: OrbitalObject) =>
  Object.fromEntries(recordKeys.map((key) => [key, record[key]]))

const finiteNumber = (value: unknown, minimum: number, maximum: number) =>
  typeof value === 'number' && Number.isFinite(value) &&
  value >= minimum && value <= maximum ? value : undefined

const integerNumber = (value: unknown, minimum: number, maximum: number) => {
  const number = finiteNumber(value, minimum, maximum)
  return number !== undefined && Number.isInteger(number) ? number : undefined
}

const boundedString = (value: unknown, minimum: number, maximum: number) =>
  typeof value === 'string' && value.length >= minimum &&
  value.length <= maximum ? value : undefined

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const parseOrbitalObjectRecord = (
  value: unknown,
  allowedGroups: readonly OrbitalSourceGroup[],
): OrbitalObject | undefined => {
  if (!isRecord(value)) return
  const record = value
  if (
    Object.keys(record).length !== recordKeys.length ||
    Object.keys(record).some((key) => !recordKeys.some((expected) => expected === key))
  ) return
  const noradCatalogId = typeof record.noradCatalogId === 'string' &&
    /^[1-9]\d{0,8}$/.test(record.noradCatalogId) ? record.noradCatalogId : undefined
  const name = boundedString(record.name, 1, 120)
  const internationalDesignator = boundedString(record.internationalDesignator, 0, 24)
  const objectType: OrbitalObjectType | undefined = (
    record.objectType === 'PAY' || record.objectType === 'R/B' ||
    record.objectType === 'DEB' || record.objectType === 'UNK'
  ) ? record.objectType : undefined
  const epoch = typeof record.epoch === 'string' &&
    parseOrbitalTimestamp(record.epoch) !== undefined ? record.epoch : undefined
  const meanMotion = finiteNumber(record.meanMotion, 0, 20)
  const eccentricity = finiteNumber(record.eccentricity, 0, 0.99999999)
  const inclination = finiteNumber(record.inclination, 0, 180)
  const rightAscensionOfAscendingNode = finiteNumber(record.rightAscensionOfAscendingNode, 0, 360)
  const argumentOfPericenter = finiteNumber(record.argumentOfPericenter, 0, 360)
  const meanAnomaly = finiteNumber(record.meanAnomaly, 0, 360)
  const ephemerisType = integerNumber(record.ephemerisType, 0, 99)
  const classificationType = typeof record.classificationType === 'string' &&
    /^[A-Z]$/.test(record.classificationType) ? record.classificationType : undefined
  const elementSetNumber = integerNumber(record.elementSetNumber, 0, 999_999)
  const revolutionAtEpoch = integerNumber(record.revolutionAtEpoch, 0, 99_999_999)
  const bstar = finiteNumber(record.bstar, -10, 10)
  const meanMotionDot = finiteNumber(record.meanMotionDot, -10, 10)
  const meanMotionDdot = finiteNumber(record.meanMotionDdot, -10, 10)
  if (
    !Array.isArray(record.sourceGroups) || record.sourceGroups.length === 0 ||
    record.sourceGroups.length > allowedGroups.length
  ) return
  const sourceGroups: OrbitalSourceGroup[] = []
  let previousGroup = -1
  for (const group of record.sourceGroups) {
    const index = allowedGroups.findIndex((candidate) => candidate === group)
    if (index <= previousGroup) return
    previousGroup = index
    sourceGroups.push(allowedGroups[index])
  }
  const displayOrder = noradCatalogId
    ? allowedGroups.indexOf(sourceGroups[0]) * 1_000_000_000 + Number(noradCatalogId)
    : undefined
  if (
    noradCatalogId === undefined || name === undefined ||
    internationalDesignator === undefined || objectType === undefined ||
    epoch === undefined || meanMotion === undefined || eccentricity === undefined ||
    inclination === undefined || rightAscensionOfAscendingNode === undefined ||
    argumentOfPericenter === undefined || meanAnomaly === undefined ||
    ephemerisType === undefined || classificationType === undefined ||
    elementSetNumber === undefined || revolutionAtEpoch === undefined ||
    bstar === undefined || meanMotionDot === undefined || meanMotionDdot === undefined ||
    displayOrder === undefined || record.displayOrder !== displayOrder
  ) return
  return {
    noradCatalogId, name, internationalDesignator, objectType, epoch,
    meanMotion, eccentricity, inclination, rightAscensionOfAscendingNode,
    argumentOfPericenter, meanAnomaly, ephemerisType, classificationType,
    elementSetNumber, revolutionAtEpoch, bstar, meanMotionDot, meanMotionDdot,
    sourceGroups, displayOrder,
  }
}
