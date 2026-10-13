import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Whether the console sidebar (Staff and Admin) is folded to an icon rail on
 * wide screens. A per-browser preference, so it survives reloads; the phone
 * drawer ignores it.
 */
interface SidebarState {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: 'campus-tour-sidebar' },
  ),
)
