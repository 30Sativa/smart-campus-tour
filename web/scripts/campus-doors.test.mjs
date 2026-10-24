import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
const size = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.toString('utf8', 20, 20 + size)), bin = bytes.subarray(28 + size)
const doors = gltf.asset.extras.doorOpenings
const shell = gltf.nodes.find(node => node.name === 'Original architectural shell')
const wall = gltf.meshes[shell.mesh].primitives.find(p => gltf.materials[p.material].name === 'Warm ivory walls')
const accessor = gltf.accessors[wall.attributes.POSITION], view = gltf.bufferViews[accessor.bufferView]
const vertices = Array.from({ length: accessor.count }, (_, i) => [0, 1, 2].map(k => bin.readFloatLE((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * 12 + k * 4)))

// Probe the entire glass aperture through both faces of the opaque shell.
function opaqueIntersections(door, u, y) {
  let count = 0
  for (let i = 0; i < vertices.length; i += 3) {
    const p = vertices.slice(i, i + 3).map(([x, h, z]) => [
      (x - door.centre[0]) * door.axis[0] + (z - door.centre[1]) * door.axis[1], h,
      (x - door.centre[0]) * door.axis[1] - (z - door.centre[1]) * door.axis[0],
    ])
    const [a, b, c] = p, determinant = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if (Math.abs(determinant) < 1e-9) continue
    const wa = ((b[1] - c[1]) * (u - c[0]) + (c[0] - b[0]) * (y - c[1])) / determinant
    const wb = ((c[1] - a[1]) * (u - c[0]) + (a[0] - c[0]) * (y - c[1])) / determinant, wc = 1 - wa - wb
    if (Math.min(wa, wb, wc) < -1e-6) continue
    const depth = wa * a[2] + wb * b[2] + wc * c[2]
    if (Math.abs(depth) < door.depth / 2 + 0.03) count++
  }
  return count
}

describe('annotated classroom door corrections', () => {
  it('moves 601 and 614 onto their marked right-hand walls and closes the former apertures', () => {
    for (const name of ['601', '614']) {
      const door = doors.find(d => d.name === name), infill = gltf.nodes.find(n => n.name === name + ' former doorway infill')
      expect(door.centre[0] - door.movedFrom[0]).toBeGreaterThan(4)
      expect(infill.translation).toEqual([door.movedFrom[0], 1.74, door.movedFrom[1]])
      expect(infill.scale[1]).toBe(3.48)
      expect(gltf.materials[gltf.meshes[infill.mesh].primitives[0].material].name).toBe('Warm ivory walls')
    }
    expect(doors.find(d => d.name === '614').centre[0]).toBeGreaterThan(37)
  })
  it('moves 615 and 616 to the opposite end of the same corridor frontage and restores the old positions', () => {
    const previous = { '615': [43.83482610590873, -28.68091362156247], '616': [51.82037847921217, -34.59777216883128] }
    const frontages = { '615': [[42.34338188171387, -27.575836181640625], [50.38234901428223, -33.53227233886719]], '616': [[50.38234901428223, -33.53227233886719], [54.679771423339844, -36.7164249420166]] }
    for (const name of ['615', '616']) {
      const door = doors.find(d => d.name === name), old = previous[name], [a, b] = frontages[name]
      expect(door.centre[0]).toBeCloseTo(a[0] + b[0] - old[0], 2)
      expect(door.centre[1]).toBeCloseTo(a[1] + b[1] - old[1], 2)
      const dx = door.centre[0] - old[0], dz = door.centre[1] - old[1]
      expect(Math.abs(dx * door.axis[1] - dz * door.axis[0])).toBeLessThan(0.0001)
      expect(Math.hypot(dx, dz)).toBeGreaterThan(1.5)
      for (const y of [0.2, 1.5, 3.3]) expect(opaqueIntersections({ ...door, centre: old }, 0, y)).toBeGreaterThan(0)
    }
    expect(doors.find(d => d.name === '615 secondary').centre[0]).toBeCloseTo(41.70823755640121, 5)
  })
  it('keeps two distinct entrances for 615 and adds the marked transverse entrance to 617', () => {
    for (const name of ['615', '617']) {
      const front = doors.find(d => d.name === name), side = doors.find(d => d.name === name + ' secondary')
      expect(front).toBeDefined(); expect(side).toBeDefined()
      expect(Math.abs(front.axis[0] * side.axis[0] + front.axis[1] * side.axis[1])).toBeLessThan(0.02)
    }
    const entry = doors.find(d => d.name === '617 secondary')
    expect(entry.centre[0]).toBeCloseTo(13.43, 1)
    expect(entry.centre[1]).toBeCloseTo(-75.65, 1)
    expect(entry.width).toBeGreaterThanOrEqual(1.2)
  })
  it('cuts every relocated or added glass opening through the opaque wall', () => {
    for (const door of doors.filter(d => d.added || d.movedFrom)) {
      for (const u of [-0.35, 0, 0.35].map(v => v * door.width)) for (const y of [0.2, 1.5, 3.3]) {
        expect(opaqueIntersections(door, u, y), door.name + ' has wall behind its glass aperture').toBe(0)
      }
    }
  })
})
