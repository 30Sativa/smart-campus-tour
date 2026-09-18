import { Suspense, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react'
import type { Ref } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsInstance } from 'three-stdlib'
import { Box3, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three'
import type { Object3D } from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MapPin as PinIcon } from 'lucide-react'
import type { CampusModelConfig } from '../campus-model'
import { modelAnchorForPin } from '../campus-model'
import type { MapPin } from './CampusMap'
import { RobotMark } from './RobotMark'
import { campusCameraFrame, campusModelMatrix } from './campus-camera'

export type CampusCameraControls = {
  overview: (top: boolean) => void
  zoom: (factor: number) => void
  focus: () => void
}

export type CampusSceneProps = {
  config: CampusModelConfig
  pins: MapPin[]
  selectedId: string | null
  onSelect: (id: string) => void
  cameraRef: Ref<CampusCameraControls>
  topView: boolean
  showLabels: boolean
  colors: { surface: string; ink: string; accent: string }
  onReady: () => void
}

function ModelScene({ object, ...props }: CampusSceneProps & { object: Object3D }) {
  const { get, invalidate, size } = useThree()
  const { onReady } = props
  const controls = useRef<OrbitControlsInstance>(null)
  const matrix = useMemo(() => campusModelMatrix(props.config), [props.config])
  const model = useMemo(() => {
    const root = new Group()
    root.matrixAutoUpdate = false
    root.matrix.copy(matrix)
    const clone = object.clone(true)
    // OBJ is presented as a neutral architectural model. GLTF keeps its authored
    // materials. Cached loader geometries/materials are never mutated or disposed.
    const material = props.config.format === 'obj' ? new MeshStandardMaterial({ color: props.colors.surface, roughness: 0.85, metalness: 0 }) : null
    const edgeMaterial = material ? new LineBasicMaterial({ color: props.colors.ink, transparent: true, opacity: 0.28 }) : null
    const edges: EdgesGeometry[] = []
    if (material) clone.traverse((child) => {
      if (child instanceof Mesh) {
        child.material = material
        const geometry = new EdgesGeometry(child.geometry, 30)
        edges.push(geometry)
        child.add(new LineSegments(geometry, edgeMaterial!))
      }
    })
    root.add(clone)
    root.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(root)
    if (bounds.isEmpty() || !Number.isFinite(bounds.min.length() + bounds.max.length())) throw new Error('Empty campus model')
    return { root, bounds, material, edgeMaterial, edges }
  }, [object, matrix, props.config.format, props.colors.surface, props.colors.ink])
  useEffect(() => () => {
    model.material?.dispose()
    model.edgeMaterial?.dispose()
    model.edges.forEach((geometry) => geometry.dispose())
  }, [model])

  const frame = useMemo(() => campusCameraFrame(model.bounds, size.width / size.height, 42, props.topView), [model.bounds, size.width, size.height, props.topView])
  const selectedPin = props.pins.find((pin) => pin.id === props.selectedId)
  const selectedAnchor = selectedPin ? modelAnchorForPin(selectedPin, props.config) : null
  const selectedPosition = selectedAnchor ? new Vector3(...selectedAnchor).applyMatrix4(matrix) : null

  const overview = (top: boolean) => {
    const camera = get().camera
    if (!(camera instanceof PerspectiveCamera) || !controls.current) return
    const next = campusCameraFrame(model.bounds, size.width / size.height, camera.fov, top)
    camera.position.copy(next.position)
    camera.near = Math.max(next.radius / 1000, 0.001)
    camera.far = next.distance * 10
    camera.updateProjectionMatrix()
    controls.current.target.copy(next.center)
    controls.current.update()
    invalidate()
  }
  const focus = () => {
    const camera = get().camera
    if (!selectedPosition || !controls.current) return
    const offset = camera.position.clone().sub(controls.current.target).normalize().multiplyScalar(frame.radius * 1.25)
    controls.current.target.copy(selectedPosition)
    camera.position.copy(selectedPosition).add(offset)
    controls.current.update()
    invalidate()
  }

  useImperativeHandle(props.cameraRef, () => ({
    overview,
    focus,
    zoom: (factor) => {
      const camera = get().camera
      if (!controls.current) return
      const offset = camera.position.clone().sub(controls.current.target)
      offset.setLength(Math.max(frame.radius * 0.15, Math.min(frame.distance * 3, offset.length() * factor)))
      camera.position.copy(controls.current.target).add(offset)
      controls.current.update()
      invalidate()
    },
  }))

  useLayoutEffect(() => {
    const camera = get().camera
    if (!(camera instanceof PerspectiveCamera) || !controls.current) return
    camera.position.copy(frame.position)
    camera.near = Math.max(frame.radius / 1000, 0.001)
    camera.far = frame.distance * 10
    camera.updateProjectionMatrix()
    controls.current.target.copy(frame.center)
    controls.current.update()
    invalidate()
  }, [get, frame, invalidate])
  useEffect(() => { onReady() }, [onReady])

  return <>
    <ambientLight intensity={1.3} />
    <directionalLight position={[frame.radius, frame.radius * 2, frame.radius]} intensity={2.5} />
    <directionalLight position={[-frame.radius, frame.radius, -frame.radius]} intensity={0.6} />
    <primitive object={model.root} dispose={null} />
    <gridHelper args={[frame.radius * 2.6, 24, props.colors.ink, props.colors.ink]} position={[frame.center.x, model.bounds.min.y - 0.02, frame.center.z]} material-transparent material-opacity={0.08} />
    {props.pins.map((pin) => {
      const anchor = modelAnchorForPin(pin, props.config)
      if (!anchor) return null
      const position = new Vector3(...anchor).applyMatrix4(matrix)
      const selected = pin.id === props.selectedId
      return <Html key={pin.id} position={position} center zIndexRange={[20, 1]}>
        <button type="button" className="vs-model-pin" data-on={selected} data-role={pin.role}
          aria-label={`Show ${pin.name} on the map`} aria-pressed={selected} onClick={() => props.onSelect(pin.id)}>
          <span>{pin.role === 'robot' ? <RobotMark size={19} /> : <PinIcon size={18} />}</span>
          {(props.showLabels || selected) && <strong>{pin.name}</strong>}
        </button>
      </Html>
    })}
    <OrbitControls ref={controls} makeDefault enableDamping={false} minDistance={frame.radius * 0.15} maxDistance={frame.distance * 3}
      maxPolarAngle={Math.PI / 2 - 0.015} enableRotate={!props.topView} />
  </>
}

function ObjScene(props: CampusSceneProps) {
  const object = useLoader(OBJLoader, props.config.url)
  return <ModelScene {...props} object={object} />
}
function GltfScene(props: CampusSceneProps) {
  const gltf = useLoader(GLTFLoader, props.config.url)
  return <ModelScene {...props} object={gltf.scene} />
}

export default function CampusMap3DScene(props: CampusSceneProps) {
  return <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 42, position: [80, 80, 80] }}
    gl={{ antialias: true, alpha: true }} fallback={<div className="vs-model-state">3D is unavailable on this device. You can still browse the location list.</div>}
    onCreated={({ gl }) => {
      gl.domElement.setAttribute('aria-label', 'Interactive 3D campus model')
    }}>
    <Suspense fallback={<Html center><div className="vs-model-loading" role="status"><span className="auth-spinner" />Loading campus model…</div></Html>}>
      {props.config.format === 'obj' ? <ObjScene {...props} /> : <GltfScene {...props} />}
    </Suspense>
  </Canvas>
}
