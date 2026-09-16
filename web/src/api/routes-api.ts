import { apiClient } from './client'

export interface POI {
  id: string
  name: string
  description: string
  imageUrl?: string | null
}

export interface Waypoint {
  id: string
  order: number
  lat: number
  lng: number
  label: string
  poi?: POI | null
}

export interface TourRoute {
  id: string
  name: string
  description: string
  thumbnailUrl?: string | null
  estimatedMinutes: number
  status: string
  waypoints: Waypoint[]
}

export interface TimeSlot {
  id: string
  routeId: string
  routeName: string
  startTime: string
  endTime: string
  capacity: number
  available: number
  status: string
}

export const routesApi = {
  getRoutes: () => apiClient<TourRoute[]>('/api/routes'),
  getRouteById: (id: string) => apiClient<TourRoute>(`/api/routes/${id}`),
  getRouteSlots: (id: string, from?: string) =>
    apiClient<TimeSlot[]>(`/api/routes/${id}/slots${from ? `?from=${encodeURIComponent(from)}` : ''}`),
}
