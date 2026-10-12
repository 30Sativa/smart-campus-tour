import { readFileSync } from 'node:fs'
import { Box3, Matrix4, Quaternion, Vector3 } from 'three'

export function patrolGeometry(path = 'public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb') {
  const bytes = readFileSync(path)
  const size = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.toString('utf8', 20, 20 + size))
  const bin = bytes.subarray(28 + size)
  const read = index => {
    const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView]
    const dimensions = a.type === 'VEC3' ? 3 : 1, component = a.componentType === 5123 ? 2 : 4
    const view = new DataView(bin.buffer, bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0))
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: dimensions }, (_, j) => {
      const offset = i * (v.byteStride ?? dimensions * component) + j * component
      return a.componentType === 5126 ? view.getFloat32(offset, true) : component === 2 ? view.getUint16(offset, true) : view.getUint32(offset, true)
    }))
  }
  const bounds = new Box3(), edges = [], floors = []
  const visit = (index, parent) => {
    const n = gltf.nodes[index]
    const local = n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(new Vector3().fromArray(n.translation ?? [0, 0, 0]), new Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1]), new Vector3().fromArray(n.scale ?? [1, 1, 1]))
    const matrix = parent.clone().multiply(local)
    if (n.mesh !== undefined) for (const primitive of gltf.meshes[n.mesh].primitives) {
      const vertices = read(primitive.attributes.POSITION).map(p => new Vector3().fromArray(p).applyMatrix4(matrix))
      vertices.forEach(p => bounds.expandByPoint(p))
      const indices = primitive.indices === undefined ? vertices.map((_, i) => i) : read(primitive.indices).flat()
      for (let i = 0; i < indices.length; i += 3) {
        const t = indices.slice(i, i + 3).map(j => vertices[j])
        if (t.every(p => Math.abs(p.y) < 0.08)) floors.push(t.map(p => [p.x, p.z]))
        // Check the whole body envelope, not just one horizontal slice.
        if (Math.min(...t.map(p => p.y)) > 0.49 || Math.max(...t.map(p => p.y)) < 0.06) continue
        for (const height of [0.08, 0.25, 0.4, 0.49]) {
          const hits = []
          for (let j = 0; j < 3; j++) {
            const a = t[j], b = t[(j + 1) % 3]
            if ((a.y < height) !== (b.y < height)) hits.push(a.clone().lerp(b, (height - a.y) / (b.y - a.y)))
          }
          if (hits.length === 2) edges.push({ name: n.name, a: [hits[0].x, hits[0].z], b: [hits[1].x, hits[1].z] })
        }
      }
    }
    n.children?.forEach(child => visit(child, matrix))
  }
  gltf.scenes[gltf.scene ?? 0].nodes.forEach(i => visit(i, new Matrix4()))
  return { bounds, edges, floors }
}

export function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

export function insideTriangle(p, t) {
  const cross = (a, b) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  const signs = [cross(t[0], t[1]), cross(t[1], t[2]), cross(t[2], t[0])]
  return !(signs.some(v => v < -1e-7) && signs.some(v => v > 1e-7))
}
