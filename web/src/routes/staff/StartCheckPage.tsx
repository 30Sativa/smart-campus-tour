import { useState } from 'react'
import { ChevronDown, CircleCheck, Play, TriangleAlert, WifiOff } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { notify } from '../../components/ui/toast-store'
import { buttonClass } from '../../components/ui/ui-classes'
import { formatDate, formatTime } from '../../components/ui/date-time'
import { useRequestId } from '../../features/administration/tours/hooks'
import type { StartConfirmation, TourStartChecks } from '../../features/administration/tours/types'
import { QuestLiveVideo } from '../../features/quest-stream/QuestLiveVideo'
import { DEV_QUEST_SOURCE, toQuestSource } from '../../features/quest-stream/stream-access'
import { cameraLeaseHint, useCameraLease } from '../../features/quest-stream/camera-lease'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { isTourStale, useOperationTour, useStartChecks, useStartTour } from '../../features/staff/operations/hooks'
import { useNow } from '../../features/staff/use-now'
import { blockerOwner, checkCountText, checkCounts, checkVerdict, opensAtText } from '../../features/staff/operations/operation-labels'
import { operationRefusal } from '../../features/staff/operations/operation-errors'
import { RobotStatusCard, RouteStopList, TourStateBadge } from '../../features/staff/operations/OperationParts'
import { BlockerList, CheckGroups } from '../../features/staff/operations/StartCheckList'
import { TourStepper } from '../../features/staff/operations/TourStepper'

/** The four on-site confirmations the Start request carries (SRS §7); the server records them. */
const CONFIRMATIONS: Array<{ key: keyof StartConfirmation; label: string; hint: string }> = [
  { key: 'robotPlaced', label: 'Robot ở đúng điểm xuất phát', hint: 'Vị trí robot báo khớp thực tế.' },
  { key: 'areaClear', label: 'Đường đi đầu tiên thông thoáng', hint: 'Không có người hay vật cản.' },
  { key: 'attendantPresent', label: 'Người phụ trách an toàn cạnh robot', hint: 'Sẵn sàng bấm nút dừng khẩn cấp trên robot.' },
  { key: 'previewChecked', label: 'Đã xem hình camera', hint: 'Hình rõ, đúng hướng.' },
]
const NONE: StartConfirmation = { robotPlaced: false, areaClear: false, attendantPresent: false, previewChecked: false }

const slotText = (value: string) => `${formatDate(value, { weekday: 'short' })} ${formatTime(value)}`

type Verdict = { tone: 'ok' | 'info' | 'warn'; title: string; note: string }
function verdictOf(result: TourStartChecks, confirmed: boolean, opensAt: string, now: number): Verdict {
  const causes = result.checks.filter(check => checkVerdict(check, result.blockedBy) === 'failed')
  const system = causes.filter(check => blockerOwner(check.id) === 'system').length
  const early = result.blockedBy.includes('withinStartWindow') && new Date(opensAt).getTime() > now
  const work = causes.length - system - (early ? 1 : 0)
  const rest = [work && `${work} việc cần xử lý`, system && `${system} giới hạn hệ thống chưa mở`].filter(Boolean).join(' và ')
  // Too early is the usual reason a Tour opened days ahead cannot start; say when, not just "not yet".
  if (!result.canStart && early)
    return { tone: 'warn', title: 'Chưa tới giờ bắt đầu', note: `Mở lúc ${opensAtText(opensAt, now)}. ${rest ? `Ngoài giờ, còn ${rest}.` : 'Các điều kiện khác đều đạt.'}` }
  if (!result.canStart) return { tone: 'warn', title: 'Chưa thể bắt đầu', note: rest ? `Còn ${rest}, xem bên dưới.` : 'Máy chủ chưa kiểm tra xong, chờ cập nhật.' }
  if (!confirmed) return { tone: 'info', title: 'Máy chủ cho phép bắt đầu', note: 'Đánh dấu đủ 4 xác nhận tại chỗ rồi bấm Bắt đầu.' }
  return { tone: 'ok', title: 'Sẵn sàng bắt đầu', note: 'Máy chủ sẽ kiểm tra lại mọi điều kiện khi bắt đầu.' }
}
/** One numbered step of the Start panel, so the server's part and the operator's part never read as one checklist. */
function StartStep({ number, done, title, status, note }: { number: number; done: boolean; title: string; status: string; note?: string }) {
  return <div className="mb-2.5 flex items-start gap-2.5" aria-label={`Bước ${number}: ${title}`} role="group">
    <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? 'bg-[#ecfdf3] text-[#15803d]' : 'bg-[#f1f5f9] text-[#475569]'}`}>
      {done ? <CircleCheck size={15} aria-hidden="true" /> : number}
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-[#0f172a]">Bước {number}. {title}</span>
        <span className={`shrink-0 rounded-full px-2 py-px text-[11px] font-bold tabular-nums ${done ? 'bg-[#ecfdf3] text-[#15803d]' : 'bg-[#fffaf0] text-[#8a5a06]'}`}>{status}</span>
      </span>
      {note && <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-muted">{note}</span>}
    </span>
  </div>
}

const VERDICT_STYLE = {
  ok: { box: 'border-[#b8dec9] bg-[#edf8f1] text-[#236344]', icon: CircleCheck },
  info: { box: 'border-[#d8e5f7] bg-[#f5f9ff] text-[#35507a]', icon: CircleCheck },
  warn: { box: 'border-[#f1dcb0] bg-[#fffaf0] text-[#7d5310]', icon: TriangleAlert },
}

/**
 * Pre-start check for one READY Tour (ADR-0042). It answers one question first,
 * "can this Tour start, and if not, why", with the root causes only; the full
 * check list stays one click away. Start and the on-site confirmations sit in
 * a column that stays in view. The server re-runs everything inside Start.
 */
export default function StartCheckPage() {
  const { tourId = '' } = useParams()
  const tour = useOperationTour(tourId)
  const ready = tour.data?.tour.state === 'READY'
  const checks = useStartChecks(tourId, ready)
  // ADR-0052: while this page is open the robot's camera stays on, so the preview is ready before Start.
  // ADR-0055: each renewal also brings the relay URL and this Staff user's token.
  const cameraLease = useCameraLease(ready ? tour.data?.reservation?.robotCode : null)
  const cameraSource = (cameraLease.isError ? null : toQuestSource(cameraLease.data?.stream)) ?? DEV_QUEST_SOURCE
  const start = useStartTour()
  const navigate = useNavigate()
  const [confirmation, setConfirmation] = useState<StartConfirmation>(NONE)
  const [confirming, setConfirming] = useState(false)
  const requestId = useRequestId(`start:${tourId}:${tour.data?.tour.rowVersion ?? ''}`)
  const now = useNow(1000)

  if (tour.isPending) return <StaffPage><LoadingPanel /></StaffPage>
  // A failed poll keeps the last answer on screen (marked old below); only a failed first load has nothing to show.
  if (!tour.data) return <StaffPage><ErrorPanel error={tour.error} onRetry={() => void tour.refetch()} /></StaffPage>
  const detail = tour.data
  const { tour: summary, reservation, operator } = detail
  const header = <>
    <TourStepper detail={detail} page="start" />
    <PageHeader eyebrow={summary.name} title="Kiểm tra trước khi bắt đầu"
      description={`${slotText(summary.scheduledStartAt)} · ${detail.routeRevision?.name ?? summary.routeName} · robot ${reservation?.robotCode ?? 'chưa giữ'} · người vận hành ${operator?.fullName ?? 'chưa giao'}`}
      action={<TourStateBadge tour={summary} />} />
  </>

  if (!ready) {
    const running = summary.state === 'RUNNING' || Boolean(detail.startedAt)
    return <StaffPage>{header}
      <div className={`${panelClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <p className="text-sm text-[#334155]">{summary.state === 'SCHEDULED' ? 'Tour chưa được chốt. Chỉ Tour đã chốt mới kiểm tra và bắt đầu được.' : running ? 'Tour đã bắt đầu. Theo dõi ở màn hình điều hành.' : 'Tour không còn bắt đầu được.'}</p>
        <Link to={running ? `/staff/live/${summary.id}` : `/staff/manage/tours/${summary.id}`} className={buttonClass('primary', 'sm')}>{running ? 'Mở điều hành' : 'Mở trang chuẩn bị Tour'}</Link>
      </div>
    </StaffPage>
  }

  const result = checks.data
  const blockedBy = result?.blockedBy ?? []
  const counts = checkCounts(result?.checks ?? [], blockedBy)
  const confirmed = CONFIRMATIONS.every(({ key }) => confirmation[key])
  // Start is decided on what the screen shows, so it waits while the checks or the Tour are out of date.
  const stale = Boolean(result) && (isTourStale(checks, now) || isTourStale(tour, now))
  const canStart = Boolean(result?.canStart) && confirmed && !stale
  const notOperator = blockedBy.includes('callerIsOperator')
  // The server opens Start a few minutes before the published time (ADR-0050); an older server omits it.
  const opensAt = result?.opensAt ?? summary.scheduledStartAt
  const verdict = result ? verdictOf(result, confirmed, opensAt, now) : null
  const refusal = start.isError ? operationRefusal(start.error, { operator: true }) : null
  const ticked = CONFIRMATIONS.filter(({ key }) => confirmation[key]).length
  const reason = !result ? null
    : stale ? 'Điều kiện chưa cập nhật được từ máy chủ. Chờ cập nhật lại rồi bắt đầu.'
    : notOperator ? `Chỉ ${operator?.fullName ?? 'người vận hành được giao'} mới bắt đầu được Tour này.`
    : !result.canStart && !confirmed ? 'Còn thiếu cả bước 1 và bước 2.'
    : !result.canStart ? 'Bước 2 đã xong. Nút còn khóa vì bước 1: máy chủ chưa cho phép.'
    : !confirmed ? 'Bước 1 đã đạt. Đánh dấu đủ 4 xác nhận ở bước 2.'
    : null

  return (
    <StaffPage wide>
      {header}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {!result ? <section className={`${panelClass} p-4`}>{checks.isError ? <ErrorPanel error={checks.error} onRetry={() => void checks.refetch()} /> : <LoadingPanel label="Đang tải điều kiện bắt đầu…" />}</section>
            : <>
              {stale && <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#f1dcb0] bg-[#fffaf0] px-4 py-3 text-[13px] leading-5 font-semibold text-[#7d5310]">
                <WifiOff size={16} className="mt-0.5 shrink-0" aria-hidden="true" />Không cập nhật được điều kiện từ máy chủ. Kết quả dưới đây có thể đã cũ, nên Bắt đầu tạm khóa.</p>}
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
          {/* The camera comes first: the operator watches it before ticking "Đã xem hình camera" and pressing Start. */}
          <section className={panelClass} aria-label="Hình camera">
            <PanelHead title="Hình camera" />
            <div className="p-3">{cameraSource ? <QuestLiveVideo source={cameraSource} label={reservation?.robotCode}
              offlineHint={cameraLeaseHint(cameraLease.data, cameraLease.isError)} />
              : <p className="text-[13px] leading-5 text-muted">{cameraLease.isPending && ready
                ? 'Đang xin quyền xem camera…'
                : 'Máy chủ chưa cấp luồng camera cho robot này. Xem hình trên thiết bị trước khi xác nhận.'}</p>}</div>
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

      <ConfirmationDialog open={confirming} title="Bắt đầu Tour?" confirmLabel="Bắt đầu" withReason={false} busyLabel="Đang bắt đầu…"
        description={<>Máy chủ kiểm tra lại mọi điều kiện, nhận robot <strong>{reservation?.robotCode}</strong>, chuyển Tour sang Đang diễn ra và tạo lệnh di chuyển tới {detail.routeRevision?.stops[0] ? <strong>{detail.routeRevision.stops[0].name}</strong> : 'điểm dừng đầu tiên'}. Robot lấy lệnh ở lần hỏi kế tiếp; trạng thái lệnh hiện ở màn hình điều hành.</>}
        busy={start.isPending} error={refusal?.message ?? null}
        onCancel={() => { if (!start.isPending) setConfirming(false) }}
        onConfirm={() => {
          // The Tour leaves READY as soon as the cache refreshes, so navigate from the promise.
          start.mutateAsync({ id: summary.id, requestId, rowVersion: summary.rowVersion, confirmation }).then(() => {
            notify({ title: `Đã bắt đầu Tour “${summary.name}”`, detail: 'Lệnh chặng đầu đã được tạo và đang chờ robot lấy. Theo dõi ở màn hình điều hành.' })
            navigate(`/staff/live/${summary.id}`)
          }, () => undefined)
        }} />
    </StaffPage>
  )
}
