import type { ReactNode } from 'react'
import type { PoiNarrationState, PoiRevision, PoiVerification } from '../../technical/api/technical'
import { usePoiNarrations } from '../../technical/technical-hooks'
import { poiObservationLabels, poiStatus, verificationMethodLabel } from '../../technical/poi-labels'
import { campusShortStamp } from '../tours/tour-calendar'
import { revisionChange } from './poi-revision-change'

const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'
const observationKeys = ['reached', 'stopped', 'localizationPassed', 'cameraPresetConfirmed'] as const
const narrationStateLabel: Record<PoiNarrationState, string> = { DRAFT: 'Bản đang soạn', APPROVED: 'Đang dùng', SUPERSEDED: 'Đã thay thế', DISCARDED: 'Đã bỏ' }

/** One collapsed group; its title carries the count so nothing long is open by default. */
function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <details className="group border-t border-[#eef2f6] first:border-t-0">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-3 text-[15px] font-semibold text-[#2d3748]">
      <span>{title} ({count})</span><span aria-hidden="true" className="text-xs text-[#718096] group-open:rotate-180">▾</span>
    </summary>
    <div className="pb-3">{count ? children : <p className="text-sm text-[#718096]">Chưa có.</p>}</div>
  </details>
}

/**
 * "Lịch sử": POI saves, technical results and narration versions, newest first. A save's status is the effective
 * result for its navigation fingerprint (the server's history rule since this change), so a content-only save reads
 * "Đạt · giữ kết quả của bản lưu …" and agrees with the POI list.
 */
export function PoiHistory({ proposalId, revisions, records, loading }: { proposalId: string; revisions: PoiRevision[]; records: PoiVerification[]; loading: boolean }) {
  const narrations = usePoiNarrations(proposalId)
  const ascending = [...revisions].sort((a, b) => a.revisionNumber - b.revisionNumber)
  const byId = new Map(ascending.map(revision => [revision.id, revision]))
  const status = (revision: PoiRevision) => {
    const label = poiStatus(revision).label
    const source = revision.verificationSourceRevisionId && revision.verificationSourceRevisionId !== revision.id
      ? byId.get(revision.verificationSourceRevisionId) : undefined
    return source ? `${label} · giữ kết quả của bản lưu ${campusShortStamp(source.createdAt)}` : label
  }
  const newestRecords = [...records].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
  const narrationList = narrations.data ?? []
  return <section className={`${card} px-5 py-2`} aria-label="Lịch sử thay đổi">
    <h2 className="sr-only">Lịch sử</h2>
    {loading && !revisions.length ? <p className="py-3 text-sm text-[#718096]">Đang tải lịch sử…</p> : <>
      <Group title="Phiên bản POI" count={ascending.length}>
        <ol className="space-y-1.5">{[...ascending].reverse().map(item => {
          const index = ascending.indexOf(item)
          return <li key={item.id} className="text-sm text-[#2d3748]">
            Bản lưu {campusShortStamp(item.createdAt)} · {status(item)}
            {index > 0 && <span className="text-[#718096]"> · so với bản trước: {revisionChange(ascending[index - 1], item)}</span>}
          </li>
        })}</ol>
      </Group>
      <Group title="Kết quả kiểm chứng" count={newestRecords.length}>
        <ul className="space-y-3">{newestRecords.map(record => {
          const revision = byId.get(record.proposalRevisionId)
          // The four steps name the camera action of the revision that was checked, not the current one.
          const labels = poiObservationLabels(revision?.cameraPreset ?? 'FRONT')
          return <li key={record.id} className="text-sm text-[#2d3748]">
            <span className="font-semibold">{record.resultCode === 'PASS' ? 'Đạt' : 'Không đạt'}</span> · {record.robotCode} · {campusShortStamp(record.checkedAt)}
            <p className="text-xs text-[#718096]">Kết quả cho bản lưu {revision ? campusShortStamp(revision.createdAt) : `số ${record.revisionNumber}`}</p>
            {record.verificationMethod === 'POSE_CAPTURE'
              ? <p className="mt-1 text-[13px]">{verificationMethodLabel.POSE_CAPTURE}</p>
              : <ul aria-label="Các bước kiểm" className="mt-1 grid gap-1 sm:grid-cols-2">{observationKeys.map((key, index) => {
                const value = record[key]
                return <li key={key} data-failed={value === false || undefined}
                  className={`rounded-lg px-2.5 py-1 text-[13px] ${value === false ? 'bg-[#fbeeec] font-semibold text-[#a4473d]' : 'bg-[#f8fafc] text-[#2d3748]'}`}>
                  {labels[index]}: {value === true ? 'Đạt' : value === false ? 'Không đạt' : 'Không ghi'}
                </li>
              })}</ul>}
            {record.reason && <p className="text-[#a4473d]">Lý do: {record.reason}</p>}
            <p className="text-xs text-[#718096]">{record.evidenceNote}</p>
          </li>
        })}</ul>
      </Group>
      <Group title="Lịch sử thuyết minh" count={narrationList.length}>
        <ol className="space-y-1.5">{narrationList.map(item => <li key={item.id} className="text-sm text-[#2d3748]">
          Phiên bản {item.revisionNumber} · {narrationStateLabel[item.state]} · sửa cuối {item.lastEditedByName} lúc {campusShortStamp(item.lastEditedAt)}{item.approvedByName ? ` · duyệt ${item.approvedByName}` : ''}
        </li>)}</ol>
      </Group>
    </>}
  </section>
}
