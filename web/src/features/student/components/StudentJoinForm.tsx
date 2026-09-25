import { useState } from 'react'
import { AlertCircle, ArrowUpRight, KeyRound, School, User } from 'lucide-react'
import type { RosterMatchRequest } from '../student-types'

interface StudentJoinFormProps {
  tourId: string
  tourName?: string
  schoolName?: string
  initialGroupCode?: string
  isSubmitting?: boolean
  errorMessage?: string | null
  onSubmit: (req: RosterMatchRequest) => void
}

export function StudentJoinForm({
  tourId,
  tourName = 'Tham quan Trực tuyến Khuôn viên Đại học',
  schoolName = 'Trường THPT',
  initialGroupCode = '',
  isSubmitting = false,
  errorMessage,
  onSubmit,
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

  return (
    <div className="st-join">
      {/* Campus photo side, same art direction as the home hero */}
      <div className="st-join__visual">
        <img src="/images/hero-campus.jpg" alt="" aria-hidden="true" />
        <div>
          <div className="st-kicker">Tham quan qua robot tự hành</div>
          <h2 className="st-join__title">{tourName}</h2>
          <p className="st-join__school">
            <School size={16} />
            <span>Dành cho học sinh: {schoolName}</span>
          </p>
        </div>
        <div className="st-join__steps">
          <div><b>01</b>Nhập mã đoàn, họ tên và lớp</div>
          <div><b>02</b>Chờ trong phòng chờ</div>
          <div><b>03</b>Xem live, nghe thuyết minh, hỏi AI</div>
        </div>
      </div>

      <div className="st-join__panel">
        <form onSubmit={handleSubmit} className="st-form">
          <div className="st-form__head">
            <div className="st-kicker">Vào phiên tham quan</div>
            <h3>Xác nhận bạn có trong danh sách đoàn.</h3>
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
