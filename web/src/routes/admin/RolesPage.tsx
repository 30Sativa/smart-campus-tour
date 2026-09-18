import { Check, Layers, Minus, ShieldCheck, Users } from 'lucide-react'
import { CellIcon, PageHeader, PanelHead, SummaryTile, panelClass } from '../../features/staff/StaffUi'
import { ALL_ROLES, AREAS, roleRow } from '../../auth/access'
import { STAFF_NAV } from '../../features/staff/staff-nav'
import { VISITOR_NAV, VISITOR_SECONDARY_NAV } from '../../features/visitor/visitor-content'
import { ADMIN_NAV } from '../../features/administration/admin-nav'

const shell = 'min-h-full bg-[#f1f6fe] px-4 py-5 font-sans sm:px-6 lg:px-8 lg:py-7'

const AREA_PAGES: Record<string, string[]> = {
  public: ['Trang giới thiệu', 'Đăng nhập', 'Đăng ký'],
  // The visitor app is an English surface, so its own nav labels are English.
  // They are listed as the area ships them rather than translated here, which
  // would put a second name on every page.
  visitor: [...VISITOR_NAV, ...VISITOR_SECONDARY_NAV].map((item) => item.label),
  staff: STAFF_NAV.map((item) => item.label),
  admin: ADMIN_NAV.map((item) => item.label),
}

/**
 * One answer in the matrix.
 *
 * Text, not just an icon: the answer has to survive a screen reader and a
 * printout. This is the page's one exception to the single-accent rule, and it
 * earns it — "được vào" and "không" are opposite meanings, and the whole page is
 * a grid of them.
 */
function AccessCell({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#cde9dc] bg-[#effbf5] px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-[#1f7a55]">
      <Check size={12} strokeWidth={2.4} aria-hidden="true" />
      Được vào
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe6f4] bg-[#f6f9fd] px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-[#5d7085]">
      <Minus size={12} strokeWidth={2.4} aria-hidden="true" />
      Không
    </span>
  )
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

  /**
   * How many of the role/area pairs are open. Counted from the same rows the
   * table renders, so the tile and the matrix can never disagree — and like the
   * matrix, it is whatever `allows()` currently returns, not a figure kept
   * anywhere by hand.
   */
  const grants = rows.reduce((total, row) => total + row.areas.filter((area) => area.allowed).length, 0)

  return (
    <div className={shell}>
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader
          eyebrow="Quản trị hệ thống"
          title="Vai trò & quyền"
          description="Vai trò nào vào được khu vực nào. Bảng này đọc trực tiếp từ quy tắc mà route guard đang áp dụng, nên luôn khớp với hành vi thật của ứng dụng."
        />

        {/* The three figures this page is about, read off the same source the
            table below reads. Nothing here is a filter, so the tiles are plain
            readouts rather than controls. */}
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Tổng quan phân quyền">
          <SummaryTile icon={Users} label="Vai trò" value={rows.length} hint="Chuẩn hóa từ claim của access token" />
          <SummaryTile icon={Layers} label="Khu vực" value={AREAS.length} hint="Mỗi khu vực có một route guard riêng" />
          <SummaryTile
            icon={ShieldCheck}
            label="Cặp vai trò / khu vực được phép"
            value={grants}
            hint={`Trên tổng số ${rows.length * AREAS.length} cặp`}
          />
        </section>

        <section className={`${panelClass} mt-5`} aria-label="Ma trận quyền truy cập">
          <PanelHead
            title="Ma trận truy cập"
            description="Chỉ đọc. Việc cấp hoặc thu hồi vai trò được thực hiện ở máy chủ, giao diện chưa có chức năng chỉnh sửa."
          />

          {/* Desktop: a matrix, because the whole point is comparing rows against
              columns. Below `lg` that becomes one card per role — a five-column
              grid on a phone is a scrollbar with a table behind it. */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f8fbff] text-[11px] font-bold text-[#71819a]">
                <tr>
                  <th scope="col" className="px-5 py-4">Vai trò</th>
                  {AREAS.map((area) => (
                    <th key={area.id} scope="col" className="px-4 py-4">{area.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2fa]">
                {rows.map((row) => (
                  <tr key={row.role} className="transition-colors hover:bg-[#f8fbff]">
                    <th scope="row" className="px-5 py-4 text-left align-top">
                      <div className="flex items-center gap-3">
                        <CellIcon icon={ShieldCheck} />
                        <span className="min-w-0">
                          <span className="block font-bold text-[#40546f]">{row.label}</span>
                          <code className="mt-0.5 block font-mono text-[11px] font-normal text-[#8a98ac]">{row.role}</code>
                        </span>
                      </div>
                    </th>
                    {row.areas.map((cell) => (
                      <td key={cell.id} className="px-4 py-4 align-middle">
                        <AccessCell allowed={cell.allowed} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-[#edf2fa] lg:hidden">
            {rows.map((row) => (
              <li key={row.role} className="p-4">
                <div className="flex items-center gap-3">
                  <CellIcon icon={ShieldCheck} />
                  <span className="min-w-0">
                    <span className="block font-bold text-[#40546f]">{row.label}</span>
                    <code className="mt-0.5 block font-mono text-[11px] text-[#8a98ac]">{row.role}</code>
                  </span>
                </div>
                <dl className="mt-3 space-y-2">
                  {row.areas.map((cell) => (
                    <div key={cell.id} className="flex items-center justify-between gap-3">
                      <dt className="min-w-0 truncate text-sm text-[#647793]">
                        {AREAS.find((area) => area.id === cell.id)?.label}
                      </dt>
                      <dd className="shrink-0">
                        <AccessCell allowed={cell.allowed} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${panelClass} mt-5`} aria-label="Nội dung từng khu vực">
          <PanelHead
            title="Mỗi khu vực gồm những gì"
            description="Danh sách lấy từ chính cấu hình điều hướng của từng khu vực."
          />
          <div className="grid divide-y divide-[#edf2fa] md:grid-cols-2 md:divide-x md:divide-[#edf2fa] lg:grid-cols-4 lg:divide-y-0">
            {AREAS.map((area) => (
              <div key={area.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-[#1f314d]">{area.label}</h3>
                  <code className="rounded bg-[#edf2fa] px-1.5 py-0.5 font-mono text-[11px] text-[#2f62b8]">{area.path}</code>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-[#71819a]">{area.purpose}</p>
                <ul className="mt-3 space-y-1.5">
                  {(AREA_PAGES[area.id] ?? []).map((page) => (
                    <li key={page} className="flex items-start gap-2 text-sm text-[#647793]">
                      <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-[#5b91ed]" />
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
