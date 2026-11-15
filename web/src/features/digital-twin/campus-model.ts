import { Box3, Mesh, Vector3, type Object3D } from 'three'

export type CampusModelKey = 'legacy' | 'nvh-v3'

/** A model's footprint in its own units: the longer side, the plan centre and the floor height. */
export type CampusFit = { width: number; centerX: number; centerZ: number; floorY: number }

/**
 * NVH tầng 6 V3, measured on the source GLB (`robot/Map3d/NVHSV_Tang6_V3.glb`; the
 * `_modern_v2` skin and its optimised build share it). `map-config.ts` places
 * robots with these same numbers. The optimised build is fitted with them rather
 * than with three's Box3: that box grows around rotated GPU instances, which
 * would shrink and shift the building under the robots.
 */
export const NVH_V3_FIT: CampusFit = { width: 2.14561939 + 97.7707138, centerX: 35.803092385, centerZ: -47.812547205, floorY: -1 }

/** Display fit only; a changed asset still needs its own measured ROS transform. */
export function prepareCampusModel(object: Object3D, floorY?: number, fit?: CampusFit) {
  const root = object.clone(true)
  let measured = fit
  if (!measured) {
    const bounds = new Box3().setFromObject(root)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    measured = { width: Math.max(size.x, size.z), centerX: center.x, centerZ: center.z, floorY: floorY ?? bounds.min.y }
    if (bounds.isEmpty()) throw new Error('Invalid campus model bounds.')
  }
  const { width, centerX, centerZ } = measured
  if (![width, centerX, centerZ, measured.floorY].every(Number.isFinite) || width <= 0) {
    throw new Error('Invalid campus model bounds.')
  }
  const scale = 20 / width
  // Compose the display fit with the imported root scale and translation.
  root.scale.multiplyScalar(scale)
  root.position.multiplyScalar(scale).add(new Vector3(-centerX * scale, -measured.floorY * scale, -centerZ * scale))
  root.traverse((child) => {
    if (child instanceof Mesh) {
      // Cast the architectural shell, columns and garden structures; furniture
      // need not each add a draw call to the campus-wide shadow map.
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      child.castShadow = materials.some(material => !material.transparent && /^(Warm ivory walls|Retained blue-grey corridor columns|Garden bench stone|Garden pergola steel)$/.test(material.name))
      child.receiveShadow = true
    }
  })
  return root
}
