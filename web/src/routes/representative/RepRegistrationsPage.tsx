import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Plus, Search } from 'lucide-react'
import { useRepRegistrations } from '../../features/representative/representative-hooks'
import { RepPage, RepPageHeader, ErrorState, PageSkeleton, EmptyState } from '../../features/representative/components/RepUi'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { REGISTRATION_FILTERS, readRepError } from '../../features/representative/rep-format'
import { repButton } from '../../features/representative/rep-classes'
import { Pagination } from '../../components/ui/ConsolePrimitives'

export default function RepRegistrationsPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const filter = REGISTRATION_FILTERS.find(f => f.slug === params.get('trang-thai')) ?? REGISTRATION_FILTERS[0]
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = useRepRegistrations({ page, state: filter.state ?? undefined, search: params.get('search') ?? '', tourId: params.get('tourId') ?? undefined })
  function change(key: string, value: string) { const next = new URLSearchParams(params); next.set(key, value); next.set('page', '1'); setParams(next) }
  return <RepPage>
    <RepPageHeader kicker="Đăng ký của tôi" title={<>Theo dõi từng hành trình<span className="rep-dot">.</span></>} description="Theo dõi từng đoàn và kết quả duyệt của Admin."
      action={<Link to="/dai-dien/buoi" className={repButton('dark')}><Plus size={17} aria-hidden="true" />Đăng ký đoàn mới</Link>} />
    <div className="rep-toolbar">
      <nav aria-label="Lọc đăng ký" className="rep-chips">{REGISTRATION_FILTERS.map(f =>
        <button key={f.slug} type="button" aria-pressed={f === filter} onClick={() => change('trang-thai', f.slug)}>{f.label}</button>)}</nav>
      <form role="search" onSubmit={e => { e.preventDefault(); change('search', search.trim()) }} style={{ display: 'flex', flex: 1, justifyContent: 'flex-end', minWidth: 'min(360px, 100%)' }}>
        <label className="rep-search" style={{ flex: '0 1 420px' }}>
          <Search size={17} aria-hidden="true" className="rep-muted" />
          <input aria-label="Tìm đăng ký" value={search} maxLength={200} onChange={e => setSearch(e.target.value)} placeholder="Tên đoàn, trường hoặc buổi" />
          <button className={repButton('dark', 'sm')}>Tìm kiếm</button>
        </label>
      </form>
    </div>
    {query.isPending ? <PageSkeleton /> : query.error ? <ErrorState title="Không tải được đăng ký" message={readRepError(query.error).message} onRetry={() => void query.refetch()} /> :
      query.data?.data.length ? <><p className="rep-count"><span className="num">{query.data.pagination.totalItems}</span> đăng ký</p><div className="rep-reg-list" key={filter.slug}>{query.data.data.map(r => <RegistrationCard key={r.id} registration={r} />)}</div>
        <Pagination page={page} pageCount={query.data.pagination.totalPages} total={query.data.pagination.totalItems} pageSize={query.data.pagination.pageSize} label="Trang đăng ký"
          onPage={p => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next) }} /></>
        : <EmptyState title="Chưa có đăng ký phù hợp" description="Đổi bộ lọc hoặc đăng ký một đoàn mới." />}
  </RepPage>
}
