import { useState } from 'react'
import { ArrowLeft, Play } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../../api/client'
import type { StartConfirmation } from '../../api/contracts/staff'
import { useStaffAmrs, useStartTour, useTour } from '../../features/staff/staff-hooks'
import { ErrorPanel, LoadingPanel, PageHeader, PanelHead, panelClass, StaffPage, StatusBadge } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { groupSummary } from '../../features/staff/attention'
import { formatTime } from '../../features/staff/formatters'
import { statusLabel } from '../../features/staff/status'
import { ConfirmationDialog } from '../../features/staff/components/ConfirmationDialog'
import { LiveCameraPreview } from '../../features/staff/components/LiveCameraPreview'
import { RegistrationList, StartChecklist, TourStateBadges } from '../../features/staff/components/TourParts'
import { RobotHeader, RobotTelemetry } from '../../features/staff/components/RobotParts'
import { useNow } from '../../features/staff/use-now'

const CONFIRMATIONS: Array<{ key: keyof StartConfirmation; label: string; hint: string }> = [
  { key: 'robotPlaced', label: 'Robot đặt đúng điểm xuất phát, đã định vị', hint: 'Kiểm tra tại chỗ: vị trí trên Twin khớp thực tế.' },
  { key: 'areaClear', label: 'Khu vực chạy an toàn, có người hỗ trợ tại chỗ', hint: 'Tuyến thông thoáng, người hỗ trợ biết cách dừng robot.' },
  { key: 'previewChecked', label: 'Đã xem preview: hình rõ, đúng góc FRONT', hint: 'Xem khung preview bên phải trước khi bắt đầu.' },
]

const errorText = (error: unknown) => (error instanceof ApiError && error.body ? error.body : 'Không bắt đầu được buổi. Kiểm tra kết nối rồi thử lại.')

/**
 * Pre-start check (scope §5.3). READY was decided by Admin ("Chốt buổi"):
 * content and groups are locked. Here Staff looks at the device side - the
 * server's checks on the robot and stream, plus three on-site confirmations -
 * and presses Start. The robot is taken at Start, not before; if any check
 * fails the Tour stays Ready and the reason is written under the button.
 */
export default function StartCheckPage() {
  const { tourId = '' } = useParams()
  const tour = useTour(tourId)
  const robots = useStaffAmrs()
  const start = useStartTour()
  const navigate = useNavigate()
  const now = useNow(1000)
  const [confirmation, setConfirmation] = useState<StartConfirmation>({ robotPlaced: false, areaClear: false, previewChecked: false })
  const [confirming, setConfirming] = useState(false)

  if (tour.isPending) return <StaffPage><LoadingPanel /></StaffPage>
  if (tour.isError) return <StaffPage><ErrorPanel error={tour.error} onRetry={tour.refetch} /></StaffPage>
  const data = tour.data
  const robot = robots.data?.find((item) => item.assignable)

  if (data.state !== 'Ready') {
    const running = data.state === 'Running'
    return (
      <StaffPage>
        <PageHeader eyebrow={`Kiểm tra trước khi bắt đầu · ${data.code}`} title={data.name} description={data.state === 'Scheduled' ? `Buổi chưa được Admin chốt: ${data.readyBlockers.join('; ')}. Staff chỉ bắt đầu buổi đã ở trạng thái Sẵn sàng.` : `Buổi đang ở trạng thái ${statusLabel(data.state).toLowerCase()}.`} />
        <div className={`${panelClass} flex flex-wrap items-center justify-between gap-3 p-5`}>
          <TourStateBadges tour={data} size="md" />
          <Link to={running ? `/staff/live/${data.id}` : `/staff/tours/${data.id}`} className={buttonClass('primary')}>{running ? 'Mở điều hành trực tiếp' : 'Xem chi tiết buổi'}</Link>
        </div>
      </StaffPage>
    )
  }

  const gate = data.allowedActions.start
  const confirmed = CONFIRMATIONS.every(({ key }) => confirmation[key])
  const canStart = gate.allowed && confirmed
  const groups = groupSummary(data)
  const passed = data.startChecks.filter((check) => check.passed).length

  return (
    <StaffPage wide>
      <Link to="/staff/tours" className={`${buttonClass('ghost', 'sm')} mb-3 -ml-2`}><ArrowLeft size={15} aria-hidden="true" />Buổi hôm nay</Link>
      <PageHeader
        eyebrow={`Kiểm tra trước khi bắt đầu · ${data.code}`}
        title={data.name}
        description={`${formatTime(data.scheduledAt)} · ${data.routeName} · ${data.stops.length} POI · ${groups.groups} đoàn, ${groups.students} học sinh · thuyết minh ${data.language}`}
        action={<StatusBadge value={data.state} size="md" />}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
        <div className="space-y-5">
          <section className={panelClass} aria-label="Robot">
            <PanelHead title="Robot sẽ nhận khi bắt đầu" description="Buổi không giữ robot trước; backend nhận robot tại thời điểm Start." />
            <div className="p-5">
              {robot ? (
                <>
                  <RobotHeader robot={robot} />
                  <div className="mt-3"><RobotTelemetry robot={robot} now={now} /></div>
                </>
              ) : <p className="text-sm text-[#8a98ac]">Chưa có dữ liệu robot.</p>}
            </div>
          </section>
          <section className={panelClass} aria-label="Đoàn đăng ký">
            <PanelHead title="Đoàn đã đăng ký" description="Danh sách đã được Admin chốt; Staff chỉ xem." />
            <div className="p-5"><RegistrationList registrations={data.registrations} /></div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className={panelClass} aria-label="Preview nguồn hình">
            <PanelHead title="Preview nguồn hình" action={<StatusBadge value={data.livestream.state} />} />
            <div className="p-4"><LiveCameraPreview livestream={data.livestream} robotName={robot?.name} /></div>
          </section>

          <section className={panelClass} aria-label="Điều kiện bắt đầu">
            <PanelHead title="Điều kiện thiết bị" action={<span className={`text-sm font-extrabold tabular-nums ${passed === data.startChecks.length ? 'text-[#1f7a55]' : 'text-[#8a5a06]'}`}>{passed}/{data.startChecks.length} đạt</span>} />
            <div className="p-4"><StartChecklist checks={data.startChecks} /></div>

            <fieldset className="border-t border-[#edf2fa] p-5">
              <legend className="sr-only">Xác nhận kiểm tra thực tế</legend>
              <p className="mb-3 text-[11px] font-bold tracking-[0.06em] text-[#8a98ac] uppercase">Staff xác nhận tại chỗ</p>
              <div className="space-y-2">
                {CONFIRMATIONS.map(({ key, label, hint }) => (
                  <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${confirmation[key] ? 'border-[#cde9dc] bg-[#f5fcf8]' : 'border-[#dce9fb] hover:border-[#b9d3f7]'}`}>
                    <input type="checkbox" checked={confirmation[key]} onChange={(event) => setConfirmation((value) => ({ ...value, [key]: event.target.checked }))} className="mt-0.5 size-4 accent-[#2f62b8]" />
                    <span><span className="block text-[13px] font-bold text-[#1f314d]">{label}</span><span className="block text-xs text-[#8a98ac]">{hint}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="border-t border-[#edf2fa] p-5">
              <button type="button" disabled={!canStart || start.isPending} onClick={() => setConfirming(true)} className={`${buttonClass('primary', 'lg')} w-full`} aria-describedby={`start-reason-${data.id}`}>
                <Play size={18} aria-hidden="true" />Bắt đầu buổi
              </button>
              <p id={`start-reason-${data.id}`} className={`mt-3 text-[13px] leading-5 ${canStart ? 'font-semibold text-[#1f7a55]' : 'text-[#8a5a06]'}`}>
                {canStart ? `Đủ điều kiện. Khi bắt đầu, backend nhận ${robot?.name ?? 'robot'} và gửi chặng đầu.` : !gate.allowed ? `Chưa thể bắt đầu: ${gate.reason}` : 'Đánh dấu đủ 3 xác nhận tại chỗ để bắt đầu.'}
              </p>
            </div>
          </section>
        </aside>
      </div>

      <ConfirmationDialog
        open={confirming}
        title={`Bắt đầu ${data.code}?`}
        description={<>Backend nhận <strong>{robot?.name ?? 'robot'}</strong>, chuyển buổi sang Đang chạy và gửi chặng đầu tới {data.stops[0]?.name}. {groups.groups} đoàn ({groups.students} học sinh) sẽ vào live.</>}
        confirmLabel="Bắt đầu"
        busy={start.isPending}
        error={start.isError ? errorText(start.error) : null}
        onCancel={() => {
          setConfirming(false)
          start.reset()
        }}
        onConfirm={() => {
          // The page switches away from Ready as soon as the cache refreshes,
          // so navigate from the promise, not from a mutate callback.
          start.mutateAsync({ tourId: data.id, confirmation }).then(() => navigate(`/staff/live/${data.id}`), () => undefined)
        }}
      />
    </StaffPage>
  )
}
