import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router'
import type { LucideIcon } from 'lucide-react'

/** Top-right of the administration header: the signed-in account. Sign-out stays in the sidebar. */
export function AdminHeaderActions({ name, role, icon: UserIcon }: { name: string; role: string; icon: LucideIcon }) {
  return (
    <div className="ml-auto flex min-w-0 items-center gap-1.5">
      <Link to="/admin/profile" aria-label="Hồ sơ của tôi" title="Hồ sơ của tôi" className="ml-1 flex min-w-0 items-center gap-2.5 border-l border-[#e2e8f0] pl-3.5 rounded-lg hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#edf3fb] text-[#4a6fa5]"><UserIcon size={15} aria-hidden="true" /></span>
        <div className="hidden min-w-0 sm:block">
          <p className="max-w-40 truncate text-[13px] leading-tight font-semibold text-[#2d3748]">{name}</p>
          <p className="max-w-40 truncate text-[11px] leading-tight text-[#9ca3af]">{role}</p>
        </div>
        <ChevronDown size={14} aria-hidden="true" className="hidden shrink-0 text-[#9ca3af] sm:block" />
      </Link>
    </div>
  )
}
