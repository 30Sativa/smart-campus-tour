import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Top-right of the administration header: the signed-in account. Sign-out stays in the sidebar. */
export function AdminHeaderActions({ name, role, icon: UserIcon }: { name: string; role: string; icon: LucideIcon }) {
  return (
    <div className="ml-auto flex min-w-0 items-center gap-1.5">
      <div role="group" aria-label="Tài khoản đang đăng nhập" className="ml-1 flex min-w-0 items-center gap-2.5 border-l border-[#e5e7eb] pl-3.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#173b59] text-white"><UserIcon size={15} aria-hidden="true" /></span>
        <div className="hidden min-w-0 sm:block">
          <p className="max-w-40 truncate text-[13px] leading-tight font-semibold text-[#0f172a]">{name}</p>
          <p className="max-w-40 truncate text-[11px] leading-tight text-[#9ca3af]">{role}</p>
        </div>
        <ChevronDown size={14} aria-hidden="true" className="hidden shrink-0 text-[#9ca3af] sm:block" />
      </div>
    </div>
  )
}
