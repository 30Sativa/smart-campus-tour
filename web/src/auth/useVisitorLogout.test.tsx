import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useAuthStore } from '../stores/auth-store';
import { useVisitorLogout } from './useVisitorLogout';

vi.mock('../api/client', () => ({ apiClient: vi.fn() }));
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => useVisitorLogout(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider> });
}
describe('Visitor logout', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ isAuthenticated: true, accessToken: 'test', user: { userId: 'v', username: 'visitor', role: 'visitor' } });
  });
  it('revokes the server session before clearing authentication', async () => {
    vi.mocked(apiClient).mockResolvedValue(undefined);
    const { result } = setup();
    await act(async () => result.current.mutateAsync());
    expect(apiClient).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST', credentials: 'include' });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
  it('keeps authentication and exposes an error if revocation fails', async () => {
    vi.mocked(apiClient).mockRejectedValue(new Error('Offline'));
    const { result } = setup();
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});

