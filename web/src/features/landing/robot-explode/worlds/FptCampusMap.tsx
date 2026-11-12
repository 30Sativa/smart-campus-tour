import { Suspense, memo, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry as Geometry, CanvasTexture, ClampToEdgeWrapping, CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, IcosahedronGeometry, InstancedMesh,
  Matrix4, MeshBasicMaterial, MeshStandardMaterial, Object3D, Quaternion, RepeatWrapping, SRGBColorSpace, SphereGeometry, Vector3, type BufferGeometry, type Material, type Texture, type WebGLRenderer,
} from 'three'
import type { DriveState } from '../drive'
import {
  BAYS, BAY_ROWS, BIKE_ROWS, BUILDING, CAR_LANES, COURTYARD, DRUM, FLOWER_BEDS, GROVE, GUARD_BOOTH, LAMPS, PARKED_CARS, PARKING, PITCH, PITCH_FENCE, PLAZA, POND,
  RING_ROAD, STATUE, STREET, TREES, WING_PIECES, seeded, type Rect, type WingPiece,
} from './fpt-campus'
import { campusCrowd, stepCrowd } from './fpt-crowd'
import { AssetBoundary, RealCrowd, RealTrees } from './FptCampusAssets'
import { preloadCampusAssets } from './fpt-assets'
import type { MapProps } from './world'

/* The FPT campus demo map in 3D, built from boxes, cylinders and spheres
   drawn in batches (one instanced mesh per kind of thing), with paving and
   grass from small textures painted at load. Scene x = map x, scene z = map
   y, metres; the ground is at y = 0. */

/** One instance: position, size, a turn about the vertical (`r`), then a tilt raising its own +x end (`t`, about its z axis), a colour. */
type Part = { p: readonly [number, number, number]; s: readonly [number, number, number]; r?: number; t?: number; c?: string }

const matrix = new Matrix4()
const turn = new Quaternion()
const tilt = new Quaternion()
const place = new Vector3()
const size = new Vector3()
const UP = new Vector3(0, 1, 0)
const Z_AXIS = new Vector3(0, 0, 1)
const tint = new Color()

/**
 * Writes `parts` into an instanced mesh: position, scale, turn and tilt, and a
 * colour each when given. `bounds` (static batches) also measures the batch;
 * moving ones are rewritten every frame and skip that.
 */
function fill(mesh: InstancedMesh, parts: readonly Part[], bounds = true) {
  parts.forEach((part, index) => {
    turn.setFromAxisAngle(UP, part.r ?? 0)
    if (part.t) turn.multiply(tilt.setFromAxisAngle(Z_AXIS, part.t))
    matrix.compose(place.set(...part.p), turn, size.set(...part.s))
    mesh.setMatrixAt(index, matrix)
    if (part.c) mesh.setColorAt(index, tint.set(part.c))
  })
  mesh.count = parts.length
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  if (bounds) mesh.computeBoundingSphere()
}

/** One batch of identical shapes. `capacity` leaves room for parts that move every frame. */
function Batch({ parts, geometry, material, shadows = true, capacity, meshRef }: { parts: readonly Part[]; geometry: BufferGeometry; material: Material; shadows?: boolean; capacity?: number; meshRef?: MutableRefObject<InstancedMesh | null> }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    if (meshRef) meshRef.current = mesh
    fill(mesh, parts)
  }, [parts, meshRef])
  if (!parts.length && !capacity) return null
  return <instancedMesh ref={ref} args={[geometry, material, Math.max(1, capacity ?? parts.length)]} castShadow={shadows} receiveShadow frustumCulled={false} />
}

const box = new BoxGeometry(1, 1, 1)
const cylinder = new CylinderGeometry(0.5, 0.5, 1, 12)
const taper = new CylinderGeometry(0.32, 0.5, 1, 9)
const ball = new SphereGeometry(0.5, 12, 8)
const leaves = new IcosahedronGeometry(0.5, 1)
/** The terraces' shrubs and flowers, thousands of them seen from below: a lighter blob (20 faces, not 80). */
const bush = new IcosahedronGeometry(0.5, 0)
const disc = new CircleGeometry(0.5, 24).rotateX(-Math.PI / 2)

/**
 * A palm frond: a strip 1 long down +x, arching over and drooping towards its
 * tip, widest a third of the way along; u runs along it, v across.
 */
function frondGeometry() {
  const steps = 10
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const half = 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7 + 0.02
    const y = 0.18 * t - 0.55 * t * t
    positions.push(t, y, -half, t, y + 0.04, 0, t, y, half)
    uvs.push(t, 0, t, 0.5, t, 1)
    if (i < steps) {
      const a = i * 3
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5)
    }
  }
  const geometry = new Geometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
const frond = frondGeometry()

/* ---------- Materials and textures ---------- */

const standard = (color: string, extra: Partial<MeshStandardMaterial> = {}) => Object.assign(new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }), extra)

/** A tiling texture painted on a canvas (none where there is no canvas, as in tests). */
function painted(size: number, paint: (g: CanvasRenderingContext2D) => void) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return null
  paint(g)
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** Herringbone pavers, 20 × 10 cm, on a 3.2 m tile: bricks in `colors`, joints in `joint`. */
function herringbone(colors: readonly string[], joint: string, seed: number) {
  return painted(512, g => {
    const random = seeded(seed)
    const h = 16
    g.fillStyle = joint
    g.fillRect(0, 0, 512, 512)
    const brick = (x: number, y: number, w: number, d: number) => {
      g.fillStyle = colors[Math.floor(random() * colors.length)]
      g.fillRect(x * h + 1, y * h + 1, w * h - 2, d * h - 2)
    }
    // A horizontal brick at (t + 2s, t - 2s) and an upright one below it tile the plane.
    for (let s = -10; s <= 10; s += 1) {
      for (let t = -4; t <= 36; t += 1) {
        const x = t + 2 * s
        const y = t - 2 * s
        if (x < -3 || x > 33 || y < -3 || y > 33) continue
        brick(x, y, 2, 1)
        brick(x, y + 1, 1, 2)
      }
    }
  })
}

/** A palm frond's leaflets: a midrib with narrow leaves angled off it to both edges, on a clear ground. */
function frondTexture() {
  const texture = painted(256, g => {
    const random = seeded(12)
    g.clearRect(0, 0, 256, 256)
    g.lineCap = 'round'
    for (let i = 0; i < 70; i += 1) {
      const x = 6 + (i / 70) * 244
      const reach = 118 * Math.sin(Math.PI * Math.min(1, (x / 256) * 1.15)) ** 0.7 + 6
      for (const side of [-1, 1]) {
        g.strokeStyle = ['#3f7f2f', '#4c8f36', '#5a9a3c', '#356e28'][Math.floor(random() * 4)]
        g.lineWidth = 3 + random() * 2.5
        g.beginPath()
        g.moveTo(x, 128)
        g.quadraticCurveTo(x + 10, 128 + side * reach * 0.6, x + 22 + random() * 8, 128 + side * reach)
        g.stroke()
      }
    }
    g.strokeStyle = '#8b8a4c'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(0, 128)
    g.lineTo(256, 128)
    g.stroke()
  })
  if (texture) { texture.wrapS = ClampToEdgeWrapping; texture.wrapT = ClampToEdgeWrapping }
  return texture
}

/** Grass with soft patches of lighter and darker green, on a 24 m tile. */
function grassTexture() {
  return painted(256, g => {
    const random = seeded(3)
    g.fillStyle = '#7ea653'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 420; i += 1) {
      const x = random() * 256
      const y = random() * 256
      const r = 4 + random() * 22
      g.fillStyle = random() < 0.5 ? 'rgba(98,140,58,0.18)' : 'rgba(160,186,96,0.16)'
      for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
        g.beginPath()
        g.arc(x + dx, y + dy, r, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
}

/** A paved or planted area as one textured plane; `tile` is the texture's size on the ground, m. */
function surface(texture: Texture | null, fallback: string, rect: Rect, tile: number, extra: Partial<MeshStandardMaterial> = {}) {
  const w = rect.maxX - rect.minX
  const d = rect.maxY - rect.minY
  const map = texture?.clone() ?? null
  if (map) {
    map.repeat.set(w / tile, d / tile)
    map.needsUpdate = true
  }
  return { rect, material: standard(map ? '#ffffff' : fallback, { map, ...extra }) }
}

/** Materials shared by the whole map; night changes a few of them in place. */
function makeMaterials() {
  return {
    grassTile: grassTexture(),
    plazaTile: herringbone(['#a9a7a1', '#9c9a94', '#b3b0aa', '#a2a09a', '#8f8d88'], '#7b7975', 41),
    brickTile: herringbone(['#a3533d', '#b0604a', '#954a36', '#a85a41', '#8c4533'], '#6f3b2d', 42),
    grass: standard('#ffffff'),
    grassDark: standard('#5e8f42'),
    lawn: standard('#6f9d4b'),
    stone: standard('#cfcac0'),
    asphalt: standard('#41464b', { roughness: 0.95 }),
    concrete: standard('#b9b6ae'),
    paint: standard('#f2f2ec'),
    curb: standard('#ffffff'),
    slab: standard('#efece5'),
    wall: standard('#f6f4ef'),
    glassLit: standard('#5d707d', { roughness: 0.3, metalness: 0.15 }),
    glassDark: standard('#4f6270', { roughness: 0.3, metalness: 0.15 }),
    louver: standard('#8e979d', { roughness: 0.5, metalness: 0.3 }),
    tile: standard('#c9673f', { roughness: 0.9 }),
    planter: standard('#9a5230', { roughness: 0.8 }),
    shrub: standard('#ffffff'),
    flower: standard('#ffffff', { roughness: 0.7 }),
    hedge: standard('#3f7a35'),
    trunk: standard('#6b5240'),
    palmTrunk: standard('#8d7d68'),
    foliage: standard('#ffffff'),
    frond: (() => { const map = frondTexture(); return standard(map ? '#ffffff' : '#4b8a3a', { map, side: DoubleSide, alphaTest: map ? 0.45 : 0 }) })(),
    pole: standard('#4a5056', { metalness: 0.5, roughness: 0.4 }),
    lampHead: standard('#dfe2e4'),
    floodHead: standard('#e8edf0'),
    glow: new MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    floodGlow: new MeshBasicMaterial({ color: '#eaf3ff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    water: standard('#3d6660', { roughness: 0.12, metalness: 0.35 }),
    canal: standard('#557a7c', { roughness: 0.15, metalness: 0.3 }),
    lotus: standard('#ffffff', { side: DoubleSide }),
    bamboo: standard('#c9a76b'),
    bronze: standard('#7a5a32', { metalness: 0.75, roughness: 0.35 }),
    statue: standard('#8d8a84', { metalness: 0.3, roughness: 0.6 }),
    turf: standard('#ffffff'),
    net: standard('#24452f', { transparent: true, opacity: 0.28, side: DoubleSide, depthWrite: false }),
    shed: standard('#5f84a8', { metalness: 0.4, roughness: 0.5 }),
    orange: standard('#f26f21'),
    seat: standard('#2f6fd0'),
    body: standard('#ffffff', { roughness: 0.45, metalness: 0.15 }),
    tyre: standard('#1b1d20', { roughness: 0.9 }),
    cabin: standard('#1d2830', { roughness: 0.2, metalness: 0.4 }),
    tail: standard('#7a1d16'),
    head: standard('#e8e4d4'),
    legs: standard('#2a3038'),
    cloth: standard('#ffffff'),
    skin: standard('#ffffff'),
    other: standard('#e9e7e1'),
    otherGlass: standard('#62727c', { roughness: 0.3, metalness: 0.15 }),
    otherGlassLit: standard('#62727c', { roughness: 0.3, metalness: 0.15 }),
    blueGlass: standard('#2f5c8f', { roughness: 0.2, metalness: 0.5 }),
    darkGlass: standard('#44515c', { roughness: 0.25, metalness: 0.3 }),
    warehouse: standard('#dcdedd'),
    roofBlue: standard('#4f7fae'),
    crane: standard('#e3b21c', { metalness: 0.4 }),
    reed: standard('#8ea55a'),
  }
}
type Materials = ReturnType<typeof makeMaterials>

/** Day or night: windows, lamps, floodlights and headlights glow at night. */
function lightUp(materials: Materials, night: boolean) {
  const glow = (material: MeshStandardMaterial, color: string, intensity: number) => {
    material.emissive.set(color)
    material.emissiveIntensity = night ? intensity : 0
  }
  glow(materials.glassLit, '#ffcf91', 0.95)
  glow(materials.otherGlassLit, '#ffe0b0', 0.7)
  glow(materials.lampHead, '#ffad55', 2.6)
  glow(materials.floodHead, '#f2f7ff', 3)
  glow(materials.head, '#fff6dc', 2)
  glow(materials.tail, '#ff2a1a', 1.6)
  glow(materials.blueGlass, '#7fb4ff', 0.25)
  materials.glow.opacity = night ? 0.6 : 0
  materials.floodGlow.opacity = night ? 0.4 : 0
}

/* ---------- The building ---------- */

const H = BUILDING.floor
const DEPTH = BUILDING.depth
const SHRUB_GREENS = ['#4c8a37', '#5f9c45', '#3d7a33', '#6aa64c']
const BLOOMS = ['#e2457e', '#ff6fa3', '#d9304f', '#f08a2c', '#c2378f', '#ffd166']

/** Map position of a point `a` along and `c` across (outwards positive) a wing piece. */
function onPiece(piece: WingPiece, a: number, c: number): [number, number] {
  return piece.along === 'x' ? [piece.x + a, piece.y + piece.out * c] : [piece.x + piece.out * c, piece.y + a]
}
/** Scene size of something `a` long along the piece, `c` across it and `h` high. */
function sized(piece: WingPiece, a: number, h: number, c: number): [number, number, number] {
  return piece.along === 'x' ? [a, h, c] : [c, h, a]
}

/**
 * The building, piece by piece and floor by floor: white floors stepping back
 * from the outside as they rise, each step a terracotta terrace with a long
 * planter of shrubs and bougainvillea at its edge; rows of windows; balconies
 * with planters all along the courtyard side; the grey louvred hall at the
 * front right; roof gardens on the high corners.
 */
function buildingParts() {
  const random = seeded(31)
  const slabs: Part[] = []
  const walls: Part[] = []
  const lit: Part[] = []
  const dark: Part[] = []
  const tiles: Part[] = []
  const planters: Part[] = []
  const shrubs: Part[] = []
  const flowers: Part[] = []
  const parapets: Part[] = []
  const louvers: Part[] = []
  const roofTrees: { x: number; y: number; h: number }[] = []

  const greenery = (piece: WingPiece, c: number, y: number, bloom: number) => {
    for (let a = -piece.length / 2 + 0.6; a < piece.length / 2 - 0.3; a += 1.1 + random() * 0.5) {
      const [x, z] = onPiece(piece, a, c)
      const r = 0.55 + random() * 0.45
      shrubs.push({ p: [x, y + r * 0.3, z], s: [r, r * 0.75, r], r: random() * 6, c: SHRUB_GREENS[Math.floor(random() * SHRUB_GREENS.length)] })
      if (random() < bloom) {
        const f = 0.35 + random() * 0.35
        const [fx, fz] = onPiece(piece, a + (random() - 0.5) * 0.6, c + 0.25)
        flowers.push({ p: [fx, y + r * 0.45, fz], s: [f, f * 0.8, f], r: random() * 6, c: BLOOMS[Math.floor(random() * BLOOMS.length)] })
      }
    }
  }

  for (const piece of WING_PIECES) {
    const L = piece.length
    const step = piece.floors > 1 ? Math.min(2.4, 10 / (piece.floors - 1)) : 0
    const back = (k: number) => (piece.hall ? Math.max(0, k - 2) : k) * step
    for (let k = 0; k < piece.floors; k += 1) {
      const d = DEPTH - back(k)
      const c0 = -back(k) / 2
      const base = k * H
      const at = (a: number, c: number, y: number, s: [number, number, number], list: Part[], color?: string) => {
        const [x, z] = onPiece(piece, a, c)
        list.push({ p: [x, y, z], s: sized(piece, ...s), c: color })
      }
      // Floor slab (running on 1 m into the courtyard as the balcony) and the walls.
      at(0, c0 - 0.5, base + 0.15, [L + 0.04, 0.3, d + 1], slabs)
      at(0, c0, base + 0.3 + (H - 0.3) / 2, [L + 0.02, H - 0.3, d - 0.3], walls)
      // Windows on both faces.
      for (const side of [1, -1]) {
        if (side === 1 && piece.hall && k < 3) continue
        const c = c0 + side * ((d - 0.3) / 2 + 0.04)
        const tall = side === -1 && k === 0
        for (let a = -L / 2 + 1.3; a < L / 2 - 0.8; a += 2.6) {
          at(a, c, base + 0.3 + (tall ? 1.55 : 1.7), [1.5, tall ? 2.9 : 2, 0.08], random() < 0.62 ? lit : dark)
        }
      }
      // The balcony on the courtyard side: a white parapet with a long planter along its top.
      if (k >= 1) {
        at(0, c0 - d / 2 - 0.93, base + 0.3 + 0.47, [L + 0.02, 0.95, 0.14], parapets)
        at(0, c0 - d / 2 - 1.05, base + 0.3 + 0.95, [L, 0.42, 0.42], planters)
        greenery(piece, c0 - d / 2 - 1.05, base + 1.4, 0.2)
      } else {
        // A planted bed along the foot of the outside wall.
        at(0, c0 + d / 2 + 0.7, 0.25, [L, 0.5, 0.9], planters)
        greenery(piece, c0 + d / 2 + 0.7, 0.5, 0.1)
      }
      const top = k === piece.floors - 1
      // The roof of this floor: a terracotta terrace where the next floor steps back, the whole roof at the top.
      at(0, c0, base + H + 0.05, [L + 0.02, 0.1, d], tiles)
      if (!top && back(k + 1) > back(k)) {
        at(0, c0 + d / 2 - 0.12, base + H + 0.5, [L + 0.02, 0.9, 0.14], parapets)
        at(0, c0 + d / 2 - 0.4, base + H + 0.75, [L, 0.5, 0.48], planters)
        greenery(piece, c0 + d / 2 - 0.4, base + H + 1.1, 0.45)
      }
      if (top) {
        for (const side of [1, -1]) at(0, c0 + side * (d / 2 - 0.1), base + H + 0.55, [L + 0.02, 1, 0.2], parapets)
        greenery(piece, c0 + d / 2 - 0.6, base + H + 0.25, 0.5)
        if (piece.floors >= 5 && random() < 0.7) {
          const [x, z] = onPiece(piece, (random() - 0.5) * (L - 3), c0 + (random() - 0.5) * (d - 4))
          roofTrees.push({ x, y: z, h: base + H + 0.1 })
        }
      }
    }
    // The hall's screen of grey louvres over its three lower floors.
    if (piece.hall) {
      const c = DEPTH / 2 + 0.45
      for (let a = -L / 2 + 0.3; a < L / 2; a += 0.75) {
        const [x, z] = onPiece(piece, a, c)
        louvers.push({ p: [x, (3 * H) / 2, z], s: sized(piece, 0.14, 3 * H - 0.2, 0.6) })
      }
      for (let k = 1; k <= 3; k += 1) {
        const [x, z] = onPiece(piece, 0, c)
        louvers.push({ p: [x, k * H - 0.1, z], s: sized(piece, L + 0.02, 0.3, 0.7) })
      }
    }
  }
  return { slabs, walls, lit, dark, tiles, planters, shrubs, flowers, parapets, louvers, roofTrees }
}

/* ---------- Ground: roads, paving, markings ---------- */

const span = (rect: Rect, y: number, h: number, c?: string): Part => ({ p: [(rect.minX + rect.maxX) / 2, y, (rect.minY + rect.maxY) / 2], s: [rect.maxX - rect.minX, h, rect.maxY - rect.minY], c })
const STREET_X = 260

function groundParts() {
  const R = RING_ROAD
  const half = R.width / 2
  const asphalt: Part[] = [
    span({ minX: -R.x - half, maxX: R.x + half, minY: R.south - half, maxY: R.south + half }, 0.035, 0.03),
    span({ minX: -R.x - half, maxX: R.x + half, minY: R.north - half, maxY: R.north + half }, 0.035, 0.03),
    span({ minX: R.x - half, maxX: R.x + half, minY: R.south + half, maxY: R.north - half }, 0.035, 0.03),
    span({ minX: -R.x - half, maxX: -R.x + half, minY: R.south + half, maxY: R.north - half }, 0.035, 0.03),
    // From the gate to the campus road, and out over the sidewalk to the street.
    span({ minX: -5, maxX: 5, minY: STREET.sidewalk[0], maxY: R.south - half }, 0.034, 0.03),
    span({ minX: -STREET_X, maxX: STREET_X, minY: STREET.westbound[0], maxY: STREET.westbound[1] }, 0.03, 0.03),
    span({ minX: -STREET_X, maxX: STREET_X, minY: STREET.eastbound[0], maxY: STREET.eastbound[1] }, 0.03, 0.03),
  ]
  const concrete: Part[] = [
    // The bike park's aisle and its way in; the path to the pitch.
    span({ minX: PARKING.minX, maxX: -R.x - half, minY: -3, maxY: 3 }, 0.04, 0.03),
    span({ minX: R.x + half, maxX: PITCH.minX - 2, minY: -2, maxY: 2 }, 0.04, 0.03),
    span({ minX: PITCH.minX - 3.5, maxX: PITCH.maxX + 3.5, minY: PITCH.minY - 3.5, maxY: PITCH.maxY + 3.5 }, 0.03, 0.03),
  ]
  // Stone: round the building, the way in and the hall through the front wing, both sidewalks.
  const stone: Part[] = [
    span({ minX: -BUILDING.halfX - 2.2, maxX: BUILDING.halfX + 2.2, minY: -BUILDING.halfY - 2.2, maxY: BUILDING.halfY + 2.2 }, 0.025, 0.03),
    span({ minX: -12, maxX: 12, minY: R.south + half, maxY: -BUILDING.halfY + 0.5 }, 0.04, 0.03),
    span({ minX: -STREET_X, maxX: STREET_X, minY: STREET.sidewalk[0], maxY: STREET.sidewalk[1] }, 0.09, 0.16),
    span({ minX: -STREET_X, maxX: STREET_X, minY: STREET.farSidewalk[0], maxY: STREET.farSidewalk[1] }, 0.09, 0.16),
  ]
  const median: Part[] = [span({ minX: -STREET_X, maxX: STREET_X, minY: STREET.median[0], maxY: STREET.median[1] }, 0.1, 0.2)]
  // Red and white kerbs along the median.
  const curbs: Part[] = []
  for (let x = -STREET_X; x < STREET_X; x += 1) {
    for (const y of STREET.median) curbs.push({ p: [x + 0.5, 0.13, y], s: [1, 0.26, 0.3], c: Math.round(x) % 2 ? '#c73a2c' : '#f2f2ee' })
  }
  const paint: Part[] = []
  for (let t = -R.x + 6; t < R.x - 6; t += 5) paint.push({ p: [t, 0.055, R.north], s: [2.4, 0.02, 0.14] })
  for (let t = R.south + 6; t < R.north - 6; t += 5) paint.push({ p: [R.x, 0.055, t], s: [0.14, 0.02, 2.4] }, { p: [-R.x, 0.055, t], s: [0.14, 0.02, 2.4] })
  for (let x = -STREET_X; x < STREET_X; x += 9) {
    paint.push({ p: [x, 0.05, -71.6], s: [3.5, 0.02, 0.15] }, { p: [x, 0.05, -88.4], s: [3.5, 0.02, 0.15] })
  }
  for (const y of [-66.4, -76.6, -83.4, -93.6]) paint.push({ p: [0, 0.05, y], s: [2 * STREET_X, 0.02, 0.15] })
  // The zebra crossing at the gate.
  for (const [from, to] of [STREET.westbound, STREET.eastbound]) {
    for (let y = from + 0.8; y < to - 0.4; y += 1.1) paint.push({ p: [2.2, 0.055, y], s: [4, 0.02, 0.55] })
  }
  // Bay lines in the parking.
  for (const bay of BAYS) {
    const row = BAY_ROWS[bay.row]
    for (const side of [-1.3, 1.3]) paint.push({ p: [bay.x + side, 0.05, (row.minY + row.maxY) / 2], s: [0.1, 0.02, row.maxY - row.minY] })
  }
  return { asphalt, concrete, stone, median, curbs, paint }
}

/** Flowing ribbons of colour across the plaza's grey paving, as on the real one. */
function ribbonParts() {
  const ribbons: Part[] = []
  const lines: { color: string; width: number; y: number; curve: (x: number) => number }[] = [
    { color: '#e0703c', width: 2.2, y: 0.056, curve: x => -9 + 7 * Math.sin(x / 9) + 3 * Math.sin(x / 4.1) },
    { color: '#e8b54a', width: 5.2, y: 0.058, curve: x => 14 - 6 * Math.cos(x / 11) + 2 * Math.sin(x / 5) },
    { color: '#d2563a', width: 1.4, y: 0.06, curve: x => -16 + 4 * Math.sin(x / 6 + 1) },
  ]
  for (const line of lines) {
    for (let x = PLAZA.minX + 0.5; x < PLAZA.maxX - 0.5; x += 0.6) {
      const y0 = line.curve(x)
      const y1 = line.curve(x + 0.6)
      if (Math.max(y0, y1) > PLAZA.maxY - line.width / 2 || Math.min(y0, y1) < PLAZA.minY + line.width / 2) continue
      ribbons.push({ p: [x + 0.3, line.y, (y0 + y1) / 2], s: [Math.hypot(0.6, y1 - y0) + 0.08, 0.02, line.width], r: -Math.atan2(y1 - y0, 0.6), c: line.color })
    }
  }
  return ribbons
}

/* ---------- The courtyard ---------- */

function courtyardParts() {
  const random = seeded(8)
  // The statue on its square of hedge (the Self Made Man, carving himself out of the stone).
  const hedge: Part[] = [{ p: [STATUE.x, 0.6, STATUE.y], s: [STATUE.half * 2, 1.2, STATUE.half * 2] }]
  const statue: Part[] = [
    { p: [STATUE.x, 1.45, STATUE.y], s: [2.2, 0.5, 1.6] },
    { p: [STATUE.x - 0.3, 2.6, STATUE.y], s: [1.3, 1.8, 0.9] },
    { p: [STATUE.x + 0.45, 2.55, STATUE.y], s: [0.55, 1.7, 0.45] },
    { p: [STATUE.x + 0.7, 3.25, STATUE.y + 0.1], s: [0.5, 0.2, 0.2], r: 0.4 },
  ]
  const heads: Part[] = [{ p: [STATUE.x + 0.45, 3.6, STATUE.y], s: [0.42, 0.48, 0.42] }]
  // The lotus pond: water, a stone rim, leaves and flowers, and its bamboo fence.
  const water: Part[] = [span(POND, 0.09, 0.06)]
  const rim: Part[] = [
    { p: [(POND.minX + POND.maxX) / 2, 0.15, POND.minY], s: [POND.maxX - POND.minX + 0.4, 0.3, 0.4] },
    { p: [(POND.minX + POND.maxX) / 2, 0.15, POND.maxY], s: [POND.maxX - POND.minX + 0.4, 0.3, 0.4] },
    { p: [POND.minX, 0.15, (POND.minY + POND.maxY) / 2], s: [0.4, 0.3, POND.maxY - POND.minY] },
    { p: [POND.maxX, 0.15, (POND.minY + POND.maxY) / 2], s: [0.4, 0.3, POND.maxY - POND.minY] },
  ]
  const pads: Part[] = []
  const blossoms: Part[] = []
  for (let i = 0; i < 190; i += 1) {
    const x = POND.minX + 0.6 + random() * (POND.maxX - POND.minX - 1.2)
    const y = POND.minY + 0.6 + random() * (POND.maxY - POND.minY - 1.2)
    const r = 0.5 + random() * 0.8
    pads.push({ p: [x, 0.13 + random() * 0.25, y], s: [r, 1, r], r: random() * 6, c: random() < 0.5 ? '#4f8a3c' : '#5d9b45' })
    if (random() < 0.16) blossoms.push({ p: [x + 0.2, 0.55 + random() * 0.3, y], s: [0.32, 0.28, 0.32], c: random() < 0.75 ? '#f39ac0' : '#fff2f6' })
  }
  const bamboo: Part[] = []
  const fence = { minX: POND.minX - 0.6, maxX: POND.maxX + 0.6, minY: POND.minY - 0.6, maxY: POND.maxY + 0.6 }
  const sides: [number, number, number, number][] = [
    [fence.minX, fence.minY, fence.maxX, fence.minY], [fence.maxX, fence.minY, fence.maxX, fence.maxY],
    [fence.maxX, fence.maxY, fence.minX, fence.maxY], [fence.minX, fence.maxY, fence.minX, fence.minY],
  ]
  for (const [x0, y0, x1, y1] of sides) {
    const length = Math.hypot(x1 - x0, y1 - y0)
    const yaw = -Math.atan2(y1 - y0, x1 - x0)
    const bays = Math.max(1, Math.round(length / 2))
    for (let i = 0; i <= bays; i += 1) {
      const u = i / bays
      bamboo.push({ p: [x0 + (x1 - x0) * u, 0.55, y0 + (y1 - y0) * u], s: [0.12, 1.1, 0.12] })
    }
    for (const h of [0.35, 1.0]) bamboo.push({ p: [(x0 + x1) / 2, h, (y0 + y1) / 2], s: [length, 0.08, 0.08], r: yaw })
    // Crossed braces in every bay.
    for (let i = 0; i < bays; i += 1) {
      const u = (i + 0.5) / bays
      const bay = length / bays
      const lean = Math.atan2(0.62, bay)
      for (const sign of [1, -1]) bamboo.push({ p: [x0 + (x1 - x0) * u, 0.68, y0 + (y1 - y0) * u], s: [Math.hypot(bay, 0.62), 0.06, 0.06], r: yaw, t: sign * lean })
    }
  }
  // Flower beds: terracotta edging, and flowers in rows.
  const edging: Part[] = []
  const blooms: Part[] = []
  for (const bed of FLOWER_BEDS) {
    edging.push(span(bed, 0.15, 0.3))
    const colors = ['#ffcd3c', '#ff8a3d', '#e2457e', '#ff5e5b', '#f7f3e8', '#c2378f']
    const color = colors[Math.floor(random() * colors.length)]
    for (let x = bed.minX + 0.3; x < bed.maxX - 0.15; x += 0.42) {
      for (let y = bed.minY + 0.3; y < bed.maxY - 0.15; y += 0.42) {
        const r = 0.26 + random() * 0.14
        blooms.push({ p: [x + (random() - 0.5) * 0.12, 0.36, y + (random() - 0.5) * 0.12], s: [r, r * 0.8, r], r: random() * 6, c: random() < 0.7 ? color : '#4f8a3c' })
      }
    }
  }
  // Big terracotta pots of flowers at the plaza's corners, blue chairs by the statue, benches in the grove.
  const pots: Part[] = []
  for (const [x, y] of [[-28, -20], [28, -20], [-28, 18.5], [28, 12], [-8, -21], [8, -21]] as const) {
    pots.push({ p: [x, 0.45, y], s: [1.4, 0.9, 1.4] })
    blooms.push({ p: [x, 1.05, y], s: [1.3, 0.7, 1.3], c: '#e2457e' }, { p: [x + 0.2, 1.25, y - 0.1], s: [0.8, 0.5, 0.8], c: '#4f8a3c' })
  }
  const seats: Part[] = []
  for (let row = 0; row < 2; row += 1) {
    for (let i = 0; i < 9; i += 1) {
      const x = 11 + i * 1.1
      const y = 0.5 + row * 1.6
      seats.push({ p: [x, 0.45, y], s: [0.48, 0.08, 0.46] }, { p: [x, 0.75, y + 0.22], s: [0.48, 0.5, 0.06] })
    }
  }
  const benches: Part[] = []
  for (let i = 0; i < 6; i += 1) {
    const x = GROVE.minX + 3 + i * 4.2
    for (const y of [GROVE.minY - 2, GROVE.maxY + 2]) benches.push({ p: [x, 0.45, y], s: [1.8, 0.12, 0.5] })
  }
  const lawn: Part[] = [span(COURTYARD, 0.03, 0.03)]
  // The bronze drum in the hall through the front wing.
  const drum: Part[] = [{ p: [DRUM.x, 0.95, DRUM.y], s: [DRUM.r * 2, 1.3, DRUM.r * 2] }]
  const plinth: Part[] = [{ p: [DRUM.x, 0.15, DRUM.y], s: [DRUM.r * 2 + 0.5, 0.3, DRUM.r * 2 + 0.5] }]
  return { hedge, statue, heads, water, rim, pads, blossoms, bamboo, edging, blooms, pots, seats, benches, lawn, drum, plinth }
}

/* ---------- Fence, gate, trees, lamps ---------- */

function fenceParts() {
  const plinth: Part[] = []
  const posts: Part[] = []
  const bars: Part[] = []
  const rails: Part[] = []
  for (const [from, to] of [[-STREET_X, -STREET.gate], [STREET.gate, STREET_X]] as const) {
    const mid = (from + to) / 2
    plinth.push({ p: [mid, 0.22, STREET.fence], s: [to - from, 0.45, 0.35] })
    rails.push({ p: [mid, 1.85, STREET.fence], s: [to - from, 0.07, 0.07] }, { p: [mid, 0.55, STREET.fence], s: [to - from, 0.07, 0.07] })
    for (let x = from; x <= to; x += 2.5) posts.push({ p: [x, 1.05, STREET.fence], s: [0.14, 2.1, 0.14] })
    if (Math.abs(mid) < 200) for (let x = from + 0.15; x < to; x += 0.3) if (Math.abs(x) < 190) bars.push({ p: [x, 1.2, STREET.fence], s: [0.035, 1.3, 0.035] })
  }
  const gate: Part[] = [
    { p: [-STREET.gate - 0.6, 1.7, STREET.fence], s: [1.2, 3.4, 1.2] },
    { p: [STREET.gate + 0.6, 1.7, STREET.fence], s: [1.2, 3.4, 1.2] },
  ]
  const orange: Part[] = [
    { p: [-STREET.gate - 0.6, 3.5, STREET.fence], s: [1.3, 0.25, 1.3] },
    { p: [STREET.gate + 0.6, 3.5, STREET.fence], s: [1.3, 0.25, 1.3] },
    { p: [-STREET.gate - 0.6, 2.2, STREET.fence - 0.62], s: [0.9, 1.1, 0.04] },
    { p: [(GUARD_BOOTH.minX + GUARD_BOOTH.maxX) / 2, 3.05, (GUARD_BOOTH.minY + GUARD_BOOTH.maxY) / 2], s: [4, 0.3, 4] },
  ]
  const booth: Part[] = [span(GUARD_BOOTH, 1.45, 2.9)]
  const boothGlass: Part[] = [{ p: [(GUARD_BOOTH.minX + GUARD_BOOTH.maxX) / 2, 1.8, GUARD_BOOTH.minY - 0.02], s: [2.6, 1, 0.06] }, { p: [GUARD_BOOTH.minX - 0.02, 1.8, (GUARD_BOOTH.minY + GUARD_BOOTH.maxY) / 2], s: [0.06, 1, 2.6] }]
  return { plinth, posts, bars, rails, gate, orange, booth, boothGlass }
}

const GREENS = ['#4f8f3f', '#5d9c46', '#6aa84d', '#478a3c', '#579741']
const PINKS = ['#d94f8a', '#e2669b', '#c23c78']

/** Trees: shade trees with clumped crowns, palms with fronds, flowering trees; and the small trees in the roof gardens. */
function treeParts(roofTrees: readonly { x: number; y: number; h: number }[]) {
  const random = seeded(77)
  const trunks: Part[] = []
  const palmTrunks: Part[] = []
  const crowns: Part[] = []
  const palmCrowns: Part[] = []
  const fronds: Part[] = []
  const planters: Part[] = []
  const rings: Part[] = []
  const shade = (x: number, y: number, ground: number, height: number, pink: boolean) => {
    trunks.push({ p: [x, ground + height * 0.3, y], s: [0.28 + height * 0.02, height * 0.6, 0.28 + height * 0.02] })
    const r = 1.3 + height * 0.2
    const lumps = 3 + Math.floor(random() * 2)
    for (let i = 0; i < lumps; i += 1) {
      const a = random() * Math.PI * 2
      const off = i === 0 ? 0 : r * 0.45
      const k = i === 0 ? 1 : 0.65 + random() * 0.2
      const color = pink && random() < 0.6 ? PINKS[Math.floor(random() * PINKS.length)] : GREENS[Math.floor(random() * GREENS.length)]
      crowns.push({ p: [x + Math.cos(a) * off, ground + height * (0.74 + random() * 0.1) + (i ? r * 0.2 : 0), y + Math.sin(a) * off], s: [r * 2 * k, r * 1.45 * k, r * 2 * k], r: random() * 6, c: color })
    }
  }
  const median = (STREET.median[0] + STREET.median[1]) / 2
  for (const tree of TREES) {
    if (tree.kind === 'palm') {
      const h = tree.height
      palmTrunks.push({ p: [tree.x, h / 2, tree.y], s: [0.42, h, 0.42] })
      palmCrowns.push({ p: [tree.x, h + 0.1, tree.y], s: [0.9, 0.7, 0.9], c: '#4d7a33' })
      const count = 14
      // Fronds all round the crown, arching out: young ones up, old ones hanging lower.
      for (let i = 0; i < count; i += 1) {
        const yaw = (i / count) * Math.PI * 2 + random() * 0.4
        const rise = i % 2 ? 0.55 + random() * 0.35 : -0.05 + random() * 0.3
        const length = 3 + random() * 0.8
        fronds.push({ p: [tree.x, h + 0.1, tree.y], s: [length, length, 1.15], r: -yaw, t: rise })
      }
      if (Math.abs(tree.y - median) < 1) {
        planters.push({ p: [tree.x, 0.35, tree.y], s: [2.4, 0.5, 2.4] })
        rings.push({ p: [tree.x, 0.62, tree.y], s: [2.3, 0.18, 2.3], c: random() < 0.5 ? '#f08a2c' : '#e2457e' })
      }
    } else {
      shade(tree.x, tree.y, 0, tree.height, tree.kind === 'flower')
    }
  }
  for (const tree of roofTrees) shade(tree.x, tree.y, tree.h, 3 + random() * 1.5, random() < 0.4)
  return { trunks, palmTrunks, crowns, palmCrowns, fronds, planters, rings }
}

/** Which way a road lamp's arm reaches: over the nearest road. */
function armDirection(x: number, y: number): [number, number] {
  if (y < -94) return [0, 1]
  if (y < -55) return [0, 1]
  if (y > RING_ROAD.north) return [0, -1]
  return [-Math.sign(x), 0]
}

function lampParts() {
  const poles: Part[] = []
  const arms: Part[] = []
  const heads: Part[] = []
  const globes: Part[] = []
  const glows: Part[] = []
  for (const lamp of LAMPS) {
    if (lamp.kind === 'garden') {
      poles.push({ p: [lamp.x, 1.6, lamp.y], s: [0.1, 3.2, 0.1] })
      globes.push({ p: [lamp.x, 3.3, lamp.y], s: [0.42, 0.42, 0.42] })
      glows.push({ p: [lamp.x, 0.08, lamp.y], s: [5, 1, 5] })
      continue
    }
    const tall = lamp.kind === 'median' ? 10 : 8
    poles.push({ p: [lamp.x, tall / 2, lamp.y], s: [0.18, tall, 0.18] })
    const directions: [number, number][] = lamp.kind === 'median' ? [[0, 1], [0, -1]] : [armDirection(lamp.x, lamp.y)]
    for (const [dx, dy] of directions) {
      arms.push({ p: [lamp.x + dx * 0.9, tall - 0.1, lamp.y + dy * 0.9], s: [dx ? 1.8 : 0.08, 0.08, dy ? 1.8 : 0.08] })
      heads.push({ p: [lamp.x + dx * 1.8, tall - 0.2, lamp.y + dy * 1.8], s: [dx ? 0.8 : 0.36, 0.16, dy ? 0.8 : 0.36] })
      glows.push({ p: [lamp.x + dx * 2.6, 0.075, lamp.y + dy * 2.6], s: [11, 1, 11] })
    }
  }
  return { poles, arms, heads, globes, glows }
}

/* ---------- Parking, pitch, the rest of the Hi-Tech Park ---------- */

const MOTO_COLORS = ['#c0392b', '#1f2d3a', '#e9eef2', '#2f6fb5', '#7a7f85', '#d35400', '#111111', '#8e44ad']

function parkingParts() {
  const random = seeded(5)
  const bikes: Part[] = []
  const seats: Part[] = []
  for (const row of BIKE_ROWS) {
    for (let y = row.minY + 0.5; y < row.maxY; y += 0.82) {
      if (random() < 0.12) continue
      const x = (row.minX + row.maxX) / 2 + (random() - 0.5) * 0.3
      const r = (random() - 0.5) * 0.25
      bikes.push({ p: [x, 0.45, y], s: [1.8, 0.55, 0.32], r, c: MOTO_COLORS[Math.floor(random() * MOTO_COLORS.length)] })
      seats.push({ p: [x - 0.2, 0.8, y], s: [0.7, 0.12, 0.3], r })
    }
  }
  // Turf pavers with a grid of concrete strips; a long shed over the middle row.
  const turf: Part[] = [span(PARKING, 0.035, 0.03)]
  const grid: Part[] = []
  for (let x = PARKING.minX; x <= PARKING.maxX; x += 2) grid.push({ p: [x, 0.055, (PARKING.minY + PARKING.maxY) / 2], s: [0.12, 0.02, PARKING.maxY - PARKING.minY] })
  for (let y = PARKING.minY; y <= PARKING.maxY; y += 2) grid.push({ p: [(PARKING.minX + PARKING.maxX) / 2, 0.055, y], s: [PARKING.maxX - PARKING.minX, 0.02, 0.12] })
  const shed: Part[] = []
  const shedPosts: Part[] = []
  const middle = BIKE_ROWS[2]
  const cx = (middle.minX + middle.maxX) / 2
  for (const [from, to] of [[3.2, 29], [-29, -3.2]] as const) {
    shed.push({ p: [cx, 3.1, (from + to) / 2], s: [7, 0.12, to - from + 0.6], r: 0 })
    for (let y = from + 0.4; y <= to; y += 6) shedPosts.push({ p: [cx, 1.55, y], s: [0.14, 3.1, 0.14] })
  }
  const cars = PARKED_CARS.map(car => ({ x: (car.minX + car.maxX) / 2, y: (car.minY + car.maxY) / 2, yaw: Math.PI / 2, color: car.color }))
  return { bikes, seats, turf, grid, shed, shedPosts, cars }
}

/** A car's body, cabin, headlights and tail lights, from its centre and heading. */
function carParts(cars: readonly { x: number; y: number; yaw: number; color: string }[]) {
  const bodies: Part[] = []
  const cabins: Part[] = []
  const heads: Part[] = []
  const tails: Part[] = []
  const wheels: Part[] = []
  for (const car of cars) {
    const c = Math.cos(car.yaw)
    const s = Math.sin(car.yaw)
    // Scene z is map y; a heading turns the other way about the scene's up axis.
    const at = (along: number, h: number, across = 0): [number, number, number] => [car.x + c * along - s * across, h, car.y + s * along + c * across]
    bodies.push({ p: at(0, 0.66, 0), s: [4.3, 0.72, 1.8], r: -car.yaw, c: car.color })
    cabins.push({ p: at(-0.25, 1.28, 0), s: [2.4, 0.56, 1.62], r: -car.yaw })
    for (const along of [-1.35, 1.35]) for (const across of [-0.82, 0.82]) wheels.push({ p: at(along, 0.34, across), s: [0.68, 0.68, 0.24], r: -car.yaw })
    for (const side of [-0.6, 0.6]) {
      heads.push({ p: at(2.16, 0.68, side), s: [0.06, 0.16, 0.36], r: -car.yaw })
      tails.push({ p: at(-2.16, 0.7, side), s: [0.06, 0.16, 0.36], r: -car.yaw })
    }
  }
  return { bodies, cabins, heads, tails, wheels }
}

/** The football pitch: striped turf, lines and goals, green netting all round, four floodlight masts. */
function pitchParts() {
  const cx = (PITCH.minX + PITCH.maxX) / 2
  const cy = (PITCH.minY + PITCH.maxY) / 2
  const w = PITCH.maxX - PITCH.minX
  const d = PITCH.maxY - PITCH.minY
  const stripes: Part[] = []
  const count = 12
  for (let i = 0; i < count; i += 1) stripes.push({ p: [PITCH.minX + (i + 0.5) * (w / count), 0.05, cy], s: [w / count, 0.03, d], c: i % 2 ? '#3f8f3f' : '#4fa449' })
  const lines: Part[] = [
    { p: [cx, 0.07, PITCH.minY + 1], s: [w - 2, 0.02, 0.12] }, { p: [cx, 0.07, PITCH.maxY - 1], s: [w - 2, 0.02, 0.12] },
    { p: [PITCH.minX + 1, 0.07, cy], s: [0.12, 0.02, d - 2] }, { p: [PITCH.maxX - 1, 0.07, cy], s: [0.12, 0.02, d - 2] },
    { p: [cx, 0.07, cy], s: [0.12, 0.02, d - 2] },
  ]
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * Math.PI * 2
    lines.push({ p: [cx + Math.cos(a) * 4.5, 0.07, cy + Math.sin(a) * 4.5], s: [0.75, 0.02, 0.12], r: -a - Math.PI / 2 })
  }
  for (const [x, dir] of [[PITCH.minX + 1, 1], [PITCH.maxX - 1, -1]] as const) {
    lines.push({ p: [x + dir * 5, 0.07, cy], s: [0.12, 0.02, 12] }, { p: [x + dir * 2.5, 0.07, cy - 6], s: [5, 0.02, 0.12] }, { p: [x + dir * 2.5, 0.07, cy + 6], s: [5, 0.02, 0.12] })
  }
  const goals: Part[] = []
  for (const x of [PITCH.minX + 1, PITCH.maxX - 1]) goals.push({ p: [x, 1, cy - 2.5], s: [0.1, 2, 0.1] }, { p: [x, 1, cy + 2.5], s: [0.1, 2, 0.1] }, { p: [x, 2, cy], s: [0.1, 0.1, 5] })
  const nets: Part[] = []
  const netPosts: Part[] = []
  for (const side of PITCH_FENCE) {
    const along = side.maxX - side.minX > side.maxY - side.minY
    nets.push({ p: [(side.minX + side.maxX) / 2, 3, (side.minY + side.maxY) / 2], s: along ? [side.maxX - side.minX, 6, 0.04] : [0.04, 6, side.maxY - side.minY] })
    const length = along ? side.maxX - side.minX : side.maxY - side.minY
    for (let u = 0; u <= length; u += 4) netPosts.push({ p: [along ? side.minX + u : (side.minX + side.maxX) / 2, 3, along ? (side.minY + side.maxY) / 2 : side.minY + u], s: [0.1, 6, 0.1] })
  }
  const masts: Part[] = []
  const heads: Part[] = []
  const glows: Part[] = []
  for (const [x, y] of [[PITCH.minX - 3, PITCH.minY - 3], [PITCH.maxX + 3, PITCH.minY - 3], [PITCH.minX - 3, PITCH.maxY + 3], [PITCH.maxX + 3, PITCH.maxY + 3]] as const) {
    masts.push({ p: [x, 7, y], s: [0.3, 14, 0.3] })
    heads.push({ p: [x, 14.2, y], s: [1.8, 1, 0.4], r: -Math.atan2(cy - y, cx - x) + Math.PI / 2 })
    glows.push({ p: [x + (cx - x) * 0.35, 0.09, y + (cy - y) * 0.35], s: [26, 1, 26] })
  }
  return { stripes, lines, goals, nets, netPosts, masts, heads, glows }
}

/** A plain block of a building: walls, a band of windows on every floor, the roof. */
function block(list: { walls: Part[]; glass: Part[]; lit: Part[]; roofs: Part[] }, x: number, y: number, w: number, d: number, floors: number, random: () => number, floor = 4) {
  list.walls.push({ p: [x, (floors * floor) / 2, y], s: [w, floors * floor, d] })
  for (let k = 0; k < floors; k += 1) {
    const band = { p: [x, k * floor + floor * 0.55, y] as [number, number, number], s: [w + 0.06, floor * 0.42, d + 0.06] as [number, number, number] }
    ;(random() < 0.55 ? list.lit : list.glass).push(band)
  }
  list.roofs.push({ p: [x, floors * floor + 0.15, y], s: [w - 0.6, 0.3, d - 0.6] })
}

/**
 * Round the campus: the incubator behind it, the canal and the reed beds
 * beyond, the buildings across street D1, warehouses, a glass tower going up
 * by the roundabout, and the city far off.
 */
function surroundingParts() {
  const random = seeded(11)
  const plain = { walls: [] as Part[], glass: [] as Part[], lit: [] as Part[], roofs: [] as Part[] }
  block(plain, 0, 76, 68, 20, 3, random)
  block(plain, -55, -129, 60, 40, 6, random)
  block(plain, 60, -122, 30, 22, 4, random)
  block(plain, -150, 95, 40, 26, 5, random)
  const warehouses: Part[] = []
  const blueRoofs: Part[] = []
  for (const [x, y, w, d] of [[-190, -150, 70, 40], [150, -160, 80, 46], [-250, 40, 60, 90], [230, 110, 90, 50], [120, 170, 70, 40], [-90, 190, 60, 36]] as const) {
    warehouses.push({ p: [x, 4.5, y], s: [w, 9, d] })
    blueRoofs.push({ p: [x, 9.2, y], s: [w + 1, 0.4, d + 1], c: random() < 0.5 ? '#4f7fae' : '#d8dcdf' })
  }
  // The tower going up near the roundabout, its cranes, and a dark office block.
  const blue: Part[] = [{ p: [235, 21, -135], s: [40, 42, 28] }]
  const cranes: Part[] = [
    { p: [220, 30, -150], s: [1.2, 60, 1.2] }, { p: [232, 59, -150], s: [32, 1.2, 1.2] },
    { p: [255, 28, -120], s: [1.2, 56, 1.2] }, { p: [244, 55, -120], s: [28, 1.2, 1.2] },
  ]
  const darkGlass: Part[] = [{ p: [190, 18, 70], s: [26, 36, 22] }]
  // The roundabout down the street.
  const roundabout: Part[] = [{ p: [235, 0.25, -80], s: [36, 0.4, 36] }]
  // The city far off, in the haze.
  const city: Part[] = []
  for (let i = 0; i < 26; i += 1) {
    const angle = Math.PI * (0.55 + random() * 0.6)
    const far = 420 + random() * 160
    const h = 40 + random() * 70
    city.push({ p: [Math.cos(angle) * far, h / 2, Math.sin(angle) * far], s: [20 + random() * 20, h, 20 + random() * 20] })
  }
  // The canal behind the campus, and reed beds and scrub on the open land round it.
  const canal: Part[] = []
  for (let x = -320; x < 320; x += 4) {
    const y0 = 118 + 14 * Math.sin(x / 70)
    const y1 = 118 + 14 * Math.sin((x + 4) / 70)
    canal.push({ p: [x + 2, 0.05, (y0 + y1) / 2], s: [Math.hypot(4, y1 - y0) + 0.3, 0.04, 22], r: -Math.atan2(y1 - y0, 4) })
  }
  const reeds: Part[] = []
  for (let i = 0; i < 380; i += 1) {
    const x = -330 + random() * 660
    const y = -250 + random() * 520
    const inCampus = x > -135 && x < 150 && y > -100 && y < 92
    const onCanal = Math.abs(y - (118 + 14 * Math.sin(x / 70))) < 12
    const onStreet = y > -100 && y < -60
    if (inCampus || onCanal || onStreet) continue
    if ([...warehouses, ...plain.walls, ...blue, ...darkGlass].some(part => Math.abs(part.p[0] - x) < part.s[0] / 2 + 3 && Math.abs(part.p[2] - y) < part.s[2] / 2 + 3)) continue
    const r = 1.2 + random() * 2.4
    reeds.push({ p: [x, r * 0.5, y], s: [r * 1.7, r * 1.3, r * 1.7], r: random() * 6, c: ['#5f8a45', '#6e9446', '#4f7a3a', '#86a052'][Math.floor(random() * 4)] })
  }
  return { plain, warehouses, blueRoofs, blue, cranes, darkGlass, roundabout, city, canal, reeds }
}

/* ---------- People and moving cars ---------- */

const MAX_PEOPLE = 110
const MAX_CARS = 16

function crowdParts(time: number, robot?: { x: number; y: number }, clear = 0, people = true) {
  const legs: Part[] = []
  const torsos: Part[] = []
  const heads: Part[] = []
  for (const person of people ? [...campusCrowd.walkers, ...campusCrowd.idlers] : []) {
    if (robot && clear > 0 && Math.hypot(person.x - robot.x, person.y - robot.y) < clear) continue
    const bob = person.moving ? Math.abs(Math.sin(time * 9 + person.x)) * 0.05 : 0
    legs.push({ p: [person.x, 0.45 + bob, person.y], s: [0.36, 0.9, 0.24], r: -person.yaw })
    torsos.push({ p: [person.x, 1.2 + bob, person.y], s: [0.46, 0.62, 0.3], r: -person.yaw, c: person.shirt })
    heads.push({ p: [person.x, 1.68 + bob, person.y], s: [0.26, 0.28, 0.26], c: person.skin })
  }
  const cars = carParts(campusCrowd.cars.map(car => ({ x: car.x, y: car.y, yaw: CAR_LANES[car.lane].dir > 0 ? 0 : Math.PI, color: car.color })))
  return { legs, torsos, heads, cars }
}

/** Walks the people and drives the cars each frame, giving way to the robot. */
function Crowd({ materials, driveRef, clearRef, boxes = true }: { materials: Materials; driveRef: MutableRefObject<DriveState>; clearRef?: MutableRefObject<number>; /** Draw the people as simple figures (off when the real avatars are shown). */ boxes?: boolean }) {
  const legsRef = useRef<InstancedMesh | null>(null)
  const torsosRef = useRef<InstancedMesh | null>(null)
  const headsRef = useRef<InstancedMesh | null>(null)
  const bodiesRef = useRef<InstancedMesh | null>(null)
  const cabinsRef = useRef<InstancedMesh | null>(null)
  const lightsRef = useRef<InstancedMesh | null>(null)
  const tailsRef = useRef<InstancedMesh | null>(null)
  const wheelsRef = useRef<InstancedMesh | null>(null)
  const initial = useMemo(() => crowdParts(0), [])
  useFrame((state, delta) => {
    stepCrowd(campusCrowd, Math.min(delta, 0.1), driveRef.current)
    const parts = crowdParts(state.clock.elapsedTime, driveRef.current, clearRef?.current ?? 0, boxes)
    const write = (mesh: InstancedMesh | null, list: readonly Part[]) => { if (mesh) fill(mesh, list, false) }
    write(legsRef.current, parts.legs)
    write(torsosRef.current, parts.torsos)
    write(headsRef.current, parts.heads)
    write(bodiesRef.current, parts.cars.bodies)
    write(cabinsRef.current, parts.cars.cabins)
    write(lightsRef.current, parts.cars.heads)
    write(tailsRef.current, parts.cars.tails)
    write(wheelsRef.current, parts.cars.wheels)
  })
  return (
    <>
      {boxes && (
        <>
          <Batch parts={initial.legs} geometry={box} material={materials.legs} capacity={MAX_PEOPLE} meshRef={legsRef} />
          <Batch parts={initial.torsos} geometry={box} material={materials.cloth} capacity={MAX_PEOPLE} meshRef={torsosRef} />
          <Batch parts={initial.heads} geometry={ball} material={materials.skin} capacity={MAX_PEOPLE} meshRef={headsRef} />
        </>
      )}
      <Batch parts={initial.cars.bodies} geometry={box} material={materials.body} capacity={MAX_CARS} meshRef={bodiesRef} />
      <Batch parts={initial.cars.cabins} geometry={box} material={materials.cabin} capacity={MAX_CARS} meshRef={cabinsRef} />
      <Batch parts={initial.cars.heads} geometry={box} material={materials.head} capacity={MAX_CARS * 2} meshRef={lightsRef} shadows={false} />
      <Batch parts={initial.cars.tails} geometry={box} material={materials.tail} capacity={MAX_CARS * 2} meshRef={tailsRef} shadows={false} />
      <Batch parts={initial.cars.wheels} geometry={box} material={materials.tyre} capacity={MAX_CARS * 4} meshRef={wheelsRef} />
    </>
  )
}

/** A textured area of ground as one plane. */
function Surface({ area, y }: { area: { rect: Rect; material: Material }; y: number }) {
  const { rect, material } = area
  return (
    <mesh position={[(rect.minX + rect.maxX) / 2, y, (rect.minY + rect.maxY) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={material}>
      <planeGeometry args={[rect.maxX - rect.minX, rect.maxY - rect.minY]} />
    </mesh>
  )
}

/**
 * The FPT University campus demo map (Saigon Hi-Tech Park): the white
 * terraced building round its courtyard, the plaza, statue and lotus pond,
 * the parking under the trees, the gate onto street D1 and its traffic, the
 * motorbike park and the pitch, the canal and the Hi-Tech Park beyond, people
 * walking about. `night` lights the windows, lamps, floodlights and headlights.
 */
export const FptCampusMap = memo(function FptCampusMap({ night, driveRef, clearRef, lite = false }: MapProps) {
  // The real trees and people start downloading together, unless the lighter look is on.
  useMemo(() => { if (!lite) preloadCampusAssets() }, [lite])
  const materials = useMemo(() => makeMaterials(), [])
  useLayoutEffect(() => lightUp(materials, night), [materials, night])
  const areas = useMemo(() => ({
    grass: surface(materials.grassTile, '#7ea653', { minX: -700, maxX: 700, minY: -700, maxY: 700 }, 24),
    forecourt: surface(materials.brickTile, '#a3533d', { minX: -92, maxX: 92, minY: STREET.fence, maxY: -BUILDING.halfY - 2.2 }, 3.2),
    plaza: surface(materials.plazaTile, '#a9a7a1', PLAZA, 3.2),
  }), [materials])
  const parts = useMemo(() => {
    const building = buildingParts()
    const parking = parkingParts()
    return {
      building,
      ground: groundParts(),
      ribbons: ribbonParts(),
      court: courtyardParts(),
      fence: fenceParts(),
      trees: treeParts(building.roofTrees),
      lamps: lampParts(),
      parking,
      parkedCars: carParts(parking.cars),
      pitch: pitchParts(),
      around: surroundingParts(),
    }
  }, [])
  const { building, ground, ribbons, court, fence, trees, lamps, parking, parkedCars, pitch, around } = parts
  const m = materials
  const simpleTrees = (
    <>
      <Batch parts={trees.trunks} geometry={taper} material={m.trunk} />
      <Batch parts={trees.crowns} geometry={leaves} material={m.foliage} />
    </>
  )
  const simpleCrowd = <Crowd materials={materials} driveRef={driveRef} clearRef={clearRef} />
  return (
    <group>
      {/* Ground: grass everywhere, then paving, roads, markings and kerbs on top. */}
      <Surface area={areas.grass} y={0} />
      <Surface area={areas.forecourt} y={0.02} />
      <Batch parts={ground.stone} geometry={box} material={m.stone} shadows={false} />
      <Batch parts={court.lawn} geometry={box} material={m.lawn} shadows={false} />
      <Surface area={areas.plaza} y={0.052} />
      <Batch parts={ribbons} geometry={box} material={m.curb} shadows={false} />
      <Batch parts={ground.asphalt} geometry={box} material={m.asphalt} shadows={false} />
      <Batch parts={ground.concrete} geometry={box} material={m.concrete} shadows={false} />
      <Batch parts={ground.median} geometry={box} material={m.grassDark} shadows={false} />
      <Batch parts={ground.curbs} geometry={box} material={m.curb} shadows={false} />
      <Batch parts={ground.paint} geometry={box} material={m.paint} shadows={false} />

      {/* The building. */}
      <Batch parts={building.slabs} geometry={box} material={m.slab} />
      <Batch parts={building.walls} geometry={box} material={m.wall} />
      <Batch parts={building.lit} geometry={box} material={m.glassLit} shadows={false} />
      <Batch parts={building.dark} geometry={box} material={m.glassDark} shadows={false} />
      <Batch parts={building.tiles} geometry={box} material={m.tile} />
      <Batch parts={building.planters} geometry={box} material={m.planter} />
      <Batch parts={building.shrubs} geometry={bush} material={m.shrub} shadows={false} />
      <Batch parts={building.flowers} geometry={bush} material={m.flower} shadows={false} />
      <Batch parts={building.parapets} geometry={box} material={m.slab} />
      <Batch parts={building.louvers} geometry={box} material={m.louver} />

      {/* The courtyard. */}
      <Batch parts={court.hedge} geometry={box} material={m.hedge} />
      <Batch parts={court.statue} geometry={box} material={m.statue} />
      <Batch parts={court.heads} geometry={ball} material={m.statue} />
      <Batch parts={court.water} geometry={box} material={m.water} shadows={false} />
      <Batch parts={court.rim} geometry={box} material={m.stone} />
      <Batch parts={court.pads} geometry={disc} material={m.lotus} shadows={false} />
      <Batch parts={court.blossoms} geometry={leaves} material={m.flower} shadows={false} />
      <Batch parts={court.bamboo} geometry={cylinder} material={m.bamboo} />
      <Batch parts={court.edging} geometry={box} material={m.planter} />
      <Batch parts={court.blooms} geometry={leaves} material={m.flower} shadows={false} />
      <Batch parts={court.pots} geometry={taper} material={m.planter} />
      <Batch parts={court.seats} geometry={box} material={m.seat} />
      <Batch parts={court.benches} geometry={box} material={m.planter} />
      <Batch parts={court.drum} geometry={cylinder} material={m.bronze} />
      <Batch parts={court.plinth} geometry={cylinder} material={m.stone} />

      {/* Fence, gate, guard booth. */}
      <Batch parts={fence.plinth} geometry={box} material={m.stone} />
      <Batch parts={fence.posts} geometry={box} material={m.pole} />
      <Batch parts={fence.bars} geometry={box} material={m.pole} shadows={false} />
      <Batch parts={fence.rails} geometry={box} material={m.pole} />
      <Batch parts={fence.gate} geometry={box} material={m.wall} />
      <Batch parts={fence.orange} geometry={box} material={m.orange} />
      <Batch parts={fence.booth} geometry={box} material={m.wall} />
      <Batch parts={fence.boothGlass} geometry={box} material={m.glassLit} />

      {/* Trees: the real ones once loaded, simple ones meanwhile; the palms. */}
      {lite ? simpleTrees : (
        <AssetBoundary fallback={simpleTrees}>
          <Suspense fallback={simpleTrees}>
            <RealTrees roofTrees={building.roofTrees} />
          </Suspense>
        </AssetBoundary>
      )}
      <Batch parts={trees.palmTrunks} geometry={taper} material={m.palmTrunk} />
      <Batch parts={trees.palmCrowns} geometry={leaves} material={m.foliage} />
      <Batch parts={trees.fronds} geometry={frond} material={m.frond} />
      <Batch parts={trees.planters} geometry={cylinder} material={m.stone} />
      <Batch parts={trees.rings} geometry={leaves} material={m.flower} shadows={false} />

      {/* Lamps. */}
      <Batch parts={lamps.poles} geometry={cylinder} material={m.pole} />
      <Batch parts={lamps.arms} geometry={box} material={m.pole} />
      <Batch parts={lamps.heads} geometry={box} material={m.lampHead} shadows={false} />
      <Batch parts={lamps.globes} geometry={ball} material={m.lampHead} shadows={false} />
      <Batch parts={lamps.glows} geometry={disc} material={m.glow} shadows={false} />

      {/* The bike park and the cars in front. */}
      <Batch parts={parking.turf} geometry={box} material={m.grassDark} shadows={false} />
      <Batch parts={parking.grid} geometry={box} material={m.concrete} shadows={false} />
      <Batch parts={parking.bikes} geometry={box} material={m.body} />
      <Batch parts={parking.seats} geometry={box} material={m.legs} />
      <Batch parts={parking.shed} geometry={box} material={m.shed} />
      <Batch parts={parking.shedPosts} geometry={box} material={m.pole} />
      <Batch parts={parkedCars.bodies} geometry={box} material={m.body} />
      <Batch parts={parkedCars.cabins} geometry={box} material={m.cabin} />
      <Batch parts={parkedCars.wheels} geometry={box} material={m.tyre} />

      {/* The pitch. */}
      <Batch parts={pitch.stripes} geometry={box} material={m.turf} shadows={false} />
      <Batch parts={pitch.lines} geometry={box} material={m.paint} shadows={false} />
      <Batch parts={pitch.goals} geometry={box} material={m.paint} />
      <Batch parts={pitch.nets} geometry={box} material={m.net} shadows={false} />
      <Batch parts={pitch.netPosts} geometry={box} material={m.pole} />
      <Batch parts={pitch.masts} geometry={box} material={m.pole} />
      <Batch parts={pitch.heads} geometry={box} material={m.floodHead} shadows={false} />
      <Batch parts={pitch.glows} geometry={disc} material={m.floodGlow} shadows={false} />

      {/* Round the campus. */}
      <Batch parts={around.plain.walls} geometry={box} material={m.other} />
      <Batch parts={around.plain.glass} geometry={box} material={m.otherGlass} shadows={false} />
      <Batch parts={around.plain.lit} geometry={box} material={m.otherGlassLit} shadows={false} />
      <Batch parts={around.plain.roofs} geometry={box} material={m.concrete} />
      <Batch parts={around.warehouses} geometry={box} material={m.warehouse} />
      <Batch parts={around.blueRoofs} geometry={box} material={m.foliage} />
      <Batch parts={around.blue} geometry={box} material={m.blueGlass} />
      <Batch parts={around.cranes} geometry={box} material={m.crane} />
      <Batch parts={around.darkGlass} geometry={box} material={m.darkGlass} />
      <Batch parts={around.roundabout} geometry={cylinder} material={m.grassDark} shadows={false} />
      <Batch parts={around.city} geometry={box} material={m.other} shadows={false} />
      <Batch parts={around.canal} geometry={box} material={m.canal} shadows={false} />
      <Batch parts={around.reeds} geometry={leaves} material={m.foliage} shadows={false} />

      {/* People: real avatars once loaded, simple figures meanwhile. */}
      {lite ? simpleCrowd : (
        <AssetBoundary fallback={simpleCrowd}>
          <Suspense fallback={simpleCrowd}>
            <Crowd materials={materials} driveRef={driveRef} clearRef={clearRef} boxes={false} />
            <RealCrowd driveRef={driveRef} clearRef={clearRef} />
          </Suspense>
        </AssetBoundary>
      )}
    </group>
  )
})

/**
 * Draws the shadows every other frame (the sun follows the robot, so they
 * keep up, at half the cost); back to every frame when taken away.
 */
function HalfRateShadows() {
  const renderer = useRef<WebGLRenderer | null>(null)
  useFrame(({ gl }) => {
    renderer.current = gl
    drawShadowsEvery(gl, 2)
  })
  useLayoutEffect(() => () => drawShadowsEvery(renderer.current, 1), [])
  return null
}

/** Shadows drawn on one frame in `every` (1: all of them, as three.js does by itself). */
function drawShadowsEvery(gl: WebGLRenderer | null, every: number) {
  if (!gl) return
  gl.shadowMap.autoUpdate = every <= 1
  if (every > 1 && gl.info.render.frame % every === 0) gl.shadowMap.needsUpdate = true
}

const SUN = { day: new Vector3(-40, 70, -30), night: new Vector3(40, 50, 30) }

/** Sun (or moon) and sky light; the sun follows the robot so its shadows stay sharp near it. */
export const FptCampusLights = memo(function FptCampusLights({ night, driveRef, lite = false }: MapProps) {
  const sun = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  useFrame(() => {
    const light = sun.current
    if (!light) return
    const { x, y } = driveRef.current
    target.position.set(x, 0, y)
    target.updateMatrixWorld()
    light.position.copy(night ? SUN.night : SUN.day).add(target.position)
  })
  return (
    <>
      <primitive object={target} />
      <hemisphereLight args={night ? ['#3a5578', '#0d1620', 0.55] : ['#e6f1fb', '#7a8c5c', 1.2]} />
      <ambientLight intensity={night ? 0.12 : 0.22} />
      <directionalLight
        ref={sun}
        target={target}
        color={night ? '#9db8ff' : '#fff0d6'}
        intensity={night ? 0.45 : 2.5}
        castShadow={!lite}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      {!lite && <HalfRateShadows />}
    </>
  )
})
