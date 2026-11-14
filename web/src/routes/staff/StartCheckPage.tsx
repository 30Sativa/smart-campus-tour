import { ChevronDown, CircleCheck, Play, TriangleAlert, WifiOff } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { notify } from '../../components/ui/toast-store'
import { buttonClass } from '../../components/ui/ui-classes'
import { formatDate, formatTime } from '../../components/ui/date-time'
import { useRequestId } from '../../features/administration/tours/hooks'
import type { TourStartChecks } from '../../features/administration/tours/types'
import { QuestLiveVideo } from '../../features/quest-stream/QuestLiveVideo'
import { DEV_QUEST_SOURCE, toQuestSource } from '../../features/quest-stream/stream-access'
import { cameraLeaseHint, useCameraLease } from '../../features/quest-stream/camera-lease'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { isTourStale, useOpenTour, useOperationTour, useStartChecks } from '../../features/staff/operations/hooks'
import { useNow } from '../../features/staff/use-now'
import { blockerOwner, checkCountText, checkCounts, checkVerdict, opensAtText } from '../../features/staff/operations/operation-labels'
import { operationRefusal } from '../../features/staff/operations/operation-errors'
import { RobotStatusCard, RouteStopList, TourStateBadge } from '../../features/staff/operations/OperationParts'
import { BlockerList, CheckGroups } from '../../features/staff/operations/StartCheckList'
import { TourStepper } from '../../features/staff/operations/TourStepper'
import { HeadHomeButton } from '../../features/staff/operations/live/HeadHomeButton'

const slotText = (value: string) => `${formatDate(value, { weekday: 'short' })} ${formatTime(value)}`

type Verdict = { tone: 'ok' | 'warn'; title: string; note: string }
function verdictOf(result: TourStartChecks, opensAt: string, now: number): Verdict {
  const causes = result.checks.filter(check => checkVerdict(check, result.blockedBy) === 'failed')
  const system = causes.filter(check => blockerOwner(check.id) === 'system').length
  const early = result.blockedBy.includes('withinStartWindow') && new Date(opensAt).getTime() > now
  const work = causes.length - system - (early ? 1 : 0)
  const rest = [work && `${work} việc cần xử lý`, system && `${system} giới hạn hệ thống chưa mở`].filter(Boolean).join(' và ')
  // Too early is the usual reason a Tour opened days ahead cannot start; say when, not just "not yet".
  if (!result.canStart && early)
    return { tone: 'warn', title: 'Chưa tới giờ mở Tour', note: `Mở lúc ${opensAtText(opensAt, now)}. ${rest ? `Ngoài giờ, còn ${rest}.` : 'Các điều kiện khác đều đạt.'}` }
  if (!result.canStart) return { tone: 'warn', title: 'Chưa mở được Tour', note: rest ? `Còn ${rest}, xem bên dưới.` : 'Hệ thống chưa kiểm tra xong, chờ cập nhật.' }
  return { tone: 'ok', title: 'Mở được Tour', note: 'Robot chưa di chuyển khi mở Tour: bạn kiểm tra camera và robot rồi bấm Khởi hành.' }
}

const VERDICT_STYLE = {
  ok: { box: 'border-[#b8dec9] bg-[#edf8f1] text-[#236344]', icon: CircleCheck },
  warn: { box: 'border-[#f1dcb0] bg-[#fffaf0] text-[#7d5310]', icon: TriangleAlert },
}

/**
 * Opening one READY Tour (ADR-0042, opened without its first leg). It answers one question first, "can this Tour open,
 * and if not, why", with the root causes only; the full list stays one click away. Opening moves nothing: viewers, the
 * camera and the head go live, and the robot leaves only when the Operator presses Khởi hành on the operations console,
 * where the on-site confirmations and the movement checks are asked. The server re-runs every check inside Start.
 */
export default function StartCheckPage() {
  const { tourId = '' } = useParams()
  const tour = useOperationTour(tourId)
  const ready = tour.data?.tour.state === 'READY'
  const checks = useStartChecks(tourId, ready)
  // ADR-0052: while this page is open the robot's camera stays on, so the picture can be looked at before opening.
  // ADR-0055: each renewal also brings the relay URL and this Staff user's token.
  const cameraLease = useCameraLease(ready ? tour.data?.reservation?.robotCode : null)
  const cameraSource = (cameraLease.isError ? null : toQuestSource(cameraLease.data?.stream)) ?? DEV_QUEST_SOURCE
  const open = useOpenTour()
  const navigate = useNavigate()
  const requestId = useRequestId(`open:${tourId}:${tour.data?.tour.rowVersion ?? ''}`)
  const now = useNow(1000)

  if (tour.isPending) return <StaffPage><LoadingPanel /></StaffPage>
  // A failed poll keeps the last answer on screen (marked old below); only a failed first load has nothing to show.
  if (!tour.data) return <StaffPage><ErrorPanel error={tour.error} onRetry={() => void tour.refetch()} /></StaffPage>
  const detail = tour.data
  const { tour: summary, reservation, operator } = detail
  const header = <>
    <TourStepper detail={detail} page="start" />
    <PageHeader eyebrow={summary.name} title="Mở Tour"
      description={`${slotText(summary.scheduledStartAt)} · ${detail.routeRevision?.name ?? summary.routeName} · robot ${reservation?.robotCode ?? 'chưa giữ'} · người vận hành ${operator?.fullName ?? 'chưa giao'}`}
      action={<TourStateBadge tour={summary} />} />
  </>

  if (!ready) {
    const running = summary.state === 'RUNNING' || Boolean(detail.startedAt)
    return <StaffPage>{header}
      <div className={`${panelClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <p className="text-sm text-[#334155]">{summary.state === 'SCHEDULED' ? 'Tour chưa được chốt. Chỉ Tour đã chốt mới mở được.' : running ? 'Tour đã mở. Theo dõi ở màn hình điều hành.' : 'Tour không còn mở được.'}</p>
        <Link to={running ? `/staff/live/${summary.id}` : `/staff/manage/tours/${summary.id}`} className={buttonClass('primary', 'sm')}>{running ? 'Mở điều hành' : 'Mở trang chuẩn bị Tour'}</Link>
      </div>
    </StaffPage>
  }

  const result = checks.data
  const blockedBy = result?.blockedBy ?? []
  const counts = checkCounts(result?.checks ?? [], blockedBy)
  // Opening is decided on what the screen shows, so it waits while the checks or the Tour are out of date.
  const stale = Boolean(result) && (isTourStale(checks, now) || isTourStale(tour, now))
  const canOpen = Boolean(result?.canStart) && !stale
  const notOperator = blockedBy.includes('callerIsOperator')
  // The server opens Start a few minutes before the published time (ADR-0050); an older server omits it.
  const opensAt = result?.opensAt ?? summary.scheduledStartAt
  const verdict = result ? verdictOf(result, opensAt, now) : null
  const refusal = open.isError ? operationRefusal(open.error, { operator: true }) : null
  const reason = !result ? null
    : stale ? 'Điều kiện chưa cập nhật được từ máy chủ. Chờ cập nhật lại rồi mở Tour.'
    : notOperator ? `Chỉ ${operator?.fullName ?? 'người vận hành được giao'} mới mở được Tour này.`
    : !result.canStart ? 'Xử lý các mục ở phần Cần xử lý trước.'
    : null
  const openTour = () => {
    open.reset()
    open.mutateAsync({ id: summary.id, requestId, rowVersion: summary.rowVersion }).then(() => {
      notify({ title: `Đã mở Tour “${summary.name}”`, detail: 'Robot chưa di chuyển. Kiểm tra camera và robot rồi bấm Khởi hành.' })
      navigate(`/staff/live/${summary.id}`)
    }, () => undefined)
  }

  return (
    <StaffPage wide>
      {header}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {!result ? <section className={`${panelClass} p-4`}>{checks.isError ? <ErrorPanel error={checks.error} onRetry={() => void checks.refetch()} /> : <LoadingPanel label="Đang tải điều kiện mở Tour…" />}</section>
            : <>
              {stale && <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#f1dcb0] bg-[#fffaf0] px-4 py-3 text-[13px] leading-5 font-semibold text-[#7d5310]">
                <WifiOff size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Không cập nhật được điều kiện từ máy chủ. Kết quả dưới đây có thể đã cũ, nên Mở Tour tạm khóa.</p>}
              <section className={panelClass} aria-label="Kết luận">
                {verdict && (() => {
                  const style = VERDICT_STYLE[verdict.tone]
                  return <div className={`m-3 flex items-start gap-3 rounded-xl border px-4 py-3 ${style.box}`} role="status">
                    <style.icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold">{verdict.title}</p>
                      <p className="text-[13px] leading-5">{verdict.note}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-bold tabular-nums">{counts.passed}/{counts.counted} đạt</span>
                  </div>
                })()}
                {!result.canStart && <div className="border-t border-[#f1f5f9] px-4 pt-3 pb-4">
                  <h2 className="mb-2 text-xs font-semibold text-muted">Cần xử lý</h2>
                  <BlockerList checks={result.checks} blockedBy={blockedBy} opensAt={opensAt} now={now} />
                </div>}
              </section>
              {/* Folded by default: the verdict and "Cần xử lý" answer the question; the full list is for looking closer. */}
              <details className={`${panelClass} group/all`} aria-label="Toàn bộ điều kiện">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 text-[14px] font-semibold text-[#0f172a]">Toàn bộ điều kiện</span>
                  <span className="text-xs font-semibold tabular-nums text-muted">{checkCountText(counts)}</span>
                  <ChevronDown size={16} aria-hidden="true" className="text-muted transition-transform duration-150 group-open/all:rotate-180 motion-reduce:transition-none" />
                </summary>
                <div className="border-t border-[#f1f5f9] px-3 py-1.5"><CheckGroups checks={result.checks} blockedBy={blockedBy} now={now} /></div>
              </details>
            </>}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <section className={panelClass} aria-label="Mở Tour">
            <PanelHead title="Mở Tour" description="Khách vào xem, camera và đầu quay hoạt động. Robot chỉ chạy khi bạn bấm Khởi hành." />
            <div className="p-4">
              <button type="button" disabled={!canOpen || notOperator || open.isPending} onClick={openTour} className={`${buttonClass('primary', 'lg')} w-full`} aria-describedby={reason ? 'open-reason' : undefined}>
                <Play size={18} aria-hidden="true" />{open.isPending ? 'Đang mở…' : 'Mở Tour'}
              </button>
              {reason && <p id="open-reason" className="mt-2 text-xs leading-5 text-[#7d5310]">{reason}</p>}
              {refusal && <p role="alert" className="mt-2 text-xs leading-5 font-semibold text-[#9d3428]">{refusal.message}</p>}
            </div>
          </section>
          <section className={panelClass} aria-label="Hình camera">
            <PanelHead title="Hình camera" />
            <div className="p-3">{cameraSource ? <QuestLiveVideo source={cameraSource} label={reservation?.robotCode}
              offlineHint={cameraLeaseHint(cameraLease.data, cameraLease.isError)} />
              : <p className="text-[13px] leading-5 text-muted">{cameraLease.isPending && ready
                ? 'Đang xin quyền xem camera…'
                : 'Máy chủ chưa cấp luồng camera cho robot này.'}</p>}</div>

                : 'Máy chủ chưa cấp luồng camera cho robot này. Xem hình trên thiết bị trước khi xác nhận.'}</p>}</div>
            {/* Re-align the head against its stops while the robot waits at the start, then check the picture. */}
            <div className="border-t border-[#f1f5f9] p-3">
              <HeadHomeButton tourId={summary.id} isOperator={!notOperator} operatorName={operator?.fullName} />
            </div>
          </section>
          <section className={panelClass} aria-label="Bắt đầu Tour">
            <PanelHead title="Bắt đầu Tour" description="Nút chỉ mở khi đạt cả 2 bước dưới đây." />
            <div className="p-4">
              <StartStep number={1} done={Boolean(result?.canStart)} title="Máy chủ cho phép"
                status={!result ? '…' : result.canStart ? 'Đạt' : counts.failed ? `Còn ${counts.failed} mục chặn` : `${counts.notRun} mục chưa kiểm tra`}
                note={result && !result.canStart ? 'Các mục còn chặn nằm ở phần Cần xử lý.' : undefined} />
              {!notOperator && <StartStep number={2} done={confirmed} title="Xác nhận tại chỗ" status={`${ticked}/4`}
                note="Bạn tự đánh dấu khi đang đứng cạnh robot." />}
              {!notOperator && <fieldset className="mb-3 ml-8 space-y-1.5">
                <legend className="sr-only">Xác nhận tại chỗ</legend>
                {CONFIRMATIONS.map(({ key, label, hint }) => (
                  <label key={key} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors duration-150 motion-reduce:transition-none ${confirmation[key] ? 'border-[#bfdbfe] bg-[#eff6ff]' : 'border-[#e2e8f0] hover:border-[#bfdbfe]'}`}>
                    <input type="checkbox" checked={confirmation[key]} onChange={event => setConfirmation(value => ({ ...value, [key]: event.target.checked }))} className="mt-0.5 size-4 accent-[#2563eb]" />
                    <span className="min-w-0"><span className="block text-[13px] font-semibold text-[#0f172a]">{label}</span><span className="block text-[11.5px] text-muted">{hint}</span></span>
                  </label>
                ))}
              </fieldset>}
              <button type="button" disabled={!canStart || start.isPending} onClick={() => { start.reset(); setConfirming(true) }} className={`${buttonClass('primary', 'lg')} w-full`} aria-describedby={reason ? 'start-reason' : undefined}>
                <Play size={18} aria-hidden="true" />Bắt đầu Tour
              </button>
              {reason && <p id="start-reason" className="mt-2 text-xs leading-5 text-[#7d5310]">{reason}</p>}
            </div>
          </section>
          <section className={panelClass} aria-label="Robot"><RobotStatusCard robotCode={reservation?.robotCode} /></section>
          <section className={panelClass} aria-label="Tuyến của Tour">
            <PanelHead title="Tuyến" description={`${summary.registrationCount} đoàn đăng ký · ${summary.invitationCount} lời mời`} />
            <div className="px-4 py-2"><RouteStopList detail={detail} /></div>
          </section>
        </aside>
      </div>
    </StaffPage>
  )
}
