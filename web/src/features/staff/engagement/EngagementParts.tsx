import { panelClass, PanelHead } from '../../../components/ui/ConsolePrimitives'
import { rowClass, tdClass, thClass } from '../../../components/ui/ui-classes'
import type { AudienceSegment, EngagementSignal } from './engagement-api'
import { percent, ROW_TYPE_LABEL, SIGNAL, SIGNAL_TONE_CLASS, sortedAudience } from './engagement-labels'

export function SignalTags({ signals }: { signals: EngagementSignal[] }) {
  if (signals.length === 0) return <span className="text-muted">-</span>
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Nhận xét">
      {signals.map(signal => (
        <li key={signal} className={`rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${SIGNAL_TONE_CLASS[SIGNAL[signal].tone]}`}>
          {SIGNAL[signal].label}
        </li>
      ))}
    </ul>
  )
}

/**
 * Who took part, by invitation type. A shared-viewing row is one projector room, so its numbers say how many rooms
 * joined, not how many students watched there.
 */
export function AudiencePanel({ audience }: { audience: AudienceSegment[] }) {
  return (
    <section className={panelClass} aria-label="Ai tham gia tương tác">
      <PanelHead title="Ai tham gia tương tác" description="Theo loại lời mời. Một dòng phòng xem chung là một phòng, không phải số học sinh ngồi xem." />
      <div className="overflow-x-auto"><table className="w-full text-left" aria-label="Tham gia theo loại lời mời">
        <thead className="border-b border-[#e2e8f0]"><tr>
          {['Loại lời mời', 'Được mời', 'Đã vào xem', 'Đã bầu chọn', 'Câu hỏi AI'].map(label => <th key={label} scope="col" className={thClass}>{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-[#eef1f4]">
          {sortedAudience(audience).map(segment => (
            <tr key={segment.rowType} className={rowClass}>
              <th scope="row" className={`${tdClass} font-semibold text-[#0f172a]`}>{ROW_TYPE_LABEL[segment.rowType] ?? segment.rowType}</th>
              <td className={`${tdClass} tabular-nums`}>{segment.acceptedRows}</td>
              <td className={`${tdClass} tabular-nums`}>{segment.joinedRows} <span className="text-muted">({percent(segment.joinedRows, segment.acceptedRows)})</span></td>
              <td className={`${tdClass} tabular-nums`}>{segment.votedRows} <span className="text-muted">({percent(segment.votedRows, segment.joinedRows)})</span></td>
              <td className={`${tdClass} tabular-nums`}>{segment.questions}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  )
}

export const PRIVACY_NOTE = 'Số liệu tổng hợp, không gắn với tên người xem. Câu hỏi AI chỉ được đếm, nội dung không được lưu.'
