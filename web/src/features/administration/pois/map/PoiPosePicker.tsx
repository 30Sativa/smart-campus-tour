import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { CircleCheck, Crosshair, Hand, LocateFixed, Maximize, Minus, MoveUpRight, Plus, RotateCcw, TriangleAlert } from 'lucide-react'
import { buttonClass } from '../../../../components/ui/ui-classes'
import type { OccupancyMap } from './catalog'
import '../poi-form.css'
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

const MODES = [
  { key: 'position', label: 'Chọn vị trí', shortcut: '1', icon: Crosshair },
  { key: 'heading', label: 'Chọn hướng', shortcut: '2', icon: MoveUpRight },
  { key: 'pan', label: 'Di chuyển bản đồ', shortcut: 'Esc', icon: Hand },
] as const

const zoomButton = 'grid size-8.5 place-items-center rounded-lg text-[#285c7d] transition-colors hover:bg-[#f1f8fe] disabled:cursor-not-allowed disabled:text-[#c2cfda] disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]'

/** Zoom around the view centre, or keep `focus` fixed under the cursor. */
function zoomView(map: OccupancyMap, current: Viewport, factor: number, focus?: ImagePoint): Viewport {
  const height = Math.max(map.height / 32, Math.min(map.height, current.height / factor))
  const width = height * map.width / map.height
  if (!focus) return { u: current.u + (current.width - width) / 2, v: current.v + (current.height - height) / 2, width, height }
  return { u: focus.u - (focus.u - current.u) * width / current.width, v: focus.v - (focus.v - current.v) * height / current.height, width, height }
}

export function PoiPosePicker({ map, pose, editable, mode, onModeChange, onPoseChange }: Props) {
  const helpId = useId()
  const [rasterState, setRasterState] = useState<RasterState>({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState<Viewport>({ u: 0, v: 0, width: map.width, height: map.height })
  const [hover, setHover] = useState<ImagePoint | null>(null)
  const [interactionError, setInteractionError] = useState<string | null>(null)
  const drag = useRef<PanDrag | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
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
  const ghost = actualMode === 'position' && hover ? hover : null
  const hoverPosition = ghost ? quantizePosition(imageToRos(map, ghost)) : null
  const shown = hoverPosition ?? position

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
  const zoom = (factor: number, focus?: ImagePoint) => setView((current) => zoomView(map, current, factor, focus))

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !ready) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const point = screenToImage(svg.getScreenCTM(), event.clientX, event.clientY)
      setView((current) => zoomView(map, current, event.deltaY < 0 ? 1.25 : 0.8, point ?? undefined))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [ready, map])

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
    } else if (ready && (actualMode === 'heading' || actualMode === 'position')) {
      setHover(pointFromEvent(event))
    }
  }

  const finishPan = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  const coach = !editable
    ? null
    : actualMode === 'position'
      ? { step: '1', text: 'Bấm vào bản đồ để đặt vị trí POI.' }
      : actualMode === 'heading'
        ? { step: '2', text: 'Rê chuột để xem hướng thân, bấm để chốt. Esc để hủy.' }
        : null
  const help = !editable
    ? 'Pose bị khóa. Bạn vẫn có thể phóng to và di chuyển bản đồ.'
    : actualMode === 'position'
      ? 'Bấm vào ảnh để chọn vị trí. Sau đó chọn hướng thân hoặc nhập yaw bằng số.'
      : actualMode === 'heading'
        ? 'Di chuyển để xem hướng, bấm để chốt. Escape hủy chọn hướng.'
        : 'Kéo để di chuyển bản đồ, cuộn chuột hoặc dùng +/− để phóng to. Phím 1 chọn vị trí, 2 chọn hướng.'
  const arrow = `M 0 0 L ${arrowLength} 0 M ${arrowLength * 0.72} ${-arrowLength * 0.2} L ${arrowLength} 0 L ${arrowLength * 0.72} ${arrowLength * 0.2}`

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e8f0] px-3 py-2.5">
        <div className="pl-1"><p className="text-sm font-semibold text-[#1e293b]">Bản đồ ROS</p><p className="mt-0.5 font-mono text-xs text-[#64748b]">{map.mapKey} · {map.resolution} m/ô</p></div>
        <div role="group" aria-label="Chế độ thao tác bản đồ" className="flex flex-wrap gap-1 rounded-xl bg-[#f1f7fc] p-1">
          {MODES.map(({ key, label, shortcut, icon: Icon }) => {
            const disabled = key === 'pan' ? !ready : !editable || !ready || (key === 'heading' && !inside)
            const pressed = actualMode === key
            return (
              <button
                key={key} type="button" aria-label={label} aria-pressed={pressed} disabled={disabled}
                onClick={() => chooseMode(key)}
                className={`inline-flex min-h-8.5 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] disabled:cursor-not-allowed disabled:opacity-45 ${
                  pressed ? 'bg-white text-[#174b70] shadow-[0_4px_12px_-6px_rgba(23,59,89,0.4)]' : 'text-[#54738a] hover:text-[#174b70]'
                }`}
              >
                <Icon size={15} aria-hidden="true" />{label}
                <kbd aria-hidden="true" className="hidden rounded border border-current px-1 font-mono text-[10px] leading-4 font-semibold opacity-55 sm:inline">{shortcut}</kbd>
              </button>
            )
          })}
        </div>
      </div>

      <div className="relative bg-[#eef3f8] bg-[linear-gradient(#e4ecf4_1px,transparent_1px),linear-gradient(90deg,#e4ecf4_1px,transparent_1px)] bg-[length:24px_24px]">
        {rasterState.status === 'loading' && <div className="flex h-[460px] items-center justify-center text-sm text-[#64748b]" role="status">Đang tải bản đồ…</div>}
        {rasterState.status === 'error' && <div className="flex h-[460px] flex-col items-center justify-center gap-3 px-5 text-center" role="alert"><p className="text-sm text-[#334155]">Không tải được ảnh đúng kích thước bản đồ. Tọa độ trong form vẫn được giữ.</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => { setRasterState({ status: 'loading' }); setRetry((value) => value + 1) }}><RotateCcw size={14} aria-hidden="true" />Tải lại bản đồ</button></div>}
        {ready && <>
          <svg
            ref={svgRef}
            role="group" aria-label="Bản đồ occupancy ROS" aria-describedby={helpId} tabIndex={0}
            viewBox={`${view.u} ${view.v} ${view.width} ${view.height}`}
            className={`h-[380px] w-full touch-none select-none outline-offset-[-3px] sm:h-[460px] ${actualMode === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={finishPan}
            onPointerCancel={finishPan} onLostPointerCapture={finishPan}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); chooseMode('pan') }
              if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(2) }
              if (event.key === '-') { event.preventDefault(); zoom(0.5) }
              if (event.key === '1' && editable) { event.preventDefault(); chooseMode('position') }
              if (event.key === '2' && editable && inside) { event.preventDefault(); chooseMode('heading') }
            }}
          >
            <title>Chọn vị trí và hướng thân POI trong ROS map frame</title>
            <image href={map.imageUrl} x={0} y={0} width={map.width} height={map.height} style={{ imageRendering: view.height <= 420 ? 'pixelated' : 'auto' }} />
            {ghost && <g pointerEvents="none" opacity={0.55}>
              <circle cx={ghost.u} cy={ghost.v} r={markerRadius * 0.8} fill="#2563eb" />
              <circle cx={ghost.u} cy={ghost.v} r={markerRadius * 2} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            </g>}
            {marker && <g aria-label="Pose POI" transform={`translate(${marker.u} ${marker.v})`}>
              {yaw != null && Number.isFinite(yaw) && <g transform={`rotate(${-(yaw - map.origin[2]) * 180 / Math.PI})`}>
                <path d={`M 0 0 L ${arrowLength * 1.05} ${-arrowLength * 0.45} A ${arrowLength * 1.14} ${arrowLength * 1.14} 0 0 1 ${arrowLength * 1.05} ${arrowLength * 0.45} Z`} fill="rgba(37,99,235,0.12)" />
                <path d={arrow} fill="none" stroke="white" strokeWidth={6} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                <path d={arrow} fill="none" stroke="#2563eb" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={headingPreview != null ? '6 5' : undefined} />
              </g>}
              <circle className="poi-marker-ring" r={markerRadius} fill="none" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <circle key={`${pose.x}:${pose.y}`} className="poi-marker-drop" r={markerRadius} fill="#2563eb" stroke="white" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            </g>}
          </svg>

          {coach && <p aria-hidden="true" className="pointer-events-none absolute top-3 left-3 flex max-w-[calc(100%-5.5rem)] items-center gap-2.5 rounded-xl bg-[#173b59]/92 px-3 py-2 text-[12.5px] font-semibold text-white shadow-lg transition-opacity duration-300 starting:opacity-0">
            <span className="grid size-5.5 shrink-0 place-items-center rounded-md bg-[#9fd0f5] font-mono text-[11px] text-[#173b59]">{coach.step}</span>{coach.text}
          </p>}

          <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-xl border border-[#e2e8f0] bg-white p-1 shadow-[0_8px_20px_-14px_rgba(23,59,89,0.5)]">
            <button type="button" aria-label="Phóng to" disabled={view.height <= map.height / 32} onClick={() => zoom(2)} className={zoomButton}><Plus size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Thu nhỏ" disabled={view.height >= map.height} onClick={() => zoom(0.5)} className={zoomButton}><Minus size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Vừa bản đồ" onClick={fitMap} className={zoomButton}><Maximize size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Đưa POI vào giữa" disabled={!marker} onClick={() => { if (marker) setView((current) => ({ ...current, u: marker.u - current.width / 2, v: marker.v - current.height / 2 })) }} className={zoomButton}><LocateFixed size={16} aria-hidden="true" /></button>
          </div>

          <div aria-hidden="true" className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5 font-mono text-[11.5px] text-[#173b59]">
            <span className="rounded-lg border border-[#e2e8f0] bg-white/92 px-2 py-1">X {shown ? shown.x.toFixed(4) : '—'} m</span>
            <span className="rounded-lg border border-[#e2e8f0] bg-white/92 px-2 py-1">Y {shown ? shown.y.toFixed(4) : '—'} m</span>
            <span className="rounded-lg border border-[#e2e8f0] bg-white/92 px-2 py-1">Yaw {yaw == null ? '—' : yaw.toFixed(6)} rad</span>
          </div>
        </>}
      </div>

      <div className="space-y-2.5 border-t border-[#e2e8f0] bg-[#fbfdff] px-4 py-3 text-xs leading-5 text-[#54738a]">
        <p className="sr-only">X: {pose.x == null ? 'chưa chọn' : `${pose.x.toFixed(4)} m`}, Y: {pose.y == null ? 'chưa chọn' : `${pose.y.toFixed(4)} m`}, Yaw: {pose.yaw == null ? 'chưa chọn' : `${pose.yaw.toFixed(6)} rad`}</p>
        {cellState && <p role="status" className={`flex items-start gap-2 rounded-lg px-3 py-2 font-semibold ${cellState === 'free' ? 'bg-[#ecfdf3] text-[#2f7a5b]' : 'bg-[#fffaf0] text-[#7d5310]'}`}>
          {cellState === 'free' ? <CircleCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}{CELL_LABELS[cellState]}
        </p>}
        {interactionError && <p role="alert" className="font-semibold text-[#b23e31]">{interactionError}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-[3px] border border-[#94a3b8] bg-white" aria-hidden="true" />Trắng: ô trống</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-[3px] bg-[#111]" aria-hidden="true" />Đen: vật cản</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-[3px] bg-[#9aa5b1]" aria-hidden="true" />Xám: chưa biết</span>
          <span>Yaw 0 = +X, chiều dương quay về +Y</span>
        </div>
        <p id={helpId} className="text-[#7c94a7]">{help}</p>
      </div>
    </div>
  )
}
