import { zipSync } from 'fflate'
import type { MapVersionItem } from '../../src/features/technical/api/technical'
import { at, ok, type Handler } from '../support/mock-api'

export const MAP_ID = '7a7a7a7a-0000-4000-8000-000000000001'
const WIDTH = 400
const HEIGHT = 240
const RESOLUTION = 0.05

/** A small synthetic floor plan: a corridor with three rooms, as a ROS trinary PGM (254 free, 0 wall, 205 unknown). */
function floorPlan(): Uint8Array {
  const header = new TextEncoder().encode(`P5\n${WIDTH} ${HEIGHT}\n255\n`)
  const cells = new Uint8Array(WIDTH * HEIGHT).fill(205)
  const box = (x0: number, y0: number, x1: number, y1: number, value: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cells[y * WIDTH + x] = value
  }
  box(10, 10, 390, 230, 0)
  box(14, 14, 386, 226, 254)
  box(14, 110, 386, 114, 0) // corridor wall
  for (const x of [130, 260]) box(x, 14, x + 4, 110, 0)
  for (const x of [60, 190, 320]) box(x, 110, x + 30, 114, 254) // doors
  const bytes = new Uint8Array(header.length + cells.length)
  bytes.set(header)
  bytes.set(cells, header.length)
  return bytes
}

const yaml = 'image: campus.pgm\nmode: trinary\nresolution: 0.05\norigin: [-1.0, -1.0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.25\n'

export const mapPackage = Buffer.from(zipSync({ 'campus.yaml': new TextEncoder().encode(yaml), 'campus.pgm': floorPlan() }))

export const mapVersion: MapVersionItem = {
  map: {
    id: MAP_ID, areaKey: 'campus-hcm', areaName: 'Campus Hồ Chí Minh', versionNumber: 2, mapKey: 'campus-hcm', packageFileName: 'campus.zip',
    packageSha256: 'b'.repeat(64), imageFileName: 'campus.pgm', imageWidth: WIDTH, imageHeight: HEIGHT, resolution: RESOLUTION,
    originX: -1, originY: -1, originYaw: 0, negate: false, occupiedThreshold: 0.65, freeThreshold: 0.25, frameId: 'map',
    validationStatus: 'VALID', uploadedAt: at(-30 * 24 * 60),
  },
  latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true,
  preparationBlockReasonCode: null, preparationBlockReason: null, preparationEvidence: null,
  currentlyDeployedOn: [{ robotCode: 'AMR-01', checkedAt: at(-10 * 24 * 60) }], poiClearanceMeters: 0.5,
  routeMinStops: 2, routeMinStopSeparationMeters: 1,
}

export const mapHandlers: Handler[] = [
  { method: 'GET', path: '/api/maps/versions', reply: { json: ok([mapVersion]) } },
  { method: 'GET', path: `/api/maps/versions/${MAP_ID}`, reply: { json: ok(mapVersion) } },
  {
    method: 'GET', path: `/api/maps/versions/${MAP_ID}/package`,
    reply: { contentType: 'application/zip', raw: mapPackage },
  },
]
