import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountSelfApi, type ChangePasswordInput } from './api/account-api'

export const myProfileKey = ['account', 'me'] as const

export function useMyProfile() {
  return useQuery({ queryKey: myProfileKey, queryFn: accountSelfApi.get })
}

export function useUpdateMyName() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fullName: string) => accountSelfApi.updateName(fullName),
    onSuccess: (profile) => queryClient.setQueryData(myProfileKey, profile),
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => accountSelfApi.changePassword(input),
    gcTime: 0,
  })
}
