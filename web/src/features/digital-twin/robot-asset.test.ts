/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { Box3, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { describe, expect, it } from 'vitest'
import { PATROL_CLEARANCE, SAFE_DISTANCE } from './patrol-demo'
import { CAD_ROBOT_TURN } from './RobotModel'

describe('Digital Twin robot asset', () => {
  it('shows the current robot facing +X, on the floor, with enough patrol clearance', async () => {
    const bytes = Uint8Array.from(readFileSync('public/models/robot/campus-amr-explode.glb'))
    await MeshoptDecoder.ready
    const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '')
    const names: string[] = []
    scene.traverse(node => names.push(node.name.split('__')[0]))
    for (const part of ['frame', 'wheel', 'lidar', 'column', 'pantilt', 'quest']) expect(names).toContain(part)
    scene.rotation.y = CAD_ROBOT_TURN
    scene.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(scene)
    const size = bounds.getSize(new Vector3())
    expect(size.x).toBeCloseTo(0.803, 2)
    expect(size.z).toBeCloseTo(0.563, 2)
    expect(size.y).toBeCloseTo(1.276, 2)
    expect(bounds.min.y).toBeCloseTo(0, 3)
    const radius = Math.max(...[bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.z, bounds.max.z].map(z => Math.hypot(x, z))))
    expect(PATROL_CLEARANCE - radius).toBeGreaterThan(0.1)
    expect(SAFE_DISTANCE - 2 * radius).toBeGreaterThan(0.4)
  })

  it('turns the screen and front camera toward +X, the robot forward', async () => {
    const bytes = Uint8Array.from(readFileSync('public/models/robot/campus-amr-explode.glb'))
    await MeshoptDecoder.ready
    const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer, '')
    scene.rotation.y = CAD_ROBOT_TURN
    scene.updateMatrixWorld(true)
    const front = new Box3()
    scene.traverse(node => { if (node.name.startsWith('screen__')) front.expandByObject(node) })
    expect(front.getCenter(new Vector3()).x).toBeGreaterThan(0.2)
  })
})
