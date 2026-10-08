import type { Ref } from 'react'
import type { LucideIcon } from 'lucide-react'
import { GroupedSidebar } from '../../components/ui/GroupedSidebar'
import { ADMIN_NAV_ENTRIES } from './admin-nav'

/** The administration sidebar: the shared grouped sidebar with the admin pages and the pending badge. */
export function AdminSidebar({ id, currentPath, pendingCount, secondary, onNavigate, onLogout, open, panelRef }: {
  id: string
  currentPath: string | null
  pendingCount: number
  secondary: Array<{ to: string; label: string; icon: LucideIcon; current?: boolean }>
  onNavigate: () => void
  onLogout: () => void
  open: boolean
  panelRef: Ref<HTMLElement>
}) {
  return (
    <GroupedSidebar
      id={id}
      label="Khu vực quản trị"
      navLabel="Điều hướng quản trị"
      homePath="/admin"
      subtitle="DT-AMR · Quản trị"
      entries={ADMIN_NAV_ENTRIES}
      currentPath={currentPath}
      badges={{ '/admin/registrations/pending': { value: pendingCount, label: `${pendingCount} đoàn chờ duyệt`, tone: 'info' } }}
      secondary={secondary}
      onNavigate={onNavigate}
      onLogout={onLogout}
      open={open}
      panelRef={panelRef}
    />
  )
}
