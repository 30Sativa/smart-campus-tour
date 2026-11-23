import { Suspense, lazy, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, Pause, Play, Rotate3D, ChevronDown } from 'lucide-react'
import { FLOWS, SIGNAL_KINDS, flowNode, parseBody } from '../robot-explode/flows'

import { ViewerBoundary } from '../robot-explode/ViewerBoundary'
import { useThemeStore } from '../../../stores/theme-store'

const Viewer = lazy(() => import('../robot-explode/RobotFlowViewer'))

function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * Section 02 of "/ben-trong-robot": the robot's five functions step by step on
 * the 3D model (approved model-first layout, `web/design-previews/robot-inside/`).
 * `?flow=<id>&step=<n>` keeps the chosen step in the address.
 */
export function RobotFlowWorkbench({ kicker = '02 / Cách hoạt động' }: {
  /** The small line above the heading. */
  kicker?: string
}) {
  const theme = useThemeStore(state => state.theme)
  const [params, setParams] = useSearchParams()
  const flowIndex = Math.max(0, FLOWS.findIndex(item => item.id === params.get('flow')))
  const flow = FLOWS[flowIndex]
  const requestedStep = Number(params.get('step'))
  const stepIndex = Number.isInteger(requestedStep) && requestedStep > 0 ? Math.min(requestedStep - 1, flow.steps.length - 1) : 0
  const step = flow.steps[stepIndex]
  const [details, setDetails] = useState(false)
  const [paused, setPaused] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [mode, setMode] = useState<'waiting' | '3d' | 'none'>('waiting')
  const [visible, setVisible] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = stageRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      const near = Boolean(entry?.isIntersecting)
      setVisible(near)
      if (near) setMode(current => current === 'waiting' ? canUseWebGL() ? '3d' : 'none' : current)
    }, { rootMargin: '240px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  function show(nextFlow: number, nextStep: number) {
    setParams(current => {
      const next = new URLSearchParams(current)
      next.set('flow', FLOWS[nextFlow].id)
      next.set('step', String(nextStep + 1))
      return next
    })
    setDetails(false)
  }
  function move(direction: number) {
    const nextStep = stepIndex + direction
    if (nextStep >= 0 && nextStep < flow.steps.length) show(flowIndex, nextStep)
    else {
      const nextFlow = (flowIndex + direction + FLOWS.length) % FLOWS.length
      show(nextFlow, direction > 0 ? 0 : FLOWS[nextFlow].steps.length - 1)
    }
  }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number
    if (event.key === 'ArrowRight') target = (index + 1) % FLOWS.length
    else if (event.key === 'ArrowLeft') target = (index - 1 + FLOWS.length) % FLOWS.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = FLOWS.length - 1
    else return
    event.preventDefault()
    show(target, 0)
    document.getElementById(`function-${FLOWS[target].id}`)?.focus()
  }

  return <section className="ri-main" id="cach-hoat-dong" data-theme={`robot-inside-${theme}`} aria-labelledby="cach-hoat-dong-title">
      <header className="ri-intro lp3-section-head">
        <span className="lp3-kicker">{kicker}</span>
        <h2 id="cach-hoat-dong-title">Chọn chức năng,<br />theo dõi tín hiệu.</h2>
        <p>Năm chức năng của robot, mỗi chức năng đi qua vài bước. Tín hiệu chạy trên mô hình 3D: kéo để xoay, bấm số để chuyển bước.</p>
      </header>
      <div className="ri-tabs" role="tablist" aria-label="Chức năng của robot">
        {FLOWS.map((item, index) => <button key={item.id} id={`function-${item.id}`} role="tab" type="button" tabIndex={flowIndex === index ? 0 : -1} aria-selected={flowIndex === index} aria-controls="flow-panel" onKeyDown={event => tabKey(event, index)} onClick={() => show(index, 0)}>{item.label}</button>)}
      </div>
      <section className="ri-workbench" id="flow-panel" role="tabpanel" aria-labelledby={`function-${flow.id}`} onKeyDown={event => { if (event.key === 'ArrowRight') { event.preventDefault(); move(1) } else if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) } }}>
        <figure className="ri-model">
          <div className="ri-stage" ref={stageRef}>
            <div className="ri-stage-bar"><span><Rotate3D size={20} aria-hidden="true" /> Kéo để xoay mô hình</span><button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}{paused ? 'Phát mô phỏng' : 'Tạm dừng'}</button></div>
            {mode === '3d' ? <ViewerBoundary fallback={<div className="ri-fallback"><img src="/images/robot-inside-still.png" alt="Mô hình robot CampusTour nhìn xuyên vỏ" /><p>Không mở được mô hình 3D. Bạn vẫn có thể xem từng bước bên cạnh.</p><button type="button" onClick={() => window.location.reload()}>Thử tải lại</button></div>}>
              <Suspense fallback={<div className="ri-loading" role="status">Đang tải mô hình robot…</div>}><Viewer step={step} visible={visible} paused={paused} /></Suspense>
            </ViewerBoundary> : mode === 'none' ? <div className="ri-fallback"><img src="/images/robot-inside-still.png" alt="Mô hình robot CampusTour nhìn xuyên vỏ" /><p>Trình duyệt này không hiển thị được mô hình 3D. Bạn vẫn có thể xem từng bước bên cạnh.</p></div> : <p className="ri-loading" role="status">Đang tải mô hình robot…</p>}
          </div>
          <figcaption className="ri-legend" aria-label="Chú giải tín hiệu">{SIGNAL_KINDS.map(item => <span key={item.kind}><i className={`ri-signal-${item.kind}`} aria-hidden="true" />{item.label}</span>)}</figcaption>
        </figure>
        <aside className="ri-guide" aria-label="Hướng dẫn quy trình">
          <header className="ri-function"><h3>{flow.label}</h3><p>{flow.summary}</p></header>
          <div className="ri-progress">
            <span id="step-label">Chọn bước</span>
            <div className="ri-step-buttons" role="group" aria-labelledby="step-label">{flow.steps.map((item, index) => <button type="button" key={item.title} title={item.title} aria-label={`Bước ${index + 1}: ${item.title}`} aria-current={index === stepIndex ? 'step' : undefined} onClick={() => show(flowIndex, index)}>{index + 1}</button>)}</div>
          </div>
          <div className="ri-explanation" aria-live="polite" aria-atomic="true">
            <p className="ri-step-count">Bước {stepIndex + 1} / {flow.steps.length}</p>
            <h4>{step.title}</h4>
            <p className="ri-body">{parseBody(step.body).map((part, index) => part.kind ? <strong key={index}>{part.text}</strong> : part.text)}</p>
            <ul className="ri-connections" aria-label="Đường truyền tín hiệu">{step.links.map((link, index) => <li key={index}><i className={`ri-signal-${link.kind}`} aria-hidden="true" /><div><span>{flowNode(link.from).label}<ArrowRight size={16} aria-label="đến" />{flowNode(link.to).label}</span><small>{link.label}</small></div></li>)}</ul>
            <button className="ri-disclosure" type="button" aria-expanded={details} aria-controls="signal-detail" onClick={() => setDetails(!details)}>Chi tiết tín hiệu<ChevronDown size={16} aria-hidden="true" data-open={details} /></button>
            {details && <p id="signal-detail" className="ri-detail">{step.signal}</p>}
          </div>
          <nav className="ri-step-nav" aria-label="Chuyển bước"><button type="button" onClick={() => move(-1)}><ArrowLeft size={16} aria-hidden="true" />Bước trước</button><button type="button" className="ri-primary" onClick={() => move(1)}>{stepIndex === flow.steps.length - 1 ? 'Chức năng tiếp' : 'Bước tiếp'}<ArrowRight size={16} aria-hidden="true" /></button></nav>
        </aside>
      </section>
  </section>
}

