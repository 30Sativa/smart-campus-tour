import { Box3, Mesh, Vector3, type Object3D } from 'three'

export type CampusModelKey = 'legacy' | 'nvh-v3'

/** Display fit only; a changed asset still needs its own measured ROS transform. */
export function prepareCampusModel(object: Object3D, floorY?: number) {
  const root = object.clone(true)
  const bounds = new Box3().setFromObject(root)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const width = Math.max(size.x, size.z)
  if (bounds.isEmpty() || ![width, center.x, center.z, bounds.min.y].every(Number.isFinite) || width <= 0) {
    throw new Error('Invalid campus model bounds.')
  }
  const scale = 20 / width
  // Compose the display fit with the imported root scale and translation.
  root.scale.multiplyScalar(scale)
  root.position.multiplyScalar(scale).add(new Vector3(-center.x * scale, -(floorY ?? bounds.min.y) * scale, -center.z * scale))
  root.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
  return root
}
