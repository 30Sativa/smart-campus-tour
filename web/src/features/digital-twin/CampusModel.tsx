import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { Html } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { NVH_V3_FIT, prepareCampusModel, type CampusModelKey } from './campus-model'

const modelBase = `${import.meta.env.BASE_URL}models/simulator-map/`

/** Told once the model is in the scene, e.g. to bake the static shadow map. */
type Loaded = { onLoaded?: () => void }
function useLoaded(onLoaded: Loaded['onLoaded'], model: unknown) {
  useEffect(() => { onLoaded?.() }, [onLoaded, model])
}

function LoadedObjCampus({ onLoaded }: Loaded) {
  const materials = useLoader(MTLLoader, `${modelBase}map.mtl`)
  const object = useLoader(OBJLoader, `${modelBase}map.obj`, (loader) => {
    materials.preload()
    loader.setMaterials(materials)
  })
  const model = useMemo(() => prepareCampusModel(object, 10), [object])
  useLoaded(onLoaded, model)
  return <primitive object={model} dispose={null} />
}

/**
 * The optimised build of the V3 skin (`web/scripts/optimize-twin-model.mjs`):
 * instanced, joined by material and meshopt-compressed, so it needs the
 * meshopt decoder that ships with three. Its bounds match the source, which
 * `map-config.ts` is calibrated against.
 */
function LoadedGlbCampus({ onLoaded }: Loaded) {
  const gltf = useLoader(GLTFLoader, `${modelBase}NVHSV_Tang6_V3_modern_v2.opt.glb?revision=21`, loader => { loader.setMeshoptDecoder(MeshoptDecoder) })
  const model = useMemo(() => prepareCampusModel(gltf.scene, undefined, NVH_V3_FIT), [gltf.scene])
  useLoaded(onLoaded, model)
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

export function CampusModel({ modelKey = 'legacy', onLoaded }: { modelKey?: CampusModelKey } & Loaded) {
  return <ModelBoundary key={modelKey}><Suspense fallback={<Html center><p role="status" className="w-48 rounded-xl bg-white p-4 text-sm text-[#40546f]">Đang tải bản đồ 3D…</p></Html>}>{modelKey === 'nvh-v3' ? <LoadedGlbCampus onLoaded={onLoaded} /> : <LoadedObjCampus onLoaded={onLoaded} />}</Suspense></ModelBoundary>
}
