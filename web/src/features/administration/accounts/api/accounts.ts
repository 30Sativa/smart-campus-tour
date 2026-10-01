import { apiClient } from '../../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../../api/contracts/shared'
import type { AccountListItem, AccountListQuery, CreateAccountInput } from '../types'

function listPath(query: AccountListQuery): string {
  const params = new URLSearchParams()
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.sort) params.set('sort', query.sort)
  params.set('page', String(query.page))
  params.set('size', String(query.size))
  return `/api/admin/accounts?${params.toString()}`
}

/** HTTP calls for Admin account management. Query state and UI stay in their own layers. */
export const accountsApi = {
  list: (query: AccountListQuery) => apiClient<PagedApiResponse<AccountListItem>>(listPath(query)),
  create: (input: CreateAccountInput) => apiClient<ApiResponse<AccountListItem>>('/api/admin/accounts', { method: 'POST', json: input }),
  deactivate: (id: string) => apiClient<ApiResponse<null>>(`/api/admin/accounts/${id}/deactivate`, { method: 'POST' }),
  reactivate: (id: string) => apiClient<ApiResponse<null>>(`/api/admin/accounts/${id}/reactivate`, { method: 'POST' }),
}
