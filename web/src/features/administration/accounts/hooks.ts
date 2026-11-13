import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountsApi } from './api/accounts'
import type { AccountListQuery, CreateAccountInput } from './types'

export const accountQueryKeys = {
  all: ['admin', 'accounts'] as const,
  list: (query: AccountListQuery) => ['admin', 'accounts', query.search ?? '', query.sort ?? '', query.page, query.size] as const,
}

export function useAccounts(query: AccountListQuery) {
  return useQuery({ queryKey: accountQueryKeys.list(query), queryFn: () => accountsApi.list(query) })
}

function useInvalidateAccounts() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: accountQueryKeys.all })
}

export function useCreateAccount() {
  const invalidate = useInvalidateAccounts()
  return useMutation({ mutationFn: (input: CreateAccountInput) => accountsApi.create(input), onSuccess: invalidate, gcTime: 0 })
}

export function useUpdateAccount() {
  const invalidate = useInvalidateAccounts()
  return useMutation({ mutationFn: ({ id, fullName }: { id: string; fullName: string }) => accountsApi.update(id, fullName), onSuccess: invalidate })
}

/** onSettled: a stale version (409) also refreshes the list, so reopening the account gets the new version. */
export function useResetAccountPassword() {
  const invalidate = useInvalidateAccounts()
  return useMutation({
    mutationFn: ({ id, newPassword, expectedRowVersion }: { id: string; newPassword: string; expectedRowVersion: string }) =>
      accountsApi.resetPassword(id, newPassword, expectedRowVersion),
    onSettled: invalidate,
    gcTime: 0,
  })
}

export function useDeactivateAccount() {
  const invalidate = useInvalidateAccounts()
  return useMutation({ mutationFn: (id: string) => accountsApi.deactivate(id), onSuccess: invalidate })
}

export function useReactivateAccount() {
  const invalidate = useInvalidateAccounts()
  return useMutation({ mutationFn: (id: string) => accountsApi.reactivate(id), onSuccess: invalidate })
}
