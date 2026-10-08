import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PageHeader, Pagination, SearchField } from '../../components/ui/ConsolePrimitives'
import { usePagination } from '../../components/ui/use-pagination'
import { AdminErrorPanel, AdminPage, DateRangeFilter, EmptyState, SkeletonRows } from '../../features/administration/AdminUi'
import { useAdminRegistrations } from '../../features/administration/admin-hooks'
import { formatShortDay, rangeFor, type DateRangeKey } from '../../features/administration/admin-format'
import { cardClass } from '../../features/administration/admin-visual'
import { InvitationDialog } from '../../features/administration/components/InvitationDialog'
import { RegistrationRows } from '../../features/administration/components/RegistrationRows'
import { REG_STAGE, REG_STAGES, regStage, type RegStage } from '../../features/administration/registration-stage'
import { RegistrationReviewDrawer } from '../../features/administration/components/RegistrationReviewDrawer'
import { StageHint, StageTabs } from '../../components/ui/StageTabs'
import { useReviewParam } from '../../features/administration/use-review-param'

const DATE_OPTIONS: Array<{ value: DateRangeKey; label: string }> = [
  { value: 'all', label: 'Mọi ngày' },
  { value: 'today', label: 'Tour hôm nay' },
  { value: 'week', label: 'Tour tuần này' },
  { value: 'custom', label: 'Khoảng ngày' },
]
const PAGE = 10

/**
 * Group registrations across Tours. `pending` is the review queue ("Chờ
 * duyệt"). "Tất cả đăng ký" shows one stage of the review flow at a time
 * (Chờ duyệt › Chưa gửi thông tin › Đã gửi thông tin, then Từ chối · Đã hủy),
 * one line per group, with the Tour picked from a list. Oldest submission first.
 */
export default function AdminRegistrationsPage({ mode }: { mode: 'pending' | 'all' }) {
  const [params, setParams] = useSearchParams()
  const { reviewId, open, close } = useReviewParam()
  const [inviting, setInviting] = useState<string | null>(null)
  const q = params.get('q') ?? ''
  const stageParam = params.get('stage') as RegStage | null
  const stage: RegStage = mode === 'pending' ? 'wait' : stageParam && REG_STAGES.includes(stageParam) ? stageParam : 'wait'
  const tourId = mode === 'all' ? params.get('tour') ?? '' : ''
  const date = (params.get('date') as DateRangeKey | null) ?? 'all'
  const custom = { from: params.get('from') ?? '', to: params.get('to') ?? '' }
  const range = rangeFor(date, new Date(), custom)
  const base = useMemo(() => ({ q: q.trim() || undefined, from: range.from, to: range.to }), [q, range.from, range.to])
  const query = useAdminRegistrations(base)

  const update = (changes: Record<string, string | null>) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    }, { replace: true })

  const all = useMemo(() => query.data ?? [], [query.data])
  const tours = useMemo(() => {
    const map = new Map<string, { id: string; code: string; at: string; n: number }>()
    for (const reg of all) {
      const row = map.get(reg.tourId) ?? { id: reg.tourId, code: reg.tourCode, at: reg.tourScheduledAt, n: 0 }
      row.n += 1
      map.set(reg.tourId, row)
    }
    return [...map.values()].sort((a, b) => a.at.localeCompare(b.at))
  }, [all])
  const inTour = tourId ? all.filter((reg) => reg.tourId === tourId) : all
  const rows = inTour.filter((reg) => regStage(reg) === stage).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  const filtered = Boolean(q || date !== 'all' || tourId)
  const paged = usePagination(rows, PAGE, `${mode}|${q}|${stage}|${tourId}|${date}|${custom.from}|${custom.to}`)
  const S = REG_STAGE[stage]

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Đăng ký đoàn"
        title={mode === 'pending' ? 'Đăng ký chờ duyệt' : 'Tất cả đăng ký'}
        description={mode === 'pending' ? 'Đoàn đã gửi danh sách và đang chờ quyết định. Duyệt hoặc từ chối (kèm lý do) khi Tour còn đang chuẩn bị.' : 'Từng bước của luồng duyệt: chờ duyệt, chưa gửi thông tin, đã gửi thông tin, cùng các đăng ký đã từ chối hoặc hủy.'}
      />

      <section className={cardClass} aria-label="Danh sách đăng ký">
        <div className="flex flex-col gap-3 border-b border-[#f1f2f4] px-3.5 py-2.5 xl:flex-row xl:items-center xl:justify-between">
          {mode === 'all' ? (
            <StageTabs<RegStage>
              label="Lọc theo bước duyệt"
              value={stage}
              onChange={(value) => update({ stage: value })}
              stages={REG_STAGES.map((key) => ({ key, label: REG_STAGE[key].label, color: REG_STAGE[key].color, count: query.data ? inTour.filter((reg) => regStage(reg) === key).length : undefined, separated: key === 'rej' }))}
            />
          ) : <span className="hidden xl:block" />}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start xl:justify-end">
            {mode === 'all' && (
              <label className="relative">
                <span className="sr-only">Lọc theo Tour</span>
                <select value={tourId} onChange={(event) => update({ tour: event.target.value || null })} className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white pr-8 pl-3 text-[12.5px] text-[#374151] focus-visible:border-[#5b9dc9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]/30 sm:w-56">
                  <option value="">Tất cả Tour ({all.length})</option>
                  {tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.code} · {formatShortDay(tour.at)} ({tour.n})</option>)}
                </select>
              </label>
            )}
            <SearchField value={q} onChange={(value) => update({ q: value || null })} label="Tìm theo trường, đại diện hoặc Tour" placeholder="Tìm theo trường, đại diện, Tour..." className="w-full sm:w-64" />
            <DateRangeFilter label="Lọc theo ngày Tour" value={date} from={custom.from} to={custom.to} options={DATE_OPTIONS} onChange={(next) => update({ date: next.date === 'all' ? null : next.date, from: next.from || null, to: next.to || null })} />
          </div>
        </div>

        {query.isError ? (
          <div className="p-5"><AdminErrorPanel title="Không thể tải danh sách đăng ký." onRetry={() => void query.refetch()} /></div>
        ) : query.isLoading ? (
          <SkeletonRows rows={5} label="Đang tải đăng ký" />
        ) : (
          <>
            <StageHint color={S.color} title={mode === 'pending' ? 'Chờ duyệt' : S.label} count={`${rows.length} đoàn · ${rows.reduce((s, reg) => s + reg.studentCount, 0)} học sinh`} note={S.note} />
            {rows.length === 0 ? (
              stage === 'wait' && !filtered ? (
                <EmptyState title="Tất cả đăng ký đã được xử lý." description="Không còn đoàn nào chờ duyệt." />
              ) : (
                <EmptyState title="Không có đăng ký nào khớp bộ lọc." />
              )
            ) : (
              <>
                <RegistrationRows registrations={paged.rows} onReview={open} onInvite={setInviting} label={mode === 'pending' ? 'Đăng ký chờ duyệt' : `Đăng ký: ${S.label.toLowerCase()}`} />
                {paged.pageCount > 1 && <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onPage={paged.setPage} label="Phân trang đăng ký" />}
              </>
            )}
          </>
        )}
      </section>

      <RegistrationReviewDrawer registrationId={reviewId} onClose={close} />
      <InvitationDialog registrationId={inviting} onClose={() => { setInviting(null); void query.refetch() }} />
    </AdminPage>
  )
}
