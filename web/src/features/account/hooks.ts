import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountSelfApi, type ChangePasswordInput } from './api/account-api'
import { megabytes, uploadToCloudinary } from '../../api/cloudinary-upload'

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

/** The header's avatar: the same cached profile, never retried, so a page never waits or fails on it. */
export function useMyAvatarUrl(enabled = true): string | null {
  const profile = useQuery({ queryKey: myProfileKey, queryFn: accountSelfApi.get, enabled, retry: false, staleTime: 5 * 60_000 })
  return profile.data?.avatarUrl ?? null
}

/**
 * ADR-0064: sign, send the picture straight to Cloudinary, then save it as this account's avatar. `null` removes it.
 * Progress is reported in percent while the file is sent.
 */
export function useSetMyAvatar(onProgress: (percent: number) => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, signal }: { file: File | null; signal?: AbortSignal }) => {
      if (!file) return accountSelfApi.setAvatar(null)
      const ticket = await accountSelfApi.signAvatarUpload(signal)
      if (file.size > ticket.maxBytes)
        throw new Error(`Ảnh nặng ${megabytes(file.size)} MB, vượt giới hạn ${megabytes(ticket.maxBytes)} MB.`)
      await uploadToCloudinary(ticket.uploadUrl, ticket.fields, file, 'ảnh', onProgress, signal)
      return accountSelfApi.setAvatar(ticket.storedUrl)
    },
    onSuccess: (profile) => queryClient.setQueryData(myProfileKey, profile),
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => accountSelfApi.changePassword(input),
    gcTime: 0,
  })
}
