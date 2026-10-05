import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { Crosshair, Hand, LocateFixed, Maximize, Minus, MoveUpRight, Plus, RotateCcw } from 'lucide-react'
import { buttonClass } from '../../../../components/ui/ui-classes'
import type { OccupancyMap } from './catalog'
import { loadMapImage, type MapRaster } from './load-map-image'
import {
  cellAtPose, headingFromPoints, imageToRos, quantizePosition, quantizeYaw,
  rosToImage, sampleCell, screenToImage, type ImagePoint, type RosPoint,
} from './occupancy-grid'

export type PickerMode = 'pan' | 'position' | 'heading'
export type PickerPose = { x: number | null; y: number | null; yaw: number | null }

type Props = {
  map: OccupancyMap
  pose: PickerPose
  editable: boolean
  mode: PickerMode
  onModeChange: (mode: PickerMode) => void
  onPoseChange: (pose: PickerPose) => void
}

type Viewport = { u: number; v: number; width: number; height: number }
type RasterState = { status: 'loading' | 'error' } | { status: 'ready'; raster: MapRaster }
type PanDrag = { pointerId: number; start: ImagePoint; matrix: DOMMatrix; view: Viewport }

const CELL_LABELS = {
  free: 'Ô trống trên bản đồ, chưa xác nhận robot có thể tới điểm này.',
  occupied: 'Điểm nằm trên ô có vật cản. Kiểm tra lại vị trí trước khi dùng cho Route.',
  unknown: 'Điểm nằm trên ô chưa biết. Cần kiểm tra thực địa trước khi dùng cho Route.',
  outside: 'Pose nằm ngoài phạm vi bản đồ. Chọn lại vị trí hoặc kiểm tra tọa độ trong phần tinh chỉnh.',
  unavailable: 'Chưa kiểm tra được ô bản đồ. Pose vẫn cần được xác minh.',
}

export function PoiPosePicker({ map, pose, editable, mode, onModeChange, onPoseChange }: Props) {
  const helpId = useId()
  const [rasterState, setRasterState] = useState<RasterState>({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState<Viewport>({ u: 0, v: 0, width: map.width, height: map.height })
  const [hover, setHover] = useState<ImagePoint | null>(null)
  const [interactionError, setInteractionError] = useState<string | null>(null)
  const drag = useRef<PanDrag | null>(null)
  const actualMode = editable ? mode : 'pan'
  const position: RosPoint | null = pose.x != null && pose.y != null ? { x: pose.x, y: pose.y } : null
  const inside = position && cellAtPose(map, position) != null
  const marker = inside ? rosToImage(map, position) : null
  const headingPreview = actualMode === 'heading' && hover && position
    ? headingFromPoints(position, imageToRos(map, hover)) : null
  const yaw = headingPreview ?? pose.yaw
  const cellState = position ? sampleCell(map, rasterState.status === 'ready' ? rasterState.raster.pixels : null, position) : null
  const ready = rasterState.status === 'ready'
  const markerRadius = view.height / 100
  const arrowLength = view.height / 22

  useEffect(() => {
    let active = true
    void loadMapImage(map).then(
      (raster) => { if (active) setRasterState({ status: 'ready', raster }) },
      () => { if (active) setRasterState({ status: 'error' }) },
    )
    return () => { active = false }
  }, [map, retry])

  const chooseMode = (next: PickerMode) => {
    drag.current = null
    setHover(null)
    setInteractionError(null)
    onModeChange(next)
  }

  const fitMap = () => setView({ u: 0, v: 0, width: map.width, height: map.height })
  const zoom = (factor: number) => {
    setView((current) => {
      const height = Math.max(map.height / 32, Math.min(map.height, current.height / factor))
      const width = height * map.width / map.height
      return { u: current.u + (current.width - width) / 2, v: current.v + (current.height - height) / 2, width, height }
    })
  }

  const pointFromEvent = (event: PointerEvent<SVGSVGElement>) =>
    screenToImage(event.currentTarget.getScreenCTM(), event.clientX, event.clientY)

  const pointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!ready || event.button !== 0 || drag.current) return
    const matrix = event.currentTarget.getScreenCTM()
    const point = screenToImage(matrix, event.clientX, event.clientY)
    if (!point) {
      setInteractionError('Không xác định được vị trí trên ảnh. Thử tải lại hoặc nhập tọa độ bằng số.')
      return
    }
    setInteractionError(null)
    if (actualMode === 'pan' && matrix) {
      drag.current = { pointerId: event.pointerId, start: point, matrix, view }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (!editable) return
    if (actualMode === 'position') {
      const rawPosition = imageToRos(map, point)
      const next = quantizePosition(rawPosition)
      if (!cellAtPose(map, rawPosition) || !cellAtPose(map, next)) {
        setInteractionError('Chọn một điểm bên trong bản đồ.')
        return
      }
      onPoseChange({ ...next, yaw: null })
      chooseMode('heading')
    } else if (position && actualMode === 'heading') {
      const nextYaw = headingFromPoints(position, imageToRos(map, point))
      const start = rosToImage(map, position)
      if (nextYaw == null || Math.hypot(point.u - start.u, point.v - start.v) < view.height / 200) {
        setInteractionError('Chọn hướng cách điểm POI một khoảng để xác định góc.')
        return
      }
      onPoseChange({ ...position, yaw: quantizeYaw(nextYaw) })
      chooseMode('pan')
    }
  }

  const pointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current
    if (current && current.pointerId === event.pointerId) {
      // Freeze the starting CTM: reading the moving CTM would introduce pan drift.
      const point = screenToImage(current.matrix, event.clientX, event.clientY)
      if (point) setView({ ...current.view, u: current.view.u - (point.u - current.start.u), v: current.view.v - (point.v - current.start.v) })
    } else if (ready && actualMode === 'heading') {
      setHover(pointFromEvent(event))
    }
  }

  const finishPan = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div><p className="text-sm font-semibold text-slate-800">Bản đồ ROS</p><p className="mt-0.5 font-mono text-xs text-slate-500">{map.mapKey} · {map.resolution} m/ô</p></div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={actualMode === 'position'} disabled={!editable || !ready} onClick={() => chooseMode('position')} className={buttonClass(actualMode === 'position' ? 'primary' : 'secondary', 'sm')}><Crosshair size={14} aria-hidden="true" />Chọn vị trí</button>
          <button type="button" aria-pressed={actualMode === 'heading'} disabled={!editable || !ready || !inside} onClick={() => chooseMode('heading')} className={buttonClass(actualMode === 'heading' ? 'primary' : 'secondary', 'sm')}><MoveUpRight size={14} aria-hidden="true" />Chọn hướng</button>
          <button type="button" aria-pressed={actualMode === 'pan'} disabled={!ready} onClick={() => chooseMode('pan')} className={buttonClass('secondary', 'sm')}><Hand size={14} aria-hidden="true" />Di chuyển bản đồ</button>
        </div>
      </div>

      <div className="relative bg-slate-100">
        {rasterState.status === 'loading' && <div className="flex h-[420px] items-center justify-center text-sm text-slate-500" role="status">Đang tải bản đồ…</div>}
        {rasterState.status === 'error' && <div className="flex h-[420px] flex-col items-center justify-center gap-3 px-5 text-center" role="alert"><p className="text-sm text-slate-700">Không tải được ảnh đúng kích thước bản đồ. Tọa độ trong form vẫn được giữ.</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => { setRasterState({ status: 'loading' }); setRetry((value) => value + 1) }}><RotateCcw size={14} aria-hidden="true" />Tải lại bản đồ</button></div>}
        {ready && <>
          <svg
            role="group" aria-label="Bản đồ occupancy ROS" aria-describedby={helpId} tabIndex={0}
            viewBox={`${view.u} ${view.v} ${view.width} ${view.height}`}
            className={`h-[420px] w-full touch-none select-none outline-offset-[-3px] ${actualMode === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={finishPan}
            onPointerCancel={finishPan} onLostPointerCapture={finishPan}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); chooseMode('pan') }
              if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(2) }
              if (event.key === '-') { event.preventDefault(); zoom(0.5) }
            }}
          >
            <title>Chọn vị trí và hướng thân POI trong ROS map frame</title>
            <image href={map.imageUrl} x={0} y={0} width={map.width} height={map.height} style={{ imageRendering: view.height <= 420 ? 'pixelated' : 'auto' }} />
            {marker && <g aria-label="Pose POI" transform={`translate(${marker.u} ${marker.v})`}>
              {yaw != null && Number.isFinite(yaw) && <g transform={`rotate(${-(yaw - map.origin[2]) * 180 / Math.PI})`}>
                <path d={`M 0 0 L ${arrowLength} 0 M ${arrowLength * 0.72} ${-arrowLength * 0.2} L ${arrowLength} 0 L ${arrowLength * 0.72} ${arrowLength * 0.2}`} fill="none" stroke="white" strokeWidth={6} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                <path d={`M 0 0 L ${arrowLength} 0 M ${arrowLength * 0.72} ${-arrowLength * 0.2} L ${arrowLength} 0 L ${arrowLength * 0.72} ${arrowLength * 0.2}`} fill="none" stroke="#2563eb" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              </g>}
              <circle r={markerRadius} fill="#2563eb" stroke="white" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            </g>}
          </svg>
          <div className="absolute right-3 top-3 flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs">
            <button type="button" aria-label="Phóng to" disabled={view.height <= map.height / 32} onClick={() => zoom(2)} className={buttonClass('secondary', 'sm')}><Plus size={15} aria-hidden="true" /></button>
            <button type="button" aria-label="Thu nhỏ" disabled={view.height >= map.height} onClick={() => zoom(0.5)} className={buttonClass('secondary', 'sm')}><Minus size={15} aria-hidden="true" /></button>
            <button type="button" aria-label="Vừa bản đồ" onClick={fitMap} className={buttonClass('secondary', 'sm')}><Maximize size={15} aria-hidden="true" /></button>
            <button type="button" aria-label="Đưa POI vào giữa" disabled={!marker} onClick={() => { if (marker) setView((current) => ({ ...current, u: marker.u - current.width / 2, v: marker.v - current.height / 2 })) }} className={buttonClass('secondary', 'sm')}><LocateFixed size={15} aria-hidden="true" /></button>
          </div>
        </>}
      </div>

      <div className="space-y-2 border-t border-slate-200 px-4 py-3 text-xs leading-5 text-slate-600">
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-slate-800"><span>X: {pose.x == null ? 'chưa chọn' : `${pose.x.toFixed(4)} m`}</span><span>Y: {pose.y == null ? 'chưa chọn' : `${pose.y.toFixed(4)} m`}</span><span>Yaw: {pose.yaw == null ? 'chưa chọn' : `${pose.yaw.toFixed(6)} rad`}</span></div>
        <p id={helpId}>{!editable ? 'Pose bị khóa. Bạn vẫn có thể phóng to và di chuyển bản đồ.' : actualMode === 'position' ? 'Bấm vào ảnh để chọn vị trí. Sau đó chọn hướng thân hoặc nhập yaw bằng số.' : actualMode === 'heading' ? 'Di chuyển để xem hướng, bấm để chốt. Escape hủy chọn hướng.' : 'Kéo để di chuyển bản đồ. Chọn vị trí hoặc hướng để sửa pose; + / - để zoom khi bản đồ có focus.'}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1"><span>□ Trắng: ô trống</span><span>■ Đen: vật cản</span><span>▧ Xám: chưa biết</span><span>Yaw 0 = +X, chiều dương quay về +Y</span></div>
        {cellState && <p role="status" className={cellState === 'free' ? 'text-slate-600' : 'font-medium text-amber-800'}>{CELL_LABELS[cellState]}</p>}
        {interactionError && <p role="alert" className="font-medium text-red-700">{interactionError}</p>}
      </div>
    </div>
  )
}
