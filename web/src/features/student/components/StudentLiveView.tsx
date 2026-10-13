import { useId, useRef, type KeyboardEvent } from 'react'
import { Bot, Captions, Check, Compass, Flag, ListOrdered, MessageSquare } from 'lucide-react'
import type { PoiDetail, StudentSession, StudentTourSnapshot } from '../student-types'
import { getStudentStatusDisplay } from '../student-status'
import { POI_PROGRESS_LABEL, poiMinutes, poiProgress } from '../student-route'
import { StudentVideoPlayer } from './StudentVideoPlayer'
import { Student2DMap } from './Student2DMap'
import { StudentNarrationBar } from './StudentNarrationBar'
import { StudentAiAssistant } from './StudentAiAssistant'
import { useStudentStore, type StudentLiveTab } from '../student-store'
import '../student.css'
import '../student-live.css'

interface StudentLiveViewProps {
  session: StudentSession
  snapshot: StudentTourSnapshot
}

const TABS: { key: StudentLiveTab; label: string; Icon: typeof Compass }[] = [
  { key: 'stream', label: 'Thuyết minh', Icon: Captions },
  { key: 'map', label: 'Bản đồ 2D', Icon: Compass },
  { key: 'ai', label: 'Hỏi AI', Icon: MessageSquare },
  { key: 'route', label: 'Lộ trình', Icon: ListOrdered },
]

/**
 * Live tour, layout "Ứng dụng tab": the robot's camera with a strip of stops
 * underneath, and one panel with four tabs beside it. On phones the panel
 * drops under the video and its tab bar sits at the bottom like an app.
 * Every tab stays mounted so the AI conversation survives a tab switch.
 */
export function StudentLiveView({ snapshot }: StudentLiveViewProps) {
  const tab = useStudentStore((s) => s.activeTab)
  const setTab = useStudentStore((s) => s.setActiveTab)
  const baseId = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const statusDisplay = getStudentStatusDisplay(snapshot.step, snapshot.currentPoi?.title, snapshot.tourState)
  const pois = [...snapshot.pois].sort((a, b) => a.order - b.order)
  const nextMinutes = snapshot.nextPoi ? poiMinutes(snapshot.nextPoi) : undefined
  const at = snapshot.currentPoi ?? snapshot.nextPoi
  const stopLabel = snapshot.step === 'returning' ? 'Về đích' : at ? `Điểm ${at.order} / ${pois.length}` : 'Robot tham quan'

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const index = (TABS.findIndex((t) => t.key === tab) + step + TABS.length) % TABS.length
    setTab(TABS[index].key)
    tabRefs.current[index]?.focus()
  }

  const panel = (key: StudentLiveTab) => ({
    role: 'tabpanel' as const,
    id: `${baseId}-panel-${key}`,
    'aria-labelledby': `${baseId}-tab-${key}`,
    hidden: tab !== key,
    className: `st-e-body st-e-body--${key}`,
  })

  return (
    <div className="st-ctn st-live-view st-e st-x-live">
      <div className="st-e-grid">
        <div className="st-e-main">
          <div className={`st-x-stage st-tone-${statusDisplay.tone}${snapshot.step === 'navigating' || snapshot.step === 'returning' ? ' is-moving' : ''}`}>
            <StudentVideoPlayer streamUrl={snapshot.videoStreamUrl} statusLabel={stopLabel} />
            {/* What is happening, over the picture (the player keeps its own controls below it). */}
            <div className="st-x-caption" aria-live="polite">
              <small><i aria-hidden="true" />{statusDisplay.label}</small>
              <h2>{snapshot.step === 'returning' ? 'Về điểm kết thúc' : snapshot.currentPoi?.title ?? snapshot.nextPoi?.title ?? snapshot.tourName}</h2>
              {statusDisplay.description && <p>{statusDisplay.description}</p>}
            </div>
          </div>
          <JourneyRail pois={pois} snapshot={snapshot} />
        </div>

        <section className="st-e-panel" aria-label="Thông tin buổi tham quan">
          <div className="st-e-tabs" role="tablist" aria-label="Nội dung buổi tham quan" onKeyDown={onTabKey}
            style={{ ['--tab' as string]: Math.max(0, TABS.findIndex((t) => t.key === tab)) }}>
            <span className="st-e-tabs__ind" aria-hidden="true" />
            {TABS.map(({ key, label, Icon }, index) => (
              <button
                key={key}
                ref={(el) => { tabRefs.current[index] = el }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${key}`}
                aria-controls={`${baseId}-panel-${key}`}
                aria-selected={tab === key}
                tabIndex={tab === key ? 0 : -1}
                onClick={() => setTab(key)}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div {...panel('stream')}>
            <StudentNarrationBar
              title={snapshot.narration?.title || snapshot.currentPoi?.title}
              text={snapshot.narration?.text || snapshot.currentPoi?.description}
              isPlaying={snapshot.narration?.isPlaying}
            />
            {snapshot.nextPoi && (
              <div className="st-e-next">
                <StopThumb poi={snapshot.nextPoi} />
                <span>
                  Tiếp theo: <b>{snapshot.nextPoi.title}</b>
                  {nextMinutes && <small>khoảng {nextMinutes} phút</small>}
                </span>
              </div>
            )}
          </div>

          <div {...panel('map')}>
            <Student2DMap
              pois={snapshot.pois}
              currentPoi={snapshot.currentPoi}
              nextPoi={snapshot.nextPoi}
              robotPose={snapshot.robotPose}
            />
          </div>

          <div {...panel('ai')}>
            <StudentAiAssistant poiContext={snapshot.currentPoi?.title} />
          </div>

          <div {...panel('route')}>
            <ol className="st-e-route">
              {pois.map((poi) => {
                const state = poiProgress(poi, snapshot)
                const minutes = poiMinutes(poi)
                return (
                  <li key={poi.id} className={`is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
                    <span className="st-e-route__n" aria-hidden="true">{state === 'done' ? <Check size={13} /> : poi.order}</span>
                    <span>
                      <b>{poi.title}</b>
                      <small>
                        {state === 'now' ? 'Bạn đang ở đây' : POI_PROGRESS_LABEL[state]}
                        {state === 'later' && minutes ? ` · khoảng ${minutes} phút` : ''}
                      </small>
                    </span>
                  </li>
                )
              })}
              <li className={snapshot.step === 'returning' ? 'is-now' : 'is-later'}>
                <span className="st-e-route__n" aria-hidden="true"><Flag size={13} /></span>
                <span>
                  <b>Về điểm kết thúc</b>
                  <small>{snapshot.step === 'returning' ? 'Robot đang quay về' : 'Cảm ơn và chia tay'}</small>
                </span>
              </li>
            </ol>
          </div>
        </section>
      </div>
    </div>
  )
}

function StopThumb({ poi }: { poi: PoiDetail }) {
  return poi.imageUrl
    ? <img className="st-e-thumb" src={poi.imageUrl} alt="" loading="lazy" />
    : <span className="st-e-thumb st-e-thumb--n" aria-hidden="true">{poi.order}</span>
}

/**
 * The route as one bar: a pin per stop plus the finish, a lime fill and a
 * robot dot that glide forward as stops are seen, and the stop names under it.
 */
function JourneyRail({ pois, snapshot }: { pois: PoiDetail[]; snapshot: StudentTourSnapshot }) {
  const legs = pois.length + 1
  const states = pois.map((poi) => poiProgress(poi, snapshot))
  const done = states.filter((state) => state === 'done').length
  const share = snapshot.step === 'returning' ? (legs - 0.5) / legs : (done + (states.includes('now') ? 0.5 : 0)) / legs
  const percent = Math.round(Math.min(1, share) * 100)
  const minutes = pois.filter((_, index) => states[index] !== 'done').reduce((sum, poi) => sum + (poiMinutes(poi) ?? 0), 0)
  return (
    <section className="st-x-rail" aria-label="Hành trình">
      <p className="st-x-rail__head"><span>Hành trình</span><span>{percent}%{minutes ? ` · còn khoảng ${minutes} phút dừng` : ''}</span></p>
      <div className="st-x-rail__track" role="progressbar" aria-label="Tiến độ hành trình" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span className="st-x-rail__fill" style={{ width: `${percent}%` }} />
        {pois.map((poi, index) => (
          <span key={poi.id} className={`st-x-rail__pin is-${states[index]}`} style={{ left: `${((index + 1) / legs) * 100}%` }} />
        ))}
        <span className="st-x-rail__bot" style={{ left: `${percent}%` }} aria-hidden="true"><Bot size={11} /></span>
      </div>
      <ol className="st-x-rail__stops" style={{ gridTemplateColumns: `repeat(${legs}, minmax(0, 1fr))` }}>
        {pois.map((poi, index) => (
          <li key={poi.id} className={`is-${states[index]}`} aria-current={states[index] === 'now' ? 'step' : undefined}>
            <b>{String(poi.order).padStart(2, '0')}</b>
            <span>{poi.title.split(' & ')[0]}</span>
          </li>
        ))}
        <li className={snapshot.step === 'returning' ? 'is-now' : 'is-later'}><b><Flag size={12} aria-hidden="true" /> Đích</b><span>Về điểm cuối</span></li>
      </ol>
    </section>
  )
}
