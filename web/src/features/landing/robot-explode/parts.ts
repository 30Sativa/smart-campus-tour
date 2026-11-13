/**
 * Catalog of the CampusTour robot parts shown in the exploded view of the
 * public Home page (section 04 / Công nghệ).
 *
 * `public/models/robot/campus-amr-explode.glb` is built from the per-part STL
 * export of the SolidWorks assembly `A_Full_Xe - Copy.SLDASM` by
 * `web/scripts/build-robot-explode-glb.py`. Every node in it is named
 * `<group>__<nn>`; this file gives each group its label, its colour and the
 * direction it moves when the robot is taken apart. Model units are metres,
 * origin on the floor under the middle of the robot, +Y up, +Z the front.
 */

export type PartGroupId =
  | 'frame' | 'lid' | 'shell' | 'lowershell' | 'screw'
  | 'wheel' | 'motor' | 'caster'
  | 'driver' | 'drv' | 'pc' | 'pcb' | 'battery'
  | 'sonar' | 'camera' | 'screen'
  | 'lidar' | 'column' | 'pantilt' | 'head' | 'quest'

export type Vec3 = readonly [number, number, number]

type ExplodeRule =
  /** Stays where it is: everything else is taken off it. */
  | { kind: 'fixed' }
  /** Lifted straight up; `spread` also pushes it out along its own horizontal offset. */
  | { kind: 'up'; distance: number; spread?: number }
  /** Pulled out through the nearest side of the body (or a corner), optionally lifted or lowered. */
  | { kind: 'out'; distance: number; lift?: number }
  /** Pan-tilt head: lifted, and its stacked parts pulled apart vertically. */
  | { kind: 'stack'; distance: number; from: number; gain: number }

export type PartGroup = {
  id: PartGroupId
  label: string
  body: string
  color: string
  metalness: number
  roughness: number
  explode: ExplodeRule
  /**
   * Moves as one block (a board with its components) instead of piece by
   * piece: `true` for the whole group, `'side'` for one block on each side of
   * the robot (two identical boards, one left and one right).
   */
  rigid?: boolean | 'side'
  /** Every piece of the group makes one move together (the screws). */
  together?: boolean
}

export const PART_GROUPS: readonly PartGroup[] = [
  { id: 'frame', label: 'Khung xe', body: 'Khung nhôm chịu lực ở giữa robot; mọi bộ phận khác bắt vào khung này.', color: '#a9b4bc', metalness: 0.75, roughness: 0.35, explode: { kind: 'fixed' } },
  { id: 'lid', label: 'Nắp trên', body: 'Tấm nắp đậy khoang điện tử, đồng thời là mặt đỡ trụ giữ đầu camera.', color: '#dfe6ea', metalness: 0.1, roughness: 0.55, explode: { kind: 'up', distance: 0.5 } },
  { id: 'shell', label: 'Vỏ trên', body: 'Các tấm vỏ, góc bo và tấm đệm bao quanh nửa trên thân xe, che khoang điện tử.', color: '#eef2f4', metalness: 0.08, roughness: 0.6, explode: { kind: 'out', distance: 0.58 } },
  { id: 'lowershell', label: 'Vỏ dưới', body: 'Các tấm vỏ và góc bo ở nửa dưới thân xe, ôm quanh bánh xe và động cơ.', color: '#8f989f', metalness: 0.2, roughness: 0.55, explode: { kind: 'out', distance: 0.58 } },
  { id: 'screw', label: 'Ốc vít', body: '32 con ốc giữ các tấm vỏ vào khung.', color: '#a9b3ba', metalness: 0.85, roughness: 0.3, explode: { kind: 'out', distance: 0.72 }, together: true },
  { id: 'sonar', label: 'Cảm biến siêu âm JSN-SR04T', body: 'Bốn cảm biến siêu âm chống nước ở bốn góc, đo khoảng cách tới vật cản quanh robot.', color: '#3b6f8f', metalness: 0.3, roughness: 0.5, explode: { kind: 'out', distance: 0.4 } },
  { id: 'camera', label: 'Camera phía trước', body: 'Camera gắn trên giá ở mũi xe, nhìn về hướng robot di chuyển.', color: '#15191c', metalness: 0.4, roughness: 0.35, explode: { kind: 'out', distance: 0.34 } },
  { id: 'screen', label: 'Màn hình', body: 'Màn hình phía trước thân xe.', color: '#0a0f12', metalness: 0.2, roughness: 0.2, explode: { kind: 'out', distance: 0.46 } },
  { id: 'wheel', label: 'Bánh xe chủ động', body: 'Hai bánh dẫn động hai bên; robot rẽ bằng cách quay hai bánh với tốc độ khác nhau.', color: '#20262b', metalness: 0.1, roughness: 0.85, explode: { kind: 'out', distance: 0.3 } },
  { id: 'caster', label: 'Bánh xe phụ', body: 'Bốn bánh tự lựa ở các góc giữ thân xe cân bằng.', color: '#2b3238', metalness: 0.2, roughness: 0.7, explode: { kind: 'out', distance: 0.16, lift: -0.12 } },
  { id: 'motor', label: 'Động cơ bước 57HS22', body: 'Hai động cơ bước 57 mm, mô-men 2,2 N·m, mỗi động cơ quay một bánh chủ động.', color: '#4a535b', metalness: 0.6, roughness: 0.4, explode: { kind: 'out', distance: 0.15 } },
  { id: 'driver', label: 'Driver động cơ HBS86H', body: 'Hai bộ driver cấp dòng cho hai động cơ bước theo lệnh từ mạch điều khiển.', color: '#1f63b5', metalness: 0.35, roughness: 0.45, explode: { kind: 'up', distance: 0.26, spread: 0.5 } },
  { id: 'pc', label: 'Máy tính Beelink mini PC', body: 'Máy tính trên robot chạy phần mềm tự hành, định vị và gửi dữ liệu về hệ thống vận hành.', color: '#1d2328', metalness: 0.4, roughness: 0.4, explode: { kind: 'up', distance: 0.36, spread: 0.3 }, rigid: true },
  { id: 'pcb', label: 'Mạch điều khiển', body: 'Board vi điều khiển nối động cơ trái/phải, bốn cảm biến siêu âm, IMU và hai trục pan/tilt.', color: '#1f7a4f', metalness: 0.2, roughness: 0.6, explode: { kind: 'up', distance: 0.3, spread: 0.3 }, rigid: true },
  { id: 'drv', label: 'Mạch driver pan/tilt', body: 'Hai mạch driver bước nhỏ điều khiển hai trục quay của đầu camera.', color: '#5b3f8c', metalness: 0.25, roughness: 0.55, explode: { kind: 'up', distance: 0.32, spread: 0.6 }, rigid: 'side' },
  { id: 'battery', label: 'Pin', body: 'Khối pin cấp điện cho động cơ, máy tính và các mạch trên robot.', color: '#2c4f7c', metalness: 0.2, roughness: 0.5, explode: { kind: 'up', distance: 0.22, spread: 0.8 }, rigid: true },
  { id: 'lidar', label: 'Cảm biến LiDAR', body: 'LiDAR trên nắp xe quét quanh robot để định vị, tránh vật cản và bám theo tuyến tham quan.', color: '#2b3138', metalness: 0.35, roughness: 0.4, explode: { kind: 'up', distance: 0.7 } },
  { id: 'column', label: 'Thân trụ', body: 'Trụ đứng nâng đầu camera lên ngang tầm mắt người.', color: '#eef2f4', metalness: 0.08, roughness: 0.55, explode: { kind: 'up', distance: 0.82 } },
  { id: 'pantilt', label: 'Cụm đầu pan-tilt', body: 'Đế xoay, khung và hai trục pan/tilt cho phép xoay và gật đầu camera.', color: '#eef2f4', metalness: 0.08, roughness: 0.55, explode: { kind: 'stack', distance: 0.98, from: 0.85, gain: 1.6 } },
  { id: 'head', label: 'Mô hình đầu', body: 'Giá đỡ hình đầu người, giữ kính Meta Quest 3 đúng tư thế đeo.', color: '#f5f7f9', metalness: 0.05, roughness: 0.6, explode: { kind: 'stack', distance: 0.98, from: 0.85, gain: 1.6 } },
  { id: 'quest', label: 'Kính Meta Quest 3', body: 'Kính đeo trên mô hình đầu truyền góc nhìn của chuyến đi tới học sinh.', color: '#e9ecef', metalness: 0.15, roughness: 0.45, explode: { kind: 'stack', distance: 1.12, from: 0.85, gain: 1.6 } },
]

const BY_ID = new Map(PART_GROUPS.map(group => [group.id, group]))

export function partGroup(id: PartGroupId): PartGroup {
  const group = BY_ID.get(id)
  if (!group) throw new Error(`Unknown robot part group: ${id}`)
  return group
}

/** `shell__07` -> `shell`; null for a node that is not a catalogued part. */
export function groupOfNode(name: string): PartGroupId | null {
  const id = name.split('__')[0]
  return BY_ID.has(id as PartGroupId) ? (id as PartGroupId) : null
}

/** Half the robot body footprint (x: side, z: front), used to tell which side a part sits on. */
const HALF_X = 0.28
const HALF_Z = 0.4

/**
 * Where a part goes when the robot comes apart, as an offset from its
 * assembled position. `center` is the part's (or rigid group's) centre.
 */
export function explodeOffset(rule: ExplodeRule, center: Vec3): Vec3 {
  const [x, y, z] = center
  switch (rule.kind) {
    case 'fixed':
      return [0, 0, 0]
    case 'up': {
      const spread = rule.spread ?? 0
      return [x * spread, rule.distance, z * spread]
    }
    case 'out': {
      const ax = x / HALF_X
      const az = z / HALF_Z
      const big = Math.max(Math.abs(ax), Math.abs(az))
      const lift = rule.lift ?? 0
      if (big < 1e-6) return [0, lift, rule.distance]
      // Near a corner both sides count; otherwise leave through the nearer side.
      if (Math.min(Math.abs(ax), Math.abs(az)) / big > 0.75) {
        const length = Math.hypot(x, z)
        return [(x / length) * rule.distance, lift, (z / length) * rule.distance]
      }
      return Math.abs(ax) >= Math.abs(az)
        ? [Math.sign(x) * rule.distance, lift, 0]
        : [0, lift, Math.sign(z) * rule.distance]
    }
    case 'stack':
      return [0, rule.distance + Math.max(0, y - rule.from) * (rule.gain - 1), 0]
  }
}

/**
 * The order the robot is put together in, from the frame up and the casing
 * last. Taking it apart runs the same order backwards.
 */
export const ASSEMBLY_ORDER: readonly PartGroupId[] = [
  'frame', 'caster', 'motor', 'wheel', 'battery', 'driver', 'drv', 'pcb', 'pc',
  'lid', 'lidar', 'column', 'pantilt', 'head', 'quest',
  'sonar', 'camera', 'screen', 'lowershell', 'shell', 'screw',
]

/**
 * Puts the moves in assembly order: groups as in `ASSEMBLY_ORDER`; within a
 * group, parts pulled out sideways go on round the body starting at the front
 * (+Z) and turning towards +X, and lifted parts go on from the bottom up.
 */
export function orderMoves<T extends { group: PartGroupId; centre: Vec3 }>(moves: readonly T[]): T[] {
  const around = ([x, , z]: Vec3) => (Math.atan2(x, z) + 2 * Math.PI) % (2 * Math.PI)
  return [...moves].sort((a, b) => {
    const byGroup = ASSEMBLY_ORDER.indexOf(a.group) - ASSEMBLY_ORDER.indexOf(b.group)
    if (byGroup !== 0) return byGroup
    return partGroup(a.group).explode.kind === 'out' ? around(a.centre) - around(b.centre) : a.centre[1] - b.centre[1]
  })
}

/** How far apart, in metres, a piece and its mirror image may sit (and differ in size) and still count as a pair. */
const MIRROR_TOLERANCE = { place: 0.035, size: 0.02 }

/**
 * Bundles pieces that move together into one move: the whole group when it
 * goes `together` (the screws), and otherwise a piece with its mirror image on
 * the other side of the robot (the two wheels, the left and right panels).
 * Anything without a twin, such as a front panel, moves on its own.
 */
export function pairMoves<T extends { group: PartGroupId; centre: Vec3; size: Vec3 }>(units: readonly T[]): T[][] {
  const moves: T[][] = []
  const byGroup = new Map<PartGroupId, T[]>()
  for (const unit of units) byGroup.set(unit.group, [...(byGroup.get(unit.group) ?? []), unit])
  for (const [group, members] of byGroup) {
    if (partGroup(group).together) {
      moves.push(members)
      continue
    }
    const free = new Set(members)
    for (const unit of members) {
      if (!free.has(unit)) continue
      free.delete(unit)
      const [x, y, z] = unit.centre
      const twin = Math.abs(x) < MIRROR_TOLERANCE.place ? undefined : [...free].find(other =>
        Math.abs(other.centre[0] + x) < MIRROR_TOLERANCE.place
        && Math.abs(other.centre[1] - y) < MIRROR_TOLERANCE.place
        && Math.abs(other.centre[2] - z) < MIRROR_TOLERANCE.place
        && other.size.every((value, axis) => Math.abs(value - unit.size[axis]) < MIRROR_TOLERANCE.size))
      if (twin) free.delete(twin)
      moves.push(twin ? [unit, twin] : [unit])
    }
  }
  return moves
}

/** How long one move takes, relative to a normal part; small repeated pieces go quicker, all the screws together a little slower. */
const PIECE_TURN: Partial<Record<PartGroupId, number>> = { screw: 1.4, pantilt: 0.6, sonar: 0.7, caster: 0.8, lowershell: 0.7, shell: 0.7, camera: 0.7 }
/** Share of each turn the piece spends still, so one move visibly ends before the next begins. */
const PAUSE = 0.12

/** One move of the assembly: a piece, a mirrored pair or a rigid block going onto the frame. */
export type Step = {
  group: PartGroupId
  /** 1-based position among the moves of its group, and how many that group has. */
  number: number
  of: number
  /** When the move starts and how long it takes, as fractions of the whole assembly. */
  start: number
  length: number
}

/**
 * Lays the moves end to end: every group in `ASSEMBLY_ORDER`, and within a
 * group its `moves[group]` moves one after another. Only one move is ever
 * under way. The frame has no move; everything is put on it.
 */
export function planAssembly(moves: Partial<Record<PartGroupId, number>>): { steps: Map<PartGroupId, Step[]>; turns: number } {
  const queue: { group: PartGroupId; number: number; of: number; turn: number }[] = []
  for (const group of ASSEMBLY_ORDER) {
    if (group === 'frame') continue
    const of = moves[group] ?? 0
    for (let number = 1; number <= of; number += 1) queue.push({ group, number, of, turn: PIECE_TURN[group] ?? 1 })
  }
  const turns = queue.reduce((sum, move) => sum + move.turn, 0)
  const steps = new Map<PartGroupId, Step[]>()
  let at = 0
  for (const move of queue) {
    const step = { group: move.group, number: move.number, of: move.of, start: at / turns, length: (move.turn * (1 - PAUSE)) / turns }
    steps.set(move.group, [...(steps.get(move.group) ?? []), step])
    at += move.turn
  }
  return { steps, turns }
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/** How far a piece is from its place (0 on the frame, 1 fully apart) when the robot is at `progress` (0 together, 1 apart). */
export function stepApart(progress: number, step: Step | undefined): number {
  if (!step) return 0
  const placed = (1 - progress - step.start) / step.length
  return 1 - easeInOut(Math.min(1, Math.max(0, placed)))
}

/** The move whose turn (its motion and the short pause after it) covers `progress`; null while the robot is still. */
export function stepAt(progress: number, steps: ReadonlyMap<PartGroupId, Step[]>): Step | null {
  if (progress <= 0 || progress >= 1) return null
  const placed = 1 - progress
  for (const list of steps.values()) {
    for (const step of list) if (placed >= step.start && placed < step.start + step.length / (1 - PAUSE)) return step
  }
  return null
}

/** The casing: it opens out of the way, and turns see-through, to show a part inside the robot. */
export const CASING: ReadonlySet<PartGroupId> = new Set(['shell', 'lowershell', 'lid', 'screw'])
/** Lifted together with the lid when the robot is opened: the top plate and everything standing on it. */
const TOP_SECTION: ReadonlySet<PartGroupId> = new Set(['lid', 'lidar', 'column', 'pantilt', 'head', 'quest'])
/** How far the top section rises, in metres, and how much of their way out the side panels and screws go. */
export const OPEN = { lift: 0.32, sides: 0.55 } as const

/**
 * Where a part goes when the robot is opened (not taken apart): the top
 * section rises off the frame and the side panels and screws slide part of
 * their way out, so the boards, battery and motors inside can be seen. Parts
 * inside stay where they are. `apart` is the part's offset when taken apart.
 */
export function openOffset(group: PartGroupId, apart: Vec3): Vec3 {
  if (TOP_SECTION.has(group)) return [0, OPEN.lift, 0]
  if (group === 'shell' || group === 'lowershell' || group === 'screw') return [apart[0] * OPEN.sides, apart[1] * OPEN.sides, apart[2] * OPEN.sides]
  return [0, 0, 0]
}
