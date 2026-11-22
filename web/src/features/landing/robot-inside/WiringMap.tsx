import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight, Layers, X } from 'lucide-react'
import {
  CLUSTERS, COMPONENTS, WIRES, WIRE_KINDS, component, wireColor, wiresOf,
  type InsideComponent, type InsideId, type InsideWire, type WireKind,
} from './wiring'
import {
  boxEdges, boxFaces, boxTop, circlePath, cylinderPath, nearness, project, routeLength, wirePath,
  type Box3, type Point2, type Point3,
} from './iso'

export type Selection = { type: 'part'; id: InsideId } | { type: 'wire'; id: string } | null

/* ---------- Geometry, worked out once ---------- */

/** The casing, drawn as a faint outline so the parts inside show. */
const BODY: Box3 = { min: [-0.281, 0.077, -0.401], max: [0.282, 0.473, 0.401] }
const SCREEN: Box3 = { min: [-0.15, 0.367, 0.384], max: [0.15, 0.457, 0.399] }
const WHEELS: Point3[] = [[0.216, 0.0973, 0], [-0.216, 0.0973, 0]]
const CASTERS: Point3[] = [[0.152, 0.07, -0.29], [-0.123, 0.07, 0.29], [0.152, 0.07, 0.29], [-0.123, 0.07, -0.29]]
const COLUMN = { centre: [0, 0] as const, radius: 0.076, from: 0.503, to: 0.803 }

type DrawnPiece = { key: string; id: InsideId; faces?: ReturnType<typeof boxFaces>; cylinder?: { outline: string; top: string }; near: number }

const centreOf = ({ min, max }: Box3): Point3 => [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]

const PIECES: DrawnPiece[] = COMPONENTS.flatMap(item => {
  const boxes = item.boxes.map((box, index) => ({ key: `${item.id}-${index}`, id: item.id, faces: boxFaces(box), near: nearness(centreOf(box)) }))
  const cylinder = item.cylinder
    ? [{
        key: `${item.id}-c`, id: item.id,
        cylinder: { outline: cylinderPath(item.cylinder.centre, item.cylinder.radius, item.cylinder.from, item.cylinder.to), top: circlePath([item.cylinder.centre[0], item.cylinder.to, item.cylinder.centre[1]], item.cylinder.radius, 'y') },
        near: nearness([item.cylinder.centre[0], (item.cylinder.from + item.cylinder.to) / 2, item.cylinder.centre[1]]),
      }]
    : []
  return [...boxes, ...cylinder]
}).sort((a, b) => a.near - b.near)

/** Where each part's number sits on the drawing. */
function markerOf(item: InsideComponent): Point2 {
  if (item.offRobot) return project(item.offRobot)
  if (item.cylinder) return project([item.cylinder.centre[0], item.cylinder.to, item.cylinder.centre[1]])
  return boxTop(item.boxes[0])
}
const ANCHORS = new Map(COMPONENTS.map(item => [item.id, markerOf(item)]))
/**
 * The middle of the electronics bay is crowded: these numbers stand a little
 * away from their part, a thin leader line pointing back to it (drawing units).
 */
const MARKER_SHIFT: Partial<Record<InsideId, Point2>> = {
  lidar: [-92, -34],
  pc: [-66, 34],
  pcb: [46, -52],
  drv: [-40, 52],
  dcdc: [34, 34],
  contactor: [40, 18],
}
const MARKERS = new Map(COMPONENTS.map(item => {
  const [x, y] = ANCHORS.get(item.id)!
  const [dx, dy] = MARKER_SHIFT[item.id] ?? [0, 0]
  return [item.id, [x + dx, y + dy] as Point2]
}))

/** The point halfway along a route on the drawing, where its name is printed. */
function midpoint(route: readonly Point3[]): Point2 {
  const points = route.map(point => project(point))
  const half = routeLength(route) / 2
  let walked = 0
  for (let index = 1; index < points.length; index += 1) {
    const [ax, ay] = points[index - 1]
    const [bx, by] = points[index]
    const step = Math.hypot(bx - ax, by - ay)
    if (walked + step >= half) {
      const t = step ? (half - walked) / step : 0
      return [ax + (bx - ax) * t, ay + (by - ay) * t]
    }
    walked += step
  }
  return points[points.length - 1]
}

const DRAWN_WIRES = WIRES.map(item => ({
  wire: item,
  paths: item.routes.map(route => wirePath(route)),
  label: midpoint(item.routes[0]),
}))

/** The drawing's frame: everything above, with room for the numbers and the tour card. */
const VIEW = (() => {
  const corners: Point3[] = [[BODY.min[0], 0, BODY.min[2]], [BODY.max[0], 0, BODY.max[2]], [BODY.min[0], 0, BODY.max[2]], [BODY.max[0], 0, BODY.min[2]], [0, 1.276, 0]]
  const points: Point2[] = [...corners.map(point => project(point)), project(component('tour').offRobot!)]
  const xs = points.map(point => point[0])
  const ys = points.map(point => point[1])
  const pad = 34
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad - 26
  return { minX, minY, width: Math.max(...xs) + pad + 90 - minX, height: Math.max(...ys) + pad - minY }
})()

const LIDAR_SWEEP = (() => {
  const [cx, cy] = project([0, 0.474, 0])
  return { cx, cy }
})()

/* ---------- Pieces of the drawing ---------- */

function Backdrop() {
  return (
    <g className="lp3-ri__context" aria-hidden="true">
      <ellipse className="lp3-ri__floor" cx={project([0, 0, 0])[0]} cy={project([0, 0, 0])[1]} rx={330} ry={150} />
      {WHEELS.map(centre => (
        <Fragment key={centre[0]}>
          <path className="lp3-ri__wheel" d={circlePath(centre, 0.097, 'x', 48)} />
          <path className="lp3-ri__hub" d={circlePath(centre, 0.035, 'x', 24)} />
        </Fragment>
      ))}
      {CASTERS.map(centre => <path key={`${centre[0]}${centre[2]}`} className="lp3-ri__caster" d={circlePath(centre, 0.055, 'x', 28)} />)}
      <path className="lp3-ri__body" d={boxEdges(BODY)} />
      <polygon className="lp3-ri__lid" points={boxFaces({ min: [BODY.min[0], 0.448, BODY.min[2]], max: [BODY.max[0], 0.473, BODY.max[2]] }).top} />
      <path className="lp3-ri__body" d={boxEdges(SCREEN)} />
      <path className="lp3-ri__column" d={cylinderPath(COLUMN.centre, COLUMN.radius, COLUMN.from, COLUMN.to)} />
      <path className="lp3-ri__column" d={circlePath([0.007, 1.14, 0], 0.115, 'x', 40)} />
      <ColumnBreak />
    </g>
  )
}

/** Two short slashes across the column: it is drawn shorter than it is. */
function ColumnBreak() {
  const [x, y] = project([0, 0.62, 0])
  return (
    <g className="lp3-ri__break" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <path className="lp3-ri__break-gap" d="M-50 1 L50 -9" />
      <path d="M-50 -4 L50 -14 M-50 6 L50 -4" />
    </g>
  )
}

/** `scale` keeps the numbers and labels readable when the drawing is shrunk to a phone's width. */
const place = ([x, y]: Point2, scale: number) => `translate(${x.toFixed(1)} ${y.toFixed(1)})${scale !== 1 ? ` scale(${scale.toFixed(2)})` : ''}`

/** The tour card's number, moved in from the right edge when a narrow screen makes the card larger. */
function tourAt(scale: number): Point2 {
  const [x, y] = MARKERS.get('tour')!
  return [Math.min(x, VIEW.minX + VIEW.width - 140 * scale), y]
}

function TourCard({ state, scale, onPick }: { state: string; scale: number; onPick: () => void }) {
  return (
    <g className="lp3-ri__tour" data-state={state} transform={place(tourAt(scale), scale)} onClick={event => { event.stopPropagation(); onPick() }}>
      <rect x={-18} y={-26} width={150} height={52} rx={12} />
      <text x={22} y={-4}>Trang tour</text>
      <text x={22} y={13} className="lp3-ri__tour-sub">trình duyệt học sinh</text>
    </g>
  )
}

function Marker({ item, state, scale, onPick, onHover }: { item: InsideComponent; state: string; scale: number; onPick: () => void; onHover: (on: boolean) => void }) {
  const [x, y] = item.id === 'tour' ? tourAt(scale) : MARKERS.get(item.id)!
  const onKey = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick() }
  }
  const showName = state === 'picked' || state === 'hover'
  const width = item.label.length * 7.1 + 22
  const [ax, ay] = ANCHORS.get(item.id)!
  return (
    <>
    {MARKER_SHIFT[item.id] && (
      <g className="lp3-ri__leader" data-state={state} aria-hidden="true">
        <line x1={ax} y1={ay} x2={x} y2={y} />
        <circle cx={ax} cy={ay} r={2.6} />
      </g>
    )}
    <g
      className="lp3-ri__marker" data-state={state} transform={place([x, y], scale)}
      role="button" tabIndex={0} aria-pressed={state === 'picked'} aria-label={`${item.number}. ${item.label}`}
      onClick={event => { event.stopPropagation(); onPick() }} onKeyDown={onKey}
      onPointerEnter={() => onHover(true)} onPointerLeave={() => onHover(false)} onFocus={() => onHover(true)} onBlur={() => onHover(false)}
    >
      <circle r={11.5} />
      <text className="lp3-ri__marker-num" y={4}>{item.number}</text>
      {showName && (
        <g className="lp3-ri__marker-name" transform="translate(16 -11)">
          <rect width={width} height={22} rx={11} />
          <text x={11} y={15}>{item.label}</text>
        </g>
      )}
    </g>
    </>
  )
}

/* ---------- The panel beside the drawing ---------- */

function KindChip({ kind }: { kind: WireKind }) {
  const item = WIRE_KINDS.find(entry => entry.kind === kind)!
  return <span className="lp3-ri__kind"><i style={{ background: item.color }} aria-hidden="true" />{item.label}</span>
}

function otherEnd(item: InsideWire, id: InsideId): InsideId {
  return item.from === id ? item.to : item.from
}

function PartPanel({ item, onSelect }: { item: InsideComponent; onSelect: (selection: Selection) => void }) {
  const wires = wiresOf(item.id)
  return (
    <>
      <span className="lp3-ri__eyebrow">{String(item.number).padStart(2, '0')} · {CLUSTERS.find(cluster => cluster.id === item.cluster)!.label}{item.virtual ? ' · vị trí minh họa' : ''}</span>
      <h3>{item.label}</h3>
      <p className="lp3-ri__model">{item.model}</p>
      <p className="lp3-ri__role">{item.role}</p>
      <div className="lp3-ri__how">
        <h4>Cách hoạt động</h4>
        {item.how.map(text => <p key={text}>{text}</p>)}
      </div>
      <dl className="lp3-ri__specs">
        {item.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {wires.length > 0 && (
        <div className="lp3-ri__links">
          <h4>Đường dây nối tới</h4>
          <ul>
            {wires.map(entry => (
              <li key={entry.id}>
                <button type="button" onClick={() => onSelect({ type: 'wire', id: entry.id })}>
                  <i style={{ background: wireColor(entry.kind) }} aria-hidden="true" />
                  <span><b>{entry.label}</b>{entry.from === item.id ? ' tới ' : ' từ '}{component(otherEnd(entry, item.id)).label}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function WirePanel({ item, onSelect }: { item: InsideWire; onSelect: (selection: Selection) => void }) {
  const from = component(item.from)
  const to = component(item.to)
  return (
    <>
      <span className="lp3-ri__eyebrow">Đường dây{item.routes.length > 1 ? ` · ${item.routes.length} sợi giống nhau` : ''}</span>
      <h3>{item.label}</h3>
      <p className="lp3-ri__ends">
        <button type="button" onClick={() => onSelect({ type: 'part', id: from.id })}>{from.number}. {from.label}</button>
        <ArrowRight size={15} aria-hidden="true" />
        <button type="button" onClick={() => onSelect({ type: 'part', id: to.id })}>{to.number}. {to.label}</button>
      </p>
      <p className="lp3-ri__role">{item.carries}</p>
      <dl className="lp3-ri__specs">
        <div><dt>Loại</dt><dd><KindChip kind={item.kind} />{item.back && <KindChip kind={item.back} />}</dd></div>
        <div><dt>Mức điện</dt><dd>{item.level}</dd></div>
        {item.pins && <div><dt>Chân / đầu nối</dt><dd>{item.pins}</dd></div>}
      </dl>
    </>
  )
}

function Overview({ onSelect }: { onSelect: (selection: Selection) => void }) {
  return (
    <>
      <span className="lp3-ri__eyebrow">{COMPONENTS.length} bộ phận · {WIRES.length} đường dây</span>
      <h3>Chọn một bộ phận</h3>
      <p className="lp3-ri__role">Bấm một số trên hình, một đường dây hoặc một tên dưới đây để xem nó làm gì và nối với ai.</p>
      {CLUSTERS.map(cluster => (
        <div className="lp3-ri__group" key={cluster.id}>
          <h4>{cluster.label}</h4>
          <ul>
            {COMPONENTS.filter(item => item.cluster === cluster.id).map(item => (
              <li key={item.id}>
                <button type="button" onClick={() => onSelect({ type: 'part', id: item.id })}><span>{item.number}</span>{item.label}</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

/* ---------- The map ---------- */

/**
 * The robot drawn from its front corner with the casing seen through: every
 * part in its place from the CAD model, every cable between them coloured by
 * what it carries, current running along it. Pick a part or a cable to read
 * about it; switch whole kinds of cable off and on with the chips.
 */
export function WiringMap({ selection, onSelect }: { selection: Selection; onSelect: (selection: Selection) => void }) {
  const [shown, setShown] = useState<ReadonlySet<WireKind>>(() => new Set(WIRE_KINDS.map(item => item.kind)))
  const [hoverPart, setHoverPart] = useState<InsideId | null>(null)
  const [hoverWire, setHoverWire] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  /** Drawing units per screen pixel above 1 (a narrow screen): numbers and labels grow back by most of it. */
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const node = svgRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect
      if (!box?.width || !box.height) return
      const unitsPerPixel = Math.max(VIEW.width / box.width, VIEW.height / box.height)
      setScale(Math.min(2.2, Math.max(1, unitsPerPixel * 0.8)))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const picked = selection?.type === 'part' ? selection.id : null
  const pickedWire = selection?.type === 'wire' ? WIRES.find(item => item.id === selection.id) ?? null : null
  const focusPart = picked ?? hoverPart

  /** The parts that belong to what is picked: the part and the far ends of its cables, or a cable's two ends. */
  const related = useMemo(() => {
    if (pickedWire) return new Set<InsideId>([pickedWire.from, pickedWire.to])
    if (!focusPart) return null
    return new Set<InsideId>([focusPart, ...wiresOf(focusPart).map(item => otherEnd(item, focusPart))])
  }, [pickedWire, focusPart])

  const toggle = (kind: WireKind) => setShown(current => {
    const next = new Set(current)
    if (next.has(kind)) next.delete(kind)
    else next.add(kind)
    return next
  })
  const pickPart = (id: InsideId) => onSelect(picked === id ? null : { type: 'part', id })
  const pickWire = (id: string) => onSelect(pickedWire?.id === id ? null : { type: 'wire', id })

  const partState = (id: InsideId) => {
    if (picked === id) return 'picked'
    if (hoverPart === id) return 'hover'
    if (related) return related.has(id) ? 'near' : 'dim'
    return 'idle'
  }
  const wireState = (item: InsideWire) => {
    if (pickedWire?.id === item.id) return 'picked'
    if (hoverWire === item.id) return 'hover'
    if (pickedWire) return 'dim'
    if (focusPart) return item.from === focusPart || item.to === focusPart ? 'near' : 'dim'
    return 'idle'
  }
  const labelled = DRAWN_WIRES.find(entry => entry.wire.id === (hoverWire ?? pickedWire?.id))
  const selectedPart = picked ? component(picked) : null

  return (
    <div className="lp3-ri" data-selected={selection ? 'true' : 'false'}>
      <div className="lp3-ri__stage">
        <div className="lp3-ri__chips" role="group" aria-label="Lớp dây hiển thị">
          <span className="lp3-ri__chips-label"><Layers size={14} aria-hidden="true" />Lớp dây</span>
          {WIRE_KINDS.map(item => (
            <button key={item.kind} type="button" aria-pressed={shown.has(item.kind)} onClick={() => toggle(item.kind)}>
              <i style={{ background: item.color }} aria-hidden="true" />{item.label}
            </button>
          ))}
        </div>
        <svg
          ref={svgRef}
          style={{ ['--ri-s' as string]: scale }}
          className="lp3-ri__svg"
          viewBox={`${VIEW.minX.toFixed(0)} ${VIEW.minY.toFixed(0)} ${VIEW.width.toFixed(0)} ${VIEW.height.toFixed(0)}`}
          role="group"
          aria-label="Sơ đồ đi dây bên trong robot CampusTour, vỏ xe nhìn xuyên qua"
          onClick={() => onSelect(null)}
        >
          <Backdrop />
          <g className="lp3-ri__sweep" aria-hidden="true">
            <ellipse cx={LIDAR_SWEEP.cx} cy={LIDAR_SWEEP.cy} rx={210} ry={96} />
            <ellipse cx={LIDAR_SWEEP.cx} cy={LIDAR_SWEEP.cy} rx={150} ry={69} />
          </g>

          {PIECES.map(piece => {
            const item = component(piece.id)
            return (
              <g
                key={piece.key}
                className="lp3-ri__part"
                data-state={partState(piece.id)}
                data-virtual={item.virtual ? 'true' : undefined}
                data-cluster={item.cluster}
                onClick={event => { event.stopPropagation(); pickPart(piece.id) }}
                onPointerEnter={() => setHoverPart(piece.id)}
                onPointerLeave={() => setHoverPart(null)}
              >
                {piece.faces && (
                  <>
                    <polygon className="lp3-ri__face lp3-ri__face--front" points={piece.faces.front} />
                    <polygon className="lp3-ri__face lp3-ri__face--side" points={piece.faces.side} />
                    <polygon className="lp3-ri__face lp3-ri__face--top" points={piece.faces.top} />
                  </>
                )}
                {piece.cylinder && (
                  <>
                    <path className="lp3-ri__face lp3-ri__face--side" d={piece.cylinder.outline} />
                    <path className="lp3-ri__face lp3-ri__face--top" d={piece.cylinder.top} />
                  </>
                )}
              </g>
            )
          })}

          <g className="lp3-ri__wires">
            {DRAWN_WIRES.filter(entry => shown.has(entry.wire.kind)).map(({ wire: item, paths }) => (
              <g
                key={item.id}
                className="lp3-ri__wire"
                data-kind={item.kind}
                data-state={wireState(item)}
                data-dashed={item.dashed ? 'true' : undefined}
                style={{ ['--c' as string]: wireColor(item.kind), ['--c-back' as string]: item.back ? wireColor(item.back) : undefined }}
              >
                {paths.map((d, index) => (
                  <Fragment key={index}>
                    <path className="lp3-ri__glow" d={d} />
                    <path className="lp3-ri__core" d={d} />
                    <path className="lp3-ri__pulse" d={d} />
                    {item.back && <path className="lp3-ri__pulse lp3-ri__pulse--back" d={d} />}
                    <path
                      className="lp3-ri__hit" d={d}
                      onClick={event => { event.stopPropagation(); pickWire(item.id) }}
                      onPointerEnter={() => setHoverWire(item.id)}
                      onPointerLeave={() => setHoverWire(null)}
                    />
                  </Fragment>
                ))}
              </g>
            ))}
          </g>

          <TourCard state={partState('tour')} scale={scale} onPick={() => pickPart('tour')} />

          {COMPONENTS.map(item => (
            <Marker key={item.id} item={item} state={partState(item.id)} scale={scale} onPick={() => pickPart(item.id)} onHover={on => setHoverPart(on ? item.id : null)} />
          ))}

          {labelled && (
            <g className="lp3-ri__wire-name" transform={place(labelled.label, scale)} style={{ ['--c' as string]: wireColor(labelled.wire.kind) }} aria-hidden="true">
              <rect x={-(labelled.wire.label.length * 3.6 + 12)} y={-12} width={labelled.wire.label.length * 7.2 + 24} height={24} rx={12} />
              <text y={4.5}>{labelled.wire.label}</text>
            </g>
          )}
        </svg>
        <p className="lp3-ri__note">Vị trí linh kiện lấy từ mô hình SolidWorks của xe; trụ đầu được vẽ ngắn lại. Đường dây vẽ theo sơ đồ nối, không phải đường đi thật của từng sợi.</p>
      </div>

      <aside className="lp3-ri__panel" aria-label="Chi tiết" aria-live="polite">
        {selection && (
          <button type="button" className="lp3-ri__close" onClick={() => onSelect(null)}><X size={14} aria-hidden="true" />Bỏ chọn</button>
        )}
        <div className="lp3-ri__panel-body" key={selection ? `${selection.type}-${selection.id}` : 'none'}>
          {selectedPart ? <PartPanel item={selectedPart} onSelect={onSelect} />
            : pickedWire ? <WirePanel item={pickedWire} onSelect={onSelect} />
              : <Overview onSelect={onSelect} />}
        </div>
      </aside>
    </div>
  )
}
