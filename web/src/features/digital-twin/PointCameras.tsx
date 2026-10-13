import { Camera } from 'lucide-react'
import { Html } from '@react-three/drei'
import { PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_POIS, PATROL_TRANSFORM } from './patrol-demo'
import { mapToScenePose } from './map-config'

export function PointCameras({ selected, onSelect }: { selected: number; onSelect: (point: number) => void }) {
  return <group>{PATROL_POIS.map((point, index) => {
    const { position } = mapToScenePose({ ...point, yaw: 0 }, PATROL_TRANSFORM)
    return <Html key={point.poi} position={[position[0], PATROL_FLOOR_Y + PATROL_MODEL_SCALE * 2.4, position[2]]} center zIndexRange={[30, 20]}>
      <button type="button" aria-label={`Xem camera point ${point.poi}`} aria-pressed={selected === index} title={`Camera cố định tại Điểm ${point.poi}`} onClick={event => { event.stopPropagation(); onSelect(index) }}
        className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold shadow-sm ${selected === index ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-200 bg-white/95 text-blue-700'}`}>
        <Camera size={12} aria-hidden="true" />C{point.poi}
      </button>
    </Html>
  })}</group>
}
