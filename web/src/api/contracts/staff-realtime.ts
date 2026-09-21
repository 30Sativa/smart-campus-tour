/**
 * Push channel for the operations console: what the server tells the browser
 * without being asked.
 *
 * Same arrangement as `staff.ts`: the TYPE is live, and the SignalR
 * implementation below is the written record of the hub this frontend expects.
 * It is NOT wired - no hub exists yet (web/AGENTS.md §4) - so `staff-hooks.ts`
 * binds the labelled mock in `src/mocks/staff-realtime-mock.ts`, which
 * satisfies the same type. Hub and method names are a proposal until the
 * backend agrees them in `docs/architecture.md`.
 *
 * Events carry what changed, not a command to re-render: robot telemetry comes
 * as the latest fleet snapshot (latest-state semantics, a skipped sample is not
 * a loss), everything else names the object so the owner refetches it.
 */
import type { HubConnection } from '@microsoft/signalr'
import { createHubConnection } from '../signalr'
import type { AmrStatus, AssistanceReason } from './staff'

/**
 * `TourUpdated` carries the revision so an older snapshot is never applied over
 * a newer one (scope §8.6). `AssistanceRequired` is the one push an operator
 * must see wherever they are.
 */
export type StaffRealtimeEvent =
  | { type: 'FleetUpdated'; robots: AmrStatus[] }
  | { type: 'TourUpdated'; tourId: string; revision: number }
  | { type: 'AssistanceRequired'; tourId: string; tourCode: string; reason: AssistanceReason; detail?: string | null }

export type RealtimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export type StaffRealtime = {
  /** Starts the connection on the first subscriber, stops it after the last. */
  subscribe(onEvent: (event: StaffRealtimeEvent) => void, onState: (state: RealtimeConnectionState) => void): () => void
}

export const OPERATIONS_HUB = '/hubs/operations'

/** SignalR implementation. One connection, handlers registered exactly once. */
export function createStaffRealtimeHub(): StaffRealtime {
  let connection: HubConnection | null = null
  const listeners = new Set<(event: StaffRealtimeEvent) => void>()
  const stateListeners = new Set<(state: RealtimeConnectionState) => void>()
  const emit = (event: StaffRealtimeEvent) => listeners.forEach((listener) => listener(event))
  const setState = (state: RealtimeConnectionState) => stateListeners.forEach((listener) => listener(state))

  return {
    subscribe(onEvent, onState) {
      listeners.add(onEvent)
      stateListeners.add(onState)
      if (!connection) {
        connection = createHubConnection(OPERATIONS_HUB)
        connection.on('FleetUpdated', (robots: AmrStatus[]) => emit({ type: 'FleetUpdated', robots }))
        connection.on('TourUpdated', (tourId: string, revision: number) => emit({ type: 'TourUpdated', tourId, revision }))
        connection.on('AssistanceRequired', (tourId: string, tourCode: string, reason: AssistanceReason, detail?: string | null) =>
          emit({ type: 'AssistanceRequired', tourId, tourCode, reason, detail }))
        connection.onreconnecting(() => setState('reconnecting'))
        connection.onreconnected(() => setState('connected'))
        connection.onclose(() => setState('disconnected'))
        setState('connecting')
        connection.start().then(() => setState('connected'), () => setState('disconnected'))
      }
      return () => {
        listeners.delete(onEvent)
        stateListeners.delete(onState)
        if (listeners.size === 0 && connection) {
          void connection.stop()
          connection = null
        }
      }
    },
  }
}
