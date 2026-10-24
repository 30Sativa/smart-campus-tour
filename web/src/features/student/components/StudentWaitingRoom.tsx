import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Mic,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { StudentSession, StudentTourSnapshot } from '../student-types'

interface StudentWaitingRoomProps {
  /** Demo session; the invited page has no student identity and passes the texts below instead. */
  session?: StudentSession
  snapshot: StudentTourSnapshot
  heading?: string
  intro?: string
  meta?: string
  /** The microphone check only matters where voice questions exist (the demo). */
  showMicCheck?: boolean
  /** Extra content under the welcome card, e.g. a fallback video link. */
  children?: ReactNode
}

export function StudentWaitingRoom({ session, snapshot, heading, intro, meta, showMicCheck = true, children }: StudentWaitingRoomProps) {
  const [isPlayingTestAudio, setIsPlayingTestAudio] = useState(false)
  const [audioTested, setAudioTested] = useState(false)
  const [micStatus, setMicStatus] = useState<'idle' | 'testing' | 'granted' | 'denied'>('idle')

  // Thử nghiệm âm thanh (kích hoạt tương tác người dùng để vượt qua rào cản chặn autoplay)
  const handleTestAudio = () => {
    setIsPlayingTestAudio(true)
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime) // D5 note
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 1.2)
      setTimeout(() => {
        setIsPlayingTestAudio(false)
        setAudioTested(true)
      }, 1200)
    } catch {
      setIsPlayingTestAudio(false)
      setAudioTested(true)
    }
  }

  // Thử nghiệm quyền micro
  const handleTestMic = async () => {
    setMicStatus('testing')
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        setMicStatus('granted')
      } else {
        setMicStatus('granted') // Fallback if browser doesn't expose mediaDevices in test
      }
    } catch {
      setMicStatus('denied')
    }
  }

  const isRosterUpdating = snapshot.step === 'roster_updating'

  const stops = [...snapshot.pois].sort((a, b) => a.order - b.order)

  return (
    <div className="st-ctn st-x-wait">
      {/* Banner nếu Admin/Đại diện đang cập nhật danh sách (UC-06) */}
      {isRosterUpdating && (
        <div className="st-alert st-alert--warn">
          <AlertTriangle size={18} />
          <div>
            <b>Danh sách đang được cập nhật; giữ phòng chờ</b>
            <span>
              Đại diện trường đang điều chỉnh danh sách đoàn. Trình duyệt của bạn sẽ tiếp tục giữ phòng chờ và tự động cập nhật khi ban quản trị hoàn tất duyệt lại.
            </span>
          </div>
        </div>
      )}

      <div className="st-x-wait__grid">
        <section className="st-x-card st-x-count">
          <Countdown scheduledAt={snapshot.scheduledAt} />
          <svg className="st-x-bot" width="56" height="56" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="12" y="22" width="40" height="28" rx="10" fill="currentColor" />
            <rect x="18" y="29" width="28" height="12" rx="6" fill="#13261d" />
            <circle cx="26" cy="35" r="2.6" fill="#d6f18d" /><circle cx="38" cy="35" r="2.6" fill="#d6f18d" />
            <path d="M32 22v-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <circle cx="32" cy="11" r="4" fill="#f4b860" />
          </svg>
          <span className="st-pill-status"><i />Đang chờ bắt đầu</span>
          <h3>{heading ?? `Xin chào, ${session?.studentName ?? 'bạn'}!`}</h3>
          <p>
            {intro ?? `Bạn đã được xác nhận vào phòng chờ của đoàn ${session?.groupCode ?? ''}. Khi người điều hành nhấn bắt đầu, màn hình sẽ tự chuyển sang hình trực tiếp từ robot.`}
          </p>
          <p className="st-x-meta"><Clock size={14} /><span>{meta ?? `${snapshot.schoolName} • Giờ dự kiến ${snapshot.scheduledAt}`}</span></p>
          {children}
        </section>

        <div className="st-x-wait__side">
          <div className="st-x-checks">
            <div className={audioTested ? 'st-x-check is-ok' : 'st-x-check'}>
              <span className="st-x-check__ic">{audioTested ? <CheckCircle2 size={20} /> : <Volume2 size={20} />}</span>
              <span className="st-x-check__tx">
                <b>Kiểm tra Loa / Âm thanh</b>
                <span>Để nghe rõ thuyết minh tại các điểm dừng</span>
              </span>
              <span className={isPlayingTestAudio ? 'st-x-wave' : 'st-x-wave is-idle'} aria-hidden="true"><i /><i /><i /><i /><i /></span>
              <button type="button" onClick={handleTestAudio} disabled={isPlayingTestAudio} className="st-chip-btn">
                {isPlayingTestAudio ? 'Đang phát...' : audioTested ? (
                  <><CheckCircle2 size={14} className="st-ok" /><span>Âm thanh sẵn sàng</span></>
                ) : (
                  <><VolumeX size={14} /><span>Bấm để nghe thử âm thanh</span></>
                )}
              </button>
            </div>

            {showMicCheck && <div className={micStatus === 'granted' ? 'st-x-check is-ok' : 'st-x-check'}>
              <span className="st-x-check__ic">{micStatus === 'granted' ? <CheckCircle2 size={20} /> : <Mic size={20} />}</span>
              <span className="st-x-check__tx">
                <b>Kiểm tra Micro (Tùy chọn)</b>
                <span>{micStatus === 'denied' ? 'Chưa cấp quyền mic, vẫn có thể gõ chữ' : 'Dùng nếu bạn muốn hỏi Trợ lý AI bằng giọng nói'}</span>
              </span>
              <button type="button" onClick={handleTestMic} disabled={micStatus === 'testing'} className="st-chip-btn">
                {micStatus === 'testing' ? 'Đang kiểm tra...' : micStatus === 'granted' ? 'Micro sẵn sàng' : 'Kiểm tra'}
              </button>
            </div>}
          </div>

          {stops.length > 0 && <h4 className="st-x-sec">Xem trước {String(stops.length).padStart(2, '0')} điểm dừng</h4>}
          {stops.length > 0 && <ol className="st-x-preview">
            {stops.map((poi) => (
              <li key={poi.id}>
                {poi.imageUrl ? <img src={poi.imageUrl} alt="" loading="lazy" /> : <span className="st-x-preview__n" aria-hidden="true">{poi.order}</span>}
                <span className="st-x-preview__cap"><b>{String(poi.order).padStart(2, '0')}</b>{poi.title}</span>
              </li>
            ))}
          </ol>}
        </div>
      </div>

      <p className="st-foot-note">
        <Bot size={16} />
        <span>
          Hãy giữ mở trang này. Khi buổi tham quan bắt đầu, hệ thống sẽ tự động đưa bạn vào chuyến tham quan trực tiếp.
        </span>
      </p>
    </div>
  )
}

/** "14:30" (today) or an ISO time; anything else just shows the scheduled time. */
function scheduledTime(value: string): number | null {
  const hm = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (hm) {
    const at = new Date()
    at.setHours(Number(hm[1]), Number(hm[2]), 0, 0)
    return at.getTime()
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

const RING_WINDOW_MS = 60 * 60 * 1000

/** Count-down ring to the scheduled start; the ring empties over the last hour. */
function Countdown({ scheduledAt }: { scheduledAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const target = scheduledTime(scheduledAt)
  const left = target == null ? null : Math.max(0, target - now)
  const pad = (n: number) => String(n).padStart(2, '0')
  const label = left == null ? scheduledAt
    : left === 0 ? 'Sắp bắt đầu'
    : left >= 3_600_000 ? `${Math.floor(left / 3_600_000)}:${pad(Math.floor((left % 3_600_000) / 60_000))}:${pad(Math.floor((left % 60_000) / 1000))}`
    : `${pad(Math.floor(left / 60_000))}:${pad(Math.floor((left % 60_000) / 1000))}`
  const fill = left == null ? 1 : 1 - Math.min(1, left / RING_WINDOW_MS)
  return (
    <div className="st-x-ring" role="timer" aria-label={left == null ? `Giờ dự kiến ${scheduledAt}` : `Còn ${label} tới giờ bắt đầu`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="44" className="st-x-ring__track" />
        <circle cx="50" cy="50" r="44" className="st-x-ring__arc" pathLength={100} strokeDasharray="100" strokeDashoffset={100 - fill * 100} />
      </svg>
      <span className="st-x-ring__c">
        <b>{label}</b>
        <span>{left == null ? 'Giờ dự kiến' : left === 0 ? 'Chờ Staff bắt đầu' : 'Bắt đầu sau'}</span>
      </span>
    </div>
  )
}
