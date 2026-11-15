import { Suspense, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { BufferAttribute, BufferGeometry, Group, Matrix3, Mesh, MeshStandardMaterial, ShaderMaterial, type Object3D } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { PART_GROUPS, groupOfNode, type PartGroupId } from '../landing/robot-explode/parts'
import type { RobotPose } from './demo-motion'
import { mapToScenePose, type Affine2D } from './map-config'

/** The current robot (SolidWorks `A_Full_Xe`), the same file the Home page takes apart. */
const ROBOT_URL = `${import.meta.env.BASE_URL}models/robot/campus-amr-explode.glb`
/** That model faces +Z; the twin's robot frame faces +X (ROS forward, left is -Z), a quarter turn left. */
export const CAD_ROBOT_TURN = Math.PI / 2

/** A part's geometry in the model root's frame, as plain float position/normal (the file is quantised), indexed. */
function bakedGeometry(mesh: Mesh): BufferGeometry {
  const source = mesh.geometry
  const position = source.getAttribute('position'), normal = source.getAttribute('normal')
  const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld)
  const positions = new Float32Array(position.count * 3), normals = new Float32Array(position.count * 3)
  const point = mesh.position.clone()
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).toArray(positions, i * 3)
    if (normal) point.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize().toArray(normals, i * 3)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  const index = source.getIndex()
  geometry.setIndex(index ? Array.from({ length: index.count }, (_, i) => index.getX(i)) : Array.from({ length: position.count }, (_, i) => i))
  if (!normal) geometry.computeVertexNormals()
  return geometry
}

/**
 * The robot file has 142 parts; six patrol robots would cost ~850 draw calls.
 * Parts are merged into one mesh per colour group (PART_GROUPS), once per
 * loaded file, and every robot shares those geometries and materials.
 */
const mergedRobots = new WeakMap<Object3D, Group>()
function mergedRobot(scene: Object3D): Group {
  const cached = mergedRobots.get(scene)
  if (cached) return cached
  scene.updateMatrixWorld(true)
  const parts = new Map<PartGroupId | 'other', BufferGeometry[]>()
  scene.traverse(child => {
    if (!(child instanceof Mesh)) return
    const group = groupOfNode(child.name) ?? 'other'
    parts.set(group, [...(parts.get(group) ?? []), bakedGeometry(child)])
  })
  const root = new Group()
  for (const [id, geometries] of parts) {
    const style = PART_GROUPS.find(group => group.id === id)
    const material = new MeshStandardMaterial(style ? { color: style.color, metalness: style.metalness, roughness: style.roughness } : { color: '#9aa5ae', roughness: 0.6 })
    const merged = mergeGeometries(geometries)
    geometries.forEach(geometry => geometry.dispose())
    if (!merged) continue
    // The campus shadow map is baked once (TwinScene); a moving robot gets a contact blob instead.
    const mesh = new Mesh(merged, material)
    mesh.name = `robot-${id}`
    mesh.castShadow = false
    mesh.receiveShadow = true
    root.add(mesh)
  }
  mergedRobots.set(scene, root)
  return root
}

function CadRobot() {
  const { scene } = useGLTF(ROBOT_URL, false, true)
  const model = useMemo(() => mergedRobot(scene).clone(), [scene])
  return <primitive object={model} rotation={[0, CAD_ROBOT_TURN, 0]} dispose={null} />
}

/** A soft dark disc under the robot: its shadow without a shadow-map pass. One material shared by every robot. */
const blobMaterial = new ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false,
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'varying vec2 vUv; void main(){float r=length(vUv-0.5)*2.0;gl_FragColor=vec4(0.0,0.0,0.0,0.35*(1.0-smoothstep(0.35,1.0,r)));}',
})
function BlobShadow() {
  return <mesh name="robot-blob-shadow" position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={blobMaterial} renderOrder={-1} raycast={() => {}}>
    <planeGeometry args={[1.25, 1.25]} />
  </mesh>
}

/**
 * The CampusTour robot in the 3D scene: with `cad`, the real robot (two-wheel base, column, pan/tilt head
 * with the Quest 3); otherwise a light two-wheel marker carrying the camera on a pan head.
 *
 * - It eases toward each new pose rather than jumping, so a ~1 Hz telemetry
 *   stream still reads as motion; `smoothing` is how fast it catches up. It
 *   never moves past the last sample it was given. While it is still easing
 *   (or pulsing) it asks for the next frame, so an on-demand canvas keeps
 *   drawing exactly as long as something moves.
 * - `livePose`, when given, is read every frame instead of `pose` (the
 *   simulated patrol, which advances outside React).
 * - `headYaw` turns only the camera head, relative to the body: panning the
 *   camera never turns the body marker (scope §11.6).
 * - `accent` carries status colour; `pulse` draws one soft ring under a robot
 *   that is actively driving; `dimmed` greys a robot out of focus or stale.
 */
export function RobotModel({ pose, livePose, transform, accent = '#2f62b8', pulse = false, dimmed = false, stale = false, smoothing = 4, headYaw = 0, scale = 1, groundY = 0, exactPose = false, showDirection = true, cad = false, onSelect, children }: {
  pose: RobotPose
  livePose?: () => RobotPose
  transform?: Affine2D
  accent?: string
  pulse?: boolean
  dimmed?: boolean
  stale?: boolean
  smoothing?: number
  headYaw?: number
  scale?: number
  groundY?: number
  /** The demo controller already supplies short, collision-checked steps. */
  exactPose?: boolean
  showDirection?: boolean
  cad?: boolean
  onSelect?: () => void
  children?: ReactNode
}) {
  const group = useRef<Group>(null)
  const head = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const target = mapToScenePose(pose, transform)
  useFrame((state, delta) => {
    const goal = livePose ? mapToScenePose(livePose(), transform) : target
    const blend = stale || exactPose ? 1 : 1 - Math.exp(-smoothing * delta)
    let moving = false
    if (group.current) {
      const dx = goal.position[0] - group.current.position.x, dz = goal.position[2] - group.current.position.z
      const difference = goal.rotation - group.current.rotation.y
      const turn = Math.atan2(Math.sin(difference), Math.cos(difference))
      group.current.position.x += dx * blend
      group.current.position.z += dz * blend
      group.current.rotation.y += turn * blend
      moving = blend < 1 && (Math.abs(dx) > 1e-4 || Math.abs(dz) > 1e-4 || Math.abs(turn) > 1e-3)
    }
    if (head.current) {
      const turn = headYaw - head.current.rotation.y
      head.current.rotation.y += turn * (exactPose ? 1 : 1 - Math.exp(-3 * delta))
      moving ||= !exactPose && Math.abs(turn) > 1e-3
    }
    if (ring.current) {
      const phase = (state.clock.elapsedTime % 2.4) / 2.4
      ring.current.scale.setScalar(1 + phase * 1.4)
      const material = ring.current.material as { opacity: number }
      material.opacity = 0.35 * (1 - phase)
    }
    if (moving || ring.current) state.invalidate()
  })
  const body = dimmed ? '#c9d3e1' : '#eaf4ff'
  return (
    <group ref={group} position={[target.position[0], groundY, target.position[2]]} rotation={[0, target.rotation, 0]} scale={scale} onClick={onSelect ? event => { event.stopPropagation(); onSelect() } : undefined}>
      {pulse && (
        <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.62, 48]} />
          <meshBasicMaterial color={accent} transparent opacity={0.3} />
        </mesh>
      )}
      <BlobShadow />
      {cad ? <Suspense fallback={null}><CadRobot /></Suspense> : <group>
      <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.7, 0.32, 0.5]} /><meshStandardMaterial color={body} metalness={0.25} roughness={0.4} /></mesh>
      {[-0.28, 0.28].map((z) => <mesh key={z} position={[0, 0.15, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.15, 0.15, 0.08, 24]} /><meshStandardMaterial color="#28384b" /></mesh>)}
      <mesh position={[0.365, 0.29, 0]}><boxGeometry args={[0.015, 0.06, 0.28]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1} /></mesh>
      {showDirection && <mesh position={[0.8, 0.04, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.13, 0.3, 3]} /><meshBasicMaterial color={accent} /></mesh>}
      <group ref={head} position={[0, 0.48, 0]}>
        <mesh><boxGeometry args={[0.42, 0.15, 0.38]} /><meshStandardMaterial color={dimmed ? '#9aa8bd' : accent} /></mesh>
        <mesh position={[0.16, 0.13, 0]}><cylinderGeometry args={[0.09, 0.09, 0.1, 24]} /><meshStandardMaterial color="#162740" /></mesh>
        <mesh position={[0.26, 0.13, 0]} rotation={[0, 0, -Math.PI / 2]}><cylinderGeometry args={[0.05, 0.05, 0.06, 16]} /><meshStandardMaterial color="#0d1726" /></mesh>
      </group>
      </group>}
      {children}
    </group>
  )
}
