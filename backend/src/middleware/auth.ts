import { createMiddleware } from "hono/factory"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { eq } from "drizzle-orm"
import { crossmintAuth } from "../lib/crossmint.js"
import { db } from "../db/client.js"
import { users } from "../db/schema/users.js"
import type { User } from "../db/schema/users.js"
import { provisionNewUser } from "./auth-provision.js"
import logger from "../lib/logger.js"
import { SESSION_COOKIE_OPTS, COOKIE_NAMES } from "../lib/cookies.js"
import { getCrossmintUserIdFromJwt } from "../lib/crossmint-session.js"
import { redis } from "../lib/redis.js"

const userCacheTtlSeconds = 60

export type AuthVariables = {
  userId: string
  userEmail: string
  onboardingStep: number
  user: Pick<User, 'id' | 'email' | 'walletAddress' | 'evmAddress' | 'onboardingStep'> | { userId: string; email: string; walletAddress?: string | null; evmAddress?: string | null; onboardingStep: number }
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const jwt = getCookie(c, COOKIE_NAMES.jwt)
    const refreshToken = getCookie(c, COOKIE_NAMES.refreshToken) ?? ""

    if (!jwt) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
    }

    let crossmintUserId: string

    if (refreshToken) {
      try {
        const session = await crossmintAuth.getSession({ jwt, refreshToken })
        crossmintUserId = session.userId
        const newJwt = typeof session.jwt === "string" ? session.jwt : ""
        const rt = session.refreshToken
        const newRefreshToken = typeof rt === "string" ? rt : (rt as any)?.secret ?? ""
        if (newJwt && newJwt !== jwt) {
          setCookie(c, COOKIE_NAMES.jwt, newJwt, SESSION_COOKIE_OPTS)
          logger.info({ crossmintUserId, event: "auth_refresh" }, "JWT refreshed")
        }
        if (newRefreshToken && newRefreshToken !== refreshToken) {
          setCookie(c, COOKIE_NAMES.refreshToken, newRefreshToken, SESSION_COOKIE_OPTS)
        }
        logger.debug({ crossmintUserId, event: "auth_success" }, "Session validated")
      } catch (err) {
        try {
          crossmintUserId = getCrossmintUserIdFromJwt(jwt)
          deleteCookie(c, COOKIE_NAMES.refreshToken, SESSION_COOKIE_OPTS)
          logger.warn(
            { err, crossmintUserId, event: "auth_refresh_invalid_fallback" },
            "Session validation failed; falling back to JWT-only auth",
          )
        } catch {
          logger.warn({ err, event: "auth_failure" }, "Session validation failed")
          return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
        }
      }
    } else {
      // JWT-only auth is not accepted — refresh token required to verify session with Crossmint
      logger.warn({ event: "auth_no_refresh_token" }, "Auth rejected: refresh token absent")
      return c.json({ error: "Unauthorized", code: "SESSION_REQUIRED" }, 401)
    }

    const userCacheKey = `user:cm:${crossmintUserId}`
    let existingUser: User | undefined
    try {
      const cached = await redis.get(userCacheKey)
      if (cached) {
        existingUser = JSON.parse(cached) as User
        logger.debug({ crossmintUserId, event: "auth_cache_hit" }, "User resolved from Redis cache")
      } else {
        existingUser = await db.query.users?.findFirst({
          where: eq(users.crossmintUserId, crossmintUserId),
        })
        if (existingUser) {
          await redis.set(userCacheKey, JSON.stringify(existingUser), "EX", userCacheTtlSeconds)
        }
      }
    } catch (dbErr) {
      logger.error({ err: dbErr, crossmintUserId, event: "auth_db_lookup_failed" }, "DB lookup failed")
      return c.json({ error: "Internal server error", code: "DATABASE_ERROR" }, 500)
    }

    if (existingUser) {
      c.set("userId", existingUser.id)
      c.set("userEmail", existingUser.email)
      c.set("onboardingStep", existingUser.onboardingStep)
      c.set("user", existingUser)
      await next()
      return
    }

    const emailHint = getCookie(c, COOKIE_NAMES.email)
    logger.info({ crossmintUserId, emailHint: emailHint || "(none)", event: "auth_provision_start" }, "Provisioning new user")
    const result = await provisionNewUser(crossmintUserId, emailHint || undefined)

    if (!result.ok) {
      logger.warn({ crossmintUserId, result, event: "auth_provision_failed" }, "Provisioning failed")
      return c.json({ error: result.error, code: result.code }, result.status as 401 | 500 | 503)
    }

    c.set("userId", result.userId)
    c.set("userEmail", result.email)
    c.set("onboardingStep", result.onboardingStep)
    c.set("user", {
      id: result.userId,
      email: result.email,
      walletAddress: result.walletAddress,
      evmAddress: result.evmAddress,
      onboardingStep: result.onboardingStep,
    } as AuthVariables["user"])
    await next()
  }
)

/** Factory wrapper — lets routes do `.use(requireAuth())` for consistency. */
export const requireAuth = () => authMiddleware
