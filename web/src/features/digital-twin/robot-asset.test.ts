import { readFileSync } from 'node:fs'
import { Box3, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { PATROL_CLEARANCE, SAFE_DISTANCE } from './patrol-demo'

describe('URDF robot asset', () => {
  it('loads the original parts in metres with floor contact and sufficient patrol clearance', async () => {
    const bytes = Uint8Array.from(readFileSync('public/models/robot/campus-amr.glb'))
    const { scene } = await new GLTFLoader().parseAsync(bytes.buffer, '')
    const names: string[] = []
    scene.traverse(node => names.push(node.name))
    for (const name of ['chassisstl', 'camera_assemblystl', 'left_drive_wheelstl', 'right_drive_wheelstl', 'front_left_casterstl', 'front_right_casterstl', 'rear_left_casterstl', 'rear_right_casterstl']) expect(names).toContain(name)
    const bounds = new Box3().setFromObject(scene)
    const size = bounds.getSize(new Vector3())
    expect(size.x).toBeCloseTo(0.810, 3)
    expect(size.z).toBeCloseTo(0.570, 3)
    expect(size.y).toBeCloseTo(0.494, 3)
    expect(bounds.min.y).toBeCloseTo(0, 3)
    const radius = Math.max(...[bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.z, bounds.max.z].map(z => Math.hypot(x, z))))
    expect(PATROL_CLEARANCE - radius).toBeGreaterThan(0.1)
    expect(SAFE_DISTANCE - 2 * radius).toBeGreaterThan(0.4)
  })
})
