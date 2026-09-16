import { apiClient } from './client'

export interface BookingResponse {
  id: string
  userId: string
  slotId: string
  routeName: string
  startTime: string
  endTime: string
  status: 'Pending' | 'Confirmed' | 'Cancelled' | 'Completed'
  notes?: string | null
  createdAt: string
  cancelledAt?: string | null
  feedbackRating?: number | null
  feedbackComment?: string | null
}

export interface CreateBookingRequest {
  slotId: string
  notes?: string
}

export interface FeedbackRequest {
  rating: number
  comment?: string
}

export const bookingsApi = {
  createBooking: (req: CreateBookingRequest) =>
    apiClient<BookingResponse>('/api/bookings', {
      method: 'POST',
      json: req,
    }),

  getMyBookings: () => apiClient<BookingResponse[]>('/api/bookings/me'),

  getBooking: (id: string) => apiClient<BookingResponse>(`/api/bookings/${id}`),

  cancelBooking: (id: string) =>
    apiClient<BookingResponse>(`/api/bookings/${id}/cancel`, {
      method: 'PUT',
    }),

  submitFeedback: (id: string, req: FeedbackRequest) =>
    apiClient<void>(`/api/bookings/${id}/feedback`, {
      method: 'POST',
      json: req,
    }),
}
