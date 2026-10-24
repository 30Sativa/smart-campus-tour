export type PoiListItem = {
  id: string
  name: string
  mapKey: string
  mapFrame: string
  x: number
  y: number
  yaw: number
  isActive: boolean
  createdAt: string
  updatedAt: string | null
  rowVersion: string
}

export type PoiUsage = {
  hasRouteStopReferences: boolean
  hasHistoricalTourReferences: boolean
  hasReadyOrRunningTours: boolean
  canEditPose: boolean
  canEditContentAndAvailability: boolean
}

export type PoiDetails = PoiListItem & {
  description: string | null
  narrationText: string | null
  audioUrl: string | null
  narrationSeconds: number | null
  fallbackVideoUrl: string | null
  usage: PoiUsage
}

export type PoiListQuery = {
  search?: string
  sort?: PoiSort | ''
  page: number
  size: number
  isActive?: boolean
}

export type PoiSortField = 'name' | 'isActive' | 'createdAt' | 'updatedAt'
export type PoiSort = PoiSortField | `-${PoiSortField}`

export type CreatePoiInput = {
  name: string
  description: string | null
  mapKey: string
  mapFrame: string
  x: number
  y: number
  yaw: number
  narrationText: string | null
  audioUrl: string | null
  narrationSeconds: number | null
  fallbackVideoUrl: string | null
}

export type UpdatePoiInput = CreatePoiInput & { expectedRowVersion: string }
