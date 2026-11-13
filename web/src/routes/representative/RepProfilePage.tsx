import { Info, LogOut } from 'lucide-react'
import { Link } from 'react-router'
import { AccountSettings } from '../../features/account/AccountSettings'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { useRepRegistration, useRepRegistrations } from '../../features/representative/representative-hooks'
import { EmptyState, ErrorState, InfoList, PageSkeleton, Panel, RepPage, RepPageHeader, RepSection } from '../../features/representative/components/RepUi'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { readRepError } from '../../features/representative/rep-format'
import { repButton } from '../../features/representative/rep-classes'

function initialsOf(name: string) {
  const parts = name.replace(/^(cô|thầy)\s+/i, '').split(/[\s._-]+/).filter(Boolean)
  return (parts.length > 1 ? parts.slice(-2).map(part => part[0]).join('') : name.slice(0, 2)).toUpperCase()
}

export default function RepProfilePage() {
  const user = useAuthStore(state => state.user)
  const logout = useLogout()
  const recent = useRepRegistrations({ size: 5, sort: '-submittedAt' })
  const latest = recent.data?.data[0]
  const contact = useRepRegistration(latest?.id)
  if (recent.isPending) return <PageSkeleton />
  if (recent.isError) return <RepPage><ErrorState title="Không tải được hồ sơ" message={readRepError(recent.error).message} onRetry={() => void recent.refetch()} /></RepPage>
  const username = user?.username ?? ''
  const contactName = contact.data?.contactName || null
  const school = latest?.schoolName || null
  const email = contact.data?.contactEmail || null
  const displayName = contactName ?? (username || 'Đại diện trường')
  const items = recent.data?.data ?? []
  return <RepPage>
    <RepPageHeader title="Hồ sơ của tôi" description="Xem tài khoản và thông tin liên hệ từ đăng ký gần nhất." />
    <div className="rep-profile-identity"><span className="rep-profile-avatar" aria-hidden="true">{initialsOf(displayName)}</span><div><h2>{displayName}</h2><p className="rep-muted">Đại diện trường</p>{school && <p>{school}</p>}</div></div>
    <div className="rep-detail"><div className="rep-stack">
      <Panel title="Thông tin đại diện">{latest ? contact.isError ? <ErrorState title="Chưa tải được thông tin liên hệ" message={readRepError(contact.error).message} onRetry={() => void contact.refetch()} /> : <><InfoList items={[{ label: 'Họ tên người liên hệ', value: contact.isPending ? 'Đang tải…' : contactName ?? 'Chưa có thông tin' }, { label: 'Trường / đơn vị', value: school ?? 'Chưa có thông tin' }, { label: 'Email liên hệ', value: contact.isPending ? 'Đang tải…' : email ?? 'Chưa có thông tin' }]} /><p className="rep-profile-note"><Info size={16} aria-hidden="true" /><span>Theo đăng ký gần nhất ({latest.tourName}). Mỗi đăng ký mang thông tin liên hệ riêng; cập nhật khi gửi hoặc sửa đăng ký.</span></p></> : <p className="rep-hint">Thông tin liên hệ sẽ hiện sau khi bạn gửi đăng ký đầu tiên.</p>}</Panel>
      <Panel title="Tài khoản"><InfoList items={[{ label: 'Tên đăng nhập', value: username || 'Chưa có thông tin' }, { label: 'Vai trò', value: 'Đại diện trường' }]} /><p className="rep-profile-note"><Info size={16} aria-hidden="true" /><span>Tài khoản do Admin cấp. Bạn tự đổi họ tên và mật khẩu bên dưới; đổi tên đăng nhập, liên hệ Admin.</span></p></Panel>
      <AccountSettings />
    </div><aside className="rep-aside rep-stack"><button type="button" className={repButton('danger')} onClick={() => void logout()}><LogOut size={16} aria-hidden="true" />Đăng xuất</button></aside></div>
    <RepSection title="Đăng ký gần đây" action={<Link to="/dai-dien/dang-ky" className="rep-text-link">Đăng ký của tôi</Link>}>{items.length ? <div className="rep-reg-list">{items.map(r => <RegistrationCard key={r.id} registration={r} />)}</div> : <EmptyState variant="empty" title="Bạn chưa có đăng ký nào." action={<Link to="/dai-dien/buoi" className={repButton('primary')}>Xem buổi tham quan</Link>} />}</RepSection>
  </RepPage>
}
