import type { Ref } from 'react'
import type { LucideIcon } from 'lucide-react'
import { GroupedSidebar } from '../../components/ui/GroupedSidebar'
import { ADMIN_NAV_ENTRIES } from './admin-nav'

/** The administration sidebar: the shared grouped sidebar with the admin pages. */
export function AdminSidebar({ id, currentPath, secondary, onNavigate, onLogout, open, panelRef }: {
  id: string
  currentPath: string | null
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
      secondary={secondary}
      onNavigate={onNavigate}
      onLogout={onLogout}
      open={open}
      panelRef={panelRef}
    />
  )
}
