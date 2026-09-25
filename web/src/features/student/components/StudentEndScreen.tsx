import { CheckCircle2, School, XCircle } from 'lucide-react'
import type { StudentSession, StudentTourSnapshot } from '../student-types'

interface StudentEndScreenProps {
  session: StudentSession
  snapshot: StudentTourSnapshot
  onLeave?: () => void
}

export function StudentEndScreen({ session, snapshot, onLeave }: StudentEndScreenProps) {
  const isCancelled = snapshot.tourState === 'Cancelled' || snapshot.step === 'ended_cancelled'

  return (
    <div className="st-end">
      <div className={isCancelled ? 'st-end__visual is-cancelled' : 'st-end__visual'}>
        <img src="/images/login-bg.jpg" alt="" aria-hidden="true" />
        <span className="st-end__icon" aria-hidden="true">
          {isCancelled ? <XCircle size={32} /> : <CheckCircle2 size={32} />}
        </span>
        <div className="st-kicker">{isCancelled ? 'Buổi tham quan đã dừng' : 'Buổi tham quan đã xong'}</div>
        <h2>{isCancelled ? 'Buổi tham quan đã kết thúc sớm' : 'Hoàn thành chuyến tham quan!'}</h2>
        <p className="st-end__school">
          <School size={16} />
          <span>{snapshot.schoolName} • Đoàn {session.groupCode}</span>
        </p>
      </div>

      <div className="st-end__panel">
        <div className="st-end__thanks">
          <h3>Cảm ơn {session.studentName} đã đồng hành cùng Robot AMR</h3>
          <p>
            {isCancelled
              ? 'Buổi tham quan được nhân viên vận hành kết thúc sớm. Toàn bộ hình ảnh phát trực tiếp và trợ lý AI đã dừng hoạt động.'
              : 'Robot AMR đã hoàn thành chặng đường và về tới vị trí kết thúc an toàn. Hy vọng bạn đã có trải nghiệm thú vị về khuôn viên đại học!'}
          </p>
        </div>

        {!isCancelled && (
          <div>
            <h4 className="st-sec-title">Các điểm tham quan trong lộ trình</h4>
            <ol className="st-route">
              {snapshot.pois.map((poi, idx) => (
                <li key={poi.id} className="st-route__row is-done" style={{ gridTemplateColumns: '56px 1fr auto', alignItems: 'center' }}>
                  <em>{String(idx + 1).padStart(2, '0')}</em>
                  <h6>{poi.title}</h6>
                  <span className="st-tick" aria-label="Đã tham quan">✓</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {onLeave && (
          <button type="button" onClick={onLeave} className="st-btn st-btn--block">
            <span>Rời phòng tham quan</span>
            <span className="st-btn__ic" aria-hidden="true">↗</span>
          </button>
        )}
      </div>
    </div>
  )
}
