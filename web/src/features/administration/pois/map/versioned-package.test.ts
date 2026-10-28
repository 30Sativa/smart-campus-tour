import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseVersionedMapPackage } from './versioned-package'

function packageBytes(image = 'map.pgm') {
  const yaml = `image: ${image}\nmode: trinary\nresolution: 0.5\norigin: [10, 20, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.25\n`
  return zipSync({ 'map.yaml': strToU8(yaml), 'map.pgm': strToU8('P2\n2 2\n255\n0 255 127 255\n') }).buffer
}

describe('versioned ROS map package reader', () => {
  it('parses the root YAML and referenced PGM with backend occupancy settings', async () => {
    const map = await parseVersionedMapPackage(packageBytes(), 'map.pgm')
    expect(map).toMatchObject({ width: 2, height: 2, resolution: 0.5, origin: [10, 20, 0], frameId: 'map', sourceYaml: expect.stringContaining('image: map.pgm') })
    expect(Array.from(map.pixels)).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255,
      128, 128, 128, 255,
      255, 255, 255, 255,
    ])
    expect(map.imageSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects a YAML image reference that does not match the server map version', async () => {
    await expect(parseVersionedMapPackage(packageBytes('other.pgm'), 'map.pgm')).rejects.toThrow(/không khớp/)
  })

  it('rejects nested files and non-zero origin yaw instead of silently drawing a wrong map', async () => {
    const nested = zipSync({ 'map/map.yaml': strToU8('image: map.pgm'), 'map/map.pgm': strToU8('P2 1 1 255 255') }).buffer
    await expect(parseVersionedMapPackage(nested, 'map.pgm')).rejects.toThrow(/thư mục gốc/)
    const source = `image: map.pgm\nmode: trinary\nresolution: 0.5\norigin: [10, 20, 0.3]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.25\n`
    const rotated = zipSync({ 'map.yaml': strToU8(source), 'map.pgm': strToU8('P2 1 1 255 255') }).buffer
    await expect(parseVersionedMapPackage(rotated, 'map.pgm')).rejects.toThrow(/yaw khác 0/)
  })
})
