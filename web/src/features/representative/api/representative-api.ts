import { apiClient } from '../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../api/contracts/shared'
import type { ListParameters, RegistrationInput, RegistrationSummary, RepresentativeRegistration, RepresentativeTour, RosterEmailChange, RosterEmailChangeInput } from './types'
import { withRegistrationDeadline, withTourDeadline } from '../registration-deadline'
import { representativeRead } from './representative-read'

const root = '/api/representative'
function query(parameters: ListParameters) {
  const values = new URLSearchParams()
  Object.entries(parameters).forEach(([key, value]) => { if (value !== undefined && value !== '') values.set(key, String(value)) })
  return values.size ? `?${values}` : ''
}
async function detail<T>(path: string, signal?: AbortSignal) {
  const response = await representativeRead<ApiResponse<T>>(root + path, signal)
  if (!response.success || response.data === null) throw new Error('Invalid Representative response')
  return response.data
}
export const representativeApi = {
  tours: async (parameters: ListParameters, signal?: AbortSignal) => {
    const response = await representativeRead<PagedApiResponse<RepresentativeTour>>(root + '/tours' + query(parameters), signal)
    return { ...response, data: response.data.map((tour) => withTourDeadline(tour)) }
  },
  tour: async (id: string, signal?: AbortSignal) => withTourDeadline(await detail<RepresentativeTour>(`/tours/${id}`, signal)),
  registrations: (parameters: ListParameters, signal?: AbortSignal) => representativeRead<PagedApiResponse<RegistrationSummary>>(root + '/registrations' + query(parameters), signal),
  registration: async (id: string, signal?: AbortSignal) => withRegistrationDeadline(await detail<RepresentativeRegistration>(`/registrations/${id}`, signal)),
  emailChanges: (id: string, signal?: AbortSignal) => detail<RosterEmailChange[]>(`/registrations/${id}/email-change-requests`, signal),
  requestEmailChange: (id: string, rowId: string, input: RosterEmailChangeInput) =>
    apiClient<ApiResponse<string>>(`${root}/registrations/${id}/rows/${rowId}/email-change-requests`, { method: 'POST', json: input }),
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
