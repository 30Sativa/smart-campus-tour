import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, describe, expect, it } from 'vitest'
import { buildMapPackage, classifyPixel, exportMap, readPgm, validateMetadata } from './export-poi-map.mjs'

const testDirectories = []
const metadata = { image: 'map.pgm', mode: 'trinary', resolution: 0.05, origin: [-15.3, -76.1, 0], negate: 0, occupied_thresh: 0.65, free_thresh: 0.25 }

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'poi-map-export-'))
  testDirectories.push(root)
  mkdirSync(join(root, 'robot/robot_maps'), { recursive: true })
  writeFileSync(join(root, 'robot/robot_maps/map2.yaml'), `# ROS map fixture\nimage: "map with spaces.pgm"\nmode: trinary\nresolution: 0.05\norigin: [-15.3, -76.1, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.25\n`)
  writeFileSync(join(root, 'robot/robot_maps/map with spaces.pgm'), Buffer.concat([Buffer.from('P5\n# fixture\n3 2\n255\n'), Buffer.from([0, 255, 205, 128, 64, 192])]))
  return { root, outputRoot: join(root, 'web'), sourceYaml: 'robot/robot_maps/map2.yaml', mapKey: 'map2-v1' }
}

afterEach(() => {
  for (const path of testDirectories.splice(0)) {
    if (dirname(path) !== resolve(tmpdir()) || !path.includes('poi-map-export-')) throw new Error('Unexpected test directory.')
    rmSync(path, { recursive: true, force: true })
  }
})

describe('ROS occupancy map export', () => {
  it('keeps raster bytes that look like whitespace or comments', () => {
    const raster = Buffer.from([10, 13, 32, 35, 0, 255])
    const pgm = readPgm(Buffer.concat([Buffer.from('P5\n# comment\n3 2\n255\n'), raster]))
    expect(pgm.pixels).toEqual(raster)
    expect(() => readPgm(Buffer.from('P5\n3 2\n255\nshort'))).toThrow(/dimensions/)
  })

  it('uses strict Nav2 thresholds, negate, and classifies gray 205 as free', () => {
    expect(classifyPixel(205, metadata)).toBe(255)
    expect(classifyPixel(205, { ...metadata, free_thresh: 0.196 })).toBe(128)
    expect(classifyPixel(128, metadata)).toBe(128)
    expect(classifyPixel(0, metadata)).toBe(0)
    expect(classifyPixel(255, { ...metadata, negate: 1 })).toBe(0)
    expect(classifyPixel(0, { ...metadata, negate: true })).toBe(255)
    expect(classifyPixel(128, { ...metadata, free_thresh: 1 - 128 / 255 })).toBe(128)
    expect(classifyPixel(128, { ...metadata, occupied_thresh: 1 - 128 / 255 })).toBe(128)
    expect(() => validateMetadata({ ...metadata, mode: 'scale' })).toThrow()
    expect(() => validateMetadata({ ...metadata, origin: [0, 0] })).toThrow()
  })

  it('preserves dimensions and each row/column, resolving the YAML image path', () => {
    const input = fixture()
    const { manifest, imageBytes } = buildMapPackage(input)
    const png = PNG.sync.read(imageBytes)
    expect([png.width, png.height]).toEqual([3, 2])
    expect(Array.from({ length: 6 }, (_, index) => png.data[index * 4])).toEqual([0, 255, 255, 128, 0, 255])
    expect(manifest.source.pgm).toBe('robot/robot_maps/map with spaces.pgm')
    expect(manifest.origin).toEqual([-15.3, -76.1, 0])
    expect(manifest.cellCounts).toEqual({ free: 3, occupied: 2, unknown: 1 })
  })

  it.each([0.1, -0.1, 1e-12, 2 * Math.PI])('rejects origin yaw %s before exporting a navigation map package', (yaw) => {
    const input = fixture()
    const source = join(input.root, input.sourceYaml)
    writeFileSync(source, readFileSync(source, 'utf8').replace('origin: [-15.3, -76.1, 0]', `origin: [-15.3, -76.1, ${yaw}]`))
    expect(() => exportMap(input)).toThrow(/Nonzero origin yaw is unsupported/)
  })

  it('detects stale metadata and refuses new geometry under an existing key', () => {
    const input = fixture()
    exportMap(input)
    expect(() => exportMap({ ...input, check: true })).not.toThrow()
    const source = join(input.root, input.sourceYaml)
    writeFileSync(source, readFileSync(source, 'utf8').replace('resolution: 0.05', 'resolution: 0.1'))
    expect(() => exportMap({ ...input, check: true })).toThrow(/stale/)
    expect(() => exportMap(input)).toThrow(/existing MapKey/)
    expect(exportMap({ ...input, mapKey: 'map2-v2' }).resolution).toBe(0.1)
  })

  it('checks the committed real map package against the ROS source', () => {
    const manifest = exportMap({ check: true })
    expect([manifest.width, manifest.height]).toEqual([1419, 1949])
    expect(manifest.mapKey).toBe('map2-v2')
    expect(manifest.freeThreshold).toBe(0.196)
    expect(manifest.cellCounts).toEqual({ free: 442025, occupied: 32941, unknown: 2290665 })
    expect(manifest.source.pgmSha256).toBe('940df58b70e3280aec306776cf0c5ecf270361e2398911d8982b48007ed8abd7')
  })
})
