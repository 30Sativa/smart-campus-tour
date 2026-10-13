import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { patrolGeometry, segmentDistance, insideTriangle } from './patrol-geometry.mjs'
import { findPath, nodePoint } from '../src/features/digital-twin/patrol-routing.ts'
const nav = JSON.parse(readFileSync('src/features/digital-twin/patrol-nav.json','utf8'))
function spatial(items, points, margin=0) {
  const bins=new Map()
  for(const item of items) {const p=points(item); for(let x=Math.floor((Math.min(...p.map(v=>v[0]))-margin)/3); x<=Math.floor((Math.max(...p.map(v=>v[0]))+margin)/3);x++) for(let y=Math.floor((Math.min(...p.map(v=>v[1]))-margin)/3);y<=Math.floor((Math.max(...p.map(v=>v[1]))+margin)/3);y++){const key=`${x},${y}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(item)}}
  return p=>bins.get(`${Math.floor(p[0]/3)},${Math.floor(p[1]/3)}`)||[]
}
describe('GLB fleet navigation snapshot',()=>{
  it('matches the model and all ten points belong to a connected, bidirectional graph',()=>{
    expect(nav.modelSha256).toBe(createHash('sha256').update(readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')).digest('hex'))
    const found=new Set(),todo=[nav.pois[0].node]
    while(todo.length){const i=todo.pop();if(found.has(i))continue;found.add(i);for(const j of nav.nodes[i].edges){expect(nav.nodes[j].edges).toContain(i);todo.push(j)}}
    expect(found.size).toBe(nav.nodes.length)
    expect(nav.pois).toHaveLength(10)
    for(const p of nav.pois){expect(found.has(p.node)).toBe(true);expect(nav.nodes[p.node].p).toEqual([p.x,p.y])}
  })
  it('keeps every edge on floor and the entire robot body envelope clear of walls, glass and furniture',()=>{
    const geometry=patrolGeometry(), obstacles=spatial(geometry.edges,e=>[e.a,e.b],nav.clearance), floors=spatial(geometry.floors,t=>t)
    for(let i=0;i<nav.nodes.length;i++)for(const j of nav.nodes[i].edges){if(j<i)continue;const a=nav.nodes[i].p,b=nav.nodes[j].p
      for(let k=0;k<=10;k++){const p=a.map((v,n)=>v+(b[n]-v)*k/10)
        if(!floors(p).some(t=>insideTriangle(p,t)))throw Error(`No floor on ${i}->${j}`)
        for(const e of obstacles(p))if(segmentDistance(p,e.a,e.b)<nav.clearance-1e-6)throw Error(`Footprint touches ${e.name} on ${i}->${j}`)
      }
    }
  },30000)
  it('keeps every any-angle shortcut on the actual model floor with full body clearance', () => {
    const geometry = patrolGeometry(), obstacles = spatial(geometry.edges, e => [e.a, e.b], nav.clearance), floors = spatial(geometry.floors, t => t)
    for (let i = 0; i < nav.pois.length; i++) for (let j = i + 1; j < nav.pois.length; j++) {
      const route = [nav.pois[i].node, ...findPath(nav.pois[i].node, nav.pois[j].node)].map(nodePoint)
      for (let k = 1; k < route.length; k++) {
        const a = route[k - 1], b = route[k], steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.12)
        for (let n = 0; n <= steps; n++) {
          const point = [a.x + (b.x - a.x) * n / steps, a.y + (b.y - a.y) * n / steps]
          if (!floors(point).some(t => insideTriangle(point, t))) throw Error(`Shortcut leaves floor at ${point}`)
          for (const edge of obstacles(point)) if (segmentDistance(point, edge.a, edge.b) < nav.clearance - 1e-6) throw Error(`Shortcut touches ${edge.name} at ${point}`)
        }
      }
    }
  }, 30000)
  it('aligns downlight effects with every authored ceiling fixture', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    const lamps = json.nodes.filter(n => /^Campus lamp \d+ diffuser$/.test(n.name))
    expect(nav.lamps).toEqual(lamps.map(n => [n.translation[0], n.translation[2]]))
    expect(nav.lampZones).toEqual(lamps.map(n => n.extras.lightingZone))
    const corridorLamps = lamps.filter(n => n.extras.lightingZone === 'corridor')
    expect(corridorLamps.length).toBeGreaterThan(10)
    expect(corridorLamps.length).toBeLessThanOrEqual(29)
    for (const lamp of corridorLamps) {
      const point = [lamp.translation[0], lamp.translation[2]]
      expect(Math.min(...nav.nodes.map(node => Math.hypot(node.p[0] - point[0], node.p[1] - point[1]))), `${lamp.name} lies outside the public corridor`).toBeLessThan(1)
    }
    for (let i = 0; i < corridorLamps.length; i++) for (const other of corridorLamps.slice(i + 1)) {
      expect(Math.hypot(corridorLamps[i].translation[0] - other.translation[0], corridorLamps[i].translation[2] - other.translation[2])).toBeGreaterThanOrEqual(7 - 1e-6)
    }
    for (const room of json.nodes.filter(n => /^\d{3} floor finish$/.test(n.name))) {
      const furnished = json.nodes.some(n => n.name.startsWith(`${room.name.slice(0, 3)} `) && / (desk|chair) /.test(n.name))
      expect(lamps.filter(n => n.extras.lightingZone === `room:${room.name}`)).toHaveLength(furnished ? 2 : 0)
    }
    const sourceBytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3.glb')
    const source = JSON.parse(sourceBytes.toString('utf8', 20, 20 + sourceBytes.readUInt32LE(12)))
    const sourceShell = source.nodes.find(n => n.name === 'Original architectural shell')
    const sourceWall = source.meshes[sourceShell.mesh].primitives.find(p => source.materials[p.material].name === 'Warm ivory walls')
    const ceiling = source.accessors[sourceWall.attributes.POSITION].max[1]
    expect(json.asset.extras.ceilingY).toBe(ceiling)
    for (const lamp of lamps) {
      expect(lamp.translation[1]).toBe(nav.lampHeight)
      const housing = json.nodes.find(n => n.name === lamp.name.replace('diffuser', 'housing'))
      const housingBounds = json.accessors[json.meshes[housing.mesh].primitives[0].attributes.POSITION]
      expect(housing.translation[1] + housingBounds.max[1] * housing.scale[1], `${housing.name} must mount flush beneath the ceiling`).toBeCloseTo(ceiling, 6)
      const diffuserBounds = json.accessors[json.meshes[lamp.mesh].primitives[0].attributes.POSITION]
      expect(lamp.translation[1] + diffuserBounds.max[1] * lamp.scale[1]).toBeLessThanOrEqual(housing.translation[1] + housingBounds.min[1] * housing.scale[1] + 0.005)
    }
  })
  it('keeps corridor fixtures aligned to straight authored rows with a 7 m rhythm', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    const rows = json.asset.extras.lampRows
    expect(rows.length).toBeGreaterThan(0)
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length)
    const corridorLamps = json.nodes.filter(n => /^Campus lamp \d+ diffuser$/.test(n.name) && n.extras.lightingZone === 'corridor')
    const rowDistances = new Map()
    for (const lamp of corridorLamps) {
      const row = rows.find(row => row.id === lamp.extras.lightingRow)
      expect(row, `${lamp.name} must identify an authored corridor row`).toBeDefined()
      const delta = row.b.map((v, i) => v - row.a[i]), length = Math.hypot(...delta)
      expect(length).toBeGreaterThan(0)
      const axis = delta.map(v => v / length), point = [lamp.translation[0], lamp.translation[2]]
      const offset = point.map((v, i) => v - row.a[i])
      expect(offset[0] * axis[1] - offset[1] * axis[0], `${lamp.name} drifts sideways from ${row.id}`).toBeCloseTo(0, 6)
      const distance = offset[0] * axis[0] + offset[1] * axis[1]
      expect(distance).toBeGreaterThanOrEqual(-1e-6)
      expect(distance).toBeLessThanOrEqual(length + 1e-6)
      for (const fixture of [lamp, json.nodes.find(n => n.name === lamp.name.replace('diffuser', 'housing'))]) {
        const angle = 2 * Math.atan2(fixture.rotation[1], fixture.rotation[3])
        expect(Math.cos(angle) * axis[1] + Math.sin(angle) * axis[0], `${fixture.name} must follow ${row.id}`).toBeCloseTo(0, 6)
      }
      if (!rowDistances.has(row.id)) rowDistances.set(row.id, [])
      rowDistances.get(row.id).push(distance)
    }
    for (const row of rows) expect(rowDistances.has(row.id), `${row.id} must retain corridor lighting`).toBe(true)
    for (const [id, distances] of rowDistances) {
      distances.sort((a, b) => a - b)
      for (let i = 1; i < distances.length; i++) {
        const steps = (distances[i] - distances[i - 1]) / 7
        expect(steps, `${id} must preserve 7 m spacing even when a fixture is omitted`).toBeCloseTo(Math.round(steps), 6)
        expect(steps).toBeGreaterThanOrEqual(1 - 1e-6)
      }
    }
  })
  it('keeps each classroom lamp pair on one straight row along its housing axis', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    const lamps = json.nodes.filter(n => /^Campus lamp \d+ diffuser$/.test(n.name) && n.extras.lightingZone.startsWith('room:'))
    const roomZones = new Set(lamps.map(lamp => lamp.extras.lightingZone))
    expect(roomZones.size).toBeGreaterThan(0)
    for (const zone of roomZones) {
      const pair = lamps.filter(lamp => lamp.extras.lightingZone === zone)
      expect(pair, `${zone} must retain two lamps`).toHaveLength(2)
      const housings = pair.map(lamp => json.nodes.find(n => n.name === lamp.name.replace('diffuser', 'housing')))
      const angles = housings.map(housing => 2 * Math.atan2(housing.rotation[1], housing.rotation[3]))
      const dx = pair[1].translation[0] - pair[0].translation[0], dz = pair[1].translation[2] - pair[0].translation[2]
      expect(dx * Math.sin(angles[0]) + dz * Math.cos(angles[0]), `${zone} lamp centres must share the housing row`).toBeCloseTo(0, 6)
      expect(Math.abs(Math.cos(angles[1] - angles[0])), `${zone} housings must share one heading`).toBeCloseTo(1, 6)
    }
  })
  it('keeps complete ceiling fixtures over their room or corridor floor instead of the open atrium', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
    const size = bytes.readUInt32LE(12), json = JSON.parse(bytes.toString('utf8', 20, 20 + size)), bin = bytes.subarray(28 + size)
    const read = index => {
      const a = json.accessors[index], v = json.bufferViews[a.bufferView], dimensions = a.type === 'VEC3' ? 3 : 1, stride = a.componentType === 5123 ? 2 : 4
      return Array.from({ length: a.count }, (_, i) => Array.from({ length: dimensions }, (_, j) => {
        const offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? dimensions * stride) + j * stride
        return a.componentType === 5126 ? bin.readFloatLE(offset) : stride === 2 ? bin.readUInt16LE(offset) : bin.readUInt32LE(offset)
      }))
    }
    const rooms = new Map(json.nodes.filter(n => /^\d{3} floor finish$/.test(n.name)).map(n => {
      const primitive = json.meshes[n.mesh].primitives[0], points = read(primitive.attributes.POSITION), indices = read(primitive.indices).flat(), triangles = []
      for (let i = 0; i < indices.length; i += 3) triangles.push(indices.slice(i, i + 3).map(j => [points[j][0], points[j][2]]))
      return [`room:${n.name}`, triangles]
    }))
    const floors = spatial(patrolGeometry().floors, t => t)
    for (const lamp of json.nodes.filter(n => /^Campus lamp \d+ housing$/.test(n.name))) {
      const diffuser = json.nodes.find(n => n.name === lamp.name.replace('housing', 'diffuser'))
      const angle = 2 * Math.atan2(lamp.rotation[1], lamp.rotation[3]), c = Math.cos(angle), s = Math.sin(angle)
      for (const [x, z] of [[-0.9, -0.14], [-0.9, 0.14], [0.9, -0.14], [0.9, 0.14]]) {
        const point = [lamp.translation[0] + x * c + z * s, lamp.translation[2] - x * s + z * c]
        const floor = rooms.get(diffuser.extras.lightingZone) ?? floors(point)
        expect(floor.some(t => insideTriangle(point, t)), `${lamp.name} extends outside ${diffuser.extras.lightingZone}`).toBe(true)
      }
    }
  })
})
