import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CircleCheck, Clock3, FileUp, LoaderCircle, RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader, PanelHead, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { Modal } from '../../components/ui/Drawer'
import { EmptyState } from '../../components/ui/EmptyState'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { ReadyRobotField } from '../../features/technical/ReadyRobotField'
import { robotForMap } from '../../features/technical/robot-readiness'
import { CheckRow, ComputedResult, NoneChecked, DetailFact, Note, SaveBlockedHint, TechnicalPage, ToneBadge, ViewDetailButton } from '../../features/technical/TechnicalUi'
import { mapVersionLabel, narrationStatus, poiObservationLabels, verificationMethodLabel } from '../../features/technical/poi-labels'
import { headPresetLabel } from '../../features/technical/head-camera-preset'
import { errorText, poiVerifyErrors } from '../../features/technical/technical-format'
import { formatDateTime } from '../../components/ui/date-time'
import { useMapVersions, usePhysicalRobots, usePoiHistory, usePoiProposals, usePoiVerificationQueue, useVerifyPoi } from '../../features/technical/technical-hooks'
import type { PoiNarrationSummary, PoiProposal, PoiRevision, PoiVerificationQueueItem } from '../../features/technical/api/technical'

type PoiFilter = 'pending' | 'retry' | 'passed'
/** `recordable` follows the backend queue: it holds exactly the revisions still accepting a result. */
type PoiRow = PoiVerificationQueueItem & { filter: PoiFilter; recordable: boolean; narration?: PoiNarrationSummary | null }

const filterText: Record<PoiFilter, { title: string; empty: string }> = {
  pending: { title: 'POI chờ kiểm chứng', empty: 'Chưa có POI chờ kiểm chứng' },
  retry: { title: 'POI cần kiểm tra lại', empty: 'Chưa có POI cần kiểm tra lại' },
  passed: { title: 'POI đã đạt', empty: 'Chưa có POI đạt kiểm chứng' },
}

function toRows(queue: PoiVerificationQueueItem[], proposals: PoiProposal[]): PoiRow[] {
  const queued = new Set(queue.map(item => item.proposalId))
  const recorded = proposals.filter(item => !queued.has(item.id) && ['PASS', 'FAIL'].includes(item.revision.navigationStatus))
  // The queue carries no narration summary; the proposal list does (ADR-0060), read-only here.
  const narrationOf = new Map(proposals.map(item => [item.id, item.narration ?? null]))
  return [
    ...queue.map(item => ({ ...item, narration: narrationOf.get(item.proposalId) ?? null, filter: (item.revision.navigationStatus === 'FAIL' ? 'retry' : 'pending') as PoiFilter, recordable: true })),
    ...recorded.map(({ id, currentRevision, rowVersion, revision, narration }) => ({ proposalId: id, currentRevision, rowVersion, revision, narration, filter: (revision.navigationStatus === 'PASS' ? 'passed' : 'retry') as PoiFilter, recordable: false })),
  ]
}

/**
 * POI verification: one table filtered by the figure strip; recording a check
 * opens a dialog bound to the exact revision and row version it was opened on,
 * and a recorded result opens read-only.
 */
export default function TechnicalPoisPage() {
  const proposals = usePoiVerificationQueue()
  const allProposals = usePoiProposals()
  // Holds the row itself: saving moves it between lists, and the dialog must not unmount mid-save.
  const [selected, setSelected] = useState<PoiRow | null>(null)
  const [viewing, setViewing] = useState<PoiRow | null>(null)
  const maps = useMapVersions()
  // People read the area and version; the map key is only a fallback while the list loads.
  const mapName = (mapKey: string) => {
    const map = maps.data?.find(item => item.map.mapKey === mapKey)?.map
    return map ? mapVersionLabel(map) : mapKey
  }
  const [filter, setFilter] = useState<PoiFilter>('pending')

  const rows = useMemo(() => toRows(proposals.data ?? [], allProposals.data ?? []), [proposals.data, allProposals.data])
  // Newest submission first; a revision without a submit time goes last.
  const visible = rows.filter(row => row.filter === filter)
    .sort((a, b) => (b.revision.submittedAt ? Date.parse(b.revision.submittedAt) : -Infinity) - (a.revision.submittedAt ? Date.parse(a.revision.submittedAt) : -Infinity) || 0)
  const count = (value: PoiFilter) => rows.filter(row => row.filter === value).length
  // The queue alone is enough for the first two figures; only recorded results need the full list.
  const recordedCount = (value: PoiFilter) => allProposals.isPending ? '…' : allProposals.isError ? '-' : count(value)

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Bản đồ & POI" title="Kiểm chứng POI" description="Ghi kết quả kiểm tra tại chỗ cho POI Staff đã gửi."
        action={<Link className={buttonClass('secondary')} to="/technical/pois/import"><FileUp size={15} aria-hidden="true" />Nhập từ file</Link>} />

      {!proposals.isPending && !proposals.error && (
        <div className="mb-3">
          <StatStrip label="Lọc POI theo trạng thái kiểm chứng" columns="sm:grid-cols-3">
            <StatTile icon={Clock3} label="Chờ kiểm chứng" value={count('pending')} tone="warn" onClick={() => setFilter('pending')} pressed={filter === 'pending'} />
            <StatTile icon={RotateCcw} label="Cần kiểm tra lại" value={recordedCount('retry')} tone="danger" onClick={() => setFilter('retry')} pressed={filter === 'retry'} />
            <StatTile icon={CircleCheck} label="Đã đạt" value={recordedCount('passed')} onClick={() => setFilter('passed')} pressed={filter === 'passed'} />
          </StatStrip>
        </div>
      )}

      <section className={panelClass} aria-label="Danh sách kiểm chứng POI">
        <PanelHead title={filterText[filter].title} />
        {filter !== 'pending' && allProposals.isError && <div role="alert" className="space-y-2 border-b border-[#eef1f4] p-4 text-[13px] text-[#b23e31]"><p>{errorText(allProposals.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void allProposals.refetch()}>Tải lại danh sách POI</button></div>}
        {proposals.isPending ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải…</p> : proposals.error ? <p role="alert" className="p-4 text-[13px] text-[#b23e31]">{errorText(proposals.error)}</p> : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>POI</th><th className={thClass}>Bản đồ</th><th className={thClass}>Trạng thái</th><th className={thClass}>Đã gửi</th><th className={`${thClass} text-center`}>Thao tác</th></tr></thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {visible.map((item) => <tr key={`${item.proposalId}:${item.revision.revisionNumber}`} className={rowClass}>
                  <td className={tdClass}><span className="font-semibold text-[#0f172a]">{item.revision.name}</span><p className="text-[11.5px] text-[#64748b]">{item.revision.purpose}</p></td>
                  <td className={tdClass}>{mapName(item.revision.mapKey)}</td>
                  <td className={tdClass}><PoiStatus row={item} /></td>
                  <td className={`${tdClass} text-xs text-[#64748b]`}>{formatDateTime(item.revision.submittedAt)}</td>
                  <td className={tdClass}><div className="flex items-center justify-center gap-2"><button className={buttonClass(item.recordable ? 'primary' : 'secondary', 'sm')} type="button" onClick={() => setSelected(item)}>{item.recordable ? 'Ghi kết quả' : 'Xem kết quả'}</button><ViewDetailButton label={`Xem chi tiết ${item.revision.name}`} onClick={() => setViewing(item)} /></div></td>
                </tr>)}
                {!visible.length && <tr><td colSpan={5}><EmptyState variant="empty" title={filterText[filter].empty} /></td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {viewing && <PoiDetailModal row={viewing} mapName={mapName(viewing.revision.mapKey)} onClose={() => setViewing(null)} onRecord={() => { setViewing(null); setSelected(viewing) }} />}
      {selected?.recordable && <VerifyModal key={selected.proposalId} proposal={selected} mapName={mapName(selected.revision.mapKey)} onClose={() => setSelected(null)} />}
      {selected && !selected.recordable && <PoiResultModal key={selected.proposalId} proposalId={selected.proposalId} revision={selected.revision} mapName={mapName(selected.revision.mapKey)} onClose={() => setSelected(null)} />}
    </TechnicalPage>
  )
}

function PoiStatus({ row }: { row: PoiRow }) {
  if (row.filter === 'pending') return <ToneBadge tone="warn">Chờ kiểm chứng</ToneBadge>
  if (row.filter === 'passed') return <><ToneBadge tone="ok">Đã đạt</ToneBadge><MethodBadge method={row.revision.verificationMethod} /></>
  if (row.recordable) return <ToneBadge tone="danger">Cần kiểm tra lại</ToneBadge>
  return <><ToneBadge tone="danger">Không đạt</ToneBadge><p className="mt-0.5 text-[11.5px] text-[#64748b]">Chờ Staff sửa và gửi lại</p></>
}

function MethodBadge({ method }: { method?: string | null }) {
  return method ? <span className="ml-1"><ToneBadge tone="info">{verificationMethodLabel[method] ?? method}</ToneBadge></span> : null
}

/** What the table leaves out: where the robot must go and what it will say there. */
function PoiDetailModal({ row, mapName, onClose, onRecord }: { row: PoiRow; mapName: string; onClose: () => void; onRecord: () => void }) {
  const { revision } = row
  return (
    <Modal open title={revision.name} onClose={onClose}
      footer={<div className="flex justify-end"><button type="button" className={buttonClass('primary')} onClick={onRecord}>{row.recordable ? 'Ghi kết quả' : 'Xem kết quả'}</button></div>}>
      <dl className="divide-y divide-[#f1f5f9]">
        <DetailFact label="Trạng thái"><PoiStatus row={row} /></DetailFact>
        <DetailFact label="Mục đích">{revision.purpose}</DetailFact>
        {revision.description && <DetailFact label="Mô tả">{revision.description}</DetailFact>}
        <DetailFact label="Bản đồ">{mapName}</DetailFact>
        <DetailFact label="Phiên bản POI">{revision.revisionNumber}</DetailFact>
        <DetailFact label="Tọa độ"><span className="font-mono">x {revision.x}, y {revision.y}, yaw {revision.yaw}</span></DetailFact>
        <DetailFact label="Đầu camera VR">{headPresetLabel(revision.cameraPreset)}</DetailFact>
        <DetailFact label="Thuyết minh"><ToneBadge tone={narrationStatus(row.narration).tone}>{narrationStatus(row.narration).label}</ToneBadge><p className="mt-0.5 text-[11.5px] text-[#64748b]">Staff viết và duyệt; không ảnh hưởng kết quả kiểm chứng.</p></DetailFact>
      </dl>
    </Modal>
  )
}

function VerifyModal({ proposal, mapName, onClose }: { proposal: PoiVerificationQueueItem; mapName: string; onClose: () => void }) {
  const verify = useVerifyPoi()
  const robots = usePhysicalRobots()
  const maps = useMapVersions()
  const [evidence, setEvidence] = useState('')
  const [reason, setReason] = useState('')
  // Nothing is ticked up front: every observation is one the checker made on purpose.
  const [reached, setReached] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [localized, setLocalized] = useState(false)
  const [cameraConfirmed, setCameraConfirmed] = useState(false)
  // Until a box is ticked or unticked, the result is neither Đạt nor Không đạt and no reason is asked.
  const [touched, setTouched] = useState(false)
  const { revision } = proposal

  const [reachedLabel, stoppedLabel, localizedLabel, cameraLabel] = poiObservationLabels(revision.cameraPreset)
  const checks = [
    { label: reachedLabel, checked: reached, set: setReached },
    { label: stoppedLabel, checked: stopped, set: setStopped },
    { label: localizedLabel, checked: localized, set: setLocalized },
    { label: cameraLabel, checked: cameraConfirmed, set: setCameraConfirmed },
  ]
  // The result follows the ticks: all four ticked is Đạt, any left unticked is Không đạt and needs a reason.
  const resultCode: 'PASS' | 'FAIL' = checks.every(check => check.checked) ? 'PASS' : 'FAIL'
  const pending = !touched && checks.every(check => !check.checked)
  // Not chosen: the one robot the server calls ready on this exact version records the result (MAP_NOT_DEPLOYED otherwise).
  const robotCode = robotForMap(robots.data, revision.mapVersionId).ready?.robotCode ?? ''
  const missingToSave = [
    !robotCode && 'cần một robot sẵn sàng trên bản đồ này',
    pending && 'tick các mục đã kiểm tra',
    !pending && resultCode === 'FAIL' && !reason.trim() && 'nhập lý do không đạt',
    !evidence.trim() && 'nhập ghi chú bằng chứng',
  ].filter((item): item is string => Boolean(item))
  const errors = verify.error ? poiVerifyErrors(verify.error) : {}
  const changed = () => { if (verify.error) verify.reset() }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (missingToSave.length) return
    verify.mutate({
      proposalId: proposal.proposalId,
      revisionNumber: revision.revisionNumber,
      expectedRowVersion: proposal.rowVersion,
      robotCode,
      resultCode,
      reached,
      stopped,
      localizationPassed: localized,
      cameraPresetConfirmed: cameraConfirmed,
      reason: resultCode === 'FAIL' ? reason : undefined,
      evidenceNote: evidence,
    }, { onSuccess: onClose })
  }

  return (
    <Modal open size="lg" title={`Kiểm tra ${revision.name}`} description={`${mapName}, phiên bản POI ${revision.revisionNumber}, đầu camera ${headPresetLabel(revision.cameraPreset)}. Đạt khi cả bốn kiểm tra đều đạt.`} onClose={onClose}
      footer={<div className="flex flex-wrap items-center justify-end gap-2"><SaveBlockedHint id="poi-verify-missing" missing={missingToSave} /><ComputedResult passed={resultCode === 'PASS'} pending={pending} /><button type="button" className={buttonClass('secondary')} onClick={onClose}>Đóng</button><button type="submit" form="poi-verify-form" className={buttonClass('primary')} aria-describedby={missingToSave.length ? 'poi-verify-missing' : undefined} disabled={verify.isPending || missingToSave.length > 0}>{verify.isPending ? 'Đang lưu…' : 'Lưu kết quả'}</button></div>}>
      <form id="poi-verify-form" className="space-y-3.5" onSubmit={submit}>
        <div>
          <ReadyRobotField robots={robots} mapVersionId={revision.mapVersionId} map={maps.data?.find(item => item.map.id === revision.mapVersionId)?.map} />
          {errors.robotCode && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{errors.robotCode}</p>}
        </div>
        <div className="space-y-2">
          <p className="text-xs text-[#64748b]">Tick mục đã đạt. Còn mục chưa tick thì kết quả là Không đạt.</p>
          {checks.map(check => <CheckRow key={check.label} checked={check.checked} onChange={value => { check.set(value); setTouched(true); changed() }}>{check.label}</CheckRow>)}
          {pending && <NoneChecked reasonId="verify-reason" onNone={() => { setTouched(true); changed() }} />}
        </div>
        {!pending && resultCode === 'FAIL' && <div><label className={labelClass} htmlFor="verify-reason">Lý do không đạt</label><p className="mt-0.5 text-xs text-[#64748b]">Staff sẽ thấy lý do này, sửa POI và gửi lại phiên bản mới.</p><input id="verify-reason" aria-invalid={Boolean(errors.reason)} className={`${inputClass} mt-1`} required maxLength={1000} value={reason} onChange={(event) => { setReason(event.target.value); changed() }} />{errors.reason && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{errors.reason}</p>}</div>}
        <div><label className={labelClass} htmlFor="verify-evidence">Ghi chú bằng chứng</label><textarea id="verify-evidence" rows={3} aria-invalid={Boolean(errors.evidenceNote)} className={`${inputClass} mt-1`} required maxLength={2000} value={evidence} onChange={(event) => { setEvidence(event.target.value); changed() }} />{errors.evidenceNote && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{errors.evidenceNote}</p>}</div>
        {errors.form && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errors.form}</p>}
        <Note>Bản ghi gắn với phiên bản POI {revision.revisionNumber}. Nếu Staff sửa POI trong lúc bạn kiểm tra, máy chủ sẽ từ chối và bạn cần mở lại.</Note>
      </form>
    </Modal>
  )
}

function PoiResultModal({ proposalId, revision, mapName, onClose }: { proposalId: string; revision: PoiRevision; mapName: string; onClose: () => void }) {
  const history = usePoiHistory(proposalId)
  const records = [...(history.data?.verificationRecords ?? [])].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
  const observations = (record: (typeof records)[number]) => [
    { label: 'Robot tới đúng POI', passed: record.reached },
    { label: 'Robot dừng đúng vị trí', passed: record.stopped },
    { label: 'Định vị đạt', passed: record.localizationPassed },
    // An older record may belong to a revision with another head action, so the history names no action.
    { label: 'Đầu camera làm đúng', passed: record.cameraPresetConfirmed },
  ]
  return (
    <Modal open size="lg" title={`Kết quả ${revision.name}`} description={`${mapName}, phiên bản POI ${revision.revisionNumber}, đầu camera ${headPresetLabel(revision.cameraPreset)}.`} onClose={onClose}
      footer={<div className="flex justify-end"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Đóng</button></div>}>
      <div className="space-y-3">
        {history.isPending && <p role="status" className="text-sm text-[#64748b]">Đang tải kết quả…</p>}
        {history.isError && <div role="alert" className="space-y-2 text-sm text-[#b23e31]"><p>{errorText(history.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void history.refetch()}>Tải lại kết quả</button></div>}
        {records.map(record => {
          const effective = record.proposalRevisionId === revision.verificationSourceRevisionId
          return (
            <section key={record.id} aria-label={`Kết quả phiên bản ${record.revisionNumber}`} className="rounded-lg border border-[#e2e8f0] p-3 text-[13px] text-[#334155]">
              <div className="flex flex-wrap items-center gap-2"><ToneBadge tone={record.resultCode === 'PASS' ? 'ok' : 'danger'}>{record.resultCode === 'PASS' ? 'Đạt' : 'Không đạt'}</ToneBadge><span className="font-semibold text-[#0f172a]">Phiên bản {record.revisionNumber}</span><ToneBadge tone="muted">{verificationMethodLabel[record.verificationMethod] ?? record.verificationMethod}</ToneBadge>{effective && <ToneBadge tone="info">Đang áp dụng</ToneBadge>}</div>
              <p className="mt-1.5 text-xs text-[#64748b]">Robot <span className="font-mono">{record.robotCode}</span> · {formatDateTime(record.checkedAt)}</p>
              {record.verificationMethod === 'POSE_CAPTURE'
                ? <p className="mt-2 text-xs">Pose được ghi từ robot khi đang ở đúng điểm. Không có quan sát tới nơi, dừng, localization hay camera.{record.sourceFileSha256 && <span className="mt-0.5 block break-all font-mono text-[11px] text-[#64748b]">SHA-256 {record.sourceFileSha256}</span>}</p>
                : <ul className="mt-2 grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-2">{observations(record).map(item => <li key={item.label}>{item.passed ? 'Đạt' : 'Chưa đạt'}: {item.label}</li>)}</ul>}
              {record.reason && <p className="mt-2"><span className="font-medium">Lý do:</span> {record.reason}</p>}
              <p className="mt-2 whitespace-pre-wrap"><span className="font-medium">Bằng chứng:</span> {record.evidenceNote}</p>
            </section>
          )
        })}
        {revision.verificationSourceRevisionId && revision.verificationSourceRevisionId !== revision.id && <Note>Phiên bản {revision.revisionNumber} chỉ đổi nội dung nên giữ kết quả của phiên bản đã kiểm chứng.</Note>}
        <Note>Kết quả đã ghi không sửa hay thu hồi được. Muốn kiểm tra lại, Staff tạo phiên bản mới đổi vị trí, hướng, camera hoặc bản đồ rồi gửi lại, POI sẽ quay về Chờ kiểm chứng.</Note>
      </div>
    </Modal>
  )
}
