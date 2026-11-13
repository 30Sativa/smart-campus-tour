import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Pagination, panelClass } from '../../components/ui/ConsolePrimitives'
import { DateInput } from '../../components/ui/DateInput'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateTime } from '../../components/ui/date-time'
import { buttonClass, inputClass, labelClass, rowClass } from '../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, SkeletonRows } from '../../features/administration/AdminUi'
import { AUDIT_PAGE_SIZE, listAuditLogs, type AuditLogEntry } from '../../features/administration/audit/audit-api'
import { AUDIT_ACTION_GROUPS, auditActionLabel, auditActorLabel, auditEntityLabel, auditResult } from '../../features/administration/audit/audit-labels'
import { useDebouncedValue } from '../../features/administration/use-debounced-value'
import { ToneBadge } from '../../features/technical/TechnicalUi'
import { errorText } from '../../features/technical/technical-format'

const blankFilters = { action: '', actor: '', from: '', to: '' }
const COLUMNS = ['Thời điểm', 'Thao tác', 'Đối tượng', 'Người thực hiện', 'Kết quả']
// Below md each row is a card: cells stack and name their column, so nothing scrolls sideways.
const cellClass = 'block px-4 py-1 text-sm md:table-cell md:py-3 md:align-middle before:block before:text-[11px] before:font-semibold before:text-muted before:content-[attr(data-label)] md:before:hidden'

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
    <PageHeader eyebrow="Giám sát" title="Nhật ký hệ thống" description="Xem ai đã làm gì, trên đối tượng nào và khi nào." />
    <section className={panelClass} aria-label="Nhật ký hệ thống">
      <div className="grid gap-3 border-b border-[#eef1f4] p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.2fr_1fr_1fr_auto] lg:items-end">
        <div><label className={labelClass} htmlFor="audit-action">Thao tác</label><select id="audit-action" className={`${inputClass} mt-1`} value={filters.action} onChange={event => change({ action: event.target.value })}>
          <option value="">Tất cả thao tác</option>
          {AUDIT_ACTION_GROUPS.map(group => <optgroup key={group.label} label={group.label}>{Object.entries(group.actions).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</optgroup>)}
        </select></div>
        <div><label className={labelClass} htmlFor="audit-actor">Người thực hiện</label><input id="audit-actor" className={`${inputClass} mt-1`} maxLength={100} placeholder="Tên hoặc tên đăng nhập" value={filters.actor} onChange={event => change({ actor: event.target.value })} /></div>
        <div><label className={labelClass} htmlFor="audit-from">Từ ngày</label><DateInput id="audit-from" className={`${inputClass} mt-1`} value={filters.from} max={filters.to || undefined} onChange={from => change({ from })} /></div>
        <div><label className={labelClass} htmlFor="audit-to">Đến ngày</label><DateInput id="audit-to" className={`${inputClass} mt-1`} value={filters.to} min={filters.from || undefined} onChange={to => change({ to })} /></div>
        <button type="button" className={buttonClass('secondary')} disabled={!filtered} onClick={() => change(blankFilters)}>Xóa lọc</button>
      </div>
      {logs.isPending ? <SkeletonRows rows={6} label="Đang tải nhật ký" />
        : logs.isError ? <div className="p-4"><AdminErrorPanel title={errorText(logs.error)} onRetry={() => void logs.refetch()} /></div>
        : !logs.data.data.length ? (filtered ? <EmptyState variant="noMatch" onClear={() => change(blankFilters)} /> : <EmptyState variant="empty" title="Chưa có nhật ký" />)
        : <>
          <table className="block w-full text-left md:table">
            <thead className="hidden border-b border-[#e2e8f0] md:table-header-group"><tr>{COLUMNS.map(title => <th key={title} className="bg-[#f8fafc] px-4 py-3 text-xs font-semibold text-[#475569]">{title}</th>)}</tr></thead>
            <tbody className="block divide-y divide-[#eef1f4] md:table-row-group">{logs.data.data.map(entry => <AuditRow key={entry.id} entry={entry} />)}</tbody>
          </table>
          <Pagination page={page} pageCount={logs.data.pagination.totalPages} total={logs.data.pagination.totalItems} pageSize={AUDIT_PAGE_SIZE} onPage={setPage} label="Phân trang nhật ký" />
        </>}
    </section>
  </AdminPage>
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const result = auditResult(entry.resultCode)
  return <tr className={`${rowClass} block py-2 md:table-row md:py-0`}>
    <td data-label={COLUMNS[0]} className={`${cellClass} text-xs text-[#64748b] tabular-nums md:whitespace-nowrap`}>{formatDateTime(entry.occurredAt)}</td>
    <td data-label={COLUMNS[1]} className={`${cellClass} font-medium text-[#0f172a]`}>{auditActionLabel(entry.action)}</td>
    <td data-label={COLUMNS[2]} className={cellClass}>{auditEntityLabel(entry.entityType)}{(entry.tourName || entry.robotCode) && <p className="text-[11.5px] break-words text-[#64748b]">{entry.tourName ?? entry.robotCode}</p>}</td>
    <td data-label={COLUMNS[3]} className={cellClass}>{auditActorLabel(entry)}</td>
    <td data-label={COLUMNS[4]} className={cellClass}>{result ? <ToneBadge tone={result.tone}>{result.label}</ToneBadge> : '-'}</td>
  </tr>
}
