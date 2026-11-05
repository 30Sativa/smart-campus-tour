/**
 * Connection state of a SignalR push channel, shared by the consoles that show it.
 *
 * The Staff-only `/hubs/operations` hub and its `FleetUpdated` telemetry event
 * are consumed by `features/staff/operations/fleet-telemetry.ts`, which owns the
 * one connection. `TourUpdated` and `AssistanceRequired` remain planned events
 * (docs/architecture.md); nothing listens for them until the backend sends them.
 */
export type RealtimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
