import { apiClient } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'

export type InvitationItem = {
  id: string; rowNumber: number; rowType: string; displayName: string; email: string
  rowVersion: string; accessVersion: number; expiresAt: string; revokedAt: string | null
  emailStatus: 'NOT_REQUESTED' | 'PENDING' | 'ACCEPTED' | 'FAILED' | 'UNKNOWN'
  lastEmailAt: string | null; canSend: boolean; canReissue: boolean; canRevoke: boolean
}
export type InvitationDetails = { enabled: boolean; canIssue: boolean; items: InvitationItem[] }
export type InvitationOperation = 'issue' | 'resend' | 'reissue' | 'revoke'
export type InvitationWrite = { operation: InvitationOperation; invitationId?: string; requestId: string
  expectedRowVersion: string; expectedTourRowVersion?: string }
const path = (registrationId: string) => `/api/registrations/${encodeURIComponent(registrationId)}/invitations`
export const invitationsApi = {
  get: async (id: string, signal?: AbortSignal) => (await apiClient<ApiResponse<InvitationDetails>>(path(id), { signal })).data,
  write: (id: string, input: InvitationWrite) => {
    const { operation, invitationId, ...json } = input
    return apiClient<ApiResponse<null>>(`${path(id)}${invitationId ? '/' + encodeURIComponent(invitationId) : ''}/${operation}`, { method: 'POST', json })
  },
}
