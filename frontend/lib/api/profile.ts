import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import type { components } from '@/src/types/api.d';

type UserProfile = components['schemas']['UserProfile'] & {
  evmAddress?: string | null;
};

export function useProfile() {
  return useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: () => apiClient.get('auth/profile').json<UserProfile>(),
  });
}
