'use client'

import { CrossmintAuthProvider, CrossmintProvider, CrossmintWalletProvider } from '@crossmint/client-sdk-react-ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_CROSSMINT_API_KEY
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
  )

  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_CROSSMINT_API_KEY is required')
  }

  return (
    <CrossmintProvider apiKey={apiKey}>
      <CrossmintAuthProvider loginMethods={['email', 'google']} logoutRoute="/api/auth/logout">
        <CrossmintWalletProvider  createOnLogin={{ chain: 'base-sepolia', signer: { type: 'email' } }}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </CrossmintWalletProvider>
      </CrossmintAuthProvider>
    </CrossmintProvider>
  )
}
