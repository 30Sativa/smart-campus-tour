import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Pagination, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, SkeletonRows } from '../../features/administration/AdminUi'
import { AUDIT_PAGE_SIZE, listAuditLogs, type AuditLogEntry } from '../../features/administration/audit/audit-api'
import { AUDIT_ACTION_GROUPS, auditActionLabel, auditEntityLabel, auditResult } from '../../features/administration/audit/audit-labels'
import { useDebouncedValue } from '../../features/administration/use-debounced-value'
import { ToneBadge } from '../../features/technical/TechnicalUi'
import { errorText, stamp } from '../../features/technical/technical-format'

const blankFilters = { action: '', actor: '', from: '', to: '' }

/** Read-only view of the append-only audit log: who did what, on what, and when. */
export default function AdminAuditLogsPage() {
  const [filters, setFilters] = useState(blankFilters)
  const [page, setPage] = useState(1)
  const actor = useDebouncedValue(filters.actor, 300)
  const query = { ...filters, actor, page }
  const logs = useQuery({ queryKey: ['admin', 'system-audit-logs', query], queryFn: () => listAuditLogs(query) })
  const change = (patch: Partial<typeof blankFilters>) => { setFilters(value => ({ ...value, ...patch })); setPage(1) }
  const filtered = Object.values(filters).some(Boolean)

  return <AdminPage>
    <PageHeader eyebrow="Giám sát" title="Nhật ký hệ thống" description="Xem ai đã làm gì, trên đối tượng nào và khi nào. Nhật ký chỉ đọc, không sửa hay xóa được." />
    <section className={panelClass} aria-label="Nhật ký hệ thống">
      <div className="grid gap-3 border-b border-[#eef1f4] p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.2fr_1fr_1fr_auto] lg:items-end">
        <div><label className={labelClass} htmlFor="audit-action">Thao tác</label><select id="audit-action" className={`${inputClass} mt-1`} value={filters.action} onChange={event => change({ action: event.target.value })}>
          <option value="">Tất cả thao tác</option>
          {AUDIT_ACTION_GROUPS.map(group => <optgroup key={group.label} label={group.label}>{Object.entries(group.actions).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</optgroup>)}
        </select></div>
        <div><label className={labelClass} htmlFor="audit-actor">Người thực hiện</label><input id="audit-actor" className={`${inputClass} mt-1`} maxLength={100} placeholder="Tên hoặc tên đăng nhập" value={filters.actor} onChange={event => change({ actor: event.target.value })} /></div>
        <div><label className={labelClass} htmlFor="audit-from">Từ</label><input id="audit-from" type="datetime-local" className={`${inputClass} mt-1`} value={filters.from} onChange={event => change({ from: event.target.value })} /></div>
        <div><label className={labelClass} htmlFor="audit-to">Đến</label><input id="audit-to" type="datetime-local" className={`${inputClass} mt-1`} value={filters.to} onChange={event => change({ to: event.target.value })} /></div>
        <button type="button" className={buttonClass('secondary')} disabled={!filtered} onClick={() => change(blankFilters)}>Xóa lọc</button>
      </div>
      {logs.isPending ? <SkeletonRows rows={6} label="Đang tải nhật ký" />
        : logs.isError ? <div className="p-4"><AdminErrorPanel title={errorText(logs.error)} onRetry={() => void logs.refetch()} /></div>
        : !logs.data.data.length ? <EmptyState title={filtered ? 'Không có nhật ký phù hợp' : 'Chưa có nhật ký'} description={filtered ? 'Đổi hoặc xóa bộ lọc để xem thêm.' : 'Thao tác của người dùng sẽ xuất hiện ở đây.'} />
        : <>
          <div className="relative overflow-x-auto"><table className="w-full min-w-[820px] text-left">
            <thead className="border-b border-[#e2e8f0]"><tr>{['Thời điểm', 'Thao tác', 'Đối tượng', 'Người thực hiện', 'Kết quả'].map(title => <th key={title} className={thClass}>{title}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">{logs.data.data.map(entry => <AuditRow key={entry.id} entry={entry} />)}</tbody>
          </table></div>
          <Pagination page={page} pageCount={logs.data.pagination.totalPages} total={logs.data.pagination.totalItems} pageSize={AUDIT_PAGE_SIZE} onPage={setPage} label="Phân trang nhật ký" />
        </>}
    </section>
  </AdminPage>
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const result = auditResult(entry.resultCode)
  return <tr className={rowClass}>
    <td className={`${tdClass} whitespace-nowrap text-xs text-[#64748b]`}>{stamp(entry.occurredAt)}</td>
    <td className={`${tdClass} font-medium text-[#0f172a]`}>{auditActionLabel(entry.action)}</td>
    <td className={tdClass}>{auditEntityLabel(entry.entityType)}{(entry.tourName || entry.robotCode) && <p className="text-[11.5px] text-[#64748b]">{entry.tourName ?? entry.robotCode}</p>}</td>
    <td className={tdClass}>{entry.actorName ?? 'Hệ thống hoặc khách'}</td>
    <td className={tdClass}>{result ? <ToneBadge tone={result.tone}>{result.label}</ToneBadge> : '-'}</td>
  </tr>
}
