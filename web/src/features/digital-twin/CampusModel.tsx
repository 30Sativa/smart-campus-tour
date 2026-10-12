import { Component, Suspense, useMemo, type ReactNode } from 'react'
import { Html } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { prepareCampusModel, type CampusModelKey } from './campus-model'

const modelBase = `${import.meta.env.BASE_URL}models/simulator-map/`

function LoadedObjCampus() {
  const materials = useLoader(MTLLoader, `${modelBase}map.mtl`)
  const object = useLoader(OBJLoader, `${modelBase}map.obj`, (loader) => {
    materials.preload()
    loader.setMaterials(materials)
  })
  const model = useMemo(() => prepareCampusModel(object, 10), [object])
  return <primitive object={model} dispose={null} />
}

function LoadedGlbCampus() {
  const gltf = useLoader(GLTFLoader, `${modelBase}NVHSV_Tang6_V3_modern_v2.glb?revision=2`)
  const model = useMemo(() => prepareCampusModel(gltf.scene), [gltf.scene])
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

export function CampusModel({ modelKey = 'legacy' }: { modelKey?: CampusModelKey }) {
  return <ModelBoundary key={modelKey}><Suspense fallback={<Html center><p role="status" className="w-48 rounded-xl bg-white p-4 text-sm text-[#40546f]">Đang tải bản đồ 3D…</p></Html>}>{modelKey === 'nvh-v3' ? <LoadedGlbCampus /> : <LoadedObjCampus />}</Suspense></ModelBoundary>
}
