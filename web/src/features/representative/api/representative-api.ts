import { apiClient } from '../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../api/contracts/shared'
import type { ListParameters, RegistrationInput, RegistrationSummary, RepresentativeRegistration, RepresentativeTour } from './types'

const root = '/api/representative'
function query(parameters: ListParameters) {
  const values = new URLSearchParams()
  Object.entries(parameters).forEach(([key, value]) => { if (value !== undefined && value !== '') values.set(key, String(value)) })
  return values.size ? `?${values}` : ''
}
async function detail<T>(path: string, signal?: AbortSignal) {
  const response = await apiClient<ApiResponse<T>>(root + path, { signal })
  if (!response.success || response.data === null) throw new Error('Invalid Representative response')
  return response.data
}
export const representativeApi = {
  tours: (parameters: ListParameters, signal?: AbortSignal) => apiClient<PagedApiResponse<RepresentativeTour>>(root + '/tours' + query(parameters), { signal }),
  tour: (id: string, signal?: AbortSignal) => detail<RepresentativeTour>(`/tours/${id}`, signal),
  registrations: (parameters: ListParameters, signal?: AbortSignal) => apiClient<PagedApiResponse<RegistrationSummary>>(root + '/registrations' + query(parameters), { signal }),
  registration: (id: string, signal?: AbortSignal) => detail<RepresentativeRegistration>(`/registrations/${id}`, signal),
  submit: async (tourId: string, input: RegistrationInput, requestId: string) => {
    const response = await apiClient<ApiResponse<{ id: string }>>(`${root}/tours/${tourId}/registrations`, {
      method: 'POST', headers: { 'Idempotency-Key': requestId }, json: input,
    })
    if (!response.data) throw new Error('Missing registration ID')
    return response.data
  },
  update: (id: string, input: RegistrationInput, expectedRowVersion: string) =>
    apiClient<ApiResponse<null>>(`${root}/registrations/${id}`, {
      method: 'PUT', json: { input, expectedRowVersion },
    }),
  resubmit: (id: string, input: RegistrationInput, expectedRowVersion: string) =>
    apiClient<ApiResponse<null>>(`${root}/registrations/${id}/resubmit`, {
      method: 'POST', json: { input, expectedRowVersion },
    }),
  cancel: (id: string, expectedRowVersion: string, expectedTourRowVersion: string) =>
    apiClient<ApiResponse<null>>(`${root}/registrations/${id}/cancel`, {
      method: 'POST', json: { expectedRowVersion, expectedTourRowVersion },
    }),
}
