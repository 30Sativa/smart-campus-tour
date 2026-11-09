import { Fragment, Suspense, lazy, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { prefersReducedMotion } from '../landing-motion'
import { FLOWS, FLOW_NODES, SIGNAL_KINDS, flowNode, parseBody, signalColor, type FlowLink, type FlowNode, type FlowNodeId, type FlowStep } from '../robot-explode/flows'
import { ViewerBoundary } from '../robot-explode/ViewerBoundary'

// three.js and the model load only once this section comes near the screen.
const RobotFlowViewer = lazy(() => import('../robot-explode/RobotFlowViewer'))

function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/* ---------- Signal diagram: what feeds in, the two computers, what they drive. ---------- */

const BOX = { w: 230, h: 44 }
const COLUMN_X = { in: 0, brain: 365, out: 730 } as const
const VIEW = { w: 960, h: 380 }

function boxOf(node: FlowNode) {
  if (node.column === 'brain') return { x: COLUMN_X.brain, y: node.id === 'pc' ? 30 : 205, w: BOX.w, h: 140 }
  const column = FLOW_NODES.filter(item => item.column === node.column)
  const index = column.indexOf(node)
  const gap = (VIEW.h - column.length * BOX.h) / (column.length + 1)
  return { x: COLUMN_X[node.column], y: gap + index * (BOX.h + gap), w: BOX.w, h: BOX.h }
}

/** SVG path of a link between two boxes, and where its label goes. */
function linkPath(link: FlowLink) {
  const a = flowNode(link.from)
  const b = flowNode(link.to)
  const A = boxOf(a)
  const B = boxOf(b)
  if (a.column === b.column && a.column === 'brain') {
    // Between the two computers: down for commands, up for readings, side by side.
    const x = A.x + A.w / 2 + (A.y < B.y ? -26 : 26)
    const y1 = A.y < B.y ? A.y + A.h : A.y
    const y2 = A.y < B.y ? B.y : B.y + B.h
    return { d: `M${x},${y1} L${x},${y2}`, label: { x: x + (A.y < B.y ? -8 : 8), y: (y1 + y2) / 2, anchor: A.y < B.y ? 'end' : 'start' } }
  }
  if (a.column === b.column) {
    // Within the output column: round the right-hand side.
    const x = A.x + A.w
    const y1 = A.y + A.h / 2
    const y2 = B.y + B.h / 2
    const bulge = x + 18 + Math.abs(y2 - y1) * 0.12
    return { d: `M${x},${y1} C${bulge},${y1} ${bulge},${y2} ${x},${y2}`, label: { x: bulge - 2, y: (y1 + y2) / 2 + 4, anchor: 'start' } }
  }
  const forward = A.x < B.x
  const x1 = forward ? A.x + A.w : A.x
  const x2 = forward ? B.x : B.x + B.w
  const y1 = A.y + A.h / 2
  const y2 = B.y + B.h / 2
  const mid = (x1 + x2) / 2
  return { d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`, label: { x: mid, y: (y1 + y2) / 2 - 6, anchor: 'middle' } }
}

const ALL_LINKS: FlowLink[] = (() => {
  const seen = new Map<string, FlowLink>()
  for (const flow of FLOWS) for (const step of flow.steps) for (const link of step.links) seen.set(`${link.from}>${link.to}`, link)
  return [...seen.values()]
})()

export function SignalDiagram({ step }: { step: FlowStep | null }) {
  const active = new Map<string, FlowLink>((step?.links ?? []).map(link => [`${link.from}>${link.to}`, link]))
  const nodeKind = new Map<FlowNodeId, FlowLink['kind']>()
  for (const link of step?.links ?? []) {
    if (!nodeKind.has(link.from)) nodeKind.set(link.from, link.kind)
    if (!nodeKind.has(link.to)) nodeKind.set(link.to, link.kind)
  }
  return (
    <figure className="lp3-flow__diagram">
      <div className="lp3-flow__diagram-scroll">
        <svg viewBox={`-6 -18 ${VIEW.w + 120} ${VIEW.h + 26}`} role="img" aria-label={step ? `Sơ đồ tín hiệu: ${step.links.map(link => `${flowNode(link.from).label} tới ${flowNode(link.to).label}`).join('; ')}` : 'Sơ đồ tín hiệu của robot'}>
          <defs>
            {SIGNAL_KINDS.map(item => (
              <marker key={item.kind} id={`flow-arrow-${item.kind}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" fill={item.color} />
              </marker>
            ))}
          </defs>
          <text className="lp3-flow__col" x={COLUMN_X.in} y={-6}>Nhận vào</text>
          <text className="lp3-flow__col" x={COLUMN_X.brain} y={-6}>Bộ não</text>
          <text className="lp3-flow__col" x={COLUMN_X.out} y={-6}>Điều khiển</text>
          {ALL_LINKS.filter(link => !active.has(`${link.from}>${link.to}`)).map(link => (
            <path key={`${link.from}>${link.to}`} className="lp3-flow__wire" d={linkPath(link).d} />
          ))}
          {[...active.values()].map(link => {
            const path = linkPath(link)
            return (
              <g key={`${link.from}>${link.to}`} data-kind={link.kind}>
                <path className="lp3-flow__wire lp3-flow__wire--on" d={path.d} stroke={signalColor(link.kind)} markerEnd={`url(#flow-arrow-${link.kind})`} />
                <text className="lp3-flow__wire-label" x={path.label.x} y={path.label.y} textAnchor={path.label.anchor as 'start' | 'middle' | 'end'} fill={signalColor(link.kind)}>{link.label}</text>
              </g>
            )
          })}
          {FLOW_NODES.map(node => {
            const box = boxOf(node)
            const kind = nodeKind.get(node.id)
            return (
              <g key={node.id} className="lp3-flow__node" data-on={kind ? 'true' : 'false'}>
                <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={node.column === 'brain' ? 14 : 9} stroke={kind ? signalColor(kind) : undefined} />
                <text className="lp3-flow__node-label" x={box.x + 14} y={box.y + (node.column === 'brain' ? box.h / 2 - 2 : 19)}>{node.label}</text>
                <text className="lp3-flow__node-detail" x={box.x + 14} y={box.y + (node.column === 'brain' ? box.h / 2 + 18 : 34)}>{node.detail}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <figcaption className="lp3-flow__legend">
        {SIGNAL_KINDS.map(item => <span key={item.kind}><i style={{ background: item.color }} />{item.label}</span>)}
      </figcaption>
    </figure>
  )
}

/* ---------- The section ---------- */

function StepBody({ step }: { step: FlowStep }) {
  return (
    <p>
      {parseBody(step.body).map((part, index) => part.kind
        ? <mark key={index} className="lp3-flow__term" style={{ textDecorationColor: signalColor(part.kind) }}>{part.text}</mark>
        : <Fragment key={index}>{part.text}</Fragment>)}
    </p>
  )
}

/**
 * "Bên trong robot": pick a function (driving, sensing, the head, video,
 * power), then scroll through its steps. The 3D robot beside the steps shows
 * the step under way: the parts that work light up and each signal runs along
 * its path; below it, the same step on the signal diagram.
 */
export function RobotFlowSection() {
  const [flowIndex, setFlowIndex] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [details, setDetails] = useState<number | null>(null)
  const [mode, setMode] = useState<'waiting' | '3d' | 'none'>('waiting')
  const [visible, setVisible] = useState(false)
  const [reduced] = useState(prefersReducedMotion)
  const stageRef = useRef<HTMLDivElement>(null)
  const stepRefs = useRef<(HTMLLIElement | null)[]>([])
  const flow = FLOWS[flowIndex]
  const step = flow.steps[Math.min(stepIndex, flow.steps.length - 1)]

  // The step crossing the middle of the screen is the one shown.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setStepIndex(Number((entry.target as HTMLElement).dataset.step))
    }, { rootMargin: '-48% 0px -48% 0px' })
    stepRefs.current.forEach(node => { if (node) observer.observe(node) })
    return () => observer.disconnect()
  }, [flowIndex])

  useEffect(() => {
    const node = stageRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      const near = Boolean(entry?.isIntersecting)
      setVisible(near)
      if (near) setMode(current => (current !== 'waiting' ? current : canUseWebGL() ? '3d' : 'none'))
    }, { rootMargin: '240px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const chooseFlow = (index: number) => {
    setFlowIndex(index)
    setStepIndex(0)
    setDetails(null)
  }
  const goToStep = (index: number) => {
    setStepIndex(index)
    stepRefs.current[index]?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
  }

  return (
    <section className="lp3-flow lp3-section" id="ben-trong-robot">
      <div className="lp3-container">
        <div className="lp3-section-head">
          <span className="lp3-kicker" data-reveal>05 / Bên trong robot</span>
          <h2 data-reveal>Dữ liệu chạy từ máy tính<br />tới từng bánh xe.</h2>
          <p data-reveal>Chọn một chức năng rồi cuộn xuống: mỗi bước sáng lên đúng linh kiện đang làm việc và đường tín hiệu đi qua nó.</p>
        </div>

        <div className="lp3-flow__tabs" role="tablist" aria-label="Chức năng của robot">
          {FLOWS.map((item, index) => (
            <button key={item.id} type="button" role="tab" aria-selected={index === flowIndex} onClick={() => chooseFlow(index)}>
              <strong>{item.label}</strong>
              <span>{item.summary}</span>
            </button>
          ))}
        </div>

        <div className="lp3-flow__grid">
          <ol className="lp3-flow__steps" aria-label={`Các bước: ${flow.label}`}>
            {flow.steps.map((item, index) => (
              <li
                key={`${flow.id}-${index}`}
                ref={node => { stepRefs.current[index] = node }}
                data-step={index}
                data-active={index === stepIndex}
                className="lp3-flow__step"
              >
                <span className="lp3-flow__num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <h3><span className="sr-only">Bước {index + 1}/{flow.steps.length}: </span>{item.title}</h3>
                <StepBody step={item} />
                <ul className="lp3-flow__links">
                  {item.links.map(link => (
                    <li key={`${link.from}>${link.to}`}>
                      <i style={{ background: signalColor(link.kind) }} aria-hidden="true" />
                      {flowNode(link.from).label} → {flowNode(link.to).label}
                      <span>{link.label}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="lp3-flow__more" aria-expanded={details === index} onClick={() => setDetails(current => (current === index ? null : index))}>
                  Chi tiết tín hiệu <ChevronDown size={15} aria-hidden="true" />
                </button>
                {details === index && <p className="lp3-flow__signal">{item.signal}</p>}
              </li>
            ))}
          </ol>

          <div className="lp3-flow__sticky">
            <div className="lp3-flow__stage" ref={stageRef}>
              <div className="lp3-flow__dots" role="group" aria-label="Chuyển bước">
                {flow.steps.map((item, index) => (
                  <button key={index} type="button" aria-current={index === stepIndex ? 'step' : undefined} aria-label={`Bước ${index + 1}: ${item.title}`} onClick={() => goToStep(index)} />
                ))}
              </div>
              {mode === '3d' ? (
                <ViewerBoundary fallback={null}>
                  <Suspense fallback={<p className="lp3-flow__loading">Đang tải mô hình 3D…</p>}>
                    <RobotFlowViewer step={step} visible={visible} reduced={reduced} />
                  </Suspense>
                </ViewerBoundary>
              ) : mode === 'none' ? <p className="lp3-flow__loading">Trình duyệt này không hiển thị được mô hình 3D; sơ đồ bên dưới vẫn cho thấy tín hiệu đi đâu.</p> : null}
              <p className="lp3-flow__now">
                <span>Đang chạy</span> {flow.label} · {step.title}
              </p>
            </div>
            <SignalDiagram step={step} />
          </div>
        </div>
      </div>
    </section>
  )
}
