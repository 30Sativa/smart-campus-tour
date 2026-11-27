import { useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, Bot, ClipboardCheck, Copy, KeyRound, LoaderCircle, Map as MapIcon, Plus, RefreshCw, Router, ShieldCheck } from 'lucide-react'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { Modal } from '../../components/ui/Drawer'
import { notify } from '../../components/ui/toast-store'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { Note, SetupSteps, TechnicalPage, ToneBadge, type SetupStep } from '../../features/technical/TechnicalUi'
import { useActivateRobot, useAllMapVersions, useAllPhysicalRobots, useAssignRobotMap, useClearRobotMap, useDeactivateRobot, useMapAreas, useMapShortLabel, useMapVersions, usePoiProposals, usePoiVerificationQueue, useRegisterPhysicalRobot, useReleaseRobotInspection, useRobotAffectedTours, useRobotCredential, useRouteTestQueue, useSetRobotDispatch, useSubmittedRoutes } from '../../features/technical/technical-hooks'
import type { PhysicalRobotConnectionStatus, PhysicalRobotOption, RobotAffectedTour, RobotCredentialView, RobotReadinessNextStep } from '../../features/technical/api/technical'
import { connectionStatusLabel, deploymentStepText, dispatchText, errorText, miniPcText, releaseInspectionError, returnStripText, robotNameHint, runningTourText, setupText, wrongMapText } from '../../features/technical/technical-format'
import { returnTarget, technicalReturnPath } from '../../features/technical/technical-nav'
import { formatDateTime } from '../../components/ui/date-time'
import { EmptyState } from '../../components/ui/EmptyState'
import { areaLabel, duplicateAreaNames, mapCheckLabel, mapShortLabel } from '../../features/technical/poi-labels'
import { DeploymentCheckForm } from '../../features/technical/DeploymentCheckForm'
import { ReadinessBadge, ReadinessSummary } from '../../features/technical/ReadinessBadge'
import { RobotCredentialPanel } from './RobotCredentialPanel'

const connectionTone: Record<PhysicalRobotConnectionStatus, 'ok' | 'warn' | 'danger'> = {
  UNCONFIRMED: 'warn', CONNECTED: 'ok', DISCONNECTED: 'danger', AWAITING_DATA: 'warn', WRONG_MAP: 'warn',
}

function ConnectionBadge({ robot }: { robot: PhysicalRobotOption }) {
  const status = robot.connectionStatus in connectionTone ? robot.connectionStatus : 'UNCONFIRMED'
  return <ToneBadge tone={connectionTone[status]}>{connectionStatusLabel(status)}</ToneBadge>
}

/** WRONG_MAP: the robot is not silent, its reports name another map; said instead of "Mất kết nối". */
function WrongMapLine({ robot, className }: { robot: PhysicalRobotOption; className?: string }) {
  if (robot.connectionStatus !== 'WRONG_MAP' || !robot.lastRejectedReport) return null
  return <p className={className ?? 'mt-0.5 text-[11.5px] text-amber-800'}>{wrongMapText(robot.lastRejectedReport, robot.assignedMapKey)}</p>
}

const holdingTourEnded = (robot: PhysicalRobotOption) => !robot.currentTourId || robot.currentTourState === 'COMPLETED' || robot.currentTourState === 'CANCELLED'
/**
 * Held means waiting for an on-site release (ADR-0043 D13): flagged by End Early or Reconcile, or still claimed by a
 * Tour that has ended. Start also claims the robot, so a robot in a Tour that is still going is busy, not held.
 */
const isHeld = (robot: PhysicalRobotOption) => robot.needsInspection || (Boolean(robot.currentTourId) && holdingTourEnded(robot))
const isBusy = (robot: PhysicalRobotOption) => Boolean(robot.currentTourId) && !isHeld(robot)
const isReady = (robot: PhysicalRobotOption) => robot.readiness?.state === 'READY'
/**
 * The server's condition for refusing a map, activation or key change (round 6): the Tour holding the robot is RUNNING.
 * Unlike isBusy it stays true for a robot also waiting for inspection, as after a Reconcile until End Early.
 */
const runsTour = (robot: PhysicalRobotOption) => robot.currentTourState === 'RUNNING'
/**
 * Round 5 (W2): the server refuses a map change, deactivation and a new key while the robot runs a Tour; the line under
 * each refused button says so. Null when the robot is not running a Tour.
 */
const runningTourLine = (robot: PhysicalRobotOption) => runsTour(robot) ? runningTourText.blocked(robot.currentTourName) : null

function RunningTourLine({ text }: { text: string | null }) {
  return text ? <p role="status" className="text-[13px] text-amber-800">{text}</p> : null
}

type Dialog = { view: 'detail' | 'map' | 'credential'; robotId: string; mapVersionId?: string }

/**
 * Registered robots: the table answers "is it connected, is it ready on its map"; everything else about one robot
 * lives in its setup dialog, which the map and key dialogs replace and then return to.
 */
export default function TechnicalRobotsPage() {
  const robots = useAllPhysicalRobots()
  const mapLabelOf = useMapShortLabel()
  const [showDeactivated, setShowDeactivated] = useState(false)
  const [registering, setRegistering] = useState(false)
  // `?robot=<id>` opens that robot's setup; with `&map=<version>` it opens the map step with that version chosen,
  // so the map page and the POI and route forms can send someone straight to the one place a map is changed.
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialog, setDialog] = useState<Dialog | null>(() => {
    const robotId = searchParams.get('robot')
    const mapVersionId = searchParams.get('map') ?? undefined
    return robotId ? { view: mapVersionId ? 'map' : 'detail', robotId, mapVersionId } : null
  })
  // `&returnTo=` (a Technical path only) is the POI check or route test this robot is being prepared for. It stays
  // while the setup and map dialogs replace each other, and goes when the robot's dialogs close.
  const [returnTo, setReturnTo] = useState(() => searchParams.get('robot') ? technicalReturnPath(searchParams.get('returnTo')) : null)
  // The link has done its job once its dialog closes; left in the URL, a reload would open the map step again.
  const clearLink = () => {
    if (!searchParams.has('robot') && !searchParams.has('map') && !searchParams.has('returnTo')) return
    setSearchParams(current => { const next = new URLSearchParams(current); next.delete('robot'); next.delete('map'); next.delete('returnTo'); return next }, { replace: true })
  }
  // By id, so an open dialog follows refetches (row version, assignment, connection).
  const selected = robots.data?.find(robot => robot.id === dialog?.robotId)
  const showDetail = () => { clearLink(); setDialog(current => current && { view: 'detail', robotId: current.robotId }) }
  const closeDialog = () => { clearLink(); setReturnTo(null); setDialog(null) }
  const strip = selected && returnTo ? <ReturnStrip returnTo={returnTo} robot={selected} /> : undefined
  const visibleRobots = robots.data?.filter(robot => Boolean(robot.deactivatedAt) === showDeactivated)
  const deactivatedCount = robots.data?.filter(robot => robot.deactivatedAt).length ?? 0
  const heldCount = robots.data?.filter(robot => !robot.deactivatedAt && isHeld(robot)).length ?? 0

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Giám sát" title="Robot" description="Đăng ký robot, cấp khóa, gán bản đồ và kiểm tra triển khai. Bấm Giám sát để xem số liệu của robot, Thiết lập để làm các bước còn thiếu."
        action={<button type="button" className={buttonClass('primary')} onClick={() => setRegistering(true)}><Plus size={15} aria-hidden="true" />Đăng ký robot</button>} />
      <div role="group" aria-label="Lọc robot" className="mb-3 flex gap-2">
        <button type="button" aria-pressed={!showDeactivated} className={buttonClass(showDeactivated ? 'secondary' : 'primary', 'sm')} onClick={() => setShowDeactivated(false)}>Đang sử dụng</button>
        <button type="button" aria-pressed={showDeactivated} className={buttonClass(showDeactivated ? 'primary' : 'secondary', 'sm')} onClick={() => setShowDeactivated(true)}>Ngừng sử dụng ({deactivatedCount})</button>
      </div>
      {heldCount > 0 && !showDeactivated && <div className="mb-3"><Note tone="warn">{heldCount} robot đang chờ kiểm tra tại chỗ sau khi Tour kết thúc sớm hoặc lệnh được đối soát. Đến bên robot, kiểm tra, rồi bấm Thiết lập để trả robot.</Note></div>}
      <section className={panelClass} aria-label="Danh sách robot vật lý">
        <PanelHead title="Robot đã đăng ký" action={!robots.isPending && !robots.isError ? <button type="button" className={buttonClass('secondary', 'sm')} disabled={robots.isFetching} onClick={() => void robots.refetch()}><RefreshCw size={13} aria-hidden="true" />{robots.isFetching ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button> : undefined} />
        {robots.isPending ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" role="status" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải danh sách robot…</p> : robots.isError ? <div role="alert" className="space-y-2 p-4 text-[13px] text-[#b23e31]"><p>{errorText(robots.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void robots.refetch()}>Tải lại danh sách robot</button></div> : (
          <div className="relative overflow-x-auto"><table className="w-full text-left">
            <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Robot</th><th className={thClass}>Kết nối</th><th className={thClass}>Sẵn sàng</th><th className={`${thClass} text-center`}>Thao tác</th></tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">
              {visibleRobots?.map(robot => <tr key={robot.id} className={rowClass}>
                <td className={tdClass}><span className="font-semibold text-[#0f172a]">{robot.displayName || '-'}</span><p className="font-mono text-[11.5px] text-[#64748b]">{robot.robotCode}</p>{isHeld(robot) && <p className="mt-1"><ToneBadge tone="warn">Chờ kiểm tra tại chỗ</ToneBadge></p>}{robot.isDispatchEnabled && <p className="mt-1">{isReady(robot) ? <ToneBadge tone="info">Đã cho phép điều phối</ToneBadge> : <ToneBadge tone="warn">Cho phép điều phối · chưa sẵn sàng</ToneBadge>}</p>}{isBusy(robot) && <p className="mt-1"><ToneBadge tone="info">{robot.currentTourName ? `Đang chạy Tour ${robot.currentTourName}` : 'Đang chạy Tour'}</ToneBadge></p>}</td>
                <td className={tdClass}><ConnectionBadge robot={robot} /><WrongMapLine robot={robot} /><p className="mt-0.5 text-[11.5px] text-[#64748b]">Dữ liệu gần nhất: {formatDateTime(robot.lastSyncReceivedAt)}</p></td>
                <td className={tdClass}>{robot.readiness ? <RobotReadinessCell robot={robot} mapText={mapLabelOf(robot.readiness.mapVersionId)} /> : <span className="text-[13px] text-[#64748b]">-</span>}</td>
                <td className={tdClass}><div className="flex flex-wrap items-center justify-center gap-2">
                  <Link to={`/technical/monitoring?robot=${encodeURIComponent(robot.robotCode)}`} aria-label={`Giám sát ${robot.robotCode}`} className={buttonClass('secondary', 'sm')}>Giám sát</Link>
                  <button type="button" aria-label={`Thiết lập ${robot.robotCode}`} className={buttonClass('secondary', 'sm')} onClick={() => setDialog({ view: 'detail', robotId: robot.id })}>Thiết lập</button>
                </div></td>
              </tr>)}
              {showDeactivated && !visibleRobots?.length && <tr><td colSpan={4}><EmptyState variant="empty" title="Chưa có robot ngừng sử dụng" /></td></tr>}
              {!showDeactivated && !visibleRobots?.length && <tr><td colSpan={4}><EmptyState variant="empty" icon={Bot} title="Chưa có robot vật lý được đăng ký." /></td></tr>}
            </tbody>
          </table></div>
        )}
      </section>
      <RegisterRobotModal open={registering} onClose={() => setRegistering(false)} />
      {selected && dialog?.view === 'detail' && <RobotDetailModal robot={selected} strip={strip} refreshing={robots.isFetching} onRefresh={() => void robots.refetch()} onAssignMap={() => setDialog({ view: 'map', robotId: selected.id })} onManageKey={() => setDialog({ view: 'credential', robotId: selected.id })} onClose={closeDialog} />}
      {selected && dialog?.view === 'credential' && <RobotCredentialPanel robotCode={selected.robotCode} step={SETUP_STEP.key} runningTour={runsTour(selected) ? { name: selected.currentTourName } : null} onClose={showDetail} />}
      {selected && dialog?.view === 'map' && <RobotMapAssignmentModal robot={selected} strip={strip} otherRobots={robots.data ?? []} initialMapVersionId={dialog.mapVersionId} onClose={showDetail} />}
    </TechnicalPage>
  )
}

/**
 * The top of the setup and map dialogs when the robot page was opened from a POI check or a route test: what the robot
 * is being prepared for and the way back, which becomes the main button once the server calls the robot ready on the
 * map of that POI or route. Ready on another map is said as such: it is usually the map this dialog is about to leave.
 */
function ReturnStrip({ returnTo, robot }: { returnTo: string; robot: PhysicalRobotOption }) {
  const target = returnTarget(returnTo)
  const found = useReturnTarget(target)
  const maps = useAllMapVersions()
  const mapLabelOf = useMapShortLabel()
  const labelled = target ? { kind: target.kind, name: found?.name ?? null } : null
  const readyOn = robot.readiness?.state === 'READY' ? robot.readiness.mapVersionId : null
  const ready = Boolean(found && readyOn && readyOn === found.mapVersionId)
  const targetMap = found && maps.data?.find(item => item.map.id === found.mapVersionId)?.map
  const otherMap = target && found && readyOn && !ready
    ? returnStripText.otherMap({ kind: target.kind, name: found.name }, robot.robotCode, targetMap ? mapLabelOf(targetMap.id) : null, mapLabelOf(readyOn) ?? robot.readiness?.mapLabel ?? 'bản đồ khác')
    : null
  return (
    <div role="note" aria-label="Quay lại" className={`mb-3 flex flex-wrap items-center gap-x-1 gap-y-2 rounded-lg px-3 py-2 text-[13px] ${ready ? 'bg-[#f0fdf4] text-[#166534]' : 'bg-[#eff6ff] text-[#1e293b]'}`}>
      {ready
        ? <Link to={returnTo} className={buttonClass('primary', 'sm')}><ArrowLeft size={13} aria-hidden="true" />{returnStripText.ready(labelled)}</Link>
        : <><span>{otherMap ?? returnStripText.preparing(labelled)} ·</span> <Link to={returnTo} className="font-semibold text-[#1d4ed8] underline-offset-2 hover:underline">{returnStripText.back(labelled)}</Link></>}
    </div>
  )
}

/** The POI or route and its map version, from the lists the POI and route-test pages already load; null when it is not found. */
function useReturnTarget(target: { kind: 'poi' | 'route'; id: string } | null): { name: string; mapVersionId: string } | null {
  const poiQueue = usePoiVerificationQueue()
  const poiProposals = usePoiProposals()
  const routeQueue = useRouteTestQueue()
  const routes = useSubmittedRoutes()
  if (!target) return null
  if (target.kind === 'poi') {
    const revision = poiQueue.data?.find(item => item.proposalId === target.id)?.revision ?? poiProposals.data?.find(item => item.id === target.id)?.revision
    return revision ? { name: revision.name, mapVersionId: revision.mapVersionId } : null
  }
  const route = routeQueue.data?.find(item => item.revisionId === target.id) ?? routes.data?.data.find(item => item.revisionId === target.id)
  return route ? { name: route.name, mapVersionId: route.mapVersionId } : null
}

function DetailSection({ title, subject, action, sectionRef, children }: { title: string; subject?: string; action?: ReactNode; sectionRef?: RefObject<HTMLElement | null>; children?: ReactNode }) {
  return (
    <section ref={sectionRef} aria-label={title} className="rounded-lg border border-[#e2e8f0] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[13px] font-semibold text-[#0f172a]">{title}{subject && <span className="font-normal text-[#64748b]"> · {subject}</span>}</h3>{action}</div>
      {children && <div className="mt-2">{children}</div>}
    </section>
  )
}

/** One of the three groups under the readiness block: a heading and its sections. */
function DetailGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title} className="space-y-2"><h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#64748b]">{title}</h3>{children}</section>
}

function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return <dl className="grid gap-x-3 gap-y-1 text-[13px] sm:grid-cols-[minmax(0,10rem)_1fr]">{items.map(([label, value]) => <div key={label} className="contents"><dt className="text-[#64748b]">{label}</dt><dd className="min-w-0 break-words text-[#334155]">{value}</dd></div>)}</dl>
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const copy = async () => {
    await navigator.clipboard?.writeText(value)
    notify({ title: `Đã sao chép ${label}`, detail: value })
  }
  return <span className="flex items-center gap-1.5"><span className="min-w-0 break-all font-mono">{value}</span><button type="button" title={`Sao chép ${label}`} aria-label={`Sao chép ${label}`} className="grid size-6 shrink-0 place-items-center rounded-md text-[#64748b] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]" onClick={() => void copy()}><Copy size={13} aria-hidden="true" /></button></span>
}

// Positions in RobotSetupChecklist, shown in the key and map dialogs it opens so the setup keeps its place.
const SETUP_STEP = { key: 'Bước 2/5', map: 'Bước 3/5' } as const

type NextStep = 'key' | 'map' | 'connect' | 'minipc' | 'deploy' | 'release' | null

const serverStep: Record<RobotReadinessNextStep, Exclude<NextStep, null>> = {
  ASSIGN_MAP: 'map', CONFIRM_CONNECTION: 'connect', CONFIGURE_MINIPC: 'minipc', DEPLOYMENT_CHECK: 'deploy',
}

/**
 * The MiniPC key as the setup reads it. `checking` is the first load: the key step is neither done nor next until it
 * is known, so the checklist does not jump to it and back (1.5). `unknown` is a failed load.
 */
type KeyStatus = 'active' | 'missing' | 'checking' | 'unknown'
const keyStatusOf = (credential: { data?: RobotCredentialView; isPending: boolean }): KeyStatus =>
  credential.data ? (credential.data.status === 'ACTIVE' ? 'active' : 'missing') : credential.isPending ? 'checking' : 'unknown'

/**
 * The one thing to do next. The map steps are the server's `readiness.nextStep`; this only puts the key before them
 * (the key status is not part of readiness) and the on-site release after them. Nothing is next while the key is
 * still being checked: the key might be the step.
 */
function nextStepOf(robot: PhysicalRobotOption, key: KeyStatus): NextStep {
  if (robot.deactivatedAt) return null
  if (key === 'missing') return 'key'
  if (key === 'checking') return null
  const step = robot.readiness?.nextStep
  if (step && serverStep[step]) return serverStep[step]
  if (isHeld(robot)) return 'release'
  return null
}

/** "Cấp khóa cho MiniPC" / "Gán bản đồ cho robot" when that is the next step (1.1); null otherwise. */
const mainLineOf = (next: NextStep) => next === 'key' || next === 'map' ? setupText.mainLine[next] : null

/** The list's "Sẵn sàng" cell: the chip, the step to do when it is the key or the map, the server's reason under it. */
function RobotReadinessCell({ robot, mapText }: { robot: PhysicalRobotOption; mapText: string | null }) {
  const credential = useRobotCredential(robot.robotCode, !robot.deactivatedAt)
  return <ReadinessSummary readiness={robot.readiness} mapText={mapText} mainLine={mainLineOf(nextStepOf(robot, keyStatusOf(credential)))} />
}

function RobotDetailModal({ robot, strip, refreshing, onRefresh, onAssignMap, onManageKey, onClose }: {
  robot: PhysicalRobotOption; strip?: ReactNode; refreshing: boolean; onRefresh: () => void; onAssignMap: () => void; onManageKey: () => void; onClose: () => void
}) {
  const credential = useRobotCredential(robot.robotCode, !robot.deactivatedAt)
  const mapLabelOf = useMapShortLabel()
  const [checking, setChecking] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const deployStep = useRef<HTMLElement>(null)
  const miniPcStep = useRef<HTMLElement>(null)
  const key = keyStatusOf(credential)
  const next = nextStepOf(robot, key)
  const mainLine = mainLineOf(next)
  // Opens the check form where it lives, in the map group, rather than sending anyone to another page.
  const openCheck = () => { setChecking(true); deployStep.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }) }
  const refreshButton = <button type="button" className={buttonClass('secondary', 'sm')} disabled={refreshing} onClick={onRefresh}><RefreshCw size={13} aria-hidden="true" />{refreshing ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button>
  const nextAction: Record<Exclude<NextStep, null>, ReactNode> = {
    key: <button type="button" className={buttonClass('primary', 'sm')} onClick={onManageKey}><KeyRound size={13} aria-hidden="true" />Cấp khóa</button>,
    map: <button type="button" className={buttonClass('primary', 'sm')} onClick={onAssignMap}><MapIcon size={13} aria-hidden="true" />Gán bản đồ</button>,
    connect: <div className="space-y-1.5"><p className="text-[13px] text-[#475569]">Trên MiniPC nhập khóa kết nối, MapKey <span className="font-mono">{robot.assignedMapKey}</span> và FrameId <span className="font-mono">{robot.assignedFrameId}</span>, bật fleet_bridge rồi bấm Cập nhật trạng thái.</p>{refreshButton}</div>,
    minipc: <button type="button" className={buttonClass('primary', 'sm')} onClick={() => miniPcStep.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })}><Router size={13} aria-hidden="true" />Cấu hình MiniPC</button>,
    deploy: <button type="button" className={buttonClass('primary', 'sm')} onClick={openCheck}><ClipboardCheck size={13} aria-hidden="true" />Kiểm tra triển khai</button>,
    release: <button type="button" className={buttonClass('primary', 'sm')} disabled={!holdingTourEnded(robot)} onClick={() => setReleasing(true)}><ShieldCheck size={13} aria-hidden="true" />Trả robot</button>,
  }
  return (
    <Modal open size="lg" title={robot.displayName || robot.robotCode} description={`Mã robot ${robot.robotCode}.`} onClose={onClose}
      footer={<div className="flex justify-end"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Đóng</button></div>}>
      {strip}
      <div className="space-y-4">
        {robot.deactivatedAt && <Note tone="warn">Ngừng sử dụng từ {formatDateTime(robot.deactivatedAt)}. Lý do: {robot.deactivationReason}. Sau khi kích hoạt lại cần cấp khóa mới và gán lại bản đồ.</Note>}
        {!robot.deactivatedAt && <section aria-label="Trạng thái sẵn sàng" className="space-y-2.5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3.5">
          {robot.readiness && <div><ReadinessBadge readiness={robot.readiness} mapText={mapLabelOf(robot.readiness.mapVersionId)} />
            {mainLine && <p className="mt-1 text-[14px] font-semibold text-[#0f172a]">{mainLine}</p>}
            {robot.readiness.state !== 'READY' && robot.readiness.reason && <p className={mainLine ? 'mt-0.5 text-xs text-[#64748b]' : 'mt-1 text-[13px] text-[#334155]'}>{robot.readiness.reason}</p>}
            {robot.readiness.state !== 'READY' && robot.readiness.detail && <p className="mt-0.5 text-xs text-[#64748b]">{robot.readiness.detail}</p>}</div>}
          {next && <div>{nextAction[next]}</div>}
          <RobotSetupChecklist robot={robot} keyStatus={key} onAssignMap={onAssignMap} onManageKey={onManageKey} />
        </section>}
        <DetailGroup title="Kết nối & khóa">
          <DetailSection title="Kết nối">
            <Facts items={[
              ['Trạng thái', <ConnectionBadge key="status" robot={robot} />],
              ['Nhận dữ liệu gần nhất', formatDateTime(robot.lastSyncReceivedAt)],
              ['Xác nhận đầu tiên', formatDateTime(robot.firstAcceptedSyncAt)],
              ['Map / frame lần kết nối đầu', robot.firstAcceptedMapKey && robot.firstAcceptedFrameId ? <span key="first" className="font-mono">{robot.firstAcceptedMapKey} · {robot.firstAcceptedFrameId}</span> : '-'],
            ]} />
            <WrongMapLine robot={robot} className="mt-2 text-xs text-amber-800" />
            {robot.connectionStatus === 'AWAITING_DATA' && <p className="mt-2 text-xs text-[#64748b]">Chưa nhận dữ liệu sau khi hệ thống khởi động.</p>}
          </DetailSection>
          <DetailSection title="Khóa kết nối MiniPC" action={<button type="button" className={buttonClass('secondary', 'sm')} onClick={onManageKey}><KeyRound size={13} aria-hidden="true" />Quản lý khóa</button>} />
        </DetailGroup>
        {!robot.deactivatedAt && <DetailGroup title="Bản đồ">
          <RobotMapSteps robot={robot} checking={checking} deployStep={deployStep} miniPcStep={miniPcStep} refreshButton={refreshButton} onAssignMap={onAssignMap} onCheck={openCheck} onCheckDone={() => setChecking(false)} />
        </DetailGroup>}
        <DetailGroup title="Vận hành">
          {isHeld(robot) && <RobotInspectionSection robot={robot} confirming={releasing} onConfirming={setReleasing} />}
          {!robot.deactivatedAt && <RobotDispatchSection robot={robot} />}
          <RobotLifecycleSection robot={robot} />
        </DetailGroup>
      </div>
    </Modal>
  )
}

/**
 * Deploying a map on this robot, in three steps: choose the version (the assignment dialog), enter its MapKey and
 * FrameId on the MiniPC, then check on the robot. The check is fixed to this robot and its assigned version.
 */
function RobotMapSteps({ robot, checking, deployStep, miniPcStep, refreshButton, onAssignMap, onCheck, onCheckDone }: {
  robot: PhysicalRobotOption; checking: boolean; deployStep: RefObject<HTMLElement | null>; miniPcStep: RefObject<HTMLElement | null>; refreshButton: ReactNode
  onAssignMap: () => void; onCheck: () => void; onCheckDone: () => void
}) {
  const maps = useAllMapVersions()
  const mapLabelOf = useMapShortLabel()
  const assigned = Boolean(robot.assignedMapVersionId)
  const map = maps.data?.find(item => item.map.id === robot.assignedMapVersionId)?.map
  const reporting = robot.readiness?.reportingOnAssignedMap === true
  const rejected = robot.connectionStatus === 'WRONG_MAP' ? robot.lastRejectedReport : null
  // The robot's latest check, when it was on the assigned map; a check on another map is explained by the reason above.
  const previous = assigned && robot.latestDeploymentPassed !== null && robot.latestDeployedMapKey === robot.assignedMapKey
    ? { passed: robot.latestDeploymentPassed, at: robot.readiness?.deploymentCheckedAt ?? null } : null
  // Round 5: a PASS from before the current assignment no longer counts. An older server still sends its time; the new
  // one sends none for it (deploymentCheckedAt is the counted check only), so a PASS on this map without a time is it.
  const beforeAssignment = Boolean(previous?.passed && robot.mapAssignedAt && robot.readiness?.state !== 'READY' &&
    (previous.at ? Date.parse(previous.at) < Date.parse(robot.mapAssignedAt) : true))
  const runningLine = runningTourLine(robot)
  return <>
    <DetailSection title="Chọn bản đồ" subject={assigned ? mapLabelOf(robot.assignedMapVersionId) ?? `${robot.assignedAreaName} · v${robot.assignedVersionNumber}` : undefined} action={<button type="button" className={buttonClass('secondary', 'sm')} disabled={Boolean(runningLine)} onClick={onAssignMap}><MapIcon size={13} aria-hidden="true" />{assigned ? 'Đổi bản đồ' : 'Gán bản đồ'}</button>}>
      {!assigned ? <p className="text-[13px] text-amber-800">Chưa gán bản đồ.</p>
        : robot.mapAssignedAt ? <p className="text-xs text-[#64748b]">Gán lúc {formatDateTime(robot.mapAssignedAt)}{robot.mapAssignedByName ? ` bởi ${robot.mapAssignedByName}` : ''}.</p> : null}
      <RunningTourLine text={runningLine} />
    </DetailSection>
    <DetailSection title="Cấu hình MiniPC" sectionRef={miniPcStep} action={assigned ? refreshButton : undefined}>
      {assigned ? <div className="space-y-2">
        <Facts items={[
          ['MapKey', <CopyValue key="map" label="MapKey" value={robot.assignedMapKey!} />],
          ['FrameId', <CopyValue key="frame" label="FrameId" value={robot.assignedFrameId!} />],
        ]} />
        <p role="status" className={`text-[13px] ${reporting ? 'text-[#166534]' : 'text-amber-800'}`}>{reporting
          ? 'Robot đã báo về theo bản đồ này.'
          : rejected ? wrongMapText(rejected, robot.assignedMapKey)
          : 'Chưa nhận dữ liệu theo bản đồ này. Làm theo các bước Trên MiniPC bên dưới rồi bấm Cập nhật trạng thái.'}</p>
        <MiniPcInstructions robotCode={robot.robotCode} mapKey={robot.assignedMapKey!} frameId={robot.assignedFrameId!} packageFileName={map?.packageFileName ?? null} />
      </div> : <p className="text-[13px] text-[#64748b]">Gán bản đồ trước để biết MapKey và FrameId cần nhập.</p>}
    </DetailSection>
    <section ref={deployStep} aria-label="Kiểm tra tại robot" className="rounded-lg border border-[#e2e8f0] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[#0f172a]">Kiểm tra tại robot</h3>
        {assigned && !checking && <button type="button" className={buttonClass('secondary', 'sm')} onClick={onCheck}><ClipboardCheck size={13} aria-hidden="true" />{previous ? 'Kiểm tra lại' : 'Kiểm tra triển khai'}</button>}
      </div>
      <div className="mt-2 space-y-2">
        {!assigned && <p className="text-[13px] text-[#64748b]">Gán bản đồ trước khi kiểm tra.</p>}
        {previous && (beforeAssignment
          ? <p className="text-[13px] text-amber-800">{deploymentStepText.beforeAssignment(previous.at ? formatDateTime(previous.at) : null, formatDateTime(robot.mapAssignedAt))}</p>
          : <p className="text-[13px] text-[#334155]">{deploymentStepText.previous(previous.passed, previous.at ? formatDateTime(previous.at) : null)}</p>)}
        {assigned && checking && (map
          ? <DeploymentCheckForm key={map.id} robot={robot} map={map} onDone={onCheckDone} onCancel={onCheckDone} />
          : maps.isError ? <p role="alert" className="text-[13px] text-[#b23e31]">{errorText(maps.error)}</p>
            : <p role="status" className="text-[13px] text-[#64748b]">Đang tải bản đồ…</p>)}
      </div>
    </section>
  </>
}

/**
 * What to type on the MiniPC for the assigned map (1.3): the Fleet Sync environment file, the key file, the map
 * profile and the service. The key itself is never here; it is shown once in the key dialog.
 */
function MiniPcInstructions({ robotCode, mapKey, frameId, packageFileName }: { robotCode: string; mapKey: string; frameId: string; packageFileName: string | null }) {
  const env = miniPcText.envLines(robotCode, mapKey, frameId)
  const copy = async () => {
    await navigator.clipboard?.writeText(env)
    notify({ title: 'Đã sao chép cấu hình MiniPC', detail: miniPcText.envFile })
  }
  return (
    <section aria-label={miniPcText.title} className="rounded-lg bg-[#f8fafc] p-3 text-[13px] text-[#334155]">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-[#0f172a]">{miniPcText.title}</h4>
        <button type="button" className={buttonClass('secondary', 'sm')} aria-label={miniPcText.copy} onClick={() => void copy()}><Copy size={13} aria-hidden="true" />Sao chép</button>
      </div>
      <p className="mt-1.5 font-mono text-xs text-[#64748b]">{miniPcText.envFile}</p>
      <pre className="mt-1 overflow-x-auto rounded-md border border-[#e2e8f0] bg-white p-2 font-mono text-xs">{env}</pre>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
        <li>{miniPcText.envStep}</li>
        <li>{miniPcText.keyStep}</li>
        <li>{miniPcText.mapStep(packageFileName)}</li>
        <li>{miniPcText.startStep}</li>
      </ol>
    </section>
  )
}

/**
 * The setup order from ADR-0039 as a checklist. It only reads what the robot list and key status already return;
 * the last step is the server's readiness. It has no button of its own: the next-step button above and step 3 below
 * already open the check form, and a third button with the same words only made people wonder which one to press.
 */
function RobotSetupChecklist({ robot, keyStatus, onAssignMap, onManageKey }: {
  robot: PhysicalRobotOption; keyStatus: KeyStatus; onAssignMap: () => void; onManageKey: () => void
}) {
  const steps: SetupStep[] = [
    { label: 'Đăng ký robot', done: true, hint: '' },
    keyStatus === 'checking'
      ? { label: 'Cấp khóa kết nối MiniPC', done: false, pending: true, hint: setupText.keyChecking }
      : { label: 'Cấp khóa kết nối MiniPC', done: keyStatus === 'active', hint: keyStatus === 'unknown' ? 'Không tải được trạng thái khóa.' : 'Cấp khóa rồi lưu khóa đó vào tệp khóa trên MiniPC.',
        action: <button type="button" className={buttonClass('secondary', 'sm')} onClick={onManageKey}><KeyRound size={13} aria-hidden="true" />Cấp khóa</button> },
    { label: 'Gán bản đồ', done: Boolean(robot.assignedMapVersionId), hint: 'Chọn khu vực và phiên bản bản đồ robot sẽ dùng, rồi nhập MapKey và FrameId trên MiniPC.',
      action: <button type="button" className={buttonClass('secondary', 'sm')} onClick={onAssignMap}><MapIcon size={13} aria-hidden="true" />Chọn bản đồ</button> },
    { label: 'Robot kết nối lần đầu', done: Boolean(robot.firstAcceptedSyncAt), hint: 'Bật robot với khóa, MapKey và FrameId ở trên. Khi máy chủ nhận dữ liệu đầu tiên, bấm Cập nhật trạng thái.' },
    { label: 'Kiểm tra triển khai đạt trên bản đồ được gán', done: isReady(robot), hint: setupText.deployHint },
  ]
  return <SetupSteps title="Thiết lập robot" steps={steps} />
}

function AffectedTours({ title, tours }: { title: string; tours: { isPending: boolean; isError: boolean; error: unknown; data?: RobotAffectedTour[] } }) {
  if (tours.isPending) return <p role="status" className="text-sm text-[#64748b]">Đang kiểm tra Tour đã xếp lịch…</p>
  if (tours.isError) return <p role="alert" className="text-sm text-[#b23e31]">{errorText(tours.error)}</p>
  if (!tours.data?.length) return null
  return <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p className="font-medium">{title}</p>
    <ul className="mt-1 list-inside list-disc">{tours.data.map(tour => <li key={tour.tourId}>{tour.name} · {formatDateTime(tour.scheduledStartAt)}</li>)}</ul>
    <p className="mt-1 text-xs">Các Tour này không bị tự hủy.</p></div>
}

function RobotLifecycleSection({ robot }: { robot: PhysicalRobotOption }) {
  const deactivate = useDeactivateRobot()
  const activate = useActivateRobot()
  const [confirming, setConfirming] = useState(false)
  const tours = useRobotAffectedTours(robot.id, undefined, confirming && !robot.deactivatedAt)
  const input = { id: robot.id, requestId: crypto.randomUUID(), expectedRowVersion: robot.rowVersion }
  const runningLine = robot.deactivatedAt ? null : runningTourLine(robot)
  return <>
    <DetailSection title="Trạng thái sử dụng" subject={robot.deactivatedAt ? 'Ngừng sử dụng' : 'Đang sử dụng'}
      action={robot.deactivatedAt
        ? <button type="button" className={buttonClass('secondary', 'sm')} disabled={activate.isPending} onClick={() => activate.mutate(input)}>Kích hoạt lại</button>
        : <button type="button" className={buttonClass('secondary', 'sm')} disabled={Boolean(runningLine)} onClick={() => setConfirming(true)}>Ngừng sử dụng</button>}>
      <RunningTourLine text={runningLine} />
      {activate.isError && <p role="alert" className="text-sm text-[#b23e31]">{errorText(activate.error)}</p>}
    </DetailSection>
    {confirming && <ConfirmationDialog open tone="danger" requireReason reasonLabel="Lý do ngừng sử dụng" title={`Ngừng sử dụng ${robot.robotCode}?`}
      description="Khóa kết nối bị thu hồi, bản đồ được gỡ gán và robot biến mất khỏi mọi danh sách chọn. Lịch sử vẫn được giữ."
      confirmLabel="Ngừng sử dụng" busy={deactivate.isPending} busyLabel="Đang lưu…" error={deactivate.isError ? errorText(deactivate.error) : undefined}
      onConfirm={reason => deactivate.mutate({ ...input, reason }, { onSuccess: () => setConfirming(false) })}
      onCancel={() => { setConfirming(false); deactivate.reset() }}>
      <AffectedTours title="Các Tour sau đang giữ robot này:" tours={tours} />
    </ConfirmationDialog>}
  </>
}

/**
 * Whether Tours started on the web may send commands to this robot (ADR-0049 Decision 8). Technical Staff switch it
 * per test session; the server still checks key, map and deployment, and command sending must be on in the backend.
 * Turning it off always works and never stops a robot that is already moving.
 */
function RobotDispatchSection({ robot }: { robot: PhysicalRobotOption }) {
  const setDispatch = useSetRobotDispatch()
  const [confirming, setConfirming] = useState<'on' | 'off' | null>(null)
  // A retry with the same note on the same robot version replays the first attempt instead of acting twice.
  const [attempt, setAttempt] = useState<{ key: string; requestId: string } | null>(null)
  const enabled = robot.isDispatchEnabled
  const confirm = (note: string) => {
    const on = confirming === 'on'
    const key = `${robot.rowVersion}:${on}:${note}`
    const requestId = attempt?.key === key ? attempt.requestId : crypto.randomUUID()
    if (attempt?.key !== key) setAttempt({ key, requestId })
    setDispatch.mutate({ id: robot.id, robotCode: robot.robotCode, requestId, expectedRowVersion: robot.rowVersion, enabled: on,
      reason: note, evidenceRef: on ? note.slice(0, 500) : undefined },
    { onSuccess: () => { setConfirming(null); setAttempt(null) } })
  }
  const close = () => { setConfirming(null); setDispatch.reset() }
  return <>
    <DetailSection title="Điều phối Tour" subject={enabled ? 'Đang cho phép' : 'Đang tắt'}
      action={enabled
        ? <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setConfirming('off')}>Tắt điều phối</button>
        : <button type="button" className={buttonClass('primary', 'sm')} disabled={!isReady(robot)} aria-describedby={isReady(robot) ? undefined : `dispatch-not-ready-${robot.id}`} onClick={() => setConfirming('on')}>Cho phép điều phối</button>}>
      <p className="text-[13px] text-[#475569]">{enabled
        ? 'Tour bắt đầu trên web có thể gửi lệnh di chuyển cho robot này, khi máy chủ đã bật gửi lệnh và robot chạy fleet_bridge có nhận lệnh.'
        : dispatchText.offHint}</p>
      {!enabled && !isReady(robot) && <p id={`dispatch-not-ready-${robot.id}`} className="mt-1 text-[13px] text-amber-800">{dispatchText.notReady}</p>}
      {enabled && !isReady(robot) && <p role="status" className="mt-1 text-[13px] text-amber-800">Đang cho phép, nhưng robot chưa sẵn sàng nên Tour chưa bắt đầu được.</p>}
    </DetailSection>
    {confirming && <ConfirmationDialog open requireReason tone={confirming === 'on' ? 'default' : 'danger'}
      reasonLabel={confirming === 'on' ? dispatchText.evidenceLabel : 'Lý do tắt'} reasonNote={confirming === 'on' ? dispatchText.evidenceNote : undefined}
      reasonPlaceholder={confirming === 'on' ? 'Ví dụ: demo đồ án 12/11, khu vực trống, có người đứng ở nút dừng khẩn.' : 'Ví dụ: xong buổi demo.'}
      title={confirming === 'on' ? `Cho phép điều phối ${robot.robotCode}?` : `Tắt điều phối ${robot.robotCode}?`}
      description={confirming === 'on'
        ? 'Sau khi bật, bấm "Bắt đầu Tour" sẽ làm robot di chuyển. Luôn có người đứng cạnh robot, sẵn sàng bấm nút dừng khẩn trên robot.'
        : 'Tour mới không gửi lệnh cho robot nữa. Lệnh đang chạy không bị dừng: nếu robot còn chạy, dùng nút dừng trên robot.'}
      confirmLabel={confirming === 'on' ? 'Cho phép' : 'Tắt điều phối'} busy={setDispatch.isPending} busyLabel="Đang lưu…"
      error={setDispatch.isError ? errorText(setDispatch.error) : undefined}
      onConfirm={confirm} onCancel={close} />}
  </>
}

/**
 * The last step of Tour recovery (ADR-0043 D13): Technical Staff, standing at the robot, record what they checked and
 * release it. The server re-checks the holding Tour and open commands; this page never stops the robot.
 */
function RobotInspectionSection({ robot, confirming, onConfirming: setConfirming }: { robot: PhysicalRobotOption; confirming: boolean; onConfirming: (open: boolean) => void }) {
  const release = useReleaseRobotInspection()
  // A retry of the same reason on the same robot version replays the first attempt instead of acting twice.
  const [attempt, setAttempt] = useState<{ key: string; requestId: string } | null>(null)
  const tourEnded = holdingTourEnded(robot)
  const confirm = (reason: string) => {
    const key = `${robot.rowVersion}:${reason}`
    const requestId = attempt?.key === key ? attempt.requestId : crypto.randomUUID()
    if (attempt?.key !== key) setAttempt({ key, requestId })
    release.mutate({ id: robot.id, robotCode: robot.robotCode, requestId, expectedRowVersion: robot.rowVersion, reason },
      { onSuccess: () => { setConfirming(false); setAttempt(null) } })
  }
  return <>
    <DetailSection title="Kiểm tra tại chỗ" subject={robot.currentTourName ? `Đang chờ, giữ bởi Tour ${robot.currentTourName}` : 'Đang chờ'}
      action={<button type="button" className={buttonClass('primary', 'sm')} disabled={!tourEnded} onClick={() => setConfirming(true)}><ShieldCheck size={13} aria-hidden="true" />Trả robot</button>}>
      <div className="space-y-2">
        <Note tone="warn">Robot đang bị giữ sau khi Tour kết thúc sớm hoặc lệnh được đối soát. Robot không bắt đầu Tour được cho đến khi Technical Staff kiểm tra tại chỗ và trả robot. Tour đã tạo vẫn giữ chỗ.</Note>
        {!tourEnded && <p role="status" className="text-[13px] text-amber-800">{robot.currentTourName ? `Tour ${robot.currentTourName}` : 'Tour'} đang giữ robot chưa kết thúc. Người vận hành cần kết thúc Tour trước, sau đó bấm Cập nhật trạng thái.</p>}
      </div>
    </DetailSection>
    {confirming && <ConfirmationDialog open requireReason reasonLabel="Đã kiểm tra gì tại chỗ" reasonPlaceholder="Ví dụ: robot đứng yên ở sảnh A, không vật cản, pin 80%, localization đúng."
      title={`Trả ${robot.robotCode} về sử dụng?`}
      description="Chỉ xác nhận khi bạn đang ở bên robot và đã thấy robot đứng yên, an toàn. Trang web không phải nút dừng khẩn cấp: nếu robot còn chạy, dùng nút dừng trên robot."
      confirmLabel="Trả robot" busy={release.isPending} busyLabel="Đang lưu…" error={release.isError ? releaseInspectionError(release.error) : undefined}
      onConfirm={confirm} onCancel={() => { setConfirming(false); release.reset() }} />}
  </>
}

function RobotMapAssignmentModal({ robot, strip, otherRobots, initialMapVersionId, onClose }: {
  robot: PhysicalRobotOption; strip?: ReactNode; otherRobots: PhysicalRobotOption[]
  /** Opened from a map ("Triển khai cho robot…"): that version starts chosen, and its area with it. */
  initialMapVersionId?: string
  onClose: () => void
}) {
  const areas = useMapAreas()
  const maps = useMapVersions()
  const assign = useAssignRobotMap()
  const clear = useClearRobotMap()
  const [chosenArea, setAreaKey] = useState('')
  const [mapVersionId, setMapVersionId] = useState(initialMapVersionId ?? '')
  // Derived, not copied: the preselected version's area is known only once the map list has loaded.
  const areaKey = chosenArea || maps.data?.find(item => item.map.id === mapVersionId)?.map.areaKey || ''
  const [confirming, setConfirming] = useState<'assign' | 'clear' | null>(null)
  const duplicateAreas = duplicateAreaNames((areas.data ?? []).map(area => ({ areaKey: area.areaKey, name: area.displayName })))
  const areaMaps = useMemo(() => (maps.data ?? []).filter(item => item.map.areaKey === areaKey).sort((a, b) => b.map.versionNumber - a.map.versionNumber), [maps.data, areaKey])
  const selected = areaMaps.find(item => item.map.id === mapVersionId)
  // One area holds one robot; naming the holder in the list saves a refused save (MAP_AREA_ALREADY_ASSIGNED).
  const holderOf = (key: string) => otherRobots.find(other => other.id !== robot.id && !other.deactivatedAt
    && maps.data?.some(item => item.map.areaKey === key && item.map.id === other.assignedMapVersionId))
  const chooseArea = (key: string) => {
    setAreaKey(key)
    // The newest version is almost always the one wanted, so it starts selected.
    const newest = (maps.data ?? []).filter(item => item.map.areaKey === key).sort((a, b) => b.map.versionNumber - a.map.versionNumber)[0]
    setMapVersionId(newest?.map.id ?? '')
  }
  const tours = useRobotAffectedTours(robot.id, confirming === 'assign' ? mapVersionId : undefined, Boolean(confirming))
  // Changing or clearing the assignment turns dispatch off on the server; re-saving the same version changes nothing.
  const dispatchTurnsOff = robot.isDispatchEnabled && (confirming === 'clear' || mapVersionId !== robot.assignedMapVersionId)
  const dispatchLine = dispatchTurnsOff ? ' Điều phối Tour của robot sẽ tự tắt.' : ''
  // Reached from a link or the checklist too, so the refused changes are locked here as well as on the setup dialog.
  const runningLine = runningTourLine(robot)
  // Escape reaches both overlays; while the confirmation is up it only closes that.
  const close = () => { if (!assign.isPending && !clear.isPending && !confirming) onClose() }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selected && !runningLine && !assign.isPending && !clear.isPending) setConfirming('assign')
  }
  const confirm = () => {
    const input = { id: robot.id, requestId: crypto.randomUUID(), expectedRowVersion: robot.rowVersion }
    if (confirming === 'assign') assign.mutate({ ...input, mapVersionId }, { onSuccess: onClose })
    else clear.mutate(input, { onSuccess: onClose })
    setConfirming(null)
  }
  return <><Modal open onClose={close} title={`Bản đồ của ${robot.robotCode}`} description={`${SETUP_STEP.map} trong thiết lập robot. Chọn khu vực và phiên bản bản đồ robot sẽ dùng. Có thể gán trước khi bản đồ có kiểm tra triển khai đạt, nhưng robot chỉ sẵn sàng nhận Tour khi đã kiểm tra triển khai đạt trên đúng phiên bản này.`} footer={<div className="flex flex-wrap items-center justify-between gap-2"><div>{robot.assignedMapVersionId && <button type="button" className={buttonClass('danger')} onClick={() => setConfirming('clear')} disabled={Boolean(runningLine) || clear.isPending || assign.isPending}>{clear.isPending ? 'Đang gỡ…' : 'Gỡ gán bản đồ'}</button>}</div><div className="ml-auto flex flex-wrap gap-2"><button type="button" className={buttonClass('secondary')} onClick={close}>Đóng</button><button type="submit" form="robot-map-assignment-form" className={buttonClass('primary')} disabled={!mapVersionId || Boolean(runningLine) || assign.isPending || clear.isPending}>{assign.isPending ? 'Đang lưu…' : 'Lưu bản đồ'}</button></div></div>}>
    {strip}
    <form id="robot-map-assignment-form" className="space-y-3.5" onSubmit={submit}>
      <RunningTourLine text={runningLine} />
      <div><label className={labelClass} htmlFor="robot-map-area">Khu vực</label><select title="" id="robot-map-area" className={`${inputClass} mt-1`} value={areaKey} onChange={event => chooseArea(event.target.value)}><option value="">Chọn khu vực</option>{(areas.data ?? []).map(area => {
        const holder = holderOf(area.areaKey)
        return <option key={area.areaKey} value={area.areaKey} disabled={Boolean(holder)}>{areaLabel(area.displayName, area.areaKey, duplicateAreas)}{holder ? ` (robot ${holder.robotCode} đang dùng)` : ''}</option>
      })}</select>{areaKey && <p className="mt-1 text-xs text-[#64748b]">Mã khu vực: <span className="font-mono">{areaKey}</span></p>}</div>
      <div><label className={labelClass} htmlFor="robot-map-version">Phiên bản bản đồ</label><select title="" id="robot-map-version" className={`${inputClass} mt-1`} value={mapVersionId} onChange={event => setMapVersionId(event.target.value)} disabled={!areaKey}><option value="">Chọn phiên bản</option>{areaMaps.map((item, index) => <option key={item.map.id} value={item.map.id}>
        Phiên bản {item.map.versionNumber}{index === 0 ? ' (mới nhất)' : ''} · tải lên {formatDateTime(item.map.uploadedAt)} · {mapCheckLabel(item.technicalCheckStatus)}{item.map.id === robot.assignedMapVersionId ? ' · đang gán' : ''}
      </option>)}</select></div>
      {selected
        ? <div className="rounded-lg bg-[#eff6ff] p-3 text-sm"><p>Sau khi lưu, nhập hai giá trị này trên MiniPC. Sai giá trị thì dữ liệu của robot sẽ bị từ chối.</p><p className="mt-1">MapKey <span className="font-mono font-semibold">{selected.map.mapKey}</span> · FrameId <span className="font-mono font-semibold">{selected.map.frameId}</span></p></div>
        : <p className="rounded-lg bg-[#eff6ff] p-3 text-sm">Chọn khu vực để xem MapKey và FrameId cần nhập trên MiniPC.</p>}
      {(maps.isError || areas.isError || assign.isError || clear.isError) && <p role="alert" className="text-sm text-[#b23e31]">{errorText(assign.error ?? clear.error ?? maps.error ?? areas.error)}</p>}
    </form>
  </Modal>
  {confirming && <ConfirmationDialog open withReason={false} tone={confirming === 'clear' ? 'danger' : 'default'}
    title={confirming === 'clear' ? `Gỡ bản đồ khỏi ${robot.robotCode}?` : `Gán bản đồ cho ${robot.robotCode}?`}
    description={confirming === 'clear' ? `Fleet Sync sẽ từ chối báo cáo của robot cho đến khi được gán lại bản đồ.${dispatchLine}` : `Gán ${selected ? mapShortLabel(selected.map, duplicateAreas) : ''}. Trên MiniPC nhập MapKey ${selected?.map.mapKey}, FrameId ${selected?.map.frameId}. Sai giá trị thì dữ liệu của robot sẽ bị từ chối. Sau khi gán cần kiểm tra triển khai lại trên bản đồ này.${dispatchLine}`}
    confirmLabel={confirming === 'clear' ? 'Gỡ gán' : 'Gán bản đồ'} onConfirm={confirm} onCancel={() => setConfirming(null)}>
    <AffectedTours title="Các Tour sau sẽ không chạy được với bản đồ mới:" tours={tours} />
  </ConfirmationDialog>}
  </>
}

function RegisterRobotModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const register = useRegisterPhysicalRobot()
  const [robotCode, setRobotCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const close = () => {
    if (register.isPending) return
    register.reset()
    setRobotCode('')
    setDisplayName('')
    onClose()
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (register.isPending) return
    register.mutate({ robotCode: robotCode.trim(), displayName: displayName.trim() }, { onSuccess: () => {
      setRobotCode('')
      setDisplayName('')
      onClose()
    } })
  }

  return <Modal open={open} title="Đăng ký robot" description="Tạo danh tính robot vật lý trong hệ thống." onClose={close}
    footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={close}>Hủy</button><button type="submit" form="physical-robot-form" className={buttonClass('primary')} disabled={register.isPending || !robotCode.trim() || !displayName.trim()}>{register.isPending ? 'Đang đăng ký…' : 'Đăng ký robot'}</button></div>}>
    <form id="physical-robot-form" className="space-y-3.5" onSubmit={submit}>
      <div><label className={labelClass} htmlFor="physical-robot-code">Mã robot</label><input id="physical-robot-code" className={`${inputClass} mt-1`} required maxLength={100} pattern={'[A-Za-z0-9][A-Za-z0-9_.\\-]{0,99}'} disabled={register.isPending} value={robotCode} onBlur={() => setRobotCode(value => value.trim())} onChange={event => { setRobotCode(event.target.value); if (!register.isPending) register.reset() }} placeholder="amr-01" /><p className="mt-1 text-xs text-[#64748b]">Tối đa 100 ký tự; bắt đầu bằng chữ hoặc số, chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch nối.</p></div>
      <div><label className={labelClass} htmlFor="physical-robot-name">Tên robot</label><input id="physical-robot-name" className={`${inputClass} mt-1`} required maxLength={150} disabled={register.isPending} value={displayName} onChange={event => { setDisplayName(event.target.value); if (!register.isPending) register.reset() }} placeholder="AMR 01" aria-describedby="physical-robot-name-hint" /><p id="physical-robot-name-hint" className="mt-1 text-xs text-[#64748b]">{robotNameHint}</p></div>
      {register.error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(register.error)}</p>}
      <p className="text-[12.5px] leading-5 text-[#64748b]">Đăng ký tạo danh tính robot trong hệ thống. Thiết lập kết nối ROS 2 được thực hiện riêng trên robot.</p>
    </form>
  </Modal>
}
