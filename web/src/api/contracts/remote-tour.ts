/** FE preview contract only. No remote-tour HTTP endpoints are implemented yet. */
export type TourState = 'SCHEDULED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'
export type RegistrationState = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
export type Step = 'NAVIGATING' | 'PREPARING' | 'OBSERVING' | 'FRONT' | 'RETURNING'
export type Operation = 'NORMAL' | 'NEEDS_ASSISTANCE'
export type TourAction = 'ready' | 'reopen' | 'cancel' | 'start' | 'hold' | 'next' | 'retry-leg' | 'retry-poi' | 'retry-front' | 'complete' | 'end-early'
export type RosterRow = { name: string; className: string }
export type PreparedRoute = { id: string; name: string; pois: { name: string; text: string; x: number; y: number }[] }
export type ActionOption = { action: TourAction; label: string; reason?: string }
export type RemoteTour = {
  id: string; name: string; scheduledAt: string; description: string; routeId: string
  state: TourState; operation: Operation; step: Step; poiIndex: number; hold: boolean
  revision: number; fault?: string; returnArrived?: boolean; endReason?: string; log: string[]
}
export type Registration = {
  id: string; tourId: string; ownerId: string; school: string; contact: string; email: string
  roster: RosterRow[]; state: RegistrationState; revision: number; code: string
  rejectionReason?: string; invitationSentAt?: string; updatedAt?: string
}
export type RemoteRobot = {
  id: string; source: 'Physical' | 'Gazebo' | 'Emulator'; connected: boolean
  localized: boolean; powerReady: boolean; front: boolean; streamReady: boolean; assignedTourId: string | null
  needsInspection: boolean; updatedAt: string
}
export type Workspace = {
  tours: RemoteTour[]; registrations: Registration[]; routes: PreparedRoute[]
  robots: RemoteRobot[]; actions: Record<string, ActionOption[]>
}
export type StudentSnapshot = {
  access: 'join' | 'waiting' | 'updating' | 'live' | 'ended' | 'denied'
  message?: string; tour: Pick<RemoteTour, 'id' | 'name' | 'scheduledAt' | 'state' | 'operation' | 'step' | 'poiIndex' | 'hold'>
  route?: PreparedRoute; visitKey?: string; pose?: { x: number; y: number; updatedAt: string }
  videoUrl?: string; narrationUrl?: string
}
export type RegistrationInput = { tourId: string; school: string; contact: string; email: string; roster: RosterRow[] }
