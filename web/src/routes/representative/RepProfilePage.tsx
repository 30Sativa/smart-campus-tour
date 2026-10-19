import { ArrowRight, Info, LogOut, Moon, Sun } from 'lucide-react'
import { Link } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useThemeStore } from '../../stores/theme-store'
import { useLogout } from '../../auth/use-logout'
import { useRepRegistration, useRepRegistrations } from '../../features/representative/representative-hooks'
import { EmptyState, ErrorState, InfoList, PageSkeleton, Panel, RepPage, RepPageHeader, RepSection } from '../../features/representative/components/RepUi'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { readRepError } from '../../features/representative/rep-format'
import { repButton } from '../../features/representative/rep-classes'

/** Two initials, skipping a leading "Cô" / "Thầy". */
function initialsOf(name: string) {
  const parts = name.replace(/^(cô|thầy)\s+/i, '').split(/[\s._-]+/).filter(Boolean)
  return (parts.length > 1 ? parts.slice(-2).map((part) => part[0]).join('') : name.slice(0, 2)).toUpperCase()
}

/**
 * "Hồ sơ của tôi" for a school representative. It only reads: the contact
 * details are the ones on the latest registration (each new registration
 * carries its own), and the account itself is issued and changed by Admin
 * (flow review §10.1), so there is no self-service edit or password form.
 */
export default function RepProfilePage() {
  const user = useAuthStore((state) => state.user)
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const logout = useLogout()
  const recent = useRepRegistrations({ size: 5 })
  const approved = useRepRegistrations({ state: 'APPROVED', size: 100 })
  const latest = recent.data?.data[0]
  const contact = useRepRegistration(latest?.id)

  if (recent.isPending || approved.isPending) return <PageSkeleton />
  const error = recent.error ?? approved.error
  if (error) {
    return <RepPage><ErrorState title="Không tải được hồ sơ" message={readRepError(error).message} onRetry={() => { void recent.refetch(); void approved.refetch() }} /></RepPage>
  }

  const username = user?.username ?? ''
  const contactName = contact.data?.contactName || null
  const school = latest?.schoolName || null
  const email = contact.data?.contactEmail || null
  const displayName = contactName ?? (username || 'Đại diện trường')
  const approvedRows = approved.data?.data.reduce((sum, r) => sum + r.rowCount, 0) ?? 0
  const approvedPartial = (approved.data?.pagination.totalItems ?? 0) > (approved.data?.data.length ?? 0)
  const items = recent.data?.data ?? []

  return (
    <RepPage>
      <RepPageHeader kicker="Tài khoản" title="Hồ sơ của tôi" description="Thông tin đại diện, đăng ký của bạn và giao diện." />

      <section className="rep-profile-hero" aria-label="Thông tin chính">
        <span className="rep-profile-avatar" aria-hidden="true">{initialsOf(displayName)}</span>
        <div className="rep-profile-who">
          <h2>{displayName}</h2>
          <p>Đại diện trường{school ? ` · ${school}` : ''}</p>
          <div className="rep-profile-tags">
            {username && <span className="rep-profile-tag num">@{username}</span>}
            {email && <span className="rep-profile-tag">{email}</span>}
          </div>
        </div>
        <dl className="rep-profile-stats">
          <div><dt>Đăng ký đã gửi</dt><dd className="num">{recent.data?.pagination.totalItems ?? 0}</dd></div>
          <div><dt>Đã duyệt</dt><dd className="num">{approved.data?.pagination.totalItems ?? 0}</dd></div>
          <div><dt>Dòng lời mời đã duyệt</dt><dd className="num">{approvedPartial ? '≥' : ''}{approvedRows}</dd></div>
        </dl>
      </section>

      <div className="rep-profile-grid">
        <Panel title="Thông tin đại diện">
          {latest ? (
            <>
              <InfoList
                columns={1}
                items={[
                  { label: 'Họ tên người liên hệ', value: contact.isPending ? '…' : contactName ?? '–' },
                  { label: 'Trường / đơn vị', value: school ?? '–' },
                  { label: 'Email liên hệ', value: contact.isPending ? '…' : email ?? '–' },
                ]}
              />
              <p className="rep-profile-note">
                <Info size={15} aria-hidden="true" />
                <span>
                  Theo đăng ký gần nhất ({latest.tourName}). Mỗi đăng ký mang thông tin liên hệ riêng; muốn đổi, hãy cập nhật khi gửi hoặc sửa đăng ký.
                  {contact.isError && ' Chưa tải được chi tiết liên hệ.'}
                </span>
              </p>
            </>
          ) : (
            <p className="rep-profile-note">
              <Info size={15} aria-hidden="true" />
              <span>Thông tin liên hệ sẽ hiện ở đây sau khi bạn gửi đăng ký đoàn đầu tiên.</span>
            </p>
          )}
        </Panel>

        <div className="rep-profile-side">
          <Panel title="Tài khoản">
            <InfoList columns={1} items={[{ label: 'Tên đăng nhập', value: <span className="num">{username || '–'}</span> }, { label: 'Vai trò', value: 'Đại diện trường' }]} />
            <p className="rep-profile-note">
              <Info size={15} aria-hidden="true" />
              <span>Tài khoản do Admin cấp. Cần đổi mật khẩu hoặc tên đăng nhập, liên hệ Admin.</span>
            </p>
          </Panel>

          <Panel title="Giao diện">
            <div className="rep-theme-pick" role="group" aria-label="Chọn giao diện">
              <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
                <span className="rep-theme-swatch is-light" aria-hidden="true" /><span><Sun size={14} aria-hidden="true" />Sáng</span>
              </button>
              <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
                <span className="rep-theme-swatch is-dark" aria-hidden="true" /><span><Moon size={14} aria-hidden="true" />Tối</span>
              </button>
            </div>
          </Panel>

          <button type="button" className={repButton('danger', 'md', true)} onClick={() => void logout()}>
            <LogOut size={16} aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      </div>

      <RepSection kicker="Đăng ký" title="Đăng ký gần đây" action={<Link to="/dai-dien/dang-ky" className="rep-text-link">Đăng ký của tôi<ArrowRight size={16} aria-hidden="true" /></Link>}>
        {items.length ? (
          <div className="rep-reg-list">{items.map((r) => <RegistrationCard key={r.id} registration={r} />)}</div>
        ) : (
          <EmptyState title="Bạn chưa có đăng ký nào" description="Chọn một buổi tham quan để đăng ký đoàn đầu tiên." />
        )}
      </RepSection>
    </RepPage>
  )
}
