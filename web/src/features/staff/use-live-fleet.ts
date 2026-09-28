import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AmrStatus } from '../../api/contracts/staff'
import { FLEET_HUB_ENABLED, connectFleetHub, type FleetConnectionState } from '../../api/contracts/fleet-realtime'
import { applyLivePoses, hasLivePoses, recordRobotPoses } from './live-fleet'
import { staffQueryKeys } from './staff-hooks'

/**
 * Real robot positions for the operations area, owned by the staff shell next
 * to `useStaffRealtimeSync`. Off (returns null, connects nothing) unless
 * `VITE_FLEET_HUB=on`. Every message, and once a second so ages keep counting
 * without new samples, the live poses are re-applied to the robot query.
 */
export function useLiveFleet(): FleetConnectionState | null {
  const queryClient = useQueryClient()
  const [state, setState] = useState<FleetConnectionState | null>(FLEET_HUB_ENABLED ? 'connecting' : null)

  useEffect(() => {
    if (!FLEET_HUB_ENABLED) return
    const refresh = () => {
      if (!hasLivePoses()) return
      queryClient.setQueryData<AmrStatus[]>(staffQueryKeys.amrs, (robots) => applyLivePoses(robots))
    }
    const stop = connectFleetHub({
      onRobotPoses: (message, arrived) => {
        recordRobotPoses(message, arrived)
        refresh()
      },
      onState: setState,
    })
    const tick = window.setInterval(refresh, 1000)
    return () => {
      window.clearInterval(tick)
      stop()
    }
  }, [queryClient])

  return state
}
