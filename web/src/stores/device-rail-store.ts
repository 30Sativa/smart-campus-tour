import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Whether Robot & thiết bị shows its device column (robots and the Meta Quest 3
 * headset) beside the fleet map. A per-browser preference, like the sidebar fold.
 */
interface DeviceRailState {
  hidden: boolean
  toggle: () => void
}

export const useDeviceRailStore = create<DeviceRailState>()(
  persist(
    (set) => ({
      hidden: false,
      toggle: () => set((state) => ({ hidden: !state.hidden })),
    }),
    { name: 'campus-tour-device-rail' },
  ),
)
