import { useMemo } from 'react'
import { Link } from 'react-router'
import { Bot, PlugZap, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useOpsAmrs } from '../../features/operations/operations-hooks'
import { ErrorPanel, LoadingPanel, PageHeader, panelClass, StatusBadge } from '../../features/operations/OperationsUi'
import { statusInfo } from '../../features/operations/status'
import { formatBattery, formatDateTime } from '../../features/operations/formatters'
import { ADMIN_BLOCKED_ON_BACKEND } from '../../features/administration/admin-nav'
import { ALL_ROLES, AREAS } from '../../auth/access'

const shell = 'min-h-full bg-[#f4f6fa] px-4 py-5 sm:px-6 lg:px-8 lg:py-7'

/**
 * Administration overview.
 *
 * Not the operations dashboard with a different heading. An operator asks "what
 * needs me right now"; an administrator asks "what does this system consist of,
 * and is any of it unhealthy". So this counts and inventories rather than
 * dispatches: no today's tour list, no alert queue, no assignment actions. The
 * numbers come from the AMR contract that already exists, and the access figures
 * from the app's own role model. Nothing here is invented.
 */
export default function SystemOverviewPage() {
  const amrs = useOpsAmrs()

  const summary = useMemo(() => {
    const list = amrs.data ?? []
    const byTone = (value?: string | null) => statusInfo(value).tone
    return {
      total: list.length,
      online: list.filter((a) => byTone(a.connectionState) === 'ok').length,
      needsAttention: list.filter((a) => ['warn', 'danger'].includes(byTone(a.connectionState)) || ['warn', 'danger'].includes(byTone(a.operationalState))).length,
      lowBattery: list.filter((a) => a.batteryPercent != null && a.batteryPercent < 20).length,
      inventory: [...list].sort((a, b) => {
        const rank = (v?: string | null) => ({ danger: 0, warn: 1, muted: 2, info: 3, ok: 4 })[byTone(v)] ?? 5
        return rank(a.connectionState) - rank(b.connectionState) || a.name.localeCompare(b.name, 'vi')
      }),
    }
  }, [amrs.data])

  if (amrs.isPending) return <div className={shell}><LoadingPanel label="Đang tải dữ liệu hệ thống…" /></div>
  if (amrs.isError) return <div className={shell}><ErrorPanel error={amrs.error} /></div>

  const tiles = [
    { label: 'Thiết bị AMR', value: summary.total, hint: 'Tổng số robot đã đăng ký', icon: Bot },
    { label: 'Đang kết nối', value: summary.online, hint: 'Telemetry còn mới', icon: PlugZap },
    { label: 'Cần can thiệp', value: summary.needsAttention, hint: 'Mất kết nối, dữ liệu chậm hoặc lỗi', icon: TriangleAlert },
    { label: 'Vai trò đang dùng', value: ALL_ROLES.length, hint: 'Định nghĩa trong mã nguồn', icon: ShieldCheck },
  ]

  return (
    <div className={shell}>
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader
          eyebrow="Quản trị hệ thống"
          title="Tổng quan hệ thống"
          description="Thành phần và tình trạng của CampusTour: đội thiết bị đã đăng ký và phạm vi truy cập theo vai trò. Điều phối tour trong ngày thuộc khu vực vận hành."
          action={<Link to="/admin/roles" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#33415c] px-4 text-sm font-bold text-white hover:bg-[#28334a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#33415c] focus-visible:ring-offset-2">Xem vai trò & quyền</Link>}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số hệ thống">
          {tiles.map(({ label, value, hint, icon: Icon }) => (
            <div key={label} className={`${panelClass} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-3xl font-extrabold tracking-[-0.05em] text-[#1f2937]">{value}</p>
                <Icon size={18} className="mt-1 shrink-0 text-[#8792a5]" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm font-bold text-[#3c4657]">{label}</p>
              <p className="mt-0.5 text-xs leading-5 text-[#8792a5]">{hint}</p>
            </div>
          ))}
        </section>

        <section className={`${panelClass} mt-5`} aria-label="Danh mục thiết bị">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ecf0f5] px-5 py-4">
            <div>
              <h2 className="font-bold text-[#3c4657]">Danh mục thiết bị</h2>
              <p className="mt-0.5 text-xs text-[#8792a5]">Sắp xếp theo mức độ cần chú ý. Thiết bị có vấn đề đứng trước.</p>
            </div>
            {summary.lowBattery > 0 && <StatusBadge value="warning" className="shrink-0" />}
          </div>

          {summary.inventory.length === 0 ? (
            <p className="p-10 text-center text-sm font-medium text-[#8792a5]">Chưa có thiết bị nào được đăng ký.</p>
          ) : (
            <>
              {/* Desktop: a table, because an administrator compares rows.
                  Below `md` the same records become cards; five columns squeezed
                  into 375px is not a table, it is a wall. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-[#f8fafc] text-[11px] font-bold text-[#6b7688]">
                    <tr>
                      <th scope="col" className="px-5 py-3">Thiết bị</th>
                      <th scope="col" className="px-4 py-3">Kết nối</th>
                      <th scope="col" className="px-4 py-3">Hoạt động</th>
                      <th scope="col" className="px-4 py-3">Pin</th>
                      <th scope="col" className="px-5 py-3">Cập nhật cuối</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0f3f7]">
                    {summary.inventory.map((amr) => (
                      <tr key={amr.id} className="hover:bg-[#f8fafc]">
                        <td className="px-5 py-3 font-bold whitespace-nowrap text-[#3c4657]">{amr.name}</td>
                        <td className="px-4 py-3"><StatusBadge value={amr.connectionState} /></td>
                        <td className="px-4 py-3"><StatusBadge value={amr.operationalState} /></td>
                        <td className={`px-4 py-3 font-semibold ${amr.batteryPercent != null && amr.batteryPercent < 20 ? 'text-[#b23e31]' : 'text-[#6b7688]'}`}>{formatBattery(amr.batteryPercent)}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-[#6b7688]">{formatDateTime(amr.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-[#f0f3f7] md:hidden">
                {summary.inventory.map((amr) => (
                  <li key={amr.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-bold text-[#3c4657]">{amr.name}</p>
                      <StatusBadge value={amr.connectionState} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6b7688]">
                      <StatusBadge value={amr.operationalState} />
                      <span className={amr.batteryPercent != null && amr.batteryPercent < 20 ? 'font-bold text-[#b23e31]' : ''}>Pin {formatBattery(amr.batteryPercent)}</span>
                      <span>{formatDateTime(amr.lastSeenAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className={panelClass} aria-label="Phạm vi truy cập">
            <div className="border-b border-[#ecf0f5] px-5 py-4">
              <h2 className="font-bold text-[#3c4657]">Phạm vi truy cập</h2>
              <p className="mt-0.5 text-xs text-[#8792a5]">Ba khu vực của sản phẩm và mục đích của từng khu vực.</p>
            </div>
            <ul className="divide-y divide-[#f0f3f7]">
              {AREAS.map((area) => (
                <li key={area.id} className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[#3c4657]">{area.label}</p>
                    <code className="rounded bg-[#f0f3f7] px-1.5 py-0.5 font-mono text-[11px] text-[#6b7688]">{area.path}</code>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#8792a5]">{area.purpose}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* Said once, in prose, instead of six menu items that open nothing. */}
          <section className={panelClass} aria-label="Chưa khả dụng">
            <div className="border-b border-[#ecf0f5] px-5 py-4">
              <h2 className="font-bold text-[#3c4657]">Chưa khả dụng</h2>
              <p className="mt-0.5 text-xs text-[#8792a5]">Các chức năng quản trị còn chờ contract từ máy chủ. Chưa đưa vào điều hướng để không dẫn tới trang rỗng.</p>
            </div>
            <ul className="grid gap-x-4 gap-y-2 px-5 py-4 sm:grid-cols-2">
              {ADMIN_BLOCKED_ON_BACKEND.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-[#6b7688]">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#c3cad6]" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
