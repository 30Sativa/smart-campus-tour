import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, labelClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { AdminPage, EmptyState, Notice, SkeletonRows } from '../../features/administration/AdminUi'
import { apiClient } from '../../api/client'
import type { ApiResponse } from '../../api/contracts/shared'
import type { RobotCredentialAudit, RobotCredentialView } from '../../features/technical/api/technical'
import { errorText, stamp } from '../../features/technical/technical-format'

type AuditPage = { items: RobotCredentialAudit[]; page: number; pageSize: number; totalItems: number }
type Filters = { action: string; robotCode: string; actorUserId: string; from: string; to: string }
const blankFilters: Filters = { action: '', robotCode: '', actorUserId: '', from: '', to: '' }

export default function AdminRobotCredentialsPage() {
  const client = useQueryClient()
  const [filters, setFilters] = useState(blankFilters)
  const [page, setPage] = useState(1)
  const [robotCode, setRobotCode] = useState('')
  const [reason, setReason] = useState('')
  const [selectedRobot, setSelectedRobot] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const audit = useQuery({
    queryKey: ['admin', 'robot-credential-audit', filters, page],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page) })
      if (filters.action) query.set('action', filters.action)
      if (filters.robotCode.trim()) query.set('robotCode', filters.robotCode.trim())
      if (filters.actorUserId.trim()) query.set('actorUserId', filters.actorUserId.trim())
      if (filters.from) query.set('from', new Date(filters.from).toISOString())
      if (filters.to) query.set('to', new Date(filters.to).toISOString())
      return apiClient<ApiResponse<AuditPage>>(`/api/admin/audit-logs?${query}`).then(response => response.data!)
    },
  })
  const credential = useQuery({
    queryKey: ['admin', 'robot-credential-status', selectedRobot],
    queryFn: () => apiClient<ApiResponse<RobotCredentialView>>(`/api/robots/${encodeURIComponent(selectedRobot)}/credential`).then(response => response.data!),
    enabled: Boolean(selectedRobot), retry: false,
  })
  const revoke = useMutation({
    mutationFn: () => apiClient<ApiResponse<unknown>>(`/api/robots/${encodeURIComponent(selectedRobot)}/credential/revoke`, {
      method: 'POST', json: { requestId: crypto.randomUUID(), expectedRowVersion: credential.data!.rowVersion, reason: reason.trim() },
    }),
    onSuccess: async () => {
      setReason(''); setActionError(null)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin', 'robot-credential-status', selectedRobot] }),
        client.invalidateQueries({ queryKey: ['admin', 'robot-credential-audit'] }),
      ])
    },
    onError: error => setActionError(errorText(error)),
  })
  const selectRobot = () => { if (robotCode.trim()) setSelectedRobot(robotCode.trim()) }
  const totalPages = Math.max(1, Math.ceil((audit.data?.totalItems ?? 0) / (audit.data?.pageSize ?? 50)))

  return <AdminPage>
    <PageHeader eyebrow="Bảo mật robot" title="Lịch sử khóa robot" description="Xem lịch sử cấp, cấp lại và thu hồi khóa. Admin chỉ có quyền thu hồi khẩn cấp; không thể cấp hoặc xem bí mật khóa." />
    <section className={`${panelClass} mb-5`} aria-label="Thu hồi khẩn cấp khóa robot">
      <div className="border-b border-[#eef1f4] px-4 py-3"><h2 className="font-semibold">Thu hồi khẩn cấp</h2><p className="mt-1 text-sm text-slate-600">MiniPC sẽ mất kết nối sau khi thu hồi. Technical Staff cần cấp khóa mới riêng.</p></div>
      <div className="flex flex-wrap items-end gap-3 p-4">
        <div><label className={labelClass} htmlFor="admin-credential-robot">Mã robot vật lý</label><input id="admin-credential-robot" className={`${inputClass} mt-1`} value={robotCode} onChange={event => setRobotCode(event.target.value)} /></div>
        <button type="button" className={buttonClass('secondary')} onClick={selectRobot}>Tải trạng thái khóa</button>
        {selectedRobot && credential.data && <div className="text-sm" role="status">{selectedRobot}: {credential.data.status === 'ACTIVE' ? `Đang hoạt động · …${credential.data.hint ?? '????'}` : credential.data.status === 'REVOKED' ? 'Đã thu hồi' : 'Chưa cấp'}</div>}
      </div>
      {credential.isError && <p role="alert" className="px-4 pb-3 text-sm text-red-700">{errorText(credential.error)}</p>}
      {credential.data?.status === 'ACTIVE' && <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
        <div className="min-w-64 flex-1"><label className={labelClass} htmlFor="admin-revoke-reason">Lý do thu hồi (bắt buộc)</label><input id="admin-revoke-reason" className={`${inputClass} mt-1`} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></div>
        <button type="button" className={buttonClass('danger')} disabled={revoke.isPending || !reason.trim()} onClick={() => { if (window.confirm('Thu hồi ngay khóa của robot này? MiniPC sẽ mất kết nối.')) revoke.mutate() }}>Thu hồi khóa</button>
      </div>}
      {revoke.isPending && <p role="status" className="px-4 pb-3 text-sm">Đang thu hồi…</p>}
      {actionError && <p role="alert" className="px-4 pb-3 text-sm text-red-700">{actionError}</p>}
    </section>
    <section className={panelClass} aria-label="Bộ lọc nhật ký khóa robot">
      <div className="grid gap-3 border-b border-[#eef1f4] p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div><label className={labelClass} htmlFor="audit-action">Thao tác</label><select id="audit-action" className={`${inputClass} mt-1`} value={filters.action} onChange={event => { setFilters(value => ({ ...value, action: event.target.value })); setPage(1) }}><option value="">Tất cả</option><option value="ROBOT_CREDENTIAL_ISSUED">Cấp khóa</option><option value="ROBOT_CREDENTIAL_ROTATED">Cấp lại</option><option value="ROBOT_CREDENTIAL_REVOKED">Thu hồi</option></select></div>
        {(['robotCode', 'actorUserId', 'from', 'to'] as const).map(field => <div key={field}><label className={labelClass} htmlFor={`audit-${field}`}>{({ robotCode: 'Mã robot', actorUserId: 'Actor user ID', from: 'Từ thời điểm', to: 'Đến thời điểm' })[field]}</label><input id={`audit-${field}`} type={field === 'from' || field === 'to' ? 'datetime-local' : 'text'} className={`${inputClass} mt-1`} value={filters[field]} onChange={event => { setFilters(value => ({ ...value, [field]: event.target.value })); setPage(1) }} /></div>)}
      </div>
      {audit.isPending ? <SkeletonRows rows={5} label="Đang tải nhật ký khóa robot" /> : audit.isError ? <div className="p-4"><Notice tone="danger">{errorText(audit.error)}</Notice></div> : audit.data?.items.length === 0 ? <EmptyState title="Chưa có nhật ký phù hợp" description="Thay đổi bộ lọc để xem các lần cấp, cấp lại hoặc thu hồi khóa." /> : <>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-[#e2e8f0]"><tr>{['Thời điểm', 'Mã robot', 'Thao tác', 'Người thực hiện', 'Nguồn', 'Hint', 'Lý do'].map(value => <th key={value} className={thClass}>{value}</th>)}</tr></thead><tbody className="divide-y divide-[#eef1f4]">{audit.data?.items.map(row => <tr key={row.id}><td className={tdClass}>{stamp(row.occurredAt)}</td><td className={`${tdClass} font-mono`}>{row.robotCode}</td><td className={tdClass}>{row.action.replace('ROBOT_CREDENTIAL_', '')}</td><td className={tdClass}>{row.actorName ?? 'CLI'}</td><td className={tdClass}>{row.source}</td><td className={`${tdClass} font-mono`}>{row.hint ? `…${row.hint}` : '—'}</td><td className={tdClass}>{row.reason ?? '—'}</td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between border-t border-[#eef1f4] px-4 py-3 text-sm"><span>{audit.data?.totalItems ?? 0} bản ghi · trang {page}/{totalPages}</span><div className="flex gap-2"><button type="button" className={buttonClass('secondary', 'sm')} disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Trước</button><button type="button" className={buttonClass('secondary', 'sm')} disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Sau</button></div></div>
      </>}
    </section>
  </AdminPage>
}
