import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useRepRegistrations } from '../../features/representative/representative-hooks'
import { RepPage, RepPageHeader, ErrorState, PageSkeleton, EmptyState } from '../../features/representative/components/RepUi'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { REGISTRATION_FILTERS, readRepError } from '../../features/representative/rep-format'
import { Pagination } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../components/ui/ui-classes'

export default function RepRegistrationsPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const filter = REGISTRATION_FILTERS.find(f => f.slug === params.get('trang-thai')) ?? REGISTRATION_FILTERS[0]
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = useRepRegistrations({ page, state: filter.state ?? undefined, search: params.get('search') ?? '', tourId: params.get('tourId') ?? undefined })
  function change(key: string, value: string) { const next = new URLSearchParams(params); next.set(key, value); next.set('page', '1'); setParams(next) }
  return <RepPage><RepPageHeader title="Đăng ký của tôi" description="Theo dõi từng đoàn và kết quả duyệt của Admin." />
    <form className="mb-4 flex gap-3" onSubmit={e => { e.preventDefault(); change('search', search.trim()) }}>
      <input aria-label="Tìm đăng ký" className={inputClass} value={search} maxLength={200} onChange={e => setSearch(e.target.value)} placeholder="Tên đoàn, trường hoặc buổi" />
      <button className={buttonClass('secondary')}>Tìm kiếm</button>
    </form>
    <nav aria-label="Lọc đăng ký" className="mb-6 flex flex-wrap gap-2">{REGISTRATION_FILTERS.map(f =>
      <button key={f.slug} className={buttonClass(f === filter ? 'primary' : 'secondary', 'sm')} aria-pressed={f === filter} onClick={() => change('trang-thai', f.slug)}>{f.label}</button>)}</nav>
    {query.isPending ? <PageSkeleton /> : query.error ? <ErrorState title="Không tải được đăng ký" message={readRepError(query.error).message} onRetry={() => void query.refetch()} /> :
      query.data?.data.length ? <><p className="mb-4 text-sm text-slate-500">{query.data.pagination.totalItems} đăng ký</p><div className="space-y-4">{query.data.data.map(r => <RegistrationCard key={r.id} registration={r} />)}</div>
        <Pagination page={page} pageCount={query.data.pagination.totalPages} total={query.data.pagination.totalItems} pageSize={query.data.pagination.pageSize} label="Trang đăng ký"
          onPage={p => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next) }} /></>
        : <EmptyState title="Chưa có đăng ký phù hợp" />}
  </RepPage>
}
