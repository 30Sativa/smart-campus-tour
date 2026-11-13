import { useState, type ReactNode } from 'react'
import { Bot, ChevronDown, TriangleAlert } from 'lucide-react'
import { PanelHead } from '../../../components/ui/ConsolePrimitives'
import { dotClass, toneClass, type StatusTone } from '../../../components/ui/status-tone'
import {
  headsetCommandError, headsetControl, headsetSummary, useHeadsetCommand, useRobotHeadset,
  type HeadsetAction, type HeadsetPress,
} from '../../quest-stream/robot-headset'
import { buttonClass } from '../../../components/ui/ui-classes'
import type { TourCommand, TourDetails, TourState, TourSummary } from '../../administration/tours/types'
import { tourStateLabel } from '../../administration/tours/tour-messages'
import { formatRelative, formatTime } from '../../../components/ui/date-time'
import { useNow } from '../use-now'
import { telemetryAge, useFleetConnection, useFleetRobot } from './fleet-telemetry'
import { mapAreaName } from '../../administration/map-labels'
import { useMapVersions } from '../../technical/technical-hooks'
import {
  COMMAND_KIND_LABEL, LEG_LABEL, OPERATIONAL_LABEL, STEP_LABEL, commandStateInfo, robotFaultText, robotReasonText,
} from './operation-labels'

export function ToneBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${toneClass[tone]}`}>{children}</span>
}

const STATE_TONE: Record<TourState, StatusTone> = { SCHEDULED: 'info', READY: 'ok', RUNNING: 'info', COMPLETED: 'muted', CANCELLED: 'danger' }
/** The Tour's own state, in the same words as Tour preparation. */
export function TourStateBadge({ tour }: { tour: Pick<TourSummary, 'state' | 'scheduledStartAt' | 'registrationClosesAt'> }) {
  const [now] = useState(() => Date.now())
  return <ToneBadge tone={STATE_TONE[tour.state] ?? 'muted'}>{tourStateLabel(tour, now) ?? 'Trạng thái khác'}</ToneBadge>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]"><dt className="text-[#64748b]">{label}</dt><dd className="min-w-0 text-right font-semibold break-words text-[#0f172a]">{children}</dd></div>
}

/** The robot command of the current leg: its own lifecycle, separate from the Tour's state. */
export function CommandCard({ command, legId, robotCode }: { command: TourCommand | null | undefined; legId?: string | null; robotCode?: string | null }) {
  if (!command) return <p className="text-[13px] text-[#64748b]">Chặng hiện tại không có lệnh robot nào.</p>
  const state = commandStateInfo(command.state)
  const reason = robotReasonText(command.reasonCode)
  return (
    <div className="rounded-xl border border-[#e2e8f0] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-[#0f172a]">{COMMAND_KIND_LABEL[command.kind] ?? 'Lệnh robot'}</p>
        <ToneBadge tone={state.tone}>{state.label}</ToneBadge>
      </div>
      <p className="mt-1.5 text-xs leading-5 text-[#475569]">{state.meaning}</p>
      {reason && <p className="mt-1 text-xs font-semibold text-[#9d3428]">Lý do: {reason}</p>}
      {robotCode && legId && <RobotLegReport robotCode={robotCode} legId={legId} />}
      <p className="mt-1.5 font-mono text-[11px] text-muted" title="Mã lệnh">{command.id}</p>
    </div>
  )
}

/**
 * Which leg the robot itself says it is running, beside the command state. It
 * helps a person judge an uncertain command on site; it never replaces the
 * command state and proves nothing about the robot's safety.
 */
function RobotLegReport({ robotCode, legId }: { robotCode: string; legId: string }) {
  const { robot } = useFleetRobot(robotCode)
  if (!robot) return null
  const same = robot.legId?.toLowerCase() === legId.toLowerCase()
  const text = !robot.legId ? 'không thực hiện chặng nào' : same ? 'đang thực hiện chặng này' : 'đang thực hiện một chặng khác'
  return <p className="mt-1.5 text-xs leading-5 text-[#475569]">
    <span className="font-semibold">Robot tự báo:</span> {text}{robot.syncFresh ? '' : ' (báo cáo đã cũ)'}. Đây là robot tự báo, không phải kết quả lệnh.
  </p>
}

/** Where the Tour is: state, operational status, step and times. What to do about it is the console's situation card. */
export function ExecutionPanel({ detail, now }: { detail: TourDetails; now: number }) {
  const execution = detail.execution
  const state = detail.tour.state
  // An ended Tour keeps its last status and step columns; shown as current they would say it is still moving.
  const running = state === 'RUNNING'
  const dwell = running && execution?.currentStep === 'OBSERVING' && execution.dwellDeadlineAt ? execution.dwellDeadlineAt : null
  const dwellLeft = dwell ? Math.round((new Date(dwell).getTime() - now) / 1000) : null
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TourStateBadge tour={detail.tour} />
        {running && execution?.operationalStatus && <ToneBadge tone={OPERATIONAL_LABEL[execution.operationalStatus].tone}>{OPERATIONAL_LABEL[execution.operationalStatus].label}</ToneBadge>}
        {running && execution?.currentStep && <ToneBadge tone="info">{STEP_LABEL[execution.currentStep] ?? 'Bước khác'}</ToneBadge>}
      </div>
      <dl className="divide-y divide-[#f1f5f9]">
        {execution?.currentLegKind && <Row label={running ? 'Chặng hiện tại' : 'Chặng cuối cùng'}>{LEG_LABEL[execution.currentLegKind] ?? 'Chặng khác'}</Row>}
        {dwell && <Row label="Thời gian dừng gợi ý">{formatTime(dwell)}{dwellLeft !== null && dwellLeft > 0 ? `, còn ${dwellLeft} giây` : ', đã hết'}</Row>}
        {detail.startedAt && <Row label="Bắt đầu lúc">{formatTime(detail.startedAt)}</Row>}
        {detail.endedAt && <Row label="Kết thúc lúc">{formatTime(detail.endedAt)}</Row>}
        {detail.endReason && <Row label="Lý do kết thúc">{detail.endReason}</Row>}
      </dl>
      {dwell && <p className="text-xs text-[#64748b]">Hết thời gian dừng, Tour không tự đi tiếp: người vận hành bấm Đi tiếp.</p>}
    </div>
  )
}

const EXECUTION_STATUS: Record<string, string> = { IDLE: 'Đang rảnh', NAVIGATING: 'Đang di chuyển' }
const SOURCE: Record<string, string> = { Physical: 'Robot thật', Gazebo: 'Gazebo (mô phỏng)', Emulator: 'Emulator (mô phỏng)' }
const yesNo = (value: boolean | null, yes: string, no: string) => (value === null ? 'Robot chưa báo' : value ? yes : no)
/** "12 giây trước" while it is recent, then "16 giờ trước": never thousands of seconds. */
const reportAge = (seconds: number, now: number) =>
  seconds < 1 ? 'dưới 1 giây trước' : seconds < 60 ? `${seconds.toFixed(0)} giây trước` : formatRelative(now - seconds * 1000, now)

const toneText = (tone: StatusTone) =>
  tone === 'danger' ? 'text-[#9d3428]' : tone === 'warn' ? 'text-[#b45309]' : tone === 'muted' ? 'text-[#64748b]' : ''
const HEADSET_BUTTON: Record<HeadsetAction, string> = { WAKE: 'Đánh thức kính', SLEEP: 'Cho kính ngủ' }

/**
 * ADR-0056: the Quest headset's battery and connection, as the robot's quest-stream reported it to the server; with
 * the addendum, a button wakes the headset or puts it to sleep (saves its battery between Tours).
 */
function HeadsetRow({ robotCode, controlsOnly = false }: { robotCode: string; controlsOnly?: boolean }) {
  const headset = useRobotHeadset(robotCode)
  const command = useHeadsetCommand(robotCode)
  const [press, setPress] = useState<HeadsetPress | null>(null)
  const now = useNow(1000)
  const { text, tone } = headsetSummary(headset.data, headset.isError)
  const control = headsetControl(headset.data, press, now)
  const send = (action: HeadsetAction) =>
    command.mutate(action, { onSuccess: () => setPress({ action, at: Date.now() }), onError: () => setPress(null) })
  return <>
    {!controlsOnly && <Row label="Kính Quest">
      <span className="inline-flex items-center gap-1.5">
        <span className={`size-2 shrink-0 rounded-full ${dotClass[tone]}`} aria-hidden="true" />
        <span className={toneText(tone)}>{text}</span>
      </span>
    </Row>}
    {(control.screenText || control.actions.length > 0) && <Row label="Màn hình kính">
      <span className="inline-flex flex-wrap items-center justify-end gap-2">
        {control.screenText && <span>{control.screenText}</span>}
        {control.actions.map(action => (
          <button key={action} type="button" className={buttonClass('secondary', 'sm')}
            disabled={command.isPending} onClick={() => send(action)}>
            {command.isPending && command.variables === action ? 'Đang gửi…' : HEADSET_BUTTON[action]}
          </button>
        ))}
      </span>
      {command.isError && <span role="alert" className="mt-1 block text-xs text-[#9d3428]">{headsetCommandError(command.error)}</span>}
      {!command.isError && control.pressText && <span role="status" className={`mt-1 block text-xs ${toneText(control.pressTone)}`}>{control.pressText}</span>}
    </Row>}
  </>
}

/**
 * The robot's own latest report, from the Operations hub. Ages keep counting
 * between broadcasts, and a lost hub connection is said, so an old value never
 * looks current.
 */
export function RobotTelemetryPanel({ robotCode }: { robotCode: string | null | undefined }) {
  const connection = useFleetConnection(store => store.state)
  const { robot, receivedAt } = useFleetRobot(robotCode)
  const maps = useMapVersions()
  const now = useNow(1000)
  if (!robotCode) return <p className="text-[13px] text-[#64748b]">Tour chưa giữ robot nào.</p>
  const link = connection === 'connected' ? null
    : connection === 'disconnected' ? 'Mất kết nối với máy chủ, đang thử kết nối lại. Số liệu dưới đây có thể đã cũ.'
    : 'Đang kết nối tới máy chủ.'
  if (!robot) return <div className="space-y-2 text-[13px] text-[#64748b]">{link && <p>{link}</p>}<p>Robot <span className="font-mono">{robotCode}</span> chưa gửi báo cáo nào tới máy chủ.</p>
    <dl><HeadsetRow robotCode={robotCode} /></dl></div>
  const age = telemetryAge(robot, receivedAt, now)
  return (
    <div className="space-y-2">
      {link && <p role="status" className="rounded-lg bg-[#fffaf0] px-3 py-2 text-xs font-semibold text-[#7d5310]">{link}</p>}
      <dl className="divide-y divide-[#f1f5f9]">
        <Row label="Robot">{robot.name} <span className="font-mono text-xs text-[#64748b]">{robot.id}</span></Row>
        <Row label="Nguồn">{SOURCE[robot.source] ?? 'Nguồn khác'}</Row>
        <Row label="Báo cáo gần nhất"><span className={robot.syncFresh ? '' : 'text-[#b45309]'}>{reportAge(age, now)}{robot.syncFresh ? '' : ', đã cũ'}</span></Row>
        <Row label="Trạng thái thực thi">{EXECUTION_STATUS[robot.executionStatus] ?? 'Trạng thái khác'}</Row>
        <Row label="Định vị">{yesNo(robot.localized, 'Đã định vị', 'Chưa định vị')}</Row>
        <Row label="Sẵn sàng di chuyển">{yesNo(robot.motionReady, 'Sẵn sàng', 'Chưa sẵn sàng')}</Row>
        <Row label="Bản đồ">{mapAreaName(maps.data, { mapKey: robot.mapKey }) ?? (maps.isSuccess ? 'Bản đồ chưa có trong danh sách' : '-')}</Row>
        <Row label="Vị trí">{robot.pose ? <span className={robot.poseFresh ? '' : 'text-[#b45309]'}>x {robot.pose.x.toFixed(2)}, y {robot.pose.y.toFixed(2)} m{robot.poseFresh ? '' : ', đã cũ'}</span> : 'Robot chưa báo'}</Row>
        <Row label="Pin">{robot.batteryPercent == null ? 'Robot chưa báo' : `${robot.batteryPercent.toFixed(0)}%`}</Row>
        <HeadsetRow robotCode={robotCode} />
        {robot.faultCode && <Row label="Lỗi robot báo"><span className="text-[#9d3428]">{robotFaultText(robot.faultCode)}</span></Row>}
        {robot.needsCheck && <Row label="Kiểm tra tại chỗ"><span className="text-[#9d3428]">Robot đang chờ kiểm tra</span></Row>}
      </dl>
    </div>
  )
}

const TILE_TONE: Partial<Record<StatusTone, string>> = {
  warn: 'border-[#f6e7c2] bg-[#fffcf3]',
  danger: 'border-[#f8d9d4] bg-[#fff7f6]',
}
/** One reading of the compact robot card: its label, a tone dot and the value. */
function StatusTile({ label, value, tone }: { label: string; value: ReactNode; tone?: StatusTone }) {
  return <div className={`min-w-0 rounded-xl border px-2.5 py-2 ${(tone && TILE_TONE[tone]) ?? 'border-[#edf2f7] bg-[#f8fafc]'}`}>
    <dt className="text-[11.5px] text-[#64748b]">{label}</dt>
    <dd className="mt-0.5 flex items-start gap-1.5 text-[13px] leading-[1.3] font-semibold text-[#0f172a]">
      {tone && <span className={`mt-[5px] size-2 shrink-0 rounded-full ${dotClass[tone]}`} aria-hidden="true" />}
      <span className="min-w-0 break-words">{value}</span>
    </dd>
  </div>
}
/** A tile's label already names the reading, so an unreported one is just "Chưa báo". */
const tileFlag = (value: boolean | null, yes: string, no: string) => (value === null ? 'Chưa báo' : value ? yes : no)
const flagTone = (value: boolean | null): StatusTone => (value === null ? 'muted' : value ? 'ok' : 'warn')
const batteryTone = (percent: number | null | undefined): StatusTone =>
  percent == null ? 'muted' : percent < 20 ? 'danger' : percent < 40 ? 'warn' : 'ok'

/**
 * The robot's latest report as a compact card for the pre-start check: its own
 * header with how old the report is, the robot, any fault or on-site check it
 * reports, then six readings as tiles toned by what needs attention. Source,
 * exact age and position fold under "Xem chi tiết"; the headset's wake/sleep
 * buttons stay in view because the camera needs the headset awake.
 */
export function RobotStatusCard({ robotCode }: { robotCode: string | null | undefined }) {
  const connection = useFleetConnection(store => store.state)
  const { robot, receivedAt } = useFleetRobot(robotCode)
  const maps = useMapVersions()
  const headset = useRobotHeadset(robotCode)
  const now = useNow(1000)
  const link = connection === 'connected' ? null
    : connection === 'disconnected' ? 'Mất kết nối với máy chủ, đang thử kết nối lại. Số liệu dưới đây có thể đã cũ.'
    : 'Đang kết nối tới máy chủ.'
  const age = robot ? telemetryAge(robot, receivedAt, now) : null
  const chip = robot && age !== null
    ? <ToneBadge tone={robot.syncFresh ? 'ok' : 'warn'}>Báo cáo {reportAge(age, now)}</ToneBadge>
    : undefined
  const quest = headsetSummary(headset.data, headset.isError)
  return <>
    <PanelHead title="Robot" action={chip} />
    <div className="space-y-3 p-4">
      {link && <p role="status" className="rounded-lg bg-[#fffaf0] px-3 py-2 text-xs font-semibold text-[#7d5310]">{link}</p>}
      {!robotCode ? <p className="text-[13px] text-[#64748b]">Tour chưa giữ robot nào.</p>
        : !robot ? <>
          <p className="text-[13px] text-[#64748b]">Robot <span className="font-mono">{robotCode}</span> chưa gửi báo cáo nào tới máy chủ.</p>
          <dl><StatusTile label="Kính Quest" value={quest.text} tone={quest.tone} /></dl>
          <dl><HeadsetRow robotCode={robotCode} controlsOnly /></dl>
        </>
        : <>
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf3fb] text-[#4a6fa5]"><Bot size={19} /></span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-[#0f172a]">{robot.name} <span className="font-mono text-[11.5px] font-medium text-[#64748b]">{robot.id}</span></p>
              <p className="text-xs text-[#64748b]">{SOURCE[robot.source] ?? 'Nguồn khác'}{robot.pose ? <> · <span className={robot.poseFresh ? '' : 'text-[#b45309]'}>x {robot.pose.x.toFixed(2)}, y {robot.pose.y.toFixed(2)} m{robot.poseFresh ? '' : ', đã cũ'}</span></> : ''}</p>
            </div>
          </div>
          {(robot.faultCode || robot.needsCheck) && <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-[#f5c8c2] bg-[#fff1ef] px-3 py-2.5 text-[12.5px] leading-[1.45] text-[#9d3428]">
            <TriangleAlert size={16} className="mt-px shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              {robot.faultCode && <p className="font-semibold">{robotFaultText(robot.faultCode)}</p>}
              {robot.needsCheck && <p className={robot.faultCode ? 'mt-0.5' : 'font-semibold'}>Robot đang chờ kiểm tra tại chỗ.</p>}
            </div>
          </div>}
          <dl className="grid grid-cols-2 gap-2">
            <StatusTile label="Thực thi" value={EXECUTION_STATUS[robot.executionStatus] ?? 'Trạng thái khác'}
              tone={robot.executionStatus === 'IDLE' ? 'ok' : robot.executionStatus === 'NAVIGATING' ? 'info' : 'muted'} />
            <StatusTile label="Định vị" value={tileFlag(robot.localized, 'Đã định vị', 'Chưa định vị')} tone={flagTone(robot.localized)} />
            <StatusTile label="Sẵn sàng di chuyển" value={tileFlag(robot.motionReady, 'Sẵn sàng', 'Chưa sẵn sàng')} tone={flagTone(robot.motionReady)} />
            <StatusTile label="Pin" value={robot.batteryPercent == null ? 'Chưa báo' : `${robot.batteryPercent.toFixed(0)}%`} tone={batteryTone(robot.batteryPercent)} />
            <StatusTile label="Bản đồ" value={mapAreaName(maps.data, { mapKey: robot.mapKey }) ?? (maps.isSuccess ? 'Chưa có trong danh sách' : '-')} />
            <StatusTile label="Kính Quest" value={quest.text} tone={quest.tone} />
          </dl>
          <dl><HeadsetRow robotCode={robotCode} controlsOnly /></dl>
          <details className="group/robot">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] [&::-webkit-details-marker]:hidden">
              <span className="text-[#64748b]">Nguồn, vị trí và thời điểm báo</span>
              <span className="inline-flex items-center gap-1 font-semibold text-[#2d719e]">Xem chi tiết<ChevronDown size={14} aria-hidden="true" className="transition-transform duration-150 group-open/robot:rotate-180 motion-reduce:transition-none" /></span>
            </summary>
            <dl className="mt-2 divide-y divide-[#f1f5f9] border-t border-[#f1f5f9]">
              <Row label="Mã robot"><span className="font-mono text-xs">{robot.id}</span></Row>
              <Row label="Nguồn">{SOURCE[robot.source] ?? 'Nguồn khác'}</Row>
              <Row label="Báo cáo gần nhất"><span className={robot.syncFresh ? '' : 'text-[#b45309]'}>{reportAge(age ?? 0, now)}{robot.syncFresh ? '' : ', đã cũ'}</span></Row>
              <Row label="Vị trí">{robot.pose ? <span className={robot.poseFresh ? '' : 'text-[#b45309]'}>x {robot.pose.x.toFixed(2)}, y {robot.pose.y.toFixed(2)} m{robot.poseFresh ? '' : ', đã cũ'}</span> : 'Robot chưa báo'}</Row>
            </dl>
          </details>
        </>}
    </div>
  </>
}

type StopMark = { label: string; tone: StatusTone }
const sameId = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/**
 * What the server's Tour state says about one stop, or null. Only a RUNNING
 * Tour is marked: an ended Tour keeps its last stop ids, which would look
 * current. A stop without `id` (an older server) is never marked.
 */
function stopMark(detail: TourDetails, stopId: string | undefined): StopMark | null {
  const execution = detail.execution
  if (detail.tour.state !== 'RUNNING' || !execution || !stopId) return null
  if (sameId(stopId, execution.currentRevisionStopId)) {
    if (execution.currentStep === 'NAVIGATING') return { label: 'Robot đang tới', tone: 'info' }
    if (execution.currentStep === 'OBSERVING') return { label: 'Đang dừng tại đây', tone: 'ok' }
  }
  return sameId(stopId, execution.lastArrivedRevisionStopId) ? { label: 'Đã tới', tone: 'muted' } : null
}

/** The revision's stops in order, marked from the Tour's execution stop ids while it runs. */
export function RouteStopList({ detail }: { detail: TourDetails }) {
  const revision = detail.routeRevision
  if (!revision) return <p className="text-[13px] text-[#64748b]">Tour này không chạy trên tuyến đã chạy thử đạt.</p>
  const marks = revision.stops.map(stop => stopMark(detail, stop.id))
  const returning = detail.tour.state === 'RUNNING' && detail.execution?.currentStep === 'RETURNING_TO_END'
  const marked = returning || marks.some(Boolean)
  return (
    <div>
      <ol className="divide-y divide-[#f1f5f9]">
        {revision.stops.map((stop, index) => {
          const mark = marks[index]
          return <li key={`${stop.stopOrder}-${stop.poiRevisionId}`} aria-current={mark?.tone === 'info' || mark?.tone === 'ok' ? 'step' : undefined}
            className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
            <span className="min-w-0 font-semibold text-[#0f172a]">{stop.stopOrder}. {stop.name}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              {mark && <ToneBadge tone={mark.tone}>{mark.label}</ToneBadge>}
              <span className="text-xs text-[#64748b]">dừng {stop.dwellSeconds} giây</span>
            </span>
          </li>
        })}
        <li aria-current={returning ? 'step' : undefined} className="flex items-baseline justify-between gap-3 py-2 text-[13px] text-[#64748b]">
          <span>{revision.endMode === 'POSE' ? 'Về điểm kết thúc của tuyến' : 'Kết thúc tại điểm dừng cuối'}</span>
          {returning && <ToneBadge tone="info">Robot đang tới</ToneBadge>}
        </li>
      </ol>
      {marked && <p className="mt-2 text-[11.5px] leading-5 text-muted">Đánh dấu theo trạng thái Tour trên máy chủ, không phải vị trí robot tự báo.</p>}
    </div>
  )
}
