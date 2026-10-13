import { PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_TRANSFORM } from './patrol-demo'
import { mapToScenePose } from './map-config'
import { memo, useMemo } from 'react'
import { AdditiveBlending, DoubleSide, InstancedMesh, Matrix4, Object3D } from 'three'
import nav from './patrol-nav.json'

const floor = PATROL_FLOOR_Y + 0.065 * PATROL_MODEL_SCALE
// Start the cone 1 cm below the diffuser's lower face, using the model export.
const lightY = PATROL_FLOOR_Y + (nav.lampHeight - 0.0225) * PATROL_MODEL_SCALE
const height = lightY - floor
const lampPositions = nav.lamps.map(point => mapToScenePose({ x: point[0], y: point[1], yaw: 0 }, PATROL_TRANSFORM).position)
const beamMatrices = lampPositions.map(([x, , z]) => new Matrix4().makeTranslation(x, floor + height / 2, z))
const glowMatrices = lampPositions.map(([x, , z]) => new Matrix4().makeRotationX(-Math.PI / 2).setPosition(x, floor, z))
const corridorIndexes = nav.lampZones.flatMap((zone, index) => zone === 'corridor' ? [index] : [])
const liveLightIndexes: number[] = []

// Spread the bounded live-light budget over the corridor, independent of POIs or fixture ordering.
while (liveLightIndexes.length < 6 && liveLightIndexes.length < corridorIndexes.length) {
  const remaining = corridorIndexes.filter(index => !liveLightIndexes.includes(index))
  const next = remaining.reduce((best, index) => {
    if (!liveLightIndexes.length) return nav.lamps[index][0] < nav.lamps[best][0] ? index : best
    const nearest = (candidate: number) => Math.min(...liveLightIndexes.map(selected =>
      Math.hypot(nav.lamps[candidate][0] - nav.lamps[selected][0], nav.lamps[candidate][1] - nav.lamps[selected][1])))
    return nearest(index) > nearest(best) ? index : best
  }, remaining[0])
  liveLightIndexes.push(next)
}

function setInstances(mesh: InstancedMesh | null, matrices: Matrix4[]) {
  if (!mesh) return
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}
const setBeamInstances = (mesh: InstancedMesh | null) => setInstances(mesh, beamMatrices)
const setGlowInstances = (mesh: InstancedMesh | null) => setInstances(mesh, glowMatrices)
const instanceVertexShader = `varying vec2 lightUv; void main(){lightUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`

function Downlight({ point }: { point: number[] }) {
  const { position: [x, , z] } = mapToScenePose({ x: point[0], y: point[1], yaw: 0 }, PATROL_TRANSFORM)
  const target = useMemo(() => {
    const object = new Object3D()
    object.position.set(x, PATROL_FLOOR_Y, z)
    return object
  }, [x, z])
  return <group>
    <primitive object={target} />
    <spotLight position={[x, lightY, z]}
      target={target} color="#d8efff" intensity={0.35} distance={(nav.lampHeight + 2) * PATROL_MODEL_SCALE}
      angle={Math.PI / 3} penumbra={0.7} decay={2} />
  </group>
}

/** Shared daylight and downward fixture beams for the scene and point cameras. */
export const CampusLighting = memo(function CampusLighting() {
  return <group>
    <hemisphereLight args={['#d8eaff', '#526574', 0.7]} />
    <ambientLight intensity={0.45} />
    <directionalLight position={[-6, 12, 8]} intensity={2.2} color="#fff3df" castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-12} shadow-camera-right={12}
      shadow-camera-top={12} shadow-camera-bottom={-12} shadow-camera-near={0.5}
      shadow-camera-far={40} shadow-bias={-0.0005} shadow-normalBias={0.015} />
    {/* Batch fixture effects so additional lamps do not add a pair of draw calls each. */}
    <instancedMesh name="downlight-beam" args={[undefined, undefined, nav.lamps.length]} ref={setBeamInstances} raycast={() => {}}>
      <coneGeometry args={[2.4 * PATROL_MODEL_SCALE, height, 32, 1, true]} />
      <shaderMaterial transparent depthWrite={false} side={DoubleSide} blending={AdditiveBlending} toneMapped={false}
        vertexShader={instanceVertexShader}
        fragmentShader={`varying vec2 lightUv; void main(){float fade=smoothstep(0.0,0.15,lightUv.y)*(1.0-smoothstep(0.8,1.0,lightUv.y));gl_FragColor=vec4(0.45,0.72,0.88,0.04*fade);}`} />
    </instancedMesh>
    <instancedMesh name="downlight-floor-glow" args={[undefined, undefined, nav.lamps.length]} ref={setGlowInstances} raycast={() => {}}>
      <circleGeometry args={[2.4 * PATROL_MODEL_SCALE, 32]} />
      <shaderMaterial transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false}
        vertexShader={instanceVertexShader}
        fragmentShader={`varying vec2 lightUv; void main(){float r=length(lightUv-0.5)*2.0;gl_FragColor=vec4(0.45,0.72,0.88,0.05*(1.0-smoothstep(0.0,1.0,r)));}`} />
    </instancedMesh>
    {liveLightIndexes.map(index => <Downlight key={index} point={nav.lamps[index]} />)}
  </group>
})
