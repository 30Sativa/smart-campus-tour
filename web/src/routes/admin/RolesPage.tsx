import { Check, Minus } from 'lucide-react'
import { PageHeader, panelClass } from '../../features/operations/OperationsUi'
import { ALL_ROLES, AREAS, roleRow } from '../../auth/access'
import { STAFF_NAV } from '../../features/operations/staff-nav'
import { ADMIN_NAV } from '../../features/administration/admin-nav'

const shell = 'min-h-full bg-[#f4f6fa] px-4 py-5 sm:px-6 lg:px-8 lg:py-7'

const AREA_PAGES: Record<string, string[]> = {
  public: ['Trang giới thiệu', 'Đăng nhập', 'Đăng ký'],
  staff: STAFF_NAV.map((item) => item.label),
  admin: ADMIN_NAV.map((item) => item.label),
}

/**
 * Role and permission reference.
 *
 * Read-only on purpose, and labelled as such. There is no endpoint for editing
 * roles, so a screen with switches on it would be a lie with a save button.
 *
 * What makes it worth having is that it is not hand-written: every cell calls
 * the same `allows()` the router's guard calls, so this page cannot disagree
 * with what the application actually enforces. Change a rule in `auth/access.ts`
 * and this table changes with it.
 */
export default function RolesPage() {
  const rows = ALL_ROLES.map((role) => roleRow(role))

  return (
    <div className={shell}>
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader
          eyebrow="Quản trị hệ thống"
          title="Vai trò & quyền"
          description="Vai trò nào vào được khu vực nào. Bảng này đọc trực tiếp từ quy tắc mà route guard đang áp dụng, nên luôn khớp với hành vi thật của ứng dụng."
        />

        <section className={panelClass} aria-label="Ma trận quyền truy cập">
          <div className="border-b border-[#ecf0f5] px-5 py-4">
            <h2 className="font-bold text-[#3c4657]">Ma trận truy cập</h2>
            <p className="mt-0.5 text-xs text-[#8792a5]">Chỉ đọc. Việc cấp hoặc thu hồi vai trò được thực hiện ở máy chủ, giao diện chưa có chức năng chỉnh sửa.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-[#f8fafc] text-[11px] font-bold text-[#6b7688]">
                <tr>
                  <th scope="col" className="px-5 py-3">Vai trò</th>
                  {AREAS.map((area) => (
                    <th key={area.id} scope="col" className="px-4 py-3">{area.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3f7]">
                {rows.map((row) => (
                  <tr key={row.role} className="hover:bg-[#f8fafc]">
                    <th scope="row" className="px-5 py-4 text-left align-top">
                      <span className="block font-bold text-[#3c4657]">{row.label}</span>
                      <code className="mt-0.5 block font-mono text-[11px] font-normal text-[#8792a5]">{row.role}</code>
                    </th>
                    {row.areas.map((cell) => (
                      <td key={cell.id} className="px-4 py-4 align-top">
                        {/* Text, not just an icon: the answer has to survive a
                            screen reader and a printout. */}
                        {cell.allowed ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cde9dc] bg-[#effbf5] px-2.5 py-1 text-[11px] font-bold text-[#1f7a55]">
                            <Check size={12} aria-hidden="true" />Được vào
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe4ec] bg-[#f6f8fb] px-2.5 py-1 text-[11px] font-bold text-[#6b7688]">
                            <Minus size={12} aria-hidden="true" />Không
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`${panelClass} mt-5`} aria-label="Nội dung từng khu vực">
          <div className="border-b border-[#ecf0f5] px-5 py-4">
            <h2 className="font-bold text-[#3c4657]">Mỗi khu vực gồm những gì</h2>
            <p className="mt-0.5 text-xs text-[#8792a5]">Danh sách lấy từ chính cấu hình điều hướng của từng khu vực.</p>
          </div>
          <div className="grid divide-y divide-[#f0f3f7] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {AREAS.map((area) => (
              <div key={area.id} className="p-5">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-[#3c4657]">{area.label}</h3>
                  <code className="rounded bg-[#f0f3f7] px-1.5 py-0.5 font-mono text-[11px] text-[#6b7688]">{area.path}</code>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#8792a5]">{area.purpose}</p>
                <ul className="mt-3 space-y-1.5">
                  {(AREA_PAGES[area.id] ?? []).map((page) => (
                    <li key={page} className="flex items-start gap-2 text-sm text-[#6b7688]">
                      <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#c3cad6]" />
                      {page}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
