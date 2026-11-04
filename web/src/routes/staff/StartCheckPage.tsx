import { useState } from 'react'
import { ArrowLeft, Play } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { notify } from '../../components/ui/toast-store'
import { buttonClass } from '../../components/ui/ui-classes'
import { formatSlot } from '../../features/administration/admin-format'
import { useRequestId } from '../../features/administration/tours/hooks'
import type { StartConfirmation } from '../../features/administration/tours/types'
import { QuestLiveVideo } from '../../features/quest-stream/QuestLiveVideo'
import { QUEST_WHEP_URL } from '../../features/quest-stream/quest-stream-config'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { useOperationTour, useStartChecks, useStartTour } from '../../features/staff/operations/hooks'
import { checkInfo, checkVerdict } from '../../features/staff/operations/operation-labels'
import { operationRefusal } from '../../features/staff/operations/operation-errors'
import { RobotTelemetryPanel, RouteStopList, SystemGateNotice, TourStateBadge } from '../../features/staff/operations/OperationParts'
import { StartCheckList } from '../../features/staff/operations/StartCheckList'

/** The four on-site confirmations the Start request carries (SRS §7); the server records them. */
const CONFIRMATIONS: Array<{ key: keyof StartConfirmation; label: string; hint: string }> = [
  { key: 'robotPlaced', label: 'Robot đặt đúng điểm xuất phát của tuyến', hint: 'Vị trí robot báo khớp vị trí thực tế.' },
  { key: 'areaClear', label: 'Khu vực xuất phát và chặng đầu thông thoáng', hint: 'Không có người hay vật cản trên đường đi đầu tiên.' },
  { key: 'attendantPresent', label: 'Người phụ trách an toàn đứng cạnh robot', hint: 'Đi kèm robot suốt buổi, sẵn sàng bấm nút dừng khẩn cấp trên robot.' },
  { key: 'previewChecked', label: 'Đã xem hình camera của robot', hint: 'Hình rõ, đúng hướng trước khi học sinh vào xem.' },
]
const NONE: StartConfirmation = { robotPlaced: false, areaClear: false, attendantPresent: false, previewChecked: false }

/**
 * Pre-start check for one READY Tour (ADR-0042). The server evaluates every
 * Start condition from real data; the operator adds the on-site confirmations
 * and presses Start. The button follows the server's `canStart`, and the server
 * re-runs everything inside the Start transaction.
 */
export default function StartCheckPage() {
  const { tourId = '' } = useParams()
  const tour = useOperationTour(tourId)
  const ready = tour.data?.tour.state === 'READY'
  const checks = useStartChecks(tourId, ready)
  const start = useStartTour()
  const navigate = useNavigate()
  const [confirmation, setConfirmation] = useState<StartConfirmation>(NONE)
  const [confirming, setConfirming] = useState(false)
  const requestId = useRequestId(`start:${tourId}:${tour.data?.tour.rowVersion ?? ''}`)

  if (tour.isPending) return <StaffPage><LoadingPanel /></StaffPage>
  if (tour.isError) return <StaffPage><ErrorPanel error={tour.error} onRetry={() => void tour.refetch()} /></StaffPage>
  const detail = tour.data
  const { tour: summary, reservation, operator } = detail
  const header = <>
    <Link to="/staff/tours" className={`${buttonClass('ghost', 'sm')} mb-3 -ml-2`}><ArrowLeft size={15} aria-hidden="true" />Buổi hôm nay</Link>
    <PageHeader eyebrow="Kiểm tra trước khi bắt đầu" title={summary.name}
      description={`${formatSlot(summary.scheduledStartAt)} · ${detail.routeRevision?.name ?? summary.routeName} · robot ${reservation?.robotCode ?? 'chưa giữ'} · người vận hành ${operator?.fullName ?? 'chưa giao'}`}
      action={<TourStateBadge state={summary.state} />} />
  </>

  if (!ready) {
    const running = summary.state === 'RUNNING' || Boolean(detail.startedAt)
    return <StaffPage>{header}
      <div className={`${panelClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <p className="text-sm text-[#334155]">{summary.state === 'SCHEDULED' ? 'Tour chưa được chốt. Chỉ Tour đã chốt (READY) mới kiểm tra và bắt đầu được.' : running ? 'Tour đã bắt đầu. Theo dõi ở màn hình điều hành.' : 'Tour không còn bắt đầu được.'}</p>
        <Link to={running ? `/staff/live/${summary.id}` : `/staff/manage/tours/${summary.id}`} className={buttonClass('primary', 'sm')}>{running ? 'Mở điều hành' : 'Mở trang chuẩn bị Tour'}</Link>
      </div>
    </StaffPage>
  }

  const result = checks.data
  const blockedBy = result?.blockedBy ?? []
  const counted = result?.checks.filter(check => checkVerdict(check, blockedBy) !== 'info') ?? []
  const passed = counted.filter(check => check.passed).length
  const confirmed = CONFIRMATIONS.every(({ key }) => confirmation[key])
  const canStart = Boolean(result?.canStart) && confirmed
  const notOperator = blockedBy.includes('callerIsOperator')
  const reason = !result ? (checks.isError ? 'Không tải được điều kiện bắt đầu từ máy chủ.' : 'Đang tải điều kiện từ máy chủ…')
    : notOperator ? `Chỉ người vận hành được giao${operator ? ` (${operator.fullName})` : ''} mới bắt đầu được Tour này.`
    : !result.canStart ? `Chưa thể bắt đầu: ${blockedBy.map(id => checkInfo(id).label).join('; ')}.`
    : !confirmed ? 'Đánh dấu đủ 4 xác nhận tại chỗ để bắt đầu.'
    : 'Đủ điều kiện. Máy chủ sẽ kiểm tra lại mọi điều kiện khi bắt đầu.'
  const refusal = start.isError ? operationRefusal(start.error, { operator: true }) : null

  return (
    <StaffPage wide>
      {header}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.9fr)]">
        <div className="space-y-4">
          {result && <SystemGateNotice checks={result.checks} />}
          <section className={panelClass} aria-label="Điều kiện bắt đầu">
            <PanelHead title="Điều kiện từ máy chủ" description="Đọc từ dữ liệu thật, cập nhật vài giây một lần."
              action={result ? <span className={`rounded-full px-3 py-1 text-xs font-bold tabular-nums ${passed === counted.length ? 'bg-[#ecfdf3] text-[#15803d]' : 'bg-[#fffaf0] text-[#7d5310]'}`}>{passed}/{counted.length} đạt</span> : undefined} />
            <div className="p-4">
              {result ? <StartCheckList checks={result.checks} blockedBy={blockedBy} />
                : checks.isError ? <ErrorPanel error={checks.error} onRetry={() => void checks.refetch()} />
                : <LoadingPanel label="Đang tải điều kiện bắt đầu…" />}
            </div>
            <fieldset className="border-t border-[#f1f5f9] p-4">
              <legend className="mb-2 text-xs font-semibold text-[#64748b]">Người vận hành xác nhận tại chỗ</legend>
              <div className="space-y-2">
                {CONFIRMATIONS.map(({ key, label, hint }) => (
                  <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors duration-150 motion-reduce:transition-none ${confirmation[key] ? 'border-[#bfdbfe] bg-[#eff6ff]' : 'border-[#e2e8f0] hover:border-[#bfdbfe]'}`}>
                    <input type="checkbox" checked={confirmation[key]} onChange={event => setConfirmation(value => ({ ...value, [key]: event.target.checked }))} className="mt-0.5 size-4 accent-[#2563eb]" />
                    <span><span className="block text-[13px] font-semibold text-[#0f172a]">{label}</span><span className="block text-xs text-[#64748b]">{hint}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="border-t border-[#f1f5f9] p-4">
              <button type="button" disabled={!canStart || start.isPending} onClick={() => { start.reset(); setConfirming(true) }} className={`${buttonClass('primary', 'lg')} w-full`} aria-describedby="start-reason">
                <Play size={18} aria-hidden="true" />Bắt đầu Tour
              </button>
              <p id="start-reason" className={`mt-3 text-[13px] leading-5 ${canStart ? 'font-semibold text-[#15803d]' : 'text-[#7d5310]'}`}>{reason}</p>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className={panelClass} aria-label="Telemetry robot">
            <PanelHead title="Robot Tour đang giữ" description="Robot tự báo qua kênh telemetry." />
            <div className="p-4"><RobotTelemetryPanel robotCode={reservation?.robotCode} /></div>
          </section>
          <section className={panelClass} aria-label="Hình camera">
            <PanelHead title="Hình camera" />
            <div className="p-4">{QUEST_WHEP_URL ? <QuestLiveVideo label={reservation?.robotCode} />
              : <p className="text-[13px] leading-5 text-[#64748b]">Trang này chưa được cấu hình luồng camera (VITE_QUEST_WHEP_URL). Xem hình trực tiếp trên thiết bị trước khi xác nhận.</p>}</div>
          </section>
          <section className={panelClass} aria-label="Tuyến của Tour">
            <PanelHead title="Tuyến" description={`${summary.registrationCount} đoàn đăng ký · ${summary.invitationCount} lời mời`} />
            <div className="p-4"><RouteStopList detail={detail} /></div>
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
