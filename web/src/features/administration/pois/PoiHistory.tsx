import type { PoiRevision, PoiVerification } from '../../technical/api/technical'
import { poiObservationLabels, poiStatus, verificationMethodLabel } from '../../technical/poi-labels'
import { campusShortStamp } from '../tours/tour-calendar'
import { revisionChange } from './poi-revision-change'

const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'

const observationKeys = ['reached', 'stopped', 'localizationPassed', 'cameraPresetConfirmed'] as const

/** "Lịch sử thay đổi": every save with what it changed, then every technical result and the save it belongs to. */
export function PoiHistory({ revisions, records, loading }: { revisions: PoiRevision[]; records: PoiVerification[]; loading: boolean }) {
  const ordered = [...revisions].sort((a, b) => a.revisionNumber - b.revisionNumber)
  const byId = new Map(ordered.map(revision => [revision.id, revision]))
  return <section className={`${card} mt-4 p-5`} aria-label="Lịch sử thay đổi">
    <h2 className="text-lg font-bold text-[#2d3748]">Lịch sử thay đổi</h2>
    {ordered.length ? <ol className="mt-2 space-y-1.5">{ordered.map((item, index) => <li key={item.id} className="text-sm text-[#2d3748]">
      Bản lưu {campusShortStamp(item.createdAt)} · {poiStatus(item).label}
      {index > 0 && <span className="text-[#718096]"> · so với bản trước: {revisionChange(ordered[index - 1], item)}</span>}
    </li>)}</ol> : <p className="mt-2 text-sm text-[#718096]">{loading ? 'Đang tải lịch sử…' : 'Chưa có lịch sử.'}</p>}
    {records.length > 0 && <div className="mt-3 border-t border-[#e2e8f0] pt-3">
      <h3 className="text-sm font-semibold text-[#2d3748]">Kết quả kiểm chứng</h3>
      <ul className="mt-2 space-y-3">{records.map(record => {
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
    </div>}
  </section>
}
