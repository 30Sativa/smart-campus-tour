import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { apiClient } from '../api/client';
import { useAuthStore } from '../stores/auth-store';

export function useVisitorLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useAuthStore(state => state.logout);
  return useMutation({
    mutationFn: () => apiClient<void>('/api/auth/logout', { method: 'POST', credentials: 'include' }),
    onSuccess: () => {
      logout();
      queryClient.clear();
      navigate('/');
    },
  });
}

