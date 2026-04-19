'use client'

import { useAuth } from '@crossmint/client-sdk-react-ui'
import { ChildWindow, PopupWindow } from '@crossmint/client-sdk-window'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { useOnboardingStatus } from '@/lib/api/onboarding'

const popupEvents = {
  authMaterialFromPopupCallback: z.object({ oneTimeSecret: z.string() }),
  errorFromPopupCallback: z.object({ error: z.string() }),
}

type Step = 'email' | 'otp'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function LoginPage() {
  const router = useRouter()
  const { crossmintAuth, user, status } = useAuth()
  const { data: onboardingStatus } = useOnboardingStatus({ enabled: !!user })
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [emailId, setEmailId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  const isBusy = status === 'initializing' || status === 'in-progress' || emailLoading || otpLoading || googleLoading

  useEffect(() => {
    if (!user) return
    if (onboardingStatus) {
      router.push(onboardingStatus.completed ? '/app' : '/onboarding')
    }
  }, [user, onboardingStatus, router])

  function ensureAuthMaterial(authMaterial: {
    jwt?: string
    refreshToken?: { secret?: string | null } | null
    user?: { email?: string | null } | null
  } | null) {
    if (!authMaterial?.jwt || !authMaterial.user?.email) {
      throw new Error('Crossmint did not return a valid session')
    }
  }

  async function handleSendOtp() {
    if (!crossmintAuth || !emailLooksValid || isBusy) return

    setError(null)
    setEmailLoading(true)

    try {
      const result = await crossmintAuth.sendEmailOtp(normalizedEmail)
      setEmailId(result.emailId)
      setOtp('')
      setStep('otp')
    } catch (authError) {
      setError(getErrorMessage(authError, 'Failed to send OTP'))
      setStep('email')
    } finally {
      setEmailLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (!crossmintAuth || !emailId || !otp.trim() || isBusy) return

    setError(null)
    setOtpLoading(true)

    try {
      const oneTimeSecret = await crossmintAuth.confirmEmailOtp(normalizedEmail, emailId, otp.trim())
      const authMaterial = await crossmintAuth.handleRefreshAuthMaterial(oneTimeSecret)
      ensureAuthMaterial(authMaterial)
    } catch (authError) {
      setError(getErrorMessage(authError, 'OTP verification failed'))
      setStep('otp')
    } finally {
      setOtpLoading(false)
    }
  }

  async function handleGoogleLogin() {
    if (!crossmintAuth || googleLoading || status === 'logged-in') return

    setError(null)
    setGoogleLoading(true)

    try {
      const oauthUrl = await crossmintAuth.getOAuthUrl('google')
      const url = new URL(oauthUrl)

      if (emailLooksValid) {
        const existingParams = Array.from(url.searchParams.entries())
        url.search = ''
        url.searchParams.append('provider_login_hint', normalizedEmail)
        existingParams.forEach(([key, value]) => {
          url.searchParams.append(key, value)
        })
      }

      const childWindow = new ChildWindow(window.opener || window.parent, '*', {
        incomingEvents: popupEvents as never,
      })
      const popup = await PopupWindow.init(url.toString(), {
        awaitToLoad: false,
        crossOrigin: true,
        width: 400,
        height: 700,
      })

      await new Promise<void>((resolve, reject) => {
        let settled = false

        const finish = (handler: () => void) => {
          if (settled) return
          settled = true
          if (authListenerId) childWindow.off(authListenerId)
          if (errorListenerId) childWindow.off(errorListenerId)
          if (closeTimer) window.clearInterval(closeTimer)
          handler()
        }

        const authListenerId = childWindow.on('authMaterialFromPopupCallback', ({ oneTimeSecret }) => {
          void (async () => {
            try {
              const authMaterial = await crossmintAuth.handleRefreshAuthMaterial(oneTimeSecret)
              ensureAuthMaterial(authMaterial)
              finish(() => {
                popup.window.close()
                resolve()
              })
            } catch (authError) {
              finish(() => {
                popup.window.close()
                reject(authError)
              })
            }
          })()
        })

        const errorListenerId = childWindow.on('errorFromPopupCallback', ({ error: popupError }) => {
          finish(() => {
            popup.window.close()
            reject(new Error(popupError || 'Google sign-in failed'))
          })
        })

        const closeTimer = window.setInterval(() => {
          if (popup.window.closed) {
            finish(() => {
              reject(new Error('Google sign-in was cancelled'))
            })
          }
        }, 500)
      })
    } catch (authError) {
      setError(getErrorMessage(authError, 'Unable to start Google sign-in'))
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-(--bg) px-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-(--primary) to-(--primary-light) flex items-center justify-center">
            <span className="text-white font-bold text-xl">P</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-(--text-primary)">Mersi</h1>
            <p className="text-sm text-(--text-secondary) mt-1">AI-powered shopping assistant</p>
          </div>
        </div>

        <div className="w-full rounded-2xl border border-(--border) bg-(--surface) p-4 sm:p-5 flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && step === 'email') {
                void handleSendOtp()
              }
              if (event.key === 'Enter' && step === 'otp') {
                void handleVerifyOtp()
              }
            }}
            placeholder="you@example.com"
            autoFocus
            disabled={isBusy || step === 'otp'}
            className="w-full py-2.5 px-4 rounded-lg border border-(--border) bg-(--bg) text-(--text-primary) placeholder:text-(--text-muted) outline-none disabled:opacity-60"
          />

          {step === 'otp' && (
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(event) => {
                setOtp(event.target.value)
                setError(null)
              }}
              placeholder="Enter 6-digit code"
              disabled={isBusy}
              className="w-full py-2.5 px-4 rounded-lg border border-(--border) bg-(--bg) text-(--text-primary) placeholder:text-(--text-muted) outline-none disabled:opacity-60"
            />
          )}

          {status === 'initializing' ? (
            <p className="text-sm text-(--text-secondary) text-center py-3">Loading…</p>
          ) : (
            <>
              {step === 'email' ? (
                <>
                  <button
                  onClick={() => void handleSendOtp()}
                    disabled={!crossmintAuth || !emailLooksValid || isBusy}
                    className="w-full py-2.5 px-4 rounded-lg bg-(--primary) hover:bg-(--primary-light) text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailLoading ? 'Sending code…' : 'Continue with Email'}
                  </button>
                  <button
                    onClick={() => void handleGoogleLogin()}
                    disabled={!crossmintAuth || isBusy}
                    className="w-full py-2.5 px-4 rounded-lg border border-(--border) bg-(--surface-elevated) hover:bg-(--bg) text-(--text-primary) text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {googleLoading ? 'Opening Google…' : 'Continue with Google'}
                  </button>
                </>
              ) : (
                <>
                  <button
                  onClick={() => void handleVerifyOtp()}
                    disabled={!otp.trim() || isBusy}
                    className="w-full py-2.5 px-4 rounded-lg bg-(--primary) hover:bg-(--primary-light) text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {otpLoading ? 'Verifying…' : 'Verify Code'}
                  </button>
                  <button
                    onClick={() => {
                      setStep('email')
                      setOtp('')
                      setError(null)
                    }}
                    disabled={isBusy}
                    className="w-full py-2.5 px-4 rounded-lg border border-(--border) bg-(--surface-elevated) hover:bg-(--bg) text-(--text-secondary) text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Back
                  </button>
                </>
              )}
            </>
          )}

          {step === 'otp' && (
            <p className="text-xs text-(--text-muted) text-center">
              Code sent to {normalizedEmail}
            </p>
          )}

          {error && (
            <p className="text-sm text-(--error) text-center">{error}</p>
          )}
        </div>

        <p className="text-xs text-(--text-muted)">Powered by Crossmint</p>
      </div>
    </div>
  )
}
