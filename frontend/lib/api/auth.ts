import { apiClient } from './client'

type SyncBackendAuthSessionInput = {
  jwt: string
  email: string
  refreshToken?: string | null
}

export async function syncBackendAuthSession({
  jwt,
  email,
  refreshToken,
}: SyncBackendAuthSessionInput) {
  await apiClient.post('auth/session', {
    json: {
      jwt,
      email,
      ...(refreshToken ? { refreshToken } : {}),
    },
  }).json<{ success: boolean }>()
}
