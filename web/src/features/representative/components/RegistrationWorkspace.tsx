import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import { Pagination } from '../../../components/ui/ConsolePrimitives'
import { useRepRegistrations } from '../representative-hooks'
import { REGISTRATION_GROUPS, closedNote, formatDateTime, isClosedRegistration, readRepError } from '../rep-format'
import { repButton } from '../rep-classes'
import { EmptyState, ErrorState, RegistrationStatusBadge, RepPage, RepPageHeader } from './RepUi'

function registrationUrl(id: string, params: URLSearchParams) {
  const next = new URLSearchParams(params)
  next.set('selected', id)
  next.delete('chooser')
  return `/dai-dien/dang-ky/${encodeURIComponent(id)}?${next}`
}

export function RegistrationWorkspace({ registrationId, children }: { registrationId?: string; children: (id: string) => ReactNode }) {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const group = REGISTRATION_GROUPS.find(g => g.slug === params.get('nhom')) ?? REGISTRATION_GROUPS[0]
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = useRepRegistrations({ search: params.get('search') ?? '', tourId: params.get('tourId') ?? undefined, page, group: group.group })
  const selected = registrationId ?? params.get('selected') ?? ''
  const chooser = params.get('chooser') === '1'
  useEffect(() => {
    if (selected || !query.data?.data.length) return
    const next = new URLSearchParams(params)
    next.set('selected', query.data.data[0].id)
    next.set('chooser', '1')
    setParams(next, { replace: true })
  }, [selected, query.data, params, setParams])
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.set(key, value); next.set('page', '1')
    setParams(next)
  }
  function showChooser() {
    const next = new URLSearchParams(params); next.set('chooser', '1'); setParams(next)
  }
  return <RepPage>
    <RepPageHeader title="Đăng ký của tôi" description="Theo dõi kết quả từng dòng, lời mời và yêu cầu đổi email." action={<Link to="/dai-dien/buoi" className={repButton('primary')}>Chọn buổi tham quan</Link>} />
    <div className={`rep-workspace ${selected && !chooser ? 'rep-workspace--selected' : 'rep-workspace--chooser'}`}>
      <aside className="rep-workspace-list" aria-label="Danh sách đăng ký">
        <div className="rep-workspace-filters rep-stack">
          <div className="rep-chips" role="group" aria-label="Nhóm đăng ký">{REGISTRATION_GROUPS.map(g => <button key={g.slug} type="button" aria-pressed={g === group} onClick={() => filter('nhom', g.slug)}>{g.label}</button>)}</div>
          <form role="search" onSubmit={event => { event.preventDefault(); filter('search', search.trim()) }}>
            <label className="rep-search"><Search size={16} aria-hidden="true" /><input aria-label="Tìm đăng ký" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} placeholder="Tên đoàn hoặc buổi" /><button className={repButton('secondary', 'sm')}>Tìm</button></label>
          </form>
        </div>
        {query.isPending ? <p aria-busy="true">Đang tải đăng ký…</p> : query.error ? <ErrorState title="Không tải được đăng ký" message={readRepError(query.error).message} onRetry={() => void query.refetch()} /> : !query.data?.data.length ? <EmptyState title="Không có đăng ký phù hợp" description="Thử đổi nhóm hoặc từ khóa tìm kiếm." /> : <>
          <div>{query.data.data.map(item => <Link key={item.id} to={registrationUrl(item.id, params)} className={`rep-record ${item.id === selected ? 'rep-record--selected' : ''}`} aria-current={item.id === selected ? 'page' : undefined}>
            <strong className="rep-record-title">{item.tourName}</strong><span>{item.groupName}</span><RegistrationStatusBadge state={item.state} />
            <span className="rep-record-meta">{isClosedRegistration(item) ? closedNote(item).reason : formatDateTime(item.tourScheduledStartAt)}</span>
          </Link>)}</div>
          <Pagination page={page} pageCount={query.data.pagination.totalPages} total={query.data.pagination.totalItems} pageSize={query.data.pagination.pageSize} label="Trang đăng ký" onPage={value => { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next) }} />
        </>}
      </aside>
      <div className="rep-workspace-main">
        {selected && <button type="button" className={`${repButton('secondary')} rep-mobile-chooser`} onClick={showChooser}>Chọn đăng ký khác</button>}
        {selected ? children(selected) : <EmptyState title="Chọn một đăng ký" description="Chi tiết và kết quả từng dòng sẽ hiện tại đây." />}
      </div>
    </div>
  </RepPage>
}
