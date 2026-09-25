import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, Ban, CalendarClock, ExternalLink, Lock, LockOpen, Pencil, Route as RouteIcon } from 'lucide-react'
import type { AdminTourDetail } from '../../api/contracts/admin'
import { Field, PanelHead, panelClass } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { eventTypeLabel } from '../../features/staff/status'
import { AdminErrorPanel, AdminPage, EmptyState, Notice, SkeletonRows, TourStateBadge } from '../../features/administration/AdminUi'
import { useAdminTour } from '../../features/administration/admin-hooks'
import { formatSlot, formatStamp } from '../../features/administration/admin-format'
import { ADMIN_EVENT_LABEL, readAdminError } from '../../features/administration/admin-status'
import { ReadyChecklist, RegistrationSummary } from '../../features/administration/components/TourParts'
import { AdminRegistrationTable } from '../../features/administration/components/RegistrationParts'
import { RegistrationReviewDrawer } from '../../features/administration/components/RegistrationReviewDrawer'
import { RoutePreview } from '../../features/administration/components/RoutePreview'
import { CancelTourDialog, FinalizeTourDialog, ReopenTourDialog } from '../../features/administration/components/TourDialogs'
import { useReviewParam } from '../../features/administration/use-review-param'

type Tab = 'overview' | 'registrations' | 'route' | 'activity'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'registrations', label: 'Đăng ký' },
  { id: 'route', label: 'Tuyến' },
  { id: 'activity', label: 'Hoạt động' },
]

/**
 * One Tour, for Admin (scope §11.1 "Chi tiết buổi"): edit while Scheduled,
 * Chốt / Mở lại / Hủy by state, why it is not READY yet, its groups, its route
 * and its log. A Running or finished Tour is read-only here: running it is
 * Staff's, in the operations console.
 */
export default function AdminTourDetailPage() {
  const { tourId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((item) => item.id === params.get('tab'))?.id ?? 'overview') as Tab
  const query = useAdminTour(tourId)
  const { reviewId, open: review, close: closeReview } = useReviewParam()
  const [dialog, setDialog] = useState<'finalize' | 'reopen' | 'cancel' | null>(null)
  const tour = query.data

  const setTab = (next: Tab) => setParams((current) => {
    const copy = new URLSearchParams(current)
    if (next === 'overview') copy.delete('tab')
    else copy.set('tab', next)
    return copy
  }, { replace: true })

  if (query.isError) {
    const error = readAdminError(query.error)
    return (
      <AdminPage>
        <BackLink />
        <AdminErrorPanel title={error.code === 'NotFound' ? 'Không tìm thấy Tour này.' : 'Không thể tải Tour.'} onRetry={error.code === 'NotFound' ? undefined : () => void query.refetch()} />
      </AdminPage>
    )
  }
  if (!tour) return <AdminPage><BackLink /><SkeletonRows rows={6} label="Đang tải Tour" /></AdminPage>

  const reload = () => void query.refetch()

  return (
    <AdminPage>
      <BackLink />
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl leading-tight font-bold tracking-[-0.025em] text-[#1c1c1c] sm:text-[28px]">{tour.name}</h1>
            <TourStateBadge state={tour.state} size="md" />
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#6b6e75]">
            <span className="font-mono text-[13px]">{tour.code}</span>
            <span className="inline-flex items-center gap-1.5"><CalendarClock size={15} aria-hidden="true" />{formatSlot(tour.scheduledAt)}</span>
            <span className="inline-flex items-center gap-1.5"><RouteIcon size={15} aria-hidden="true" />{tour.routeName}</span>
          </p>
        </div>
        <TourActions tour={tour} onOpen={setDialog} />
      </header>

      <StateNotice tour={tour} />

      <div role="tablist" aria-label="Nội dung Tour" className="mb-5 flex gap-1 overflow-x-auto border-b border-[#e3e3dc]">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`tab-${item.id}`}
            onClick={() => setTab(item.id)}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-[color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9cc93a] sm:px-4 ${tab === item.id ? 'border-[#1c1c1c] text-[#1c1c1c]' : 'border-transparent text-[#6b6e75] hover:border-[#c6c7cc] hover:text-[#1c1c1c]'}`}
          >
            {item.label}
            {item.id === 'registrations' && tour.counts.submitted > 0 && <span className="rounded-full bg-[#fff1d6] px-1.5 text-[11px] text-[#92400e] tabular-nums">{tour.counts.submitted}</span>}
          </button>
        ))}
      </div>

      <div key={tab} id={`tab-${tab}`} role="tabpanel" className="transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none">
        {tab === 'overview' && <Overview tour={tour} onShowRegistrations={() => setTab('registrations')} />}
        {tab === 'registrations' && (
          <section className={panelClass} aria-label="Đăng ký của Tour">
            <PanelHead title="Đăng ký đoàn" description={tour.state === 'Scheduled' ? 'Duyệt hoặc từ chối từng đoàn; gửi thông tin tham gia cho đoàn đã duyệt.' : tour.state === 'Ready' ? 'Danh sách đã chốt. Vẫn gửi / gửi lại được thông tin tham gia. Mở lại Tour để duyệt thay đổi.' : 'Chỉ xem.'} />
            {tour.registrations.length === 0 ? (
              <EmptyState title="Chưa có đoàn đăng ký cho Tour này." description="Đại diện trường đăng ký khi Tour đang chuẩn bị." />
            ) : (
              <AdminRegistrationTable registrations={tour.registrations} onReview={review} label="Đăng ký của Tour" />
            )}
          </section>
        )}
        {tab === 'route' && (
          <section className={panelClass} aria-label="Tuyến của Tour">
            <PanelHead title="Tuyến" description={tour.state === 'Scheduled' ? 'Đổi tuyến trong phần Sửa Tour. Nội dung tuyến do nhóm kỹ thuật cấu hình.' : 'Tuyến đã khóa cùng Tour.'} />
            <div className="p-5">{tour.route ? <RoutePreview route={tour.route} /> : <Notice tone="danger">Tuyến của Tour không còn trong cấu hình.</Notice>}</div>
          </section>
        )}
        {tab === 'activity' && <Activity tour={tour} />}
      </div>

      <FinalizeTourDialog tour={tour} open={dialog === 'finalize'} onClose={() => setDialog(null)} onReload={reload} />
      <ReopenTourDialog tour={tour} open={dialog === 'reopen'} onClose={() => setDialog(null)} onReload={reload} />
      <CancelTourDialog tour={tour} open={dialog === 'cancel'} onClose={() => setDialog(null)} onReload={reload} />
      <RegistrationReviewDrawer registrationId={reviewId} onClose={closeReview} />
    </AdminPage>
  )
}

function BackLink() {
  return <Link to="/admin/tours" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#4d6410] hover:underline"><ArrowLeft size={15} aria-hidden="true" />Danh sách Tour</Link>
}

/** Actions by state, on the right of the header. Only what the server allows is enabled. */
function TourActions({ tour, onOpen }: { tour: AdminTourDetail; onOpen: (dialog: 'finalize' | 'reopen' | 'cancel') => void }) {
  const { edit, finalize, reopen, cancel } = tour.allowedActions
  if (tour.state === 'Running' || tour.state === 'Completed' || tour.state === 'Cancelled') {
    return tour.state === 'Running' ? (
      <Link to={`/staff/tours/${tour.id}`} className={buttonClass('secondary')}>Xem ở khu vận hành<ExternalLink size={15} aria-hidden="true" /></Link>
    ) : null
  }
  return (
    <div className="flex flex-col items-stretch gap-2 lg:items-end">
      <div className="flex flex-wrap gap-2">
        {edit.allowed && <Link to={`/admin/tours/${tour.id}/edit`} className={buttonClass('secondary')}><Pencil size={15} aria-hidden="true" />Sửa</Link>}
        {cancel.allowed && <button type="button" onClick={() => onOpen('cancel')} className={buttonClass('danger')}><Ban size={15} aria-hidden="true" />Hủy Tour</button>}
        {tour.state === 'Ready' && <button type="button" onClick={() => onOpen('reopen')} disabled={!reopen.allowed} className={buttonClass('secondary')}><LockOpen size={15} aria-hidden="true" />Mở lại Tour</button>}
        {tour.state === 'Scheduled' && <button type="button" onClick={() => onOpen('finalize')} disabled={!finalize.allowed} aria-describedby={finalize.allowed ? undefined : 'finalize-why'} className={`${buttonClass('primary')} order-first w-full sm:order-none sm:w-auto`}><Lock size={15} aria-hidden="true" />Chốt Tour</button>}
      </div>
      {tour.state === 'Scheduled' && !finalize.allowed && <p id="finalize-why" className="max-w-md text-xs text-[#92400e] lg:text-right">Chưa chốt được: xem “Tình trạng chuẩn bị” bên dưới.</p>}
    </div>
  )
}

function StateNotice({ tour }: { tour: AdminTourDetail }) {
  if (tour.state === 'Ready') return <div className="mb-4"><Notice>Tour đã chốt: thông tin, tuyến và danh sách đoàn đã khóa. Staff kiểm tra robot, đầu xoay và nguồn hình rồi bắt đầu. Cần sửa? Mở lại Tour trước khi Staff bắt đầu.</Notice></div>
  if (tour.state === 'Running') return <div className="mb-4"><Notice>Tour đang diễn ra do Staff điều hành. Admin chỉ xem; kết thúc sớm là thao tác của Staff.</Notice></div>
  if (tour.state === 'Completed') return <div className="mb-4"><Notice>Tour đã hoàn thành. Chỉ xem.</Notice></div>
  if (tour.state === 'Cancelled') return <div className="mb-4"><Notice tone="danger">Tour đã hủy{tour.endReason ? `: ${tour.endReason}` : ''}. Chỉ xem.</Notice></div>
  return null
}

function Overview({ tour, onShowRegistrations }: { tour: AdminTourDetail; onShowRegistrations: () => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <section className={panelClass} aria-label="Thông tin Tour">
          <PanelHead title="Thông tin Tour" />
          <dl className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="Tên Tour">{tour.name}</Field>
            <Field label="Mã">{tour.code}</Field>
            <Field label="Thời gian dự kiến">{formatSlot(tour.scheduledAt)}</Field>
            <Field label="Tuyến">{tour.routeName}{tour.route ? ` · ${tour.route.stops.length} POI` : ''}</Field>
            <div className="sm:col-span-2"><Field label="Mô tả"><span className="font-normal leading-6 text-[#3a3d44]">{tour.description}</span></Field></div>
            <Field label="Tạo lúc">{formatStamp(tour.createdAt)}</Field>
            {tour.startedAt && <Field label="Bắt đầu">{formatStamp(tour.startedAt)}</Field>}
            {tour.endedAt && <Field label="Kết thúc">{formatStamp(tour.endedAt)}</Field>}
            {tour.endReason && <div className="sm:col-span-2"><Field label="Lý do kết thúc">{tour.endReason}</Field></div>}
          </dl>
        </section>
        <section className={panelClass} aria-label="Tổng hợp đăng ký">
          <PanelHead title="Đăng ký đoàn" action={<button type="button" onClick={onShowRegistrations} className={buttonClass('ghost', 'sm')}>Xem danh sách</button>} />
          <div className="p-5"><RegistrationSummary counts={tour.counts} /></div>
        </section>
      </div>
      <section className={panelClass} aria-label="Tình trạng chuẩn bị">
        <PanelHead title="Tình trạng chuẩn bị" description="Điều kiện để chốt Tour sang Sẵn sàng, do máy chủ kiểm tra." />
        <div className="p-5">
          {tour.state === 'Scheduled' ? (
            <ReadyChecklist checks={tour.readyChecklist} />
          ) : tour.state === 'Ready' ? (
            <p className="text-sm leading-6 text-[#3a3d44]">Tour đã được chốt. Danh sách {tour.counts.approved} đoàn đã duyệt được khóa.</p>
          ) : (
            <p className="text-sm leading-6 text-[#3a3d44]">Không áp dụng: Tour {tour.state === 'Running' ? 'đang diễn ra' : 'đã kết thúc'}.</p>
          )}
        </div>
      </section>
    </div>
  )
}

/** The Tour's log as the backend recorded it; nothing is reconstructed here. */
function Activity({ tour }: { tour: AdminTourDetail }) {
  const events = [...tour.events].reverse()
  return (
    <section className={panelClass} aria-label="Hoạt động">
      <PanelHead title="Hoạt động" description="Nhật ký do máy chủ ghi, mới nhất ở trên." />
      {events.length === 0 ? (
        <EmptyState title="Chưa có hoạt động nào được ghi." />
      ) : (
        <ol className="divide-y divide-[#efefe9]">
          {events.map((event) => (
            <li key={event.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:gap-4">
              <time dateTime={event.occurredAt} className="w-36 shrink-0 text-xs text-[#8e9096] tabular-nums">{formatStamp(event.occurredAt)}</time>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#1c1c1c]">{ADMIN_EVENT_LABEL[event.type] ?? eventTypeLabel(event.type)}{event.actor && <span className="font-normal text-[#8e9096]"> · {event.actor}</span>}</p>
                {event.detail && <p className="text-[13px] leading-5 text-[#4a4f59]">{event.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
