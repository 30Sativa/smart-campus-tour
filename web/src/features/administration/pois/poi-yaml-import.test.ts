import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_POI_MAP, occupancyMapFor } from './map/catalog'
import { importPoiYamlFile, parsePoiYaml, POI_YAML_MAX_BYTES } from './poi-yaml-import'

const roboticsYaml = readFileSync(resolve(process.cwd(), '../robot/robot_maps/poi_start.yaml'), 'utf8')
const map = DEFAULT_POI_MAP

describe('robotics POI YAML import', () => {
  it('imports the actual robot START export without converting quaternion or verification flags', () => {
    expect(parsePoiYaml(roboticsYaml, map)).toEqual({ x: -0.319, y: -0.535, yaw: 0.077 })
    expect(parsePoiYaml(roboticsYaml.replace('verified: false', 'verified: true'), map)).toEqual(parsePoiYaml(roboticsYaml, map))
  })

  it('keeps the explicitly selected legacy revision when only map_yaml is present', () => {
    const legacy = occupancyMapFor('map2-v1', 'map')!
    expect(parsePoiYaml(roboticsYaml, legacy)).toMatchObject({ x: -0.319, y: -0.535, yaw: 0.077 })
  })

  it('accepts a source path but rejects an explicit map_key for another revision', () => {
    expect(parsePoiYaml(roboticsYaml.replace('map2.yaml', 'C:\\maps\\map2.yaml'), map)).toMatchObject({ x: -0.319 })
    expect(() => parsePoiYaml(`${roboticsYaml}\nmap_key: map2-v1`, map)).toThrow(/map_key/)
  })

  it('rounds to API precision before checking bounds', () => {
    expect(parsePoiYaml(roboticsYaml.replace('-0.319', '-0.319123').replace('0.077', '0.07712345'), map))
      .toMatchObject({ x: -0.3191, yaw: 0.077123 })
    // This rounds to the excluded upper map boundary, despite the source point being inside.
    expect(() => parsePoiYaml(roboticsYaml.replace('-0.319', '55.64999'), map)).toThrow(/ngoài bản đồ/)
  })

  it.each([
    ['broken syntax', 'pose: [', /YAML không hợp lệ/],
    ['multiple documents', `${roboticsYaml}\n---\n${roboticsYaml}`, /YAML không hợp lệ/],
    ['duplicate key', `${roboticsYaml}\nframe_id: odom`, /YAML không hợp lệ/],
    ['alias', `${roboticsYaml}\nextra: &a [1]\ncopy: *a`, /YAML không hợp lệ/],
    ['custom tag', `${roboticsYaml}\nextra: !custom value`, /YAML không hợp lệ/],
    ['list of POIs', '- pose: {x: 1, y: 2, yaw: 0}', /một POI/],
    ['map mismatch', roboticsYaml.replace('map2.yaml', 'map1.yaml'), /map_yaml/],
    ['frame mismatch', roboticsYaml.replace('frame_id: map', 'frame_id: odom'), /frame_id/],
    ['missing yaw', roboticsYaml.replace('  yaw: 0.077', ''), /số hữu hạn/],
    ['string coordinate', roboticsYaml.replace('x: -0.319', 'x: "-0.319"'), /số hữu hạn/],
    ['non-finite coordinate', roboticsYaml.replace('x: -0.319', 'x: .nan'), /số hữu hạn/],
    ['boolean coordinate', roboticsYaml.replace('x: -0.319', 'x: true'), /số hữu hạn/],
    ['out of range yaw', roboticsYaml.replace('yaw: 0.077', 'yaw: 90'), /−π đến π/],
    ['outside map', roboticsYaml.replace('x: -0.319', 'x: 500'), /ngoài bản đồ/],
  ])('rejects %s', (_label, yaml, message) => {
    expect(() => parsePoiYaml(yaml, map)).toThrow(message)
  })

  it('reads an actual YAML File on the device', async () => {
    await expect(importPoiYamlFile(new File([roboticsYaml], 'poi_start.YML'), map)).resolves.toMatchObject({ x: -0.319, y: -0.535, yaw: 0.077 })
  })

  it('rejects non-YAML and oversized files before parsing', async () => {
    await expect(importPoiYamlFile(new File([roboticsYaml], 'poi_start.txt'), map)).rejects.toThrow(/\.yaml hoặc \.yml/)
    await expect(importPoiYamlFile(new File([' '.repeat(POI_YAML_MAX_BYTES + 1)], 'huge.yaml'), map)).rejects.toThrow(/64 KB/)
  })
})
