import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../stores/auth-store'
import RobotPage from './RobotPage'

afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

describe('Robot & thiết bị', () => {
  it('opens the Digital Twin on each robot', async () => {
    useAuthStore.getState().setAuth('test-token', { userId: 'u', username: 'staff', role: 'Staff' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: [
      { id: '1', robotCode: 'amr_01', displayName: 'AMR 01', connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-11-15T02:00:00Z' },
    ] }), { status: 200 })))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><RobotPage /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByRole('link', { name: 'Mở Digital Twin cho amr_01' })).toHaveAttribute('href', '/staff/digital-twin?robot=amr_01')
    expect(screen.getByRole('link', { name: /^Mở Digital Twin$/ })).toHaveAttribute('href', '/staff/digital-twin')
  })
})
