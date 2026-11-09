import { Fragment, Suspense, lazy, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react'
import { FLOWS, SIGNAL_KINDS, flowNode, parseBody, signalColor, type FlowStep } from '../robot-explode/flows'
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
 * power), then step through it with the buttons (or the arrow keys). The 3D
 * robot shows the step under way: the parts that work light up, each signal
 * runs along its path, and the wheels, sensors or head move when the current
 * reaches them.
 */
export function RobotFlowSection({ asPage = false }: {
  /** On its own page the heading is the page's h1. */
  asPage?: boolean
}) {
  const [flowIndex, setFlowIndex] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [details, setDetails] = useState(false)
  const [mode, setMode] = useState<'waiting' | '3d' | 'none'>('waiting')
  const [visible, setVisible] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const flow = FLOWS[flowIndex]
  const step = flow.steps[Math.min(stepIndex, flow.steps.length - 1)]
  const nextFlow = FLOWS[(flowIndex + 1) % FLOWS.length]
  const previousFlow = FLOWS[(flowIndex + FLOWS.length - 1) % FLOWS.length]

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

  const show = (nextFlowIndex: number, nextStep: number) => {
    setFlowIndex(nextFlowIndex)
    setStepIndex(nextStep)
    setDetails(false)
  }
  const chooseFlow = (index: number) => show(index, 0)
  const goToStep = (index: number) => show(flowIndex, index)
  // Past the last step the next function starts; before the first, the previous one ends.
  const next = () => (stepIndex < flow.steps.length - 1 ? goToStep(stepIndex + 1) : show((flowIndex + 1) % FLOWS.length, 0))
  const previous = () => (stepIndex > 0 ? goToStep(stepIndex - 1) : show((flowIndex + FLOWS.length - 1) % FLOWS.length, previousFlow.steps.length - 1))
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[role="tablist"]')) return
    if (event.key === 'ArrowRight') { event.preventDefault(); next() }
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous() }
  }
  const last = stepIndex === flow.steps.length - 1

  return (
    <section className="lp3-flow lp3-section" id="ben-trong-robot" data-page={asPage ? 'true' : undefined}>
      <div className="lp3-container">
        <div className="lp3-section-head">
          <span className="lp3-kicker">{asPage ? 'Quy trình chi tiết' : 'Bên trong robot'}</span>
          {asPage ? <h1>Dữ liệu chạy từ máy tính<br />tới từng bánh xe.</h1> : <h2>Dữ liệu chạy từ máy tính<br />tới từng bánh xe.</h2>}
          <p>Chọn một chức năng rồi bấm qua từng bước: mỗi bước sáng lên đúng linh kiện đang làm việc, và tín hiệu chạy dọc đường dây như dòng điện.</p>
        </div>

        <div className="lp3-flow__tabs" role="tablist" aria-label="Chức năng của robot">
          {FLOWS.map((item, index) => (
            <button key={item.id} type="button" role="tab" aria-selected={index === flowIndex} onClick={() => chooseFlow(index)}>
              <strong>{item.label}</strong>
              <span>{item.summary}</span>
            </button>
          ))}
        </div>

        <div className="lp3-flow__grid" onKeyDown={onKey}>
          <div className="lp3-flow__panel">
            <ol className="lp3-flow__steps" aria-label={`Các bước: ${flow.label}`}>
              {flow.steps.map((item, index) => (
                <li key={`${flow.id}-${index}`} data-active={index === stepIndex} className="lp3-flow__step">
                  <button type="button" className="lp3-flow__step-head" aria-current={index === stepIndex ? 'step' : undefined} onClick={() => goToStep(index)}>
                    <span className="lp3-flow__num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <h3><span className="sr-only">Bước {index + 1}/{flow.steps.length}: </span>{item.title}</h3>
                  </button>
                  {index === stepIndex && (
                    <div className="lp3-flow__step-body">
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
                      <button type="button" className="lp3-flow__more" aria-expanded={details} onClick={() => setDetails(current => !current)}>
                        Chi tiết tín hiệu <ChevronDown size={15} aria-hidden="true" />
                      </button>
                      {details && <p className="lp3-flow__signal">{item.signal}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ol>

            <div className="lp3-flow__nav" role="group" aria-label="Chuyển bước">
              <button type="button" onClick={previous} aria-label={stepIndex > 0 ? 'Bước trước' : `Về ${previousFlow.label}`}>
                <ArrowLeft size={17} aria-hidden="true" />
                <span>{stepIndex > 0 ? 'Bước trước' : previousFlow.label}</span>
              </button>
              <span className="lp3-flow__count" aria-live="polite">Bước {stepIndex + 1}/{flow.steps.length}</span>
              <button type="button" className="lp3-flow__next" onClick={next} aria-label={last ? `Tiếp: ${nextFlow.label}` : 'Bước tiếp'}>
                <span>{last ? `Tiếp: ${nextFlow.label}` : 'Bước tiếp'}</span>
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="lp3-flow__view">
            <div className="lp3-flow__stage" ref={stageRef}>
              <div className="lp3-flow__dots" role="group" aria-label="Các bước">
                {flow.steps.map((item, index) => (
                  <button key={index} type="button" aria-current={index === stepIndex ? 'step' : undefined} aria-label={`Bước ${index + 1}: ${item.title}`} onClick={() => goToStep(index)} />
                ))}
              </div>
              {mode === '3d' ? (
                <ViewerBoundary fallback={<p className="lp3-flow__loading">Không tải được mô hình 3D.</p>}>
                  <Suspense fallback={<p className="lp3-flow__loading">Đang tải mô hình 3D…</p>}>
                    <RobotFlowViewer step={step} visible={visible} />
                  </Suspense>
                </ViewerBoundary>
              ) : mode === 'none' ? <p className="lp3-flow__loading">Trình duyệt này không hiển thị được mô hình 3D.</p> : null}
              <p className="lp3-flow__now">
                <span>Đang chạy</span> {flow.label} · {step.title}
              </p>
            </div>
            <p className="lp3-flow__legend">
              {SIGNAL_KINDS.map(item => <span key={item.kind}><i style={{ background: item.color }} />{item.label}</span>)}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
