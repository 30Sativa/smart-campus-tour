export type HeadStep = { preset: 'FRONT' | 'LEFT' | 'RIGHT'; holdSeconds: number }
export type RouteStopInput = { poiId: string; dwellSeconds: number; headSteps: HeadStep[] }
export type RouteInput = {
  name: string; description: string | null; mapKey: string; mapFrame: string
  startX: number; startY: number; startYaw: number
  endMode: 'LAST_POI' | 'POSE'; endX: number | null; endY: number | null; endYaw: number | null
  stops: RouteStopInput[]
}
export type RouteListItem = {
  id: string; name: string; description: string | null; mapKey: string; mapFrame: string
  isActive: boolean; stopCount: number; createdAt: string; updatedAt: string | null
}
export type RouteDetails = RouteListItem & Omit<RouteInput, 'stops'> & {
  stops: (RouteStopInput & { id: string; poiName: string; stopOrder: number })[]
  version: string
  usage: {
    hasReferences: boolean; hasReadyOrRunningTours: boolean
    canEditConfiguration: boolean; canEditMetadataAndAvailability: boolean; canDelete: boolean
  }
  configurationIssues: string[]; availabilityIssues: string[]
}
export type RouteListQuery = { search?: string; isActive?: boolean; page: number; size: number }
