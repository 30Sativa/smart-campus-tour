import { act, render, screen, waitFor } from '@testing-library/react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it } from 'vitest'
import { QueryProvider } from './query-provider'
import { useAuthStore } from '../../stores/auth-store'

afterEach(() => useAuthStore.getState().logout())

it('retains server cache during a same-account token refresh', () => {
  let client!: QueryClient
  function CaptureClient() { client = useQueryClient(); return null }
  const user = { userId: 'account-a', username: 'a', role: 'Admin' }
  useAuthStore.getState().setAuth('old', user)
  render(<QueryProvider><CaptureClient /></QueryProvider>)
  client.setQueryData(['admin', 'accounts'], ['account-a'])
  act(() => {
    const state = useAuthStore.getState()
    expect(state.applyRefresh('renewed', user, state.sessionRevision)).toBe(true)
  })
  expect(client.getQueryData(['admin', 'accounts'])).toEqual(['account-a'])
})

it('does not reuse private cached data after another account signs in', async () => {
  function AccountData() {
    const owner = useAuthStore(s => s.user?.userId)
    const query = useQuery({ queryKey: ['admin', 'accounts'], queryFn: async () => `Private data for ${owner}`,
      enabled: Boolean(owner), staleTime: Infinity })
    return <p>{query.data}</p>
  }
  useAuthStore.getState().setAuth('a', { userId: 'account-a', username: 'a', role: 'Admin' })
  render(<QueryProvider><AccountData /></QueryProvider>)
  await screen.findByText('Private data for account-a')
  act(() => {
    useAuthStore.getState().logout()
    useAuthStore.getState().setAuth('b', { userId: 'account-b', username: 'b', role: 'Admin' })
  })
  await screen.findByText('Private data for account-b')
  expect(screen.queryByText('Private data for account-a')).not.toBeInTheDocument()
})

it('removes inactive private queries and mutation variables on session loss', async () => {
  let client!: QueryClient
  function CaptureClient() { client = useQueryClient(); return null }
  useAuthStore.getState().setAuth('a', { userId: 'account-a', username: 'a', role: 'Admin' })
  render(<QueryProvider><CaptureClient /></QueryProvider>)
  client.setQueryData(['representative', 'account-a', 'roster'], { email: 'test@example.com' })
  const mutation = client.getMutationCache().build(client, { mutationFn: async () => undefined })
  await mutation.execute({ email: 'test@example.com' })
  act(() => useAuthStore.getState().logout())
  await waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(0))
  expect(client.getMutationCache().getAll()).toHaveLength(0)
})
