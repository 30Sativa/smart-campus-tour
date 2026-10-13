import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Vector2, type ShaderMaterial } from 'three'
import { FLEET_ROUTE_COLOR, type FleetPath } from './fleet-paths'
import { createRouteSurface } from './fleet-route-surface'
export type { FleetPath } from './fleet-paths'

const vertexShader = `
  varying vec2 routeUv;
  attribute vec3 routeCenter;
  uniform vec2 resolution;
  void main() {
    routeUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 center = projectionMatrix * modelViewMatrix * vec4(routeCenter, 1.0);
    vec2 pixels = (gl_Position.xy / gl_Position.w - center.xy / center.w) * resolution * 0.5;
    float halfWidth = length(pixels);
    if (halfWidth > 0.00001 && halfWidth < 0.45) {
      gl_Position.xy = (center.xy / center.w + pixels / halfWidth * 0.45 * 2.0 / resolution) * gl_Position.w;
    }
  }
`
const fragmentShader = `
  uniform vec3 color;
  uniform float opacity;
  uniform float dashOffset;
  uniform bool dashed;
  varying vec2 routeUv;
  void main() {
    if (dashed && mod(routeUv.x + dashOffset, 0.19) > 0.12) discard;
    gl_FragColor = vec4(color, opacity);
    #include <colorspace_fragment>
  }
`

export function FleetPathLine({ route, seconds }: { route: FleetPath; seconds: number }) {
  const material = useRef<ShaderMaterial>(null)
  const geometry = useMemo(() => createRouteSurface(route.points), [route.points])
  const uniforms = useMemo(() => ({
    color: { value: new Color(FLEET_ROUTE_COLOR) }, opacity: { value: 1 },
    dashOffset: { value: 0 }, dashed: { value: true },
    resolution: { value: new Vector2(1, 1) },
  }), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ gl }) => {
    if (!material.current) return
    material.current.uniforms.dashOffset.value = -seconds * 0.22
    material.current.uniforms.dashed.value = route.dashed !== false
    material.current.uniforms.opacity.value = route.active ? 1 : 0.8
    gl.getDrawingBufferSize(material.current.uniforms.resolution.value)
  })
  if (route.points.length < 2) return null
  return <mesh name="fleet-route-surface" geometry={geometry}>
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader}
      toneMapped={false} depthWrite={false} transparent polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
  </mesh>
}
