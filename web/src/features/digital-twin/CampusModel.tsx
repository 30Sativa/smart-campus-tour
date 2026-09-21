import { Component, Suspense, useMemo, type ReactNode } from 'react'
import { Html } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { Box3, Mesh, Vector3 } from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'

const modelBase = `${import.meta.env.BASE_URL}models/simulator-map/`

function LoadedCampus() {
  const materials = useLoader(MTLLoader, `${modelBase}map.mtl`)
  const object = useLoader(OBJLoader, `${modelBase}map.obj`, (loader) => {
    materials.preload()
    loader.setMaterials(materials)
  })
  const model = useMemo(() => {
    const root = object.clone(true)
    const bounds = new Box3().setFromObject(root)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    // Display calibration only: preserve Y-up, fit the model to a 20-unit width.
    // The OBJ's principal floor is at Y=10; this is not a surveyed ROS transform.
    const scale = 20 / Math.max(size.x, size.z)
    root.scale.setScalar(scale)
    root.position.set(-center.x * scale, -10 * scale, -center.z * scale)
    root.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return root
  }, [object])
  return <primitive object={model} dispose={null} />
}

class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <Html center><p role="alert" className="w-64 rounded-xl bg-white p-4 text-sm text-[#40546f]">Không tải được bản đồ 3D. Vui lòng tải lại trang để thử lại.</p></Html>
    return this.props.children
  }
}

export function CampusModel() {
  return <ModelBoundary><Suspense fallback={<Html center><p role="status" className="w-48 rounded-xl bg-white p-4 text-sm text-[#40546f]">Đang tải bản đồ 3D…</p></Html>}><LoadedCampus /></Suspense></ModelBoundary>
}
