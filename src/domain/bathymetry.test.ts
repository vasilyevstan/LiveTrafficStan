import { describe, expect, it } from 'vitest'
import { BATHYMETRY_CONFIG } from '../config/appConfig'
import { depthCandidates, depthLabel, depthValueSource } from './bathymetry'
import type { OrbitalViewport } from './orbitalViewport'

const view = (west = 24.5, south = 59.5, east = 25, north = 59.9): OrbitalViewport => ({
  kind: 'local', center: { longitude: (west + east) / 2, latitude: (south + north) / 2 },
  polygon: [
    { longitude: west, latitude: south }, { longitude: east, latitude: south },
    { longitude: east, latitude: north }, { longitude: west, latitude: north },
  ],
})

describe('modeled depth sample geometry', () => {
  it('uses regional LAT only for a fully supported footprint, never a mixed-datum view', () => {
    expect(depthValueSource(view())).toBe('emodnet')
    expect(depthValueSource(view(-66, 13, -64, 16))).toBe('emodnet')
    expect(depthValueSource(view(-40, 45, 10, 60))).toBe('gebco')
    expect(depthValueSource(view(150, -35, 151, -33))).toBe('gebco')
    expect(depthValueSource({ kind: 'world' })).toBe('gebco')
  })

  it.each([[1280, 900], [390, 568], [315, 517]])('bounds stable native-cell candidates at %sx%s', (width, height) => {
    const first = depthCandidates(view(), 10, width, height)
    expect(first.length).toBeGreaterThan(0)
    expect(first.length).toBeLessThanOrEqual(BATHYMETRY_CONFIG.maximumLabels)
    expect(new Set(first.map(point => point.id)).size).toBe(first.length)
    expect(depthCandidates(view(24.500001, 59.500001, 25.000001, 59.900001), 10, width, height)).toEqual(first)
    for (const point of first) {
      expect(point.longitude).toBe(Number(point.longitude.toFixed(4)))
      expect(point.latitude).toBe(Number(point.latitude.toFixed(4)))
      expect(point.id.startsWith('emodnet:')).toBe(true)
    }
  })

  it('normalizes date-line cells without inventing world or invalid-geometry coverage', () => {
    const points = depthCandidates(view(179.5, 25, 180.5, 25.8), 11, 1280, 900)
    expect(points.some(point => point.longitude < 0)).toBe(true)
    expect(points.every(point => Math.abs(point.longitude) <= 180)).toBe(true)
    expect(new Set(points.map(point => point.id)).size).toBe(points.length)
    expect(depthCandidates({ kind: 'world' }, 12, 1280, 900)).toEqual([])
    expect(depthCandidates(view(), 9.99, 1280, 900)).toEqual([])
    expect(depthCandidates(view(), 12, 0, 900)).toEqual([])
    expect(depthCandidates(view(0, 0, 200, 20), 12, 1280, 900)).toEqual([])
    expect(depthCandidates(view(0, 0, Number.NaN, 20), 12, 1280, 900)).toEqual([])
  })

  it('keeps approximate metre labels and never rounds a sub-metre value to zero', () => {
    expect(depthLabel(84.837)).toBe('~85 m')
    expect(depthLabel(0.3)).toBe('~<1 m')
    expect(depthLabel(4200)).toBe('~4,200 m')
  })
})
