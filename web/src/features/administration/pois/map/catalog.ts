import map2Manifest from './map2-v2.generated.json'
import map2LegacyManifest from './map2-v1.generated.json'
import type { GridGeometry } from './occupancy-grid'

export type OccupancyMap = GridGeometry & {
  schemaVersion: number
  mapKey: string
  frameId: string
  imageUrl: string
  imageSha256: string
  fingerprint: string
  sourceYaml: string
}

function registeredMap(value: typeof map2Manifest): OccupancyMap {
  if (value.schemaVersion !== 1 || value.frameId !== 'map' || !value.mapKey ||
      !Number.isSafeInteger(value.width) || value.width <= 0 ||
      !Number.isSafeInteger(value.height) || value.height <= 0 ||
      !Number.isFinite(value.resolution) || value.resolution <= 0 ||
      value.origin.length !== 3 || !value.origin.every(Number.isFinite) || value.origin[2] !== 0 ||
      !value.imageUrl.startsWith(`/maps/${value.mapKey}/`)) throw new Error('Invalid registered occupancy map.')
  return { ...value, sourceYaml: value.source.yaml, imageUrl: `${import.meta.env.BASE_URL}${value.imageUrl.slice(1)}`, origin: [value.origin[0], value.origin[1], value.origin[2]] }
}

export const OCCUPANCY_MAPS = [registeredMap(map2Manifest), registeredMap(map2LegacyManifest)]
export const DEFAULT_POI_MAP = OCCUPANCY_MAPS[0]

export function occupancyMapFor(mapKey: string, frameId: string): OccupancyMap | null {
  return OCCUPANCY_MAPS.find((map) => map.mapKey === mapKey && map.frameId === frameId) ?? null
}
