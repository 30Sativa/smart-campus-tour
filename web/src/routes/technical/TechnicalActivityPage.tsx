import { useState } from 'react'
import { LoadingPanel, PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { useTechnicalActivity } from '../../features/technical/technical-hooks'
import { stamp } from '../../features/technical/technical-format'
import { ChoiceGroup, TechnicalPage } from '../../features/technical/TechnicalUi'
import type { ActivityKind } from '../../features/technical/types'

type Filter = 'ALL' | ActivityKind
const FILTERS: { value: Filter; label: string }[] = [{ value: 'ALL', label: 'Tất cả' }, { value: 'MAP', label: 'Map' }, { value: 'POI', label: 'POI' }, { value: 'ROUTE', label: 'Tuyến' }]

/** Every upload, deploy, localization, POI check, confirmation and revocation, newest first. */
export default function TechnicalActivityPage() {
  const activity = useTechnicalActivity()
  const [filter, setFilter] = useState<Filter>('ALL')
  const list = (activity.data ?? []).filter((entry) => filter === 'ALL' || entry.kind === filter)
  return (
    <TechnicalPage>
      <PageHeader eyebrow="Kỹ thuật" title="Nhật ký kỹ thuật" description="Mọi lần upload, deploy, localization, xác minh POI, xác nhận và thu hồi đều được ghi lại kèm người làm." />
      <div className="mb-4"><ChoiceGroup name="activity-filter" label="Loại" value={filter} options={FILTERS} onChange={setFilter} /></div>
      {activity.isPending ? <LoadingPanel label="Đang tải nhật ký…" /> : (
        <section className={panelClass} aria-label="Nhật ký">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-[#f1f5f9]"><th className={thClass}>Thời điểm</th><th className={thClass}>Người</th><th className={thClass}>Hành động</th><th className={thClass}>Đối tượng</th><th className={thClass}>Ghi chú</th></tr></thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {list.map((entry) => (
                  <tr key={entry.id} className={rowClass}>
                    <td className={`${tdClass} whitespace-nowrap text-[#64748b] tabular-nums`}>{stamp(entry.at)}</td>
                    <td className={tdClass}>{entry.by}</td>
                    <td className={`${tdClass} font-semibold text-[#0f172a]`}>{entry.action}</td>
                    <td className={tdClass}>{entry.target}</td>
                    <td className={`${tdClass} text-[13px] text-[#64748b]`}>{entry.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </TechnicalPage>
  )
}
