import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Plus, Search } from 'lucide-react'
import { useRepRegistrations } from '../../features/representative/representative-hooks'
import { RepPage, RepPageHeader, ErrorState, PageSkeleton, EmptyState } from '../../features/representative/components/RepUi'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { REGISTRATION_GROUPS, readRepError } from '../../features/representative/rep-format'
import { repButton } from '../../features/representative/rep-classes'
import { Pagination } from '../../components/ui/ConsolePrimitives'
import type { RegistrationSummary } from '../../features/representative/api/types'

/** Active registrations shown in two blocks: still waiting on Admin (or on a fix), then approved. */
function activeSections(items: RegistrationSummary[]) {
  return [
    { key: 'pending', title: 'Đang chờ duyệt', hint: 'Admin đang xem hoặc cần bạn sửa', items: items.filter(r => r.state !== 'APPROVED') },
    { key: 'approved', title: 'Đã duyệt', hint: 'Học sinh đã được gửi email mời', items: items.filter(r => r.state === 'APPROVED') },
  ].filter(section => section.items.length)
}

export default function RepRegistrationsPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const tab = REGISTRATION_GROUPS.find(g => g.slug === params.get('nhom')) ?? REGISTRATION_GROUPS[0]
  const other = REGISTRATION_GROUPS.find(g => g !== tab)!
  const page = Math.max(1, Number(params.get('page')) || 1)
  const shared = { search: params.get('search') ?? '', tourId: params.get('tourId') ?? undefined }
  const query = useRepRegistrations({ ...shared, page, group: tab.group })
  // Only the count of the other tab is needed, so ask for a single row.
  const otherCount = useRepRegistrations({ ...shared, page: 1, size: 1, group: other.group }).data?.pagination.totalItems
  const counts = { [tab.group]: query.data?.pagination.totalItems, [other.group]: otherCount }
  function change(key: string, value: string) { const next = new URLSearchParams(params); next.set(key, value); next.set('page', '1'); setParams(next) }
  const items = query.data?.data ?? []
  return <RepPage>
    <RepPageHeader kicker="Đăng ký của tôi" title={<>Theo dõi từng hành trình<span className="rep-dot">.</span></>}
      description="Đăng ký đang chờ hoặc đã được duyệt nằm ở “Đang hoạt động”. Đăng ký đã bị hủy chỉ hiện lý do."
      action={<Link to="/dai-dien/buoi" className={repButton('dark')}><Plus size={17} aria-hidden="true" />Đăng ký đoàn mới</Link>} />
    <div className="rep-toolbar">
      <div role="tablist" aria-label="Nhóm đăng ký" className="rep-chips">{REGISTRATION_GROUPS.map(g =>
        <button key={g.slug} type="button" role="tab" aria-selected={g === tab} aria-pressed={g === tab} onClick={() => change('nhom', g.slug)}>
          {g.label}{counts[g.group] !== undefined && <span className="rep-chip-count num">{counts[g.group]}</span>}
        </button>)}</div>
      <form role="search" onSubmit={e => { e.preventDefault(); change('search', search.trim()) }} style={{ display: 'flex', flex: 1, justifyContent: 'flex-end', minWidth: 'min(360px, 100%)' }}>
        <label className="rep-search" style={{ flex: '0 1 420px' }}>
          <Search size={17} aria-hidden="true" className="rep-muted" />
          <input aria-label="Tìm đăng ký" value={search} maxLength={200} onChange={e => setSearch(e.target.value)} placeholder="Tên đoàn, trường hoặc buổi" />
          <button className={repButton('dark', 'sm')}>Tìm kiếm</button>
        </label>
      </form>
    </div>
    {query.isPending ? <PageSkeleton /> : query.error ? <ErrorState title="Không tải được đăng ký" message={readRepError(query.error).message} onRetry={() => void query.refetch()} /> :
      items.length ? <>
        {tab.group === 'active'
          ? activeSections(items).map(section => <section key={section.key} aria-label={section.title} className="rep-reg-section">
              <div className="rep-reg-section-head"><h2>{section.title}</h2><span>{section.hint}</span></div>
              <div className="rep-reg-list">{section.items.map(r => <RegistrationCard key={r.id} registration={r} />)}</div>
            </section>)
          : <section aria-label="Đăng ký đã hủy" className="rep-reg-section">
              <p className="rep-count">Những đăng ký này không còn hiệu lực. Muốn tham gia lại, hãy tạo đăng ký mới cho một buổi đang mở.</p>
              <div className="rep-reg-list">{items.map(r => <RegistrationCard key={r.id} registration={r} />)}</div>
            </section>}
        <Pagination page={page} pageCount={query.data!.pagination.totalPages} total={query.data!.pagination.totalItems} pageSize={query.data!.pagination.pageSize} label="Trang đăng ký"
          onPage={p => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next) }} /></>
        : tab.group === 'active'
          ? <EmptyState title="Chưa có đăng ký đang hoạt động" description="Chọn một buổi tham quan đang mở để đăng ký đoàn." />
          : <EmptyState title="Không có đăng ký đã hủy" description="Đăng ký bị hủy hoặc bị từ chối sau khi buổi chốt sẽ hiện ở đây." />}
  </RepPage>
}
