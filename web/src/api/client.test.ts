import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';
import { useAuthStore } from '../stores/auth-store';

afterEach(() => vi.unstubAllGlobals());
describe('API response bodies', () => {
  it('accepts the empty 200 response returned by logout and includes its cookie', async () => {
    useAuthStore.setState({ accessToken: null });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiClient('/api/auth/logout', { method: 'POST', credentials: 'include' })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/logout'), expect.objectContaining({ credentials: 'include', method: 'POST' }));
  });
  it('continues to parse JSON data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'tour' }), { status: 200 })));
    await expect(apiClient('/api/routes/tour')).resolves.toEqual({ id: 'tour' });
  });
  it('does not silently accept malformed nonempty JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid', { status: 200 })));
    await expect(apiClient('/api/routes/tour')).rejects.toThrow();
  });
});
