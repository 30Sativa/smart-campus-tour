import { Link, useSearchParams } from 'react-router'
import { PageHeader, Pagination, SearchField } from '../../../components/ui/ConsolePrimitives'
import { StageTabs } from '../../../components/ui/StageTabs'
import { buttonClass, inputClass, rowClass, tdClass, thClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { useRegistrationReviews } from '../../../features/administration/registrations/hooks'
import { ReviewDrawer } from '../../../features/administration/registrations/components/ReviewDrawer'
import { dateBoundary, reviewTime } from '../../../features/administration/registrations/presentation'
import { ReviewStateBadge } from '../../../features/administration/registrations/components/ReviewStateBadge'
import { isRegistrationState, REGISTRATION_STATE_LABEL, REGISTRATION_STATES, type RegistrationState } from '../../../features/registrations/registration-state'
import { useReviewParam } from '../../../features/administration/use-review-param'
import { cardClass } from '../../../features/administration/admin-visual'
import { Waited } from '../../../features/administration/registrations/components/Waited'

const STATE_COLOR: Record<RegistrationState | 'all', string> = { all: '#64748b', SUBMITTED: '#d97706', APPROVED: '#16a34a', REJECTED: '#dc2626', CANCELLED: '#64748b' }

export default function StaffManageRegistrationsPage({ mode }: { mode: 'pending' | 'all' }) {
  const [params, setParams] = useSearchParams()
  const { reviewId, open, close } = useReviewParam()
  const search = params.get('q') ?? ''
  const requestedState = (params.get('state') ?? '').toUpperCase()
  const state = mode === 'pending' ? 'SUBMITTED' : isRegistrationState(requestedState) ? requestedState : undefined
  const requestedPage = Number(params.get('page') ?? 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const sort = params.get('sort') ?? 'submittedAt'
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  // ISO calendar dates compare as text; an inverted range is explained here instead of failing as a load error.
  const invalidRange = Boolean(from && to && from > to)
  const query = useRegistrationReviews({ search: search.trim() || undefined, state, page, size: 10, sort,
    tourId: params.get('tourId') || undefined, from: dateBoundary(from), to: dateBoundary(to, true) }, !invalidRange)
  const update = (changes: Record<string, string | null>) => setParams(current => {
    const next = new URLSearchParams(current)
    next.delete('page')
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key) }
    return next
  }, { replace: true })
  const rows = query.data?.data ?? []
  const total = query.data?.pagination.totalItems ?? 0
  const sharedParams = new URLSearchParams(params)
  for (const key of ['page', 'state', 'review']) sharedParams.delete(key)
  const sharedSearch = sharedParams.size ? `?${sharedParams}` : ''
  return <AdminPage>
    <PageHeader eyebrow="Chuẩn bị Tour · Đăng ký đoàn" title={mode === 'pending' ? 'Đăng ký chờ duyệt' : 'Tất cả đăng ký'}
      description="Xem đăng ký từ đại diện và xét duyệt khi Tour còn nhận đăng ký. Mỗi quyết định được lưu cùng lịch sử thao tác." />
    <nav aria-label="Chế độ xem đăng ký" className="mb-5 flex gap-1 rounded-xl border border-[#e2e8f0] bg-white p-1 sm:w-fit">
      <Link to={`/staff/manage/registrations/pending${sharedSearch}`} aria-current={mode === 'pending' ? 'page' : undefined} className={buttonClass(mode === 'pending' ? 'primary' : 'ghost')}>Chờ duyệt</Link>
      <Link to={`/staff/manage/registrations${sharedSearch}`} aria-current={mode === 'all' ? 'page' : undefined} className={buttonClass(mode === 'all' ? 'primary' : 'ghost')}>Tất cả đăng ký</Link>
    </nav>
    <section className={cardClass} aria-label="Danh sách đăng ký">
      <div className="space-y-2.5 border-b border-[#eef1f4] px-3 py-2.5">
        <div className="flex flex-wrap items-end gap-3">
          <SearchField value={search} onChange={q => update({ q: q || null })} label="Tìm theo trường, đoàn, đại diện hoặc Tour" placeholder="Tìm trường, đoàn, đại diện, Tour…" className="w-full lg:max-w-sm" />
          <label className="text-xs font-medium text-slate-600">Tour từ ngày (UTC+7)<input type="date" className={`${inputClass} mt-1`} value={from} onChange={e => update({ from: e.target.value || null })} /></label>
          <label className="text-xs font-medium text-slate-600">Tour đến ngày (UTC+7)<input type="date" className={`${inputClass} mt-1`} value={to} onChange={e => update({ to: e.target.value || null })} /></label>
          <label className="text-xs font-medium text-slate-600">Sắp xếp<select className={`${inputClass} mt-1`} value={sort} onChange={e => update({ sort: e.target.value })}>
            <option value="submittedAt">Gửi trước duyệt trước</option><option value="-submittedAt">Mới gửi trước</option><option value="-updatedAt">Mới cập nhật trước</option><option value="groupName">Tên đoàn</option>
          </select></label>
        </div>
        {mode === 'all' && <StageTabs<RegistrationState | 'all'> label="Lọc trạng thái đăng ký" value={state ?? 'all'} onChange={value => update({ state: value === 'all' ? null : value })}
          stages={[{ key: 'all', label: 'Tất cả', color: STATE_COLOR.all }, ...REGISTRATION_STATES.map(key => ({ key, label: REGISTRATION_STATE_LABEL[key].label, color: STATE_COLOR[key], separated: key === 'REJECTED' }))]} />}
      </div>
      {invalidRange ? <div className="p-4"><Notice tone="warn">Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.</Notice></div>
        : query.isError ? <div className="p-4"><AdminErrorPanel title="Không thể tải danh sách đăng ký." onRetry={() => void query.refetch()} /></div>
        : query.isLoading ? <SkeletonRows rows={5} label="Đang tải đăng ký" /> : rows.length === 0 ? <EmptyState title="Không có đăng ký khớp bộ lọc." action={page > 1 ? <button className={buttonClass('secondary', 'sm')} onClick={() => update({ page: null })}>Về trang đầu</button> : undefined} />
          : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left" aria-label="Đăng ký từ đại diện">
            <thead className="border-b border-[#e2e8f0]"><tr>{['Đoàn / Trường', 'Tour', 'Đại diện', 'Dòng lời mời', mode === 'pending' ? 'Đã chờ' : 'Trạng thái', ''].map((label, i) => <th key={i} scope="col" className={thClass}>{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">{rows.map(reg => <tr key={reg.id} onClick={() => open(reg.id)} className={`${rowClass} cursor-pointer`}>
              <td className={tdClass}><p className="font-semibold text-[#0f172a]">{reg.groupName}</p><p className="text-[11.5px] text-[#64748b]">{reg.schoolName}</p></td>
              <td className={tdClass}><p>{reg.tourName}</p><p className="text-[11.5px] text-[#64748b]">{reviewTime(reg.tourScheduledStartAt)}</p></td>
              <td className={tdClass}>{reg.representativeName}</td><td className={`${tdClass} tabular-nums`}>{reg.rowCount}</td>
              <td className={tdClass}>{mode === 'pending' ? <Waited since={reg.submittedAt} /> : <ReviewStateBadge state={reg.state} />}</td>
              <td className={`${tdClass} text-right`}><button type="button" onClick={(event) => { event.stopPropagation(); open(reg.id) }} className={buttonClass(reg.state === 'SUBMITTED' ? 'primary' : 'secondary', 'sm')}>Xem & duyệt<span className="sr-only"> {reg.groupName}</span></button></td>
            </tr>)}</tbody>
          </table></div>}
      {query.data && !query.isError && !invalidRange && <Pagination page={page} pageCount={Math.max(1, query.data.pagination.totalPages)} total={total} pageSize={10}
        onPage={value => update({ page: String(value) })} label="Phân trang đăng ký" />}
    </section>
    {reviewId && <ReviewDrawer key={reviewId} id={reviewId} onClose={close} />}
  </AdminPage>
}
