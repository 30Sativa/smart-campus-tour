import { Component, Suspense, lazy, useEffect, useState, type ReactNode, type KeyboardEvent } from 'react'
import { useGLTF } from '@react-three/drei'
import { ArrowLeft, ArrowRight, Pause, Play, Rotate3D, ChevronDown } from 'lucide-react'
import { SiteNav } from '../../src/features/landing/sections/SiteNav'
import { SiteFooter } from '../../src/features/landing/sections/SiteFooter'
import { useThemeStore } from '../../src/stores/theme-store'
import { FLOWS, SIGNAL_KINDS, flowNode, parseBody } from '../../src/features/landing/robot-explode/flows'
import '../../src/features/landing/landing.css'
import '../../src/features/landing/home-3d.css'
import './preview.css'

const Viewer = lazy(() => import('../../src/features/landing/robot-explode/RobotFlowViewer'))
function ReadyViewer({ step, visible, onReady }: { step: typeof FLOWS[number]['steps'][number]; visible: boolean; onReady: (ready: boolean) => void }) {
  useGLTF(`${import.meta.env.BASE_URL}models/robot/campus-amr-explode.glb`, false, true)
  useEffect(() => { onReady(true) }, [onReady])
  return <Viewer step={step} visible={visible} />
}
class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <div className="ri-fallback"><img src="./robot-still.png" alt="Mô hình robot CampusTour nhìn xuyên vỏ" /><p>Không mở được mô hình 3D. Bạn vẫn có thể xem từng bước bên cạnh.</p><button onClick={() => window.location.reload()}>Thử tải lại</button></div> : this.props.children
  }
}

function initialSelection() {
  const params = new URLSearchParams(window.location.search)
  const flow = Math.max(0, FLOWS.findIndex(item => item.id === params.get('flow')))
  const raw = Number(params.get('step'))
  return [flow, Number.isInteger(raw) && raw > 0 ? Math.min(raw - 1, FLOWS[flow].steps.length - 1) : 0]
}

export default function Preview() {
  const [initial] = useState(initialSelection)
  const [flowIndex, setFlowIndex] = useState(initial[0])
  const [stepIndex, setStepIndex] = useState(initial[1])
  const [details, setDetails] = useState(false)
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [settledStep, setSettledStep] = useState('')
  const [modelReady, setModelReady] = useState(false)
  const [viewportVersion, setViewportVersion] = useState(0)
  const theme = useThemeStore(state => state.theme)
  const flow = FLOWS[flowIndex]
  const step = flow.steps[stepIndex]
  const renderKey = `${flow.id}:${stepIndex}:${theme}:${viewportVersion}`

  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark') }, [theme])
  useEffect(() => {
    const resize = () => setViewportVersion(value => value + 1)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    const params = new URLSearchParams({ flow: flow.id, step: String(stepIndex + 1) })
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
    const timer = window.setTimeout(() => { if (modelReady) setSettledStep(renderKey) }, 1400)
    return () => window.clearTimeout(timer)
  }, [flow.id, stepIndex, modelReady, renderKey])

  function show(nextFlow: number, nextStep: number) {
    setSettledStep('')
    setFlowIndex(nextFlow)
    setStepIndex(nextStep)
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

  return <div className="lp lp3 lp3-page ri-preview" id="top">
    <SiteNav base="/" current="robot" onLockScroll={() => {}} />
    <main className="ri-main" id="ben-trong-robot">
      <header className="ri-intro">
        <div><h1>Bên trong robot</h1><p>Chọn chức năng, theo dõi tín hiệu trên mô hình 3D.</p></div>
        <a className="ri-back" href="/#cong-nghe"><ArrowLeft size={16} aria-hidden="true" /> Công nghệ robot</a>
      </header>
      <div className="ri-tabs" role="tablist" aria-label="Chức năng của robot">
        {FLOWS.map((item, index) => <button key={item.id} id={`function-${item.id}`} role="tab" type="button" tabIndex={flowIndex === index ? 0 : -1} aria-selected={flowIndex === index} aria-controls="flow-panel" onKeyDown={event => tabKey(event, index)} onClick={() => show(index, 0)}>{item.label}</button>)}
      </div>
      <section className="ri-workbench" id="flow-panel" role="tabpanel" aria-labelledby={`function-${flow.id}`}>
        <figure className="ri-model">
          <div className="ri-stage">
            <div className="ri-stage-bar"><span><Rotate3D size={20} aria-hidden="true" /> Kéo để xoay mô hình</span><button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}{paused ? 'Phát mô phỏng' : 'Tạm dừng'}</button></div>
            <ViewerBoundary><Suspense fallback={<div className="ri-loading" role="status">Đang tải mô hình robot…</div>}><ReadyViewer step={step} visible={!paused || !modelReady || settledStep !== renderKey} onReady={setModelReady} /></Suspense></ViewerBoundary>
          </div>
          <figcaption className="ri-legend" aria-label="Chú giải tín hiệu">{SIGNAL_KINDS.map(item => <span key={item.kind}><i className={`signal-${item.kind}`} aria-hidden="true" />{item.label}</span>)}</figcaption>
        </figure>
        <aside className="ri-guide" aria-label="Hướng dẫn quy trình">
          <header className="ri-function"><h2>{flow.label}</h2><p>{flow.summary}</p></header>
          <div className="ri-progress">
            <span id="step-label">Chọn bước</span>
            <div className="ri-step-buttons" role="group" aria-labelledby="step-label">{flow.steps.map((item, index) => <button type="button" key={item.title} title={item.title} aria-label={`Bước ${index + 1}: ${item.title}`} aria-current={index === stepIndex ? 'step' : undefined} onClick={() => show(flowIndex, index)}>{index + 1}</button>)}</div>
          </div>
          <div className="ri-explanation" aria-live="polite" aria-atomic="true">
            <p className="ri-step-count">Bước {stepIndex + 1} / {flow.steps.length}</p>
            <h3>{step.title}</h3>
            <p className="ri-body">{parseBody(step.body).map((part, index) => part.kind ? <strong key={index}>{part.text}</strong> : part.text)}</p>
            <ul className="ri-connections" aria-label="Đường truyền tín hiệu">{step.links.map((link, index) => <li key={index}><i className={`signal-${link.kind}`} aria-hidden="true" /><div><span>{flowNode(link.from).label}<ArrowRight size={16} aria-label="đến" />{flowNode(link.to).label}</span><small>{link.label}</small></div></li>)}</ul>
            <button className="ri-disclosure" type="button" aria-expanded={details} aria-controls="signal-detail" onClick={() => setDetails(!details)}>Chi tiết tín hiệu<ChevronDown size={16} aria-hidden="true" data-open={details} /></button>
            {details && <p id="signal-detail" className="ri-detail">{step.signal}</p>}
          </div>
          <nav className="ri-step-nav" aria-label="Chuyển bước"><button type="button" onClick={() => move(-1)}><ArrowLeft size={16} aria-hidden="true" />Bước trước</button><button type="button" className="ri-primary" onClick={() => move(1)}>{stepIndex === flow.steps.length - 1 ? 'Chức năng tiếp' : 'Bước tiếp'}<ArrowRight size={16} aria-hidden="true" /></button></nav>
        </aside>
      </section>
    </main>
    <SiteFooter base="/" />
  </div>
}

