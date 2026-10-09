import { useId, useRef, type KeyboardEvent } from 'react'
import { Captions, Check, Compass, Flag, ListOrdered, MessageSquare } from 'lucide-react'
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
export function StudentLiveView({ session, snapshot }: StudentLiveViewProps) {
  const tab = useStudentStore((s) => s.activeTab)
  const setTab = useStudentStore((s) => s.setActiveTab)
  const baseId = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const statusDisplay = getStudentStatusDisplay(snapshot.step, snapshot.currentPoi?.title, snapshot.tourState)
  const pois = [...snapshot.pois].sort((a, b) => a.order - b.order)
  const nextMinutes = snapshot.nextPoi ? poiMinutes(snapshot.nextPoi) : undefined

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
    <div className="st-ctn st-live-view st-e">
      <div className={`st-status st-tone-${statusDisplay.tone}`}>
        <div className="st-status__main">
          <span className="st-status__dot" aria-hidden="true" />
          <div>
            <h3>{statusDisplay.label}</h3>
            {statusDisplay.description && <p>{statusDisplay.description}</p>}
          </div>
        </div>
        <div className="st-status__tags">
          <span>Học sinh: {session.studentName}</span>
          {session.studentClass && <span>Lớp {session.studentClass}</span>}
        </div>
      </div>

      <div className="st-e-grid">
        <div className="st-e-main">
          <StudentVideoPlayer streamUrl={snapshot.videoStreamUrl} statusLabel={statusDisplay.label} />
          <StopStrip pois={pois} snapshot={snapshot} />
        </div>

        <section className="st-e-panel" aria-label="Thông tin buổi tham quan">
          <div className="st-e-tabs" role="tablist" aria-label="Nội dung buổi tham quan" onKeyDown={onTabKey}>
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

function StopStrip({ pois, snapshot }: { pois: PoiDetail[]; snapshot: StudentTourSnapshot }) {
  return (
    <ol className="st-e-strip" aria-label="Các điểm dừng">
      {pois.map((poi) => {
        const state = poiProgress(poi, snapshot)
        const minutes = poiMinutes(poi)
        return (
          <li key={poi.id} className={`st-e-stop is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            {poi.imageUrl
              ? <img src={poi.imageUrl} alt="" loading="lazy" />
              : <span className="st-e-stop__num" aria-hidden="true">{poi.order}</span>}
            <em>
              {state === 'done' && <Check size={11} aria-hidden="true" />}
              {POI_PROGRESS_LABEL[state]}
              {state === 'later' && minutes ? ` · ${minutes}′` : ''}
            </em>
            <b>{poi.order}. {poi.title}</b>
          </li>
        )
      })}
      <li className="st-e-stop st-e-stop--fin">
        <Flag size={18} aria-hidden="true" />
        <b>Về đích</b>
      </li>
    </ol>
  )
}
