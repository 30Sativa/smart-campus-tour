import { useState } from 'react'
import { Compass, MessageSquare, Video } from 'lucide-react'
import type { StudentSession, StudentTourSnapshot } from '../student-types'
import { getStudentStatusDisplay } from '../student-status'
import { StudentVideoPlayer } from './StudentVideoPlayer'
import { Student2DMap } from './Student2DMap'
import { StudentNarrationBar } from './StudentNarrationBar'
import { StudentAiAssistant } from './StudentAiAssistant'
import { useStudentStore } from '../student-store'

interface StudentLiveViewProps {
  session: StudentSession
  snapshot: StudentTourSnapshot
}

export function StudentLiveView({ session, snapshot }: StudentLiveViewProps) {
  const [rightPanelTab, setRightPanelTab] = useState<'map' | 'ai'>('map')
  const mobileTab = useStudentStore((s) => s.activeTab)
  const setMobileTab = useStudentStore((s) => s.setActiveTab)

  const statusDisplay = getStudentStatusDisplay(
    snapshot.step,
    snapshot.currentPoi?.title,
    snapshot.tourState
  )

  const narration = (
    <StudentNarrationBar
      title={snapshot.narration?.title || snapshot.currentPoi?.title}
      text={snapshot.narration?.text || snapshot.currentPoi?.description}
      isPlaying={snapshot.narration?.isPlaying}
    />
  )

  const map = (
    <Student2DMap
      pois={snapshot.pois}
      currentPoi={snapshot.currentPoi}
      nextPoi={snapshot.nextPoi}
      robotPose={snapshot.robotPose}
    />
  )

  return (
    <div className="st-ctn st-live-view">
      {/* Status band: the dot takes the tone of the current step */}
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

      {/* Desktop: video + narration on the left, map / AI on the right */}
      <div className="st-live-grid st-only-desktop">
        <div className="st-col">
          <StudentVideoPlayer streamUrl={snapshot.videoStreamUrl} statusLabel={statusDisplay.label} />
          {narration}
        </div>

        <div className="st-col">
          <div className="st-tabs">
            <button type="button" aria-pressed={rightPanelTab === 'map'} onClick={() => setRightPanelTab('map')}>
              <Compass size={15} />
              <span>Bản đồ 2D</span>
            </button>
            <button type="button" aria-pressed={rightPanelTab === 'ai'} onClick={() => setRightPanelTab('ai')}>
              <MessageSquare size={15} />
              <span>Hỏi Trợ lý AI</span>
            </button>
          </div>
          <div className="st-panel">
            {rightPanelTab === 'map' ? map : <StudentAiAssistant poiContext={snapshot.currentPoi?.title} />}
          </div>
        </div>
      </div>

      {/* Mobile: video on top, one tab below */}
      <div className="st-only-mobile">
        <StudentVideoPlayer streamUrl={snapshot.videoStreamUrl} statusLabel={statusDisplay.label} />

        <div className="st-tabs">
          <button type="button" aria-pressed={mobileTab === 'stream'} onClick={() => setMobileTab('stream')}>
            <Video size={14} />
            <span>Thuyết minh</span>
          </button>
          <button type="button" aria-pressed={mobileTab === 'map'} onClick={() => setMobileTab('map')}>
            <Compass size={14} />
            <span>Bản đồ 2D</span>
          </button>
          <button type="button" aria-pressed={mobileTab === 'ai'} onClick={() => setMobileTab('ai')}>
            <MessageSquare size={14} />
            <span>Hỏi AI</span>
          </button>
        </div>

        <div>
          {mobileTab === 'stream' && narration}
          {mobileTab === 'map' && <div style={{ height: 380 }}>{map}</div>}
          {mobileTab === 'ai' && (
            <div style={{ height: 460 }}>
              <StudentAiAssistant poiContext={snapshot.currentPoi?.title} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
