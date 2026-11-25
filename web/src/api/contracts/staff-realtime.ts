/**
 * Connection state of a SignalR push channel, shared by the consoles that show it.
 *
 * The Staff-only `/hubs/operations` hub is consumed by
 * `features/staff/operations/fleet-telemetry.ts`, which owns the one connection
 * and listens for `FleetUpdated`, `TourUpdated`, `BallotUpdated` and
 * `StaffNotificationsUpdated` (docs/architecture.md §3.1.2). `AssistanceRequired`
 * remains planned; nothing listens for it until the backend sends it.
 */
export type RealtimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
