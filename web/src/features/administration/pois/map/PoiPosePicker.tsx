import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { ArrowRight, ChevronRight, CircleCheck, Crosshair, Hand, Info, LocateFixed, Maximize, Minus, MoveUpRight, Plus, RotateCcw, TriangleAlert } from 'lucide-react'
import { buttonClass } from '../../../../components/ui/ui-classes'
import type { OccupancyMap } from './catalog'
import '../poi-form.css'
import { poiThemeClass } from '../poi-ui'
import { loadMapImage, type MapRaster } from './load-map-image'
import { isTouchScreen } from './touch-screen'
import {
  cellAtPose, clearanceMessage, headingFromPoints, imageToRos, poseClearance, quantizePosition, quantizeYaw,
  rosToImage, sampleCell, screenToImage, yawDegrees, type ImagePoint, type RosPoint,
} from './occupancy-grid'

export type PickerMode = 'pan' | 'position' | 'heading'
export type PickerPose = { x: number | null; y: number | null; yaw: number | null }

type Props = {
  /** The Staff workbench uses a compact toolbar and a large desktop canvas. */
  layout?: 'default' | 'workbench'
  map: OccupancyMap
  pose: PickerPose
  editable: boolean
  mode: PickerMode
  onModeChange: (mode: PickerMode) => void
  onPoseChange: (pose: PickerPose) => void
  /** Free radius the server requires around a pose; the map shows it as a circle. */
  clearanceMeters?: number
  /**
   * Staff route screens: what a click places, e.g. "điểm bắt đầu". The default keeps the POI wording.
   * Setting it also folds coordinates, yaw in radians and the map resolution into "Chi tiết kỹ thuật"
   * and states the heading in degrees with an arrow; the POI form keeps its own layout.
   */
  placing?: string
  /** Points already on the route, drawn numbered, each with `landmarkRadiusMeters` around it. */
  landmarks?: Array<{ x: number; y: number; label: string; name: string }>
  landmarkRadiusMeters?: number
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

const zoomButton = 'grid size-8.5 place-items-center rounded-lg text-[var(--poi-muted)] transition-colors hover:bg-[var(--poi-ground)] disabled:cursor-not-allowed disabled:text-[var(--poi-control)] disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--poi-focus)]'

/** Zoom around the view centre, or keep `focus` fixed under the cursor. */
function zoomView(map: OccupancyMap, current: Viewport, factor: number, focus?: ImagePoint): Viewport {
  const height = Math.max(map.height / 32, Math.min(map.height, current.height / factor))
  const width = height * map.width / map.height
  if (!focus) return { u: current.u + (current.width - width) / 2, v: current.v + (current.height - height) / 2, width, height }
  return { u: focus.u - (focus.u - current.u) * width / current.width, v: focus.v - (focus.v - current.v) * height / current.height, width, height }
}

export function PoiPosePicker({ map, pose, editable, mode, onModeChange, onPoseChange, clearanceMeters, placing, landmarks = [], landmarkRadiusMeters, layout = 'default' }: Props) {
  const staff = placing != null
  const canvasHeight = layout === 'workbench' ? 'h-[280px] sm:h-[440px] xl:h-[460px]' : 'h-[380px] sm:h-[460px]'
  const loadingHeight = layout === 'workbench' ? canvasHeight : 'h-[460px]'
  const helpId = useId()
  const [rasterState, setRasterState] = useState<RasterState>({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState<Viewport>({ u: 0, v: 0, width: map.width, height: map.height })
  const [hover, setHover] = useState<ImagePoint | null>(null)
  const [interactionError, setInteractionError] = useState<string | null>(null)
  // The picker zooms with its +/− buttons only (no pinch), so a touch screen is not told about the mouse wheel.
  const [touch] = useState(isTouchScreen)
  const drag = useRef<PanDrag | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const actualMode = editable ? mode : 'pan'
  const position: RosPoint | null = pose.x != null && pose.y != null ? { x: pose.x, y: pose.y } : null
  const inside = position && cellAtPose(map, position) != null
  const marker = inside ? rosToImage(map, position) : null
  const headingPreview = actualMode === 'heading' && hover && position
    ? headingFromPoints(position, imageToRos(map, hover)) : null
  const yaw = headingPreview ?? pose.yaw
  const pixels = rasterState.status === 'ready' ? rasterState.raster.pixels : null
  const cellState = position ? sampleCell(map, pixels, position) : null
  const tooClose = cellState === 'free' && clearanceMeters != null && poseClearance(map, pixels, position!, clearanceMeters) === 'blocked'
  const clearanceRadius = clearanceMeters == null ? null : clearanceMeters / map.resolution
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
      ? { step: '1', text: `Bấm vào bản đồ để đặt ${placing ?? 'vị trí POI'}.` }
      : actualMode === 'heading'
        ? { step: '2', text: 'Rê chuột để xem hướng thân, bấm để chốt. Esc để hủy.' }
        : null
  const help = !editable
    ? 'Pose bị khóa. Bạn vẫn có thể phóng to và di chuyển bản đồ.'
    : actualMode === 'position'
      ? staff ? 'Bấm vào ảnh để chọn vị trí, sau đó chọn hướng robot nhìn.' : 'Bấm vào ảnh để chọn vị trí. Sau đó chọn hướng thân hoặc nhập yaw bằng số.'
      : actualMode === 'heading'
        ? 'Di chuyển để xem hướng, bấm để chốt. Escape hủy chọn hướng.'
        : touch ? 'Kéo để di chuyển bản đồ, dùng nút +/− để phóng to.' : 'Kéo để di chuyển bản đồ, cuộn chuột hoặc dùng +/− để phóng to. Phím 1 chọn vị trí, 2 chọn hướng.'
  const arrow = `M 0 0 L ${arrowLength} 0 M ${arrowLength * 0.72} ${-arrowLength * 0.2} L ${arrowLength} 0 L ${arrowLength * 0.72} ${arrowLength * 0.2}`

  return (
    <div className={`${poiThemeClass} min-w-0`}>
      <div role="group" aria-label="Chế độ thao tác bản đồ" className="flex flex-wrap gap-2 rounded-xl border border-[var(--poi-rule)] p-1.5">
        {MODES.map(({ key, label, shortcut, icon: Icon }) => {
          const disabled = key === 'pan' ? !ready : !editable || !ready || (key === 'heading' && !inside)
          const pressed = actualMode === key
          return (
            <button
              key={key} type="button" aria-label={label} aria-pressed={pressed} disabled={disabled}
              onClick={() => chooseMode(key)}
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--poi-focus)] active:bg-[var(--poi-soft)] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none ${layout === 'workbench' ? 'sm:px-3' : 'sm:px-5'} ${
                pressed ? 'bg-[var(--poi-soft)] text-[var(--poi-accent-ink)]' : 'text-[var(--poi-muted)] hover:bg-[var(--poi-paper)] hover:text-[var(--poi-ink)]'
              }`}
            >
              <Icon size={16} aria-hidden="true" />{key === 'pan' ? 'Di chuyển' : layout === 'workbench' ? key === 'position' ? 'Vị trí' : 'Hướng' : label}
              <kbd aria-hidden="true" className={`hidden rounded border border-current px-1 font-mono text-[10px] leading-4 font-semibold opacity-55 ${layout === 'workbench' ? '' : 'sm:inline'}`}>{shortcut}</kbd>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-[13px]">
        <p aria-hidden="true" className="flex items-center gap-2 text-[var(--poi-muted)]"><Info size={15} className="shrink-0 text-[var(--poi-muted)]" />{coach?.text ?? (editable ? 'Kéo để di chuyển bản đồ; phím 1 đặt vị trí, phím 2 chọn hướng.' : 'Vị trí đã khóa, chỉ xem và di chuyển bản đồ.')}</p>
        {!staff && <p className="text-xs text-[var(--poi-muted)]">Độ phân giải bản đồ: <span className="font-mono">{map.resolution} m/ô</span></p>}
      </div>

      <div className="relative overflow-hidden rounded-xl border border-[var(--poi-rule)] bg-[var(--poi-paper)] bg-[linear-gradient(var(--poi-grid)_1px,transparent_1px),linear-gradient(90deg,var(--poi-grid)_1px,transparent_1px)] bg-[length:24px_24px]">
        {rasterState.status === 'loading' && <div className={`flex ${loadingHeight} items-center justify-center text-sm text-[var(--poi-muted)]`} role="status">Đang tải bản đồ…</div>}
        {rasterState.status === 'error' && <div className={`flex ${loadingHeight} flex-col items-center justify-center gap-3 px-3.5 text-center`} role="alert"><p className="text-sm text-[var(--poi-text)]">Không tải được ảnh đúng kích thước bản đồ. Tọa độ trong form vẫn được giữ.</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => { setRasterState({ status: 'loading' }); setRetry((value) => value + 1) }}><RotateCcw size={14} aria-hidden="true" />Tải lại bản đồ</button></div>}
        {ready && <>
          <svg
            ref={svgRef}
            role="group" aria-label="Bản đồ occupancy ROS" aria-describedby={helpId} tabIndex={0}
            viewBox={`${view.u} ${view.v} ${view.width} ${view.height}`}
            className={`${canvasHeight} w-full touch-none select-none outline-offset-[-3px] ${actualMode === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
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
            {landmarks.map(point => {
              const at = rosToImage(map, point)
              return <g key={point.label} pointerEvents="none" aria-label={`${point.label}. ${point.name}`}>
                {landmarkRadiusMeters != null && <circle cx={at.u} cy={at.v} r={landmarkRadiusMeters / map.resolution} fill="var(--poi-landmark-soft)" stroke="var(--poi-landmark)" strokeOpacity={0.6} strokeWidth={1.25} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                <circle cx={at.u} cy={at.v} r={markerRadius * 2.2} fill="var(--poi-landmark)" stroke="var(--poi-paper)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                <text x={at.u} y={at.v + markerRadius * 0.85} textAnchor="middle" fontSize={markerRadius * 2.4} fontWeight={700} fill="var(--poi-paper)">{point.label}</text>
              </g>
            })}
            {ghost && <g pointerEvents="none" opacity={0.55}>
              {clearanceRadius != null && <circle data-testid="clearance-preview" cx={ghost.u} cy={ghost.v} r={clearanceRadius} fill="var(--poi-pose-soft)" stroke="var(--poi-focus)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
              <circle cx={ghost.u} cy={ghost.v} r={markerRadius * 0.8} fill="var(--poi-focus)" />
              <circle cx={ghost.u} cy={ghost.v} r={markerRadius * 2} fill="none" stroke="var(--poi-focus)" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            </g>}
            {marker && <g aria-label="Pose POI" transform={`translate(${marker.u} ${marker.v})`}>
              {clearanceRadius != null && <circle data-testid="clearance-circle" pointerEvents="none" r={clearanceRadius} fill={tooClose ? 'var(--poi-clearance-soft)' : 'var(--poi-pose-soft)'} stroke={tooClose ? 'var(--poi-clearance-warn)' : 'var(--poi-focus)'} strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
              {yaw != null && Number.isFinite(yaw) && <g transform={`rotate(${-(yaw - map.origin[2]) * 180 / Math.PI})`}>
                <path d={`M 0 0 L ${arrowLength * 1.05} ${-arrowLength * 0.45} A ${arrowLength * 1.14} ${arrowLength * 1.14} 0 0 1 ${arrowLength * 1.05} ${arrowLength * 0.45} Z`} fill="var(--poi-pose-soft)" />
                <path d={arrow} fill="none" stroke="var(--poi-paper)" strokeWidth={6} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                <path d={arrow} fill="none" stroke="var(--poi-focus)" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={headingPreview != null ? '6 5' : undefined} />
              </g>}
              <circle className="poi-marker-ring" r={markerRadius} fill="none" stroke="var(--poi-focus)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <circle key={`${pose.x}:${pose.y}`} className="poi-marker-drop" r={markerRadius} fill="var(--poi-focus)" stroke="var(--poi-paper)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            </g>}
          </svg>

          <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-xl border border-[var(--poi-rule)] bg-white p-1 shadow-[0_3.5px_5.5px_var(--poi-shadow)]">
            <button type="button" aria-label="Phóng to" disabled={view.height <= map.height / 32} onClick={() => zoom(2)} className={zoomButton}><Plus size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Thu nhỏ" disabled={view.height >= map.height} onClick={() => zoom(0.5)} className={zoomButton}><Minus size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Vừa bản đồ" onClick={fitMap} className={zoomButton}><Maximize size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Đưa POI vào giữa" disabled={!marker} onClick={() => { if (marker) setView((current) => ({ ...current, u: marker.u - current.width / 2, v: marker.v - current.height / 2 })) }} className={zoomButton}><LocateFixed size={16} aria-hidden="true" /></button>
          </div>

          {!staff && <div aria-hidden="true" className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5 font-mono text-[11.5px] text-[var(--poi-muted)]">
            <span className="rounded-lg border border-[var(--poi-rule)] bg-white/92 px-2 py-1">X {shown ? shown.x.toFixed(4) : '—'} m</span>
            <span className="rounded-lg border border-[var(--poi-rule)] bg-white/92 px-2 py-1">Y {shown ? shown.y.toFixed(4) : '—'} m</span>
            <span className="rounded-lg border border-[var(--poi-rule)] bg-white/92 px-2 py-1">Yaw {yaw == null ? '—' : yaw.toFixed(6)} rad</span>
          </div>}
        </>}
      </div>

      <div className="space-y-2.5 pt-3 text-xs leading-5 text-[var(--poi-muted)]">
        {!staff && <p className="sr-only">X: {pose.x == null ? 'chưa chọn' : `${pose.x.toFixed(4)} m`}, Y: {pose.y == null ? 'chưa chọn' : `${pose.y.toFixed(4)} m`}, Yaw: {pose.yaw == null ? 'chưa chọn' : `${pose.yaw.toFixed(6)} rad`}</p>}
        {cellState && <p role="status" className={`flex items-start gap-2 rounded-lg px-3 py-2 font-semibold ${cellState === 'free' && !tooClose ? 'bg-[var(--poi-ground)] text-[var(--poi-muted)]' : 'bg-[var(--poi-warn-soft)] text-[var(--poi-warn)]'}`}>
          {cellState === 'free' && !tooClose ? <CircleCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}{tooClose ? clearanceMessage(clearanceMeters!) : CELL_LABELS[cellState]}
        </p>}
        {interactionError && <p role="alert" className="font-semibold text-[var(--poi-danger)]">{interactionError}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-[3px] border border-[var(--poi-control)] bg-white" aria-hidden="true" />Trắng: ô trống</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-[3px] bg-[var(--poi-obstacle)]" aria-hidden="true" />Đen: vật cản</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-[3px] bg-[var(--poi-unknown)]" aria-hidden="true" />Xám: chưa biết</span>
          {clearanceMeters != null && <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-full border border-dashed border-[var(--poi-focus)] bg-[var(--poi-focus)]/10" aria-hidden="true" />Vòng tròn: khoảng trống quanh robot</span>}
          {landmarks.length > 0 && <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-full bg-[var(--poi-landmark)]" aria-hidden="true" />Số: điểm dừng{landmarkRadiusMeters != null ? `, vòng nét đứt: cách tối thiểu ${landmarkRadiusMeters.toLocaleString('vi-VN')} m` : ''}</span>}
          {!staff && <span>Yaw 0 = +X, chiều dương quay về +Y</span>}
        </div>
        {staff && <>
          <p className="flex items-center gap-2 text-sm text-[var(--poi-text)]"><span className="text-[var(--poi-muted)]">Hướng robot:</span>{yaw == null ? 'chưa chọn'
            : <><ArrowRight size={16} aria-hidden="true" className="shrink-0 text-[var(--poi-focus)]" style={{ transform: `rotate(${-(yaw - map.origin[2]) * 180 / Math.PI}deg)` }} /><span className="font-semibold">{yawDegrees(yaw)}°</span></>}</p>
          <details className="group rounded-lg border border-[var(--poi-rule)]">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-medium text-[var(--poi-muted)] [&::-webkit-details-marker]:hidden"><ChevronRight size={14} aria-hidden="true" className="transition-transform group-open:rotate-90" />Chi tiết kỹ thuật</summary>
            <dl className="grid gap-x-4 gap-y-1 border-t border-[var(--poi-rule)] px-3 py-2 font-mono sm:grid-cols-3">
              <div><dt className="font-sans">X</dt><dd>{shown ? `${shown.x.toFixed(4)} m` : '-'}</dd></div>
              <div><dt className="font-sans">Y</dt><dd>{shown ? `${shown.y.toFixed(4)} m` : '-'}</dd></div>
              <div><dt className="font-sans">Yaw</dt><dd>{yaw == null ? '-' : `${yaw.toFixed(6)} rad`}</dd></div>
            </dl>
            <p className="border-t border-[var(--poi-rule)] px-3 py-2">Yaw 0 = +X, chiều dương quay về +Y. Độ phân giải bản đồ: <span className="font-mono">{map.resolution} m/ô</span>.</p>
          </details>
        </>}
        <p id={helpId} className="sr-only">{help}</p>
      </div>
    </div>
  )
}
