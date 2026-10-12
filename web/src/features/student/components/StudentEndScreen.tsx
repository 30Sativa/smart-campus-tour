import { CheckCircle2, School, XCircle } from 'lucide-react'
import type { StudentSession, StudentTourSnapshot } from '../student-types'
import { Confetti } from './Confetti'

interface StudentEndScreenProps {
  session: StudentSession
  snapshot: StudentTourSnapshot
  onLeave?: () => void
}

export function StudentEndScreen({ session, snapshot, onLeave }: StudentEndScreenProps) {
  const isCancelled = snapshot.tourState === 'Cancelled' || snapshot.step === 'ended_cancelled'

  const stops = [...snapshot.pois].sort((a, b) => a.order - b.order)

  return (
    <div className={isCancelled ? 'st-ctn st-x-end is-cancelled' : 'st-ctn st-x-end'}>
      {!isCancelled && <Confetti />}
      <span className="st-end__icon" aria-hidden="true">
        {isCancelled ? <XCircle size={30} /> : <CheckCircle2 size={30} />}
      </span>
      <div className="st-kicker">{isCancelled ? 'Buổi tham quan đã dừng' : 'Buổi tham quan đã xong'}</div>
      <h2 className="st-x-display">{isCancelled ? 'Buổi tham quan đã kết thúc sớm' : 'Hoàn thành chuyến tham quan!'}</h2>
      <p className="st-x-lead">
        Cảm ơn {session.studentName} đã đồng hành cùng Robot AMR.{' '}
        {isCancelled
          ? 'Buổi tham quan được nhân viên vận hành kết thúc sớm. Hình ảnh trực tiếp và trợ lý AI đã dừng hoạt động.'
          : 'Robot đã hoàn thành chặng đường và về tới vị trí kết thúc an toàn. Hy vọng bạn đã có trải nghiệm thú vị về khuôn viên!'}
      </p>
      <p className="st-x-meta"><School size={16} /><span>{snapshot.schoolName} • Đoàn {session.groupCode}</span></p>

      {!isCancelled && (
        <>
          <div className="st-x-stats">
            <div><b>{stops.length}</b><span>điểm dừng đã xem</span></div>
            {session.studentClass && <div><b>{session.studentClass}</b><span>lớp tham gia</span></div>}
          </div>
          <h4 className="st-x-sec">Các điểm tham quan trong lộ trình</h4>
          <ol className="st-x-recap">
            {stops.map((poi, index) => (
              <li key={poi.id} style={{ ['--i' as string]: index }}>
                {poi.imageUrl ? <img src={poi.imageUrl} alt="" loading="lazy" /> : <span className="st-x-preview__n" aria-hidden="true">{poi.order}</span>}
                <span className="st-x-recap__tick" aria-label="Đã tham quan">✓</span>
                <span className="st-x-preview__cap"><b>{String(poi.order).padStart(2, '0')}</b>{poi.title}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {onLeave && (
        <button type="button" onClick={onLeave} className="st-btn">
          <span>Rời phòng tham quan</span>
          <span className="st-btn__ic" aria-hidden="true">↗</span>
        </button>
      )}
    </div>
  )
}
