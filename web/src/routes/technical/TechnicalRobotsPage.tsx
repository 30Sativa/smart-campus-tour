import { useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Bot, ClipboardCheck, Copy, KeyRound, LoaderCircle, Map as MapIcon, Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { Modal } from '../../components/ui/Drawer'
import { notify } from '../../components/ui/toast-store'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { Note, SetupSteps, TechnicalPage, ToneBadge, type SetupStep } from '../../features/technical/TechnicalUi'
import { useActivateRobot, useAllMapVersions, useAllPhysicalRobots, useAssignRobotMap, useClearRobotMap, useDeactivateRobot, useMapAreas, useMapVersions, useRegisterPhysicalRobot, useReleaseRobotInspection, useRobotAffectedTours, useRobotCredential, useSetRobotDispatch } from '../../features/technical/technical-hooks'
import type { PhysicalRobotConnectionStatus, PhysicalRobotOption, RobotAffectedTour } from '../../features/technical/api/technical'
import { connectionStatusLabel, errorText, releaseInspectionError } from '../../features/technical/technical-format'
import { formatDateTime } from '../../components/ui/date-time'
import { EmptyState } from '../../components/ui/EmptyState'
import { areaLabel, duplicateAreaNames, mapCheckLabel } from '../../features/technical/poi-labels'
import { DeploymentCheckForm } from '../../features/technical/DeploymentCheckForm'
import { ReadinessBadge, ReadinessSummary } from '../../features/technical/ReadinessBadge'
import { RobotCredentialPanel } from './RobotCredentialPanel'

const connectionTone: Record<PhysicalRobotConnectionStatus, 'ok' | 'warn' | 'danger'> = {
  UNCONFIRMED: 'warn', CONNECTED: 'ok', DISCONNECTED: 'danger', AWAITING_DATA: 'warn',
}

function ConnectionBadge({ robot }: { robot: PhysicalRobotOption }) {
  const status = robot.connectionStatus in connectionTone ? robot.connectionStatus : 'UNCONFIRMED'
  return <ToneBadge tone={connectionTone[status]}>{connectionStatusLabel(status)}</ToneBadge>
}

const holdingTourEnded = (robot: PhysicalRobotOption) => !robot.currentTourId || robot.currentTourState === 'COMPLETED' || robot.currentTourState === 'CANCELLED'
/**
 * Held means waiting for an on-site release (ADR-0043 D13): flagged by End Early or Reconcile, or still claimed by a
 * Tour that has ended. Start also claims the robot, so a robot in a Tour that is still going is busy, not held.
 */
const isHeld = (robot: PhysicalRobotOption) => robot.needsInspection || (Boolean(robot.currentTourId) && holdingTourEnded(robot))
const isBusy = (robot: PhysicalRobotOption) => Boolean(robot.currentTourId) && !isHeld(robot)
const isReady = (robot: PhysicalRobotOption) => robot.readiness?.state === 'READY'

type Dialog = { view: 'detail' | 'map' | 'credential'; robotId: string; mapVersionId?: string }

/**
 * Registered robots: the table answers "is it connected, is it ready on its map"; everything else about one robot
 * lives in its setup dialog, which the map and key dialogs replace and then return to.
 */
export default function TechnicalRobotsPage() {
  const robots = useAllPhysicalRobots()
  const [showDeactivated, setShowDeactivated] = useState(false)
  const [registering, setRegistering] = useState(false)
  // `?robot=<id>` opens that robot's setup; with `&map=<version>` it opens the map step with that version chosen,
  // so the map page and the POI and route forms can send someone straight to the one place a map is changed.
  const [searchParams] = useSearchParams()
  const [dialog, setDialog] = useState<Dialog | null>(() => {
    const robotId = searchParams.get('robot')
    const mapVersionId = searchParams.get('map') ?? undefined
    return robotId ? { view: mapVersionId ? 'map' : 'detail', robotId, mapVersionId } : null
  })
  // By id, so an open dialog follows refetches (row version, assignment, connection).
  const selected = robots.data?.find(robot => robot.id === dialog?.robotId)
  const showDetail = () => setDialog(current => current && { view: 'detail', robotId: current.robotId })
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
                <td className={tdClass}><ConnectionBadge robot={robot} /><p className="mt-0.5 text-[11.5px] text-[#64748b]">Dữ liệu gần nhất: {formatDateTime(robot.lastSyncReceivedAt)}</p></td>
                <td className={tdClass}>{robot.readiness ? <ReadinessSummary readiness={robot.readiness} /> : <span className="text-[13px] text-[#64748b]">-</span>}</td>
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
      {selected && dialog?.view === 'detail' && <RobotDetailModal robot={selected} refreshing={robots.isFetching} onRefresh={() => void robots.refetch()} onAssignMap={() => setDialog({ view: 'map', robotId: selected.id })} onManageKey={() => setDialog({ view: 'credential', robotId: selected.id })} onClose={() => setDialog(null)} />}
      {selected && dialog?.view === 'credential' && <RobotCredentialPanel robotCode={selected.robotCode} onClose={showDetail} />}
      {selected && dialog?.view === 'map' && <RobotMapAssignmentModal robot={selected} otherRobots={robots.data ?? []} initialMapVersionId={dialog.mapVersionId} onClose={showDetail} />}
    </TechnicalPage>
  )
}

function DetailSection({ title, subject, action, children }: { title: string; subject?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-[#e2e8f0] p-3">
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

type NextStep = 'key' | 'map' | 'connect' | 'deploy' | 'release' | null

/**
 * The one thing to do next, in setup order. It only orders facts the server already returned (key status,
 * assignment, first sync, readiness, the hold); whether the robot is ready is the server's answer, never this.
 */
function nextStepOf(robot: PhysicalRobotOption, keyActive: boolean | undefined): NextStep {
  if (robot.deactivatedAt) return null
  if (keyActive === false) return 'key'
  if (!robot.assignedMapVersionId) return 'map'
  if (!robot.firstAcceptedSyncAt) return 'connect'
  if (!isReady(robot)) return 'deploy'
  if (isHeld(robot)) return 'release'
  return null
}

function RobotDetailModal({ robot, refreshing, onRefresh, onAssignMap, onManageKey, onClose }: {
  robot: PhysicalRobotOption; refreshing: boolean; onRefresh: () => void; onAssignMap: () => void; onManageKey: () => void; onClose: () => void
}) {
  const credential = useRobotCredential(robot.robotCode, !robot.deactivatedAt)
  const [checking, setChecking] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const deployStep = useRef<HTMLElement>(null)
  const keyActive = credential.data ? credential.data.status === 'ACTIVE' : undefined
  const next = nextStepOf(robot, keyActive)
  // Opens the check form where it lives, in the map group, rather than sending anyone to another page.
  const openCheck = () => { setChecking(true); deployStep.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }) }
  const refreshButton = <button type="button" className={buttonClass('secondary', 'sm')} disabled={refreshing} onClick={onRefresh}><RefreshCw size={13} aria-hidden="true" />{refreshing ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button>
  const nextAction: Record<Exclude<NextStep, null>, ReactNode> = {
    key: <button type="button" className={buttonClass('primary', 'sm')} onClick={onManageKey}><KeyRound size={13} aria-hidden="true" />Cấp khóa</button>,
    map: <button type="button" className={buttonClass('primary', 'sm')} onClick={onAssignMap}><MapIcon size={13} aria-hidden="true" />Gán bản đồ</button>,
    connect: <div className="space-y-1.5"><p className="text-[13px] text-[#475569]">Trên MiniPC nhập khóa kết nối, MapKey <span className="font-mono">{robot.assignedMapKey}</span> và FrameId <span className="font-mono">{robot.assignedFrameId}</span>, bật fleet_bridge rồi bấm Cập nhật trạng thái.</p>{refreshButton}</div>,
    deploy: <button type="button" className={buttonClass('primary', 'sm')} onClick={openCheck}><ClipboardCheck size={13} aria-hidden="true" />Kiểm tra triển khai</button>,
    release: <button type="button" className={buttonClass('primary', 'sm')} disabled={!holdingTourEnded(robot)} onClick={() => setReleasing(true)}><ShieldCheck size={13} aria-hidden="true" />Trả robot</button>,
  }
  return (
    <Modal open size="lg" title={robot.displayName || robot.robotCode} description={`Mã robot ${robot.robotCode}.`} onClose={onClose}
      footer={<div className="flex justify-end"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Đóng</button></div>}>
      <div className="space-y-4">
        {robot.deactivatedAt && <Note tone="warn">Ngừng sử dụng từ {formatDateTime(robot.deactivatedAt)}. Lý do: {robot.deactivationReason}. Sau khi kích hoạt lại cần cấp khóa mới và gán lại bản đồ.</Note>}
        {!robot.deactivatedAt && <section aria-label="Trạng thái sẵn sàng" className="space-y-2.5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3.5">
          {robot.readiness && <div><ReadinessBadge readiness={robot.readiness} />{robot.readiness.state !== 'READY' && robot.readiness.reason && <p className="mt-1 text-[13px] text-[#334155]">{robot.readiness.reason}</p>}</div>}
          {next && <div>{nextAction[next]}</div>}
          <RobotSetupChecklist robot={robot} keyActive={keyActive} keyError={credential.isError} onAssignMap={onAssignMap} onManageKey={onManageKey} onCheck={openCheck} />
        </section>}
        <DetailGroup title="Kết nối & khóa">
          <DetailSection title="Kết nối" action={refreshButton}>
            <Facts items={[
              ['Trạng thái', <ConnectionBadge key="status" robot={robot} />],
              ['Nhận dữ liệu gần nhất', formatDateTime(robot.lastSyncReceivedAt)],
              ['Xác nhận đầu tiên', formatDateTime(robot.firstAcceptedSyncAt)],
              ['Map / frame xác nhận', robot.firstAcceptedMapKey && robot.firstAcceptedFrameId ? <span key="first" className="font-mono">{robot.firstAcceptedMapKey} · {robot.firstAcceptedFrameId}</span> : '-'],
            ]} />
            {robot.connectionStatus === 'AWAITING_DATA' && <p className="mt-2 text-xs text-[#64748b]">Chưa nhận dữ liệu sau khi hệ thống khởi động.</p>}
          </DetailSection>
          <DetailSection title="Khóa kết nối MiniPC" action={<button type="button" className={buttonClass('secondary', 'sm')} onClick={onManageKey}><KeyRound size={13} aria-hidden="true" />Quản lý khóa</button>} />
        </DetailGroup>
        {!robot.deactivatedAt && <DetailGroup title="Bản đồ">
          <RobotMapSteps robot={robot} checking={checking} deployStep={deployStep} refreshButton={refreshButton} onAssignMap={onAssignMap} onCheck={openCheck} onCheckDone={() => setChecking(false)} />
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
function RobotMapSteps({ robot, checking, deployStep, refreshButton, onAssignMap, onCheck, onCheckDone }: {
  robot: PhysicalRobotOption; checking: boolean; deployStep: RefObject<HTMLElement | null>; refreshButton: ReactNode
  onAssignMap: () => void; onCheck: () => void; onCheckDone: () => void
}) {
  const maps = useAllMapVersions()
  const assigned = Boolean(robot.assignedMapVersionId)
  const map = maps.data?.find(item => item.map.id === robot.assignedMapVersionId)?.map
  const reporting = robot.readiness?.reportingOnAssignedMap === true
  // The robot's latest check, when it was on the assigned map; a check on another map is explained by the reason above.
  const previous = assigned && robot.latestDeploymentPassed !== null && robot.latestDeployedMapKey === robot.assignedMapKey
    ? { passed: robot.latestDeploymentPassed, at: robot.readiness?.deploymentCheckedAt ?? null } : null
  return <>
    <DetailSection title="1. Chọn bản đồ" subject={assigned ? `${robot.assignedAreaName} · phiên bản ${robot.assignedVersionNumber}` : undefined} action={<button type="button" className={buttonClass('secondary', 'sm')} onClick={onAssignMap}><MapIcon size={13} aria-hidden="true" />{assigned ? 'Đổi bản đồ' : 'Gán bản đồ'}</button>}>
      {!assigned ? <p className="text-[13px] text-amber-800">Chưa gán bản đồ.</p>
        : robot.mapAssignedAt ? <p className="text-xs text-[#64748b]">Gán lúc {formatDateTime(robot.mapAssignedAt)}{robot.mapAssignedByName ? ` bởi ${robot.mapAssignedByName}` : ''}.</p> : null}
    </DetailSection>
    <DetailSection title="2. Cấu hình MiniPC" action={assigned ? refreshButton : undefined}>
      {assigned ? <div className="space-y-2">
        <Facts items={[
          ['MapKey', <CopyValue key="map" label="MapKey" value={robot.assignedMapKey!} />],
          ['FrameId', <CopyValue key="frame" label="FrameId" value={robot.assignedFrameId!} />],
        ]} />
        <p role="status" className={`text-[13px] ${reporting ? 'text-[#166534]' : 'text-amber-800'}`}>{reporting
          ? 'Robot đã báo về theo bản đồ này.'
          : 'Chưa nhận dữ liệu theo bản đồ này. Nhập MapKey/FrameId trên MiniPC, bật fleet_bridge rồi bấm Cập nhật trạng thái.'}</p>
      </div> : <p className="text-[13px] text-[#64748b]">Gán bản đồ trước để biết MapKey và FrameId cần nhập.</p>}
    </DetailSection>
    <section ref={deployStep} aria-label="3. Kiểm tra tại robot" className="rounded-lg border border-[#e2e8f0] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[#0f172a]">3. Kiểm tra tại robot</h3>
        {assigned && !checking && <button type="button" className={buttonClass('secondary', 'sm')} onClick={onCheck}><ClipboardCheck size={13} aria-hidden="true" />{previous ? 'Kiểm tra lại' : 'Kiểm tra triển khai'}</button>}
      </div>
      <div className="mt-2 space-y-2">
        {!assigned && <p className="text-[13px] text-[#64748b]">Gán bản đồ trước khi kiểm tra.</p>}
        {previous && <p className="text-[13px] text-[#334155]">Lần trước: {previous.passed ? 'Đạt' : 'Không đạt'}{previous.at ? ` ${formatDateTime(previous.at)}` : ''}</p>}
        {assigned && checking && (map
          ? <DeploymentCheckForm key={map.id} robot={robot} map={map} onDone={onCheckDone} onCancel={onCheckDone} />
          : maps.isError ? <p role="alert" className="text-[13px] text-[#b23e31]">{errorText(maps.error)}</p>
            : <p role="status" className="text-[13px] text-[#64748b]">Đang tải bản đồ…</p>)}
      </div>
    </section>
  </>
}

/**
 * The setup order from ADR-0039 as a checklist. It only reads what the robot list and key status already return;
 * the last step is the server's readiness, and its button opens the check form above instead of another page.
 */
function RobotSetupChecklist({ robot, keyActive, keyError, onAssignMap, onManageKey, onCheck }: {
  robot: PhysicalRobotOption; keyActive: boolean | undefined; keyError: boolean; onAssignMap: () => void; onManageKey: () => void; onCheck: () => void
}) {
  const steps: SetupStep[] = [
    { label: 'Đăng ký robot', done: true, hint: '' },
    { label: 'Cấp khóa kết nối MiniPC', done: keyActive === true, hint: keyError ? 'Không tải được trạng thái khóa.' : 'Cấp khóa rồi nhập khóa đó trên MiniPC.',
      action: <button type="button" className={buttonClass('secondary', 'sm')} onClick={onManageKey}><KeyRound size={13} aria-hidden="true" />Cấp khóa</button> },
    { label: 'Gán bản đồ', done: Boolean(robot.assignedMapVersionId), hint: 'Chọn khu vực và phiên bản bản đồ robot sẽ dùng, rồi nhập MapKey và FrameId trên MiniPC.',
      action: <button type="button" className={buttonClass('secondary', 'sm')} onClick={onAssignMap}><MapIcon size={13} aria-hidden="true" />Chọn bản đồ</button> },
    { label: 'Robot kết nối lần đầu', done: Boolean(robot.firstAcceptedSyncAt), hint: 'Bật robot với khóa, MapKey và FrameId ở trên. Khi máy chủ nhận dữ liệu đầu tiên, bấm Cập nhật trạng thái.' },
    { label: 'Kiểm tra triển khai đạt trên bản đồ được gán', done: isReady(robot), hint: 'Nạp đúng tệp bản đồ lên robot, kiểm tra định vị và hiển thị, rồi ghi kết quả ở bước Kiểm tra tại robot.',
      action: <button type="button" className={buttonClass('secondary', 'sm')} onClick={onCheck}><ClipboardCheck size={13} aria-hidden="true" />Kiểm tra triển khai</button> },
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
  return <>
    <DetailSection title="Trạng thái sử dụng" subject={robot.deactivatedAt ? 'Ngừng sử dụng' : 'Đang sử dụng'}
      action={robot.deactivatedAt
        ? <button type="button" className={buttonClass('secondary', 'sm')} disabled={activate.isPending} onClick={() => activate.mutate(input)}>Kích hoạt lại</button>
        : <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setConfirming(true)}>Ngừng sử dụng</button>}>
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
        : <button type="button" className={buttonClass('primary', 'sm')} onClick={() => setConfirming('on')}>Cho phép điều phối</button>}>
      <p className="text-[13px] text-[#475569]">{enabled
        ? 'Tour bắt đầu trên web có thể gửi lệnh di chuyển cho robot này, khi máy chủ đã bật gửi lệnh và robot chạy fleet_bridge có nhận lệnh.'
        : 'Tour trên web chưa gửi được lệnh cho robot này. Bật khi chuẩn bị chạy thử, tắt khi xong.'}</p>
      {enabled && !isReady(robot) && <p role="status" className="mt-1 text-[13px] text-amber-800">Đang cho phép, nhưng robot chưa sẵn sàng nên Tour chưa bắt đầu được.</p>}
    </DetailSection>
    {confirming && <ConfirmationDialog open requireReason tone={confirming === 'on' ? 'default' : 'danger'}
      reasonLabel={confirming === 'on' ? 'Ghi chú buổi chạy thử' : 'Lý do tắt'}
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

function RobotMapAssignmentModal({ robot, otherRobots, initialMapVersionId, onClose }: {
  robot: PhysicalRobotOption; otherRobots: PhysicalRobotOption[]
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
  // Escape reaches both overlays; while the confirmation is up it only closes that.
  const close = () => { if (!assign.isPending && !clear.isPending && !confirming) onClose() }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selected && !assign.isPending && !clear.isPending) setConfirming('assign')
  }
  const confirm = () => {
    const input = { id: robot.id, requestId: crypto.randomUUID(), expectedRowVersion: robot.rowVersion }
    if (confirming === 'assign') assign.mutate({ ...input, mapVersionId }, { onSuccess: onClose })
    else clear.mutate(input, { onSuccess: onClose })
    setConfirming(null)
  }
  return <><Modal open onClose={close} title={`Bản đồ của ${robot.robotCode}`} description="Chọn khu vực và phiên bản bản đồ robot sẽ dùng. Có thể gán trước khi bản đồ đạt kiểm tra, nhưng robot chỉ nhận Tour khi đã kiểm tra đạt trên đúng phiên bản này." footer={<div className="flex flex-wrap items-center justify-between gap-2"><div>{robot.assignedMapVersionId && <button type="button" className={buttonClass('danger')} onClick={() => setConfirming('clear')} disabled={clear.isPending || assign.isPending}>{clear.isPending ? 'Đang gỡ…' : 'Gỡ gán bản đồ'}</button>}</div><div className="ml-auto flex flex-wrap gap-2"><button type="button" className={buttonClass('secondary')} onClick={close}>Đóng</button><button type="submit" form="robot-map-assignment-form" className={buttonClass('primary')} disabled={!mapVersionId || assign.isPending || clear.isPending}>{assign.isPending ? 'Đang lưu…' : 'Lưu bản đồ'}</button></div></div>}>
    <form id="robot-map-assignment-form" className="space-y-3.5" onSubmit={submit}>
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
    description={confirming === 'clear' ? `Fleet Sync sẽ từ chối báo cáo của robot cho đến khi được gán lại bản đồ.${dispatchLine}` : `Gán ${selected?.map.areaName} phiên bản ${selected?.map.versionNumber}. Trên MiniPC nhập MapKey ${selected?.map.mapKey}, FrameId ${selected?.map.frameId}. Sai giá trị thì dữ liệu của robot sẽ bị từ chối. Sau khi gán cần kiểm tra triển khai lại trên bản đồ này.${dispatchLine}`}
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
      <div><label className={labelClass} htmlFor="physical-robot-name">Tên robot</label><input id="physical-robot-name" className={`${inputClass} mt-1`} required maxLength={150} disabled={register.isPending} value={displayName} onChange={event => { setDisplayName(event.target.value); if (!register.isPending) register.reset() }} placeholder="AMR 01" /></div>
      {register.error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(register.error)}</p>}
      <p className="text-[12.5px] leading-5 text-[#64748b]">Đăng ký tạo danh tính robot trong hệ thống. Thiết lập kết nối ROS 2 được thực hiện riêng trên robot.</p>
    </form>
  </Modal>
}
