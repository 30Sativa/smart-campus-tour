import { useState } from 'react'
import { AlertCircle, ArrowUpRight, KeyRound, School, User } from 'lucide-react'
import type { PoiDetail, RosterMatchRequest } from '../student-types'

interface StudentJoinFormProps {
  tourId: string
  tourName?: string
  schoolName?: string
  initialGroupCode?: string
  isSubmitting?: boolean
  errorMessage?: string | null
  onSubmit: (req: RosterMatchRequest) => void
  /** The Tour's stops, for the photo fan beside the form (optional). */
  pois?: PoiDetail[]
}

export function StudentJoinForm({
  tourId,
  tourName = 'Tham quan Trực tuyến Khuôn viên Đại học',
  schoolName = 'Trường THPT',
  initialGroupCode = '',
  isSubmitting = false,
  errorMessage,
  onSubmit,
  pois = [],
}: StudentJoinFormProps) {
  const [groupCode, setGroupCode] = useState(initialGroupCode)
  const [hoTen, setHoTen] = useState('')
  const [lop, setLop] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!groupCode.trim()) {
      setLocalError('Vui lòng nhập Mã đoàn do trường cung cấp')
      return
    }

    if (!hoTen.trim()) {
      setLocalError('Vui lòng nhập Họ và tên của bạn')
      return
    }

    onSubmit({
      tourId,
      groupCode: groupCode.trim(),
      hoTen: hoTen.trim(),
      lop: lop.trim() || undefined,
    })
  }

  const activeError = localError || errorMessage

  const fan = [...pois].sort((a, b) => a.order - b.order).slice(0, 3)

  return (
    <div className="st-ctn st-x-join">
      <div className="st-x-join__intro">
        <div className="st-kicker">Tham quan qua robot tự hành</div>
        <h2 className="st-x-display">Sẵn sàng <em>khám phá</em> campus từ xa?</h2>
        <p className="st-x-lead">
          {tourName}. Một robot thật đưa cả lớp đi qua {pois.length || 'các'} điểm dừng: bạn xem trực tiếp, nghe thuyết minh và hỏi trợ lý AI bất cứ lúc nào.
        </p>
        <p className="st-x-meta"><School size={16} /><span>Dành cho học sinh: {schoolName}</span></p>
        <div className="st-x-fan" aria-hidden="true">
          {fan.length > 0 ? fan.map((poi) => (
            <figure key={poi.id}>
              {poi.imageUrl ? <img src={poi.imageUrl} alt="" /> : <span className="st-x-fan__n">{poi.order}</span>}
              <figcaption>{String(poi.order).padStart(2, '0')} · {poi.title.split(' & ')[0]}</figcaption>
            </figure>
          )) : (
            <figure><img src="/images/student-campus.png" alt="" /><figcaption>Khuôn viên</figcaption></figure>
          )}
        </div>
      </div>

      <div className="st-x-join__panel">
        <form onSubmit={handleSubmit} className="st-form st-x-card">
          <div className="st-form__head">
            <div className="st-kicker">Vào phiên tham quan</div>
            <h3>Vào buổi tham quan</h3>
            <p>Không cần tài khoản. Thông tin được đối chiếu với danh sách trường đã gửi.</p>
          </div>

          {activeError && (
            <div role="alert" className="st-alert">
              <AlertCircle size={16} />
              <div>
                <b>Xác nhận không thành công</b>
                <span>{activeError}</span>
              </div>
            </div>
          )}

          <div className="st-field">
            <label htmlFor="groupCode">
              Mã đoàn / Lời mời <span>*</span>
            </label>
            <div className="st-input">
              <KeyRound size={16} />
              <input
                id="groupCode"
                type="text"
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value)}
                placeholder="Ví dụ: LHP2026 hoặc GD2026"
                disabled={isSubmitting}
                autoComplete="off"
              />
            </div>
            <small>Mã do giáo viên hoặc đại diện trường chia sẻ.</small>
          </div>

          <div className="st-field">
            <label htmlFor="hoTen">
              Họ và tên học sinh <span>*</span>
            </label>
            <div className="st-input">
              <User size={16} />
              <input
                id="hoTen"
                type="text"
                value={hoTen}
                onChange={(e) => setHoTen(e.target.value)}
                placeholder="Ví dụ: Nguyễn Văn An"
                disabled={isSubmitting}
                autoComplete="name"
              />
            </div>
          </div>

          <div className="st-field">
            <label htmlFor="lop">Lớp học</label>
            <input
              id="lop"
              type="text"
              value={lop}
              onChange={(e) => setLop(e.target.value)}
              placeholder="Ví dụ: 12A1 (nếu có trong danh sách)"
              disabled={isSubmitting}
            />
            <small>Nhập lớp nếu danh sách đoàn của trường có thông tin lớp.</small>
          </div>

          <button type="submit" disabled={isSubmitting} className="st-btn st-btn--block">
            <span>{isSubmitting ? 'Đang xác nhận...' : 'Vào buổi tham quan'}</span>
            <span className="st-btn__ic" aria-hidden="true">
              {isSubmitting ? <span className="st-spinner" /> : <ArrowUpRight size={18} />}
            </span>
          </button>

          <p className="st-form__note">
            Học sinh tham gia trực tiếp qua liên kết đối chiếu danh sách, không cần đăng ký tài khoản.
          </p>
        </form>
      </div>
    </div>
  )
}
