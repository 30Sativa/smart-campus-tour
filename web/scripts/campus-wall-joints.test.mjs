import { readFileSync } from 'node:fs'
import { Box3, Matrix4, Quaternion, Ray, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { wallGlazingReturns } from './campus-wall-joints.mjs'

describe('wall to glazing joints', () => {
  it('restores a partition end using its original face thickness and does not bridge unrelated walls', () => {
    const positions = [[0, 0, -0.125], [8, 0, -0.125], [8, 5, -0.125], [0, 0, 0.125], [8, 0, 0.125], [8, 5, 0.125]]
    const normals = positions.map((_, i) => [0, 0, i < 3 ? -1 : 1]), indices = [0, 1, 2, 3, 4, 5]
    const joints = wallGlazingReturns(positions, normals, indices, [[[0, -4], [0, 4]]])
    expect(joints).toHaveLength(1)
    expect(joints[0].size[2]).toBe(0.25)
    expect(joints[0].join).toEqual([0, 0])
    expect(joints[0].centre[0] - joints[0].size[0] / 2).toBeCloseTo(-0.03)
    expect(joints[0].centre[0] + joints[0].size[0] / 2).toBeGreaterThan(0.9)
    expect(wallGlazingReturns(positions, normals, indices, [[[20, -4], [20, 4]]])).toHaveLength(0)
    expect(wallGlazingReturns(positions, normals, indices, [[[4, -4], [4, 4]]])).toHaveLength(0)
    expect(wallGlazingReturns(positions, normals, indices, [[[0, -4], [0, 4]]], new Set([0, 3]))).toHaveLength(0)
    const splitPositions = [], splitNormals = []
    for (const [bottom, top] of [[0, 3.48], [3.48, 5]]) for (const side of [-1, 1]) {
      splitPositions.push([0, bottom, side * 0.125], [8, bottom, side * 0.125], [8, top, side * 0.125])
      splitNormals.push(...Array.from({ length: 3 }, () => [0, 0, side]))
    }
    expect(wallGlazingReturns(splitPositions, splitNormals, splitPositions.map((_, i) => i), [[[0, -4], [0, 4]]])).toHaveLength(1)
  })

  it('closes the marked classroom ends and exports solid joined geometry across all replacement facades', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12))), visible = []
    const visit = i => { visible.push(gltf.nodes[i]); gltf.nodes[i].children?.forEach(visit) }
    gltf.scenes[gltf.scene ?? 0].nodes.forEach(visit)
    const joints = gltf.asset.extras.wallReturns
    for (const [x, z] of [[59.667, -60.633], [60.73, -49.711], [61.792, -38.791]]) expect(joints.some(j => Math.hypot(j.join[0] - x, j.join[1] - z) < 0.01)).toBe(true)
    expect(joints.length).toBeGreaterThanOrEqual(8)
    const cornerBranches = joints.filter(j => Math.hypot(j.join[0] - 61.792, j.join[1] + 38.79) < 0.01)
    expect(cornerBranches).toHaveLength(2)
    expect(cornerBranches.some(j => j.centre[0] < 61.79)).toBe(true)
    expect(cornerBranches.some(j => j.centre[0] > 61.79)).toBe(true)
    for (const joint of joints) {
      const node = visible.find(n => n.name === joint.name)
      expect(node).toBeDefined()
      const primitive = gltf.meshes[node.mesh].primitives[0], material = gltf.materials[primitive.material]
      expect(material.name).toBe('Warm ivory walls')
      expect(material.alphaMode ?? 'OPAQUE').toBe('OPAQUE')
      const transform = new Matrix4().compose(new Vector3(...node.translation), new Quaternion(...node.rotation), new Vector3(...node.scale)).invert()
      const bounds = new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5))
      expect(bounds.containsPoint(new Vector3(joint.join[0], 2.5, joint.join[1]).applyMatrix4(transform))).toBe(true)
      // The return must overlap the retained wall beyond the cut's 0.9 m depth.
      const sign = (joint.centre[0] - joint.join[0]) * joint.axis[0] + (joint.centre[2] - joint.join[1]) * joint.axis[1] > 0 ? 1 : -1
      const run = joint.run < 2 ? gltf.asset.extras.glazingRuns[joint.run] : gltf.asset.extras.gardenGlassRun
      const a = run[joint.segment - 1], b = run[joint.segment], length = Math.hypot(b[0] - a[0], b[1] - a[1])
      const cross = Math.abs(joint.axis[0] * (b[1] - a[1]) / length - joint.axis[1] * (b[0] - a[0]) / length)
      const reach = joint.continuation ? 0.65 : (joint.run < 2 ? 0.9 : 0.65) / cross + 0.02
      expect(bounds.containsPoint(new Vector3(joint.join[0] + sign * reach * joint.axis[0], 2.5, joint.join[1] + sign * reach * joint.axis[1]).applyMatrix4(transform))).toBe(true)
      expect(node.scale[2]).toBeGreaterThan(0.18)
      expect(node.scale[2]).toBeLessThan(0.5)
      for (const run of gltf.asset.extras.glazingRuns) for (let s = 1; s < run.length; s++) {
        const a = run[s - 1], b = run[s], length = Math.hypot(b[0] - a[0], b[1] - a[1])
        const t = Math.max(0, Math.min(1, ((joint.join[0] - a[0]) * (b[0] - a[0]) + (joint.join[1] - a[1]) * (b[1] - a[1])) / (length * length)))
        const distance = Math.hypot(joint.join[0] - a[0] - t * (b[0] - a[0]), joint.join[1] - a[1] - t * (b[1] - a[1]))
        const parallel = Math.abs(((b[0] - a[0]) * joint.axis[0] + (b[1] - a[1]) * joint.axis[1]) / length) > 0.999
        if (!joint.continuation) expect(parallel && distance < 0.3, `${joint.name} must not restore a replaced glass frontage`).toBe(false)
      }
      for (const door of gltf.asset.extras.doorOpenings) for (let sample = 0; sample <= 20; sample++) {
        const offset = (sample / 20 - 0.5) * (door.width - 0.1)
        const point = new Vector3(door.centre[0] + offset * door.axis[0], 1.5, door.centre[1] + offset * door.axis[1]).applyMatrix4(transform)
        expect(bounds.containsPoint(point), `${joint.name} must not fill ${door.name}`).toBe(false)
      }
    }
  })

  it('closes the longitudinal wall beyond the last glass bay without filling the bay', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    const run = gltf.asset.extras.glazingRuns[0], end = run.at(-1), before = run.at(-2)
    const direction = new Vector3(end[0] - before[0], 0, end[1] - before[1]).normalize()
    const joint = gltf.asset.extras.wallReturns.find(j => j.continuation && j.run === 0 && j.segment === 3)
    expect(joint).toBeDefined()
    const node = gltf.nodes.find(n => n.name === joint.name)
    const inverse = new Matrix4().compose(new Vector3(...node.translation), new Quaternion(...node.rotation), new Vector3(...node.scale)).invert()
    const bounds = new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5))
    // Every point of the formerly missing 0.6 m end cap is now solid.
    for (let distance = 0; distance <= 0.6; distance += 0.05) expect(bounds.containsPoint(new Vector3(joint.join[0], 2.5, joint.join[1]).addScaledVector(direction, distance).applyMatrix4(inverse))).toBe(true)
    expect(bounds.containsPoint(new Vector3(end[0], 2.5, end[1]).addScaledVector(direction, -0.3).applyMatrix4(inverse))).toBe(false)
  })

  it('extends the entire 602 frontage to the partition with full-height glass and no opaque remnant', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb'), size = bytes.readUInt32LE(12)
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + size)), bin = bytes.subarray(28 + size)
    const run = gltf.asset.extras.glazingRuns[1], end = run.at(-1), door = gltf.asset.extras.doorOpenings.find(d => d.name === '602')
    const joint = gltf.asset.extras.wallReturns.find(j => j.run === 1 && j.segment === 5)
    expect(joint).toBeDefined()
    expect(gltf.asset.extras.wallReturns.some(j => j.run === 1 && j.segment < 5)).toBe(false)
    expect(Math.hypot(end[0] - joint.join[0], end[1] - joint.join[1])).toBeLessThan(0.001)
    expect(end[0]).toBeGreaterThan(31.9)
    const normal = new Vector3(-door.axis[1], 0, door.axis[0])
    for (const p of [run[4], end]) expect(Math.abs((p[0] - door.centre[0]) * normal.x + (p[1] - door.centre[1]) * normal.z)).toBeLessThan(0.001)
    for (const node of gltf.nodes.filter(n => /^Modern glass pane 1-/.test(n.name))) {
      expect(node.translation[1] + node.scale[1] / 2).toBeCloseTo(4.975)
      expect(node.translation[1] - node.scale[1] / 2).toBeCloseTo(0.15)
    }
    expect(gltf.nodes.some(n => n.name === 'Corner door transom 602')).toBe(true)
    const shell = gltf.nodes.find(n => n.name === 'Original architectural shell')
    const wall = gltf.meshes[shell.mesh].primitives.find(p => gltf.materials[p.material].name === 'Warm ivory walls')
    const accessor = gltf.accessors[wall.attributes.POSITION], view = gltf.bufferViews[accessor.bufferView]
    const vertex = (i, target) => target.set(...[0, 1, 2].map(k => bin.readFloatLE((view.byteOffset ?? 0) + i * 12 + k * 4)))
    const point = new Vector3(end[0] + door.axis[0] * 0.32, 4.2, end[1] + door.axis[1] * 0.32)
    const origin = point.clone().addScaledVector(normal, -0.6), ray = new Ray(origin, normal), hit = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3()
    let opaqueHits = 0
    for (let i = 0; i < accessor.count; i += 3) if (ray.intersectTriangle(vertex(i, a), vertex(i + 1, b), vertex(i + 2, c), false, hit) && hit.distanceTo(origin) < 1.2) opaqueHits++
    expect(opaqueHits).toBe(0)
  })
})
