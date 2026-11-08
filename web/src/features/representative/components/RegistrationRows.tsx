import { Link } from 'react-router'
import type { RepresentativeRegistration } from '../api/types'
import { formatDateTime } from '../rep-format'
import { repButton } from '../rep-classes'
import { canRequestRowEmail } from '../row-permissions'

const states = { PENDING: 'Chờ duyệt', ACCEPTED: 'Đã chấp nhận', REJECTED: 'Bị từ chối', REMOVED: 'Đã xóa khỏi danh sách', EXPIRED: 'Đã hết hạn' }
export function RegistrationRows({ registration, emailLink }: { registration: RepresentativeRegistration; emailLink: (id: string) => string }) {
  return <div className="rep-table-wrap"><table className="rep-table" aria-label="Danh sách lời mời">
    <thead><tr>{['Người nhận / điểm xem', 'Loại dòng', 'Email hiện tại', 'Lớp', 'Kết quả duyệt', 'Lý do / thao tác'].map(label => <th key={label}>{label}</th>)}</tr></thead>
    <tbody>{registration.roster.map(row => <tr key={row.id ?? row.rowNumber}>
      <td data-label="Người nhận / điểm xem"><div className="rep-table-cell">{row.displayName}</div></td>
      <td data-label="Loại dòng">{row.rowType === 'SHARED_VIEWING' ? 'Điểm xem chung' : 'Cá nhân'}</td>
      <td data-label="Email hiện tại"><div className="rep-table-cell">{row.email}</div></td>
      <td data-label="Lớp">{row.className || 'Không áp dụng'}</td>
      <td data-label="Kết quả duyệt"><div className="rep-table-cell"><span className={`rep-badge rep-badge--${row.participationState === 'ACCEPTED' ? 'success' : row.participationState === 'REJECTED' ? 'danger' : 'muted'}`}>{row.participationState ? states[row.participationState] : 'Chưa có kết quả theo dòng'}</span>{row.reviewedAt && <p className="rep-hint">{formatDateTime(row.reviewedAt)}</p>}</div></td>
      <td data-label="Lý do / thao tác"><div className="rep-table-cell rep-stack">
        <span>{row.reviewReason || (row.participationState === 'PENDING' ? 'Chờ Staff xét duyệt; chưa được cấp lời mời.' : row.participationState === 'ACCEPTED' ? 'Quyền truy cập và kết quả gửi email được theo dõi riêng ở Lời mời.' : row.participationState === 'EXPIRED' ? 'Chưa được duyệt trước giờ tham quan 24 giờ nên đã hết hạn.' : 'Không có lý do được lưu.')}</span>
        {canRequestRowEmail(registration, row) && <Link to={emailLink(row.id!)} className={repButton('secondary', 'sm')}>Yêu cầu đổi email</Link>}
      </div></td>
    </tr>)}</tbody>
  </table>{!registration.roster.length && <p className="rep-hint">Đăng ký không có dòng lời mời.</p>}</div>
}
