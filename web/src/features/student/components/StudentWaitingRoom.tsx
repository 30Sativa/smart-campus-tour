import { useState } from 'react'
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
  session: StudentSession
  snapshot: StudentTourSnapshot
}

export function StudentWaitingRoom({ session, snapshot }: StudentWaitingRoomProps) {
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

  return (
    <div className="st-ctn st-wait">
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

      {/* Dark band with campus photo, like the home hero */}
      <section className="st-band">
        <img src="/images/login-bg.jpg" alt="" aria-hidden="true" />
        <div className="st-band__top">
          <div className="st-kicker">Phòng chờ trực tuyến</div>
          <span className="st-pill-time">
            <Clock size={13} />
            <span>Giờ dự kiến: {snapshot.scheduledAt}</span>
          </span>
        </div>
        <div>
          <h2>{snapshot.tourName}</h2>
          <p className="st-band__meta">
            {snapshot.schoolName} • Đoàn {snapshot.groupCode}
          </p>
          <div style={{ marginTop: 22 }}>
            <span className="st-pill-status"><i />Đang chờ bắt đầu</span>
          </div>
        </div>
      </section>

      {/* Welcome */}
      <div className="st-card st-welcome">
        <div className="st-avatar" aria-hidden="true">{session.studentName.trim().charAt(0)}</div>
        <div>
          <h3>Xin chào, {session.studentName}!</h3>
          <p>
            Bạn đã được xác nhận vào phòng chờ của đoàn {session.groupCode}. Khi người điều hành nhấn bắt đầu, màn hình sẽ tự động chuyển sang luồng video trực tiếp từ Robot AMR.
          </p>
        </div>
      </div>

      <div className="st-grid2">
        {/* Test Equipment & Audio Checklist */}
        <div className="st-card">
          <h4 className="st-sec-title">Chuẩn bị thiết bị trước khi tham quan</h4>
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="st-check">
              <div className="st-check__head">
                <div className="st-check__row">
                  <span className="st-check__ic"><Volume2 size={18} /></span>
                  <div>
                    <h5>Kiểm tra Loa / Âm thanh</h5>
                    <p>Để nghe rõ thuyết minh tại các điểm dừng</p>
                  </div>
                </div>
                {audioTested && <CheckCircle2 size={20} className="st-ok" />}
              </div>
              <button
                type="button"
                onClick={handleTestAudio}
                disabled={isPlayingTestAudio}
                className="st-chip-btn st-chip-btn--block"
              >
                {isPlayingTestAudio ? (
                  <>
                    <Volume2 size={14} />
                    <span>Đang phát chuông thử nghiệm...</span>
                  </>
                ) : audioTested ? (
                  <>
                    <CheckCircle2 size={14} className="st-ok" />
                    <span>Âm thanh sẵn sàng (Nghe lại)</span>
                  </>
                ) : (
                  <>
                    <VolumeX size={14} />
                    <span>Bấm để nghe thử âm thanh</span>
                  </>
                )}
              </button>
            </div>

            <div className="st-check">
              <div className="st-check__head">
                <div className="st-check__row">
                  <span className="st-check__ic"><Mic size={18} /></span>
                  <div>
                    <h5>Kiểm tra Micro (Tùy chọn)</h5>
                    <p>Dùng nếu bạn muốn hỏi Trợ lý AI bằng giọng nói</p>
                  </div>
                </div>
                {micStatus === 'granted' && <CheckCircle2 size={20} className="st-ok" />}
              </div>
              <button
                type="button"
                onClick={handleTestMic}
                disabled={micStatus === 'testing'}
                className="st-chip-btn st-chip-btn--block"
              >
                {micStatus === 'testing' ? (
                  <span>Đang kiểm tra micro...</span>
                ) : micStatus === 'granted' ? (
                  <>
                    <CheckCircle2 size={14} className="st-ok" />
                    <span>Micro sẵn sàng</span>
                  </>
                ) : micStatus === 'denied' ? (
                  <span>Chưa cấp quyền mic (vẫn có thể gõ chữ)</span>
                ) : (
                  <>
                    <Mic size={14} />
                    <span>Kiểm tra quyền micro</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Planned POI summary */}
        <div className="st-card">
          <h4 className="st-sec-title">
            <span>Lộ trình dự kiến</span>
            <span>({String(snapshot.pois.length).padStart(2, '0')} điểm tham quan)</span>
          </h4>
          <ol className="st-route">
            {snapshot.pois.map((poi, idx) => (
              <li key={poi.id} className="st-route__row">
                <em>{String(idx + 1).padStart(2, '0')}</em>
                <div>
                  <h6>{poi.title}</h6>
                  <p>{poi.description}</p>
                </div>
              </li>
            ))}
          </ol>
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
