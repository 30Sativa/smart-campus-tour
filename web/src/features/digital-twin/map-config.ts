/**
 * Presentation transforms for a robot pose in the ROS `map` frame (metres,
 * radians, the frame of Pois.X/Y/Yaw) into something a screen draws:
 * the Staff 3D twin and the Student 2D map. Components never write their own
 * `x, -z, yaw` formula (docs/architecture.md §4).
 *
 * Occupancy raster geometry lives separately in the Admin POI map package,
 * derived directly from ROS YAML/PGM; it does not require landmark calibration.
 * Each presentation map (`MapKey`) has one entry here. Its transforms are
 * calibration results, not guesses: until a transform is measured
 * (`calibrated: false`), a live robot is NOT drawn on that surface, because
 * a robot parked at a wrong spot is worse than no robot.
 *
 * Calibrating: pick three landmarks visible on both the robot map and the
 * drawing (building corners, the gate), read their map coordinates in RViz
 * ("Publish Point") and their coordinates on the drawing, then
 * `fitAffine([...])` and paste the result below.
 */

/** out = [a b; c d] · [x y] + [tx ty] */
export type Affine2D = { a: number; b: number; c: number; d: number; tx: number; ty: number }

export type MapPose = { x: number; y: number; yaw: number }

export type MapConfig = {
  mapKey: string
  /** map metres -> 3D scene ground (u, v); the scene position is (u, 0, -v), Y up. */
  scene: { transform: Affine2D; calibrated: boolean; modelKey?: string }
  /** map metres -> Student 2D map in percent of its drawing (0-100 across, 0-100 down). */
  student2d: { transform: Affine2D; calibrated: boolean }
}

export const IDENTITY: Affine2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

/**
 * Legacy presentation map key, not an alias for the physical map2-v1 raster.
 * The scene transform is the
 * identity the twin already uses for Gazebo and the mocks (map metres drawn
 * 1:1); it is marked uncalibrated for the real campus until measured against
 * the `map.obj` model. The Student drawing is a hand-made illustration, so
 * it needs its own three-point fit before real poses appear on it.
 */
export const MAP_CONFIGS: Record<string, MapConfig> = {
  // Physical occupancy snapshots have no measured transform to the 3D model yet.
  'map2-v1': {
    mapKey: 'map2-v1',
    scene: { transform: IDENTITY, calibrated: false },
    student2d: { transform: IDENTITY, calibrated: false },
  },
  'map2-v2': {
    mapKey: 'map2-v2',
    scene: { transform: IDENTITY, calibrated: false },
    student2d: { transform: IDENTITY, calibrated: false },
  },
  campus_v1: {
    mapKey: 'campus_v1',
    scene: { transform: IDENTITY, calibrated: false },
    student2d: { transform: IDENTITY, calibrated: false },
  },
  // Gazebo preview world and the fleet emulator: map metres == scene metres by construction.
  'map3d-preview-v1': {
    mapKey: 'map3d-preview-v1',
    scene: { transform: IDENTITY, calibrated: true },
    student2d: { transform: IDENTITY, calibrated: false },
  },
}

export function mapConfigFor(mapKey: string | null | undefined): MapConfig | null {
  return (mapKey && MAP_CONFIGS[mapKey]) || null
}

export function applyAffine(t: Affine2D, x: number, y: number) {
  return { x: t.a * x + t.b * y + t.tx, y: t.c * x + t.d * y + t.ty }
}

/** Heading after the transform, from where the robot's nose lands. Handles rotation, scale and a mirrored axis. */
function transformedYaw(t: Affine2D, yaw: number) {
  const dx = t.a * Math.cos(yaw) + t.b * Math.sin(yaw)
  const dy = t.c * Math.cos(yaw) + t.d * Math.sin(yaw)
  return Math.atan2(dy, dx)
}

/** 3D twin: scene position and rotation about +Y. The default identity equals the old `mapToScene`. */
export function mapToScenePose(pose: MapPose, transform: Affine2D = IDENTITY) {
  const p = applyAffine(transform, pose.x, pose.y)
  return { position: [p.x, 0, -p.y] as [number, number, number], rotation: transformedYaw(transform, pose.yaw) }
}

/**
 * Student 2D map: percent position and a heading in degrees, 0 = up,
 * clockwise (SVG `rotate`). `aspect` = drawing width / height, because a
 * percent step across is longer than a percent step down on a 1000x700 drawing.
 * Null when this map has no measured transform for the drawing.
 */
export function mapToStudentPose(config: MapConfig | null, pose: MapPose, aspect = 1000 / 700) {
  if (!config?.student2d.calibrated) return null
  const t = config.student2d.transform
  const p = applyAffine(t, pose.x, pose.y)
  const nose = applyAffine(t, pose.x + Math.cos(pose.yaw), pose.y + Math.sin(pose.yaw))
  const dx = (nose.x - p.x) * aspect
  const dy = nose.y - p.y
  const heading = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
  return { x: p.x, y: p.y, heading }
}

/**
 * Affine transform that maps `from` points onto `to` points: exact for three
 * points, least squares for more. Throws when the points are collinear.
 */
export function fitAffine(pairs: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>): Affine2D {
  if (pairs.length < 3) throw new Error('fitAffine needs at least three landmark pairs')
  // Normal equations for [a b tx] and [c d ty] against rows [x y 1].
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const rx = [0, 0, 0]
  const ry = [0, 0, 0]
  for (const { from, to } of pairs) {
    const row = [from.x, from.y, 1]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i][j] += row[i] * row[j]
      rx[i] += row[i] * to.x
      ry[i] += row[i] * to.y
    }
  }
  const [a, b, tx] = solve3(m, rx)
  const [c, d, ty] = solve3(m, ry)
  return { a, b, c, d, tx, ty }
}

function solve3(m: number[][], r: number[]): [number, number, number] {
  const det = (k: number[][]) =>
    k[0][0] * (k[1][1] * k[2][2] - k[1][2] * k[2][1]) - k[0][1] * (k[1][0] * k[2][2] - k[1][2] * k[2][0]) + k[0][2] * (k[1][0] * k[2][1] - k[1][1] * k[2][0])
  const d = det(m)
  if (Math.abs(d) < 1e-9) throw new Error('Landmarks are collinear; pick three points that form a triangle')
  const col = (i: number) => m.map((row, k) => row.map((value, j) => (j === i ? r[k] : value)))
  return [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d]
}
