import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { deleteCookie, setCookie } from "hono/cookie"
import { eq } from "drizzle-orm"
import { db } from "../db/client.js"
import { users } from "../db/schema/users.js"
import type { AuthVariables } from "../middleware/auth.js"
import { crossmintAuth } from "../lib/crossmint.js"
import logger from "../lib/logger.js"
import { UserProfileSchema, errorResponse, commonErrors, cookieSecurity, validationHook } from "../lib/openapi-schemas.js"
import { SESSION_COOKIE_OPTS, COOKIE_NAMES } from "../lib/cookies.js"
import { getCrossmintUserIdFromJwt } from "../lib/crossmint-session.js"

const profileRoute = createRoute({
  method: "get",
  path: "/profile",
  tags: ["Auth"],
  security: cookieSecurity,
  summary: "Get authenticated user profile",
  responses: {
    200: {
      content: { "application/json": { schema: UserProfileSchema } },
      description: "Authenticated user profile",
    },
    ...errorResponse(404, "User not found"),
    ...commonErrors,
  },
})

const logoutRoute = createRoute({
  method: "post",
  path: "/logout",
  tags: ["Auth"],
  summary: "Logout and clear session cookies",
  description: "Public and idempotent. Clears auth cookies even if the current session is already expired or partially missing.",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
      description: "Successfully logged out",
    },
  },
})

const setSessionRoute = createRoute({
  method: "post",
  path: "/session",
  tags: ["Auth"],
  summary: "Set session cookies from JWT (public — no auth required)",
  description: "Validates the provided JWT with Crossmint and sets httpOnly session cookies. Used by frontend clients after completing OTP login.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            jwt: z.string().min(1),
            refreshToken: z.string().optional(),
            email: z.string().email().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
      description: "Cookies set successfully",
    },
    ...errorResponse(401, "Invalid JWT"),
  },
})

const walletAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/).nullable()

export const authRoute = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook })

authRoute.openapi(setSessionRoute, async (c) => {
  const { jwt, refreshToken, email } = c.req.valid("json")
  let storeRefreshToken = !!refreshToken

  try {
    if (refreshToken) {
      await crossmintAuth.getSession({ jwt, refreshToken })
    } else {
      getCrossmintUserIdFromJwt(jwt)
    }
  } catch (err) {
    try {
      getCrossmintUserIdFromJwt(jwt)
      storeRefreshToken = false
      logger.warn(
        { err, event: "set_session_refresh_invalid_fallback" },
        "Refresh token rejected during set-session; storing JWT only",
      )
    } catch {
      logger.warn({ err, event: "set_session_invalid_jwt" }, "Invalid JWT in set-session")
      return c.json({ error: "Invalid JWT", code: "UNAUTHORIZED" }, 401) as never
    }
  }

  setCookie(c, COOKIE_NAMES.jwt, jwt, SESSION_COOKIE_OPTS)
  if (refreshToken && storeRefreshToken) {
    setCookie(c, COOKIE_NAMES.refreshToken, refreshToken, SESSION_COOKIE_OPTS)
  } else {
    deleteCookie(c, COOKIE_NAMES.refreshToken, SESSION_COOKIE_OPTS)
  }
  if (email) {
    setCookie(c, COOKIE_NAMES.email, email, SESSION_COOKIE_OPTS)
  }

  return c.json({ success: true })
})

authRoute.openapi(profileRoute, async (c) => {
  const userId = c.get("userId")

  const user = await db.query.users?.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, email: true, walletAddress: true, walletStatus: true, onboardingStep: true, evmAddress: true },
  })

  if (!user) {
    return c.json({ error: "User not found", code: "USER_NOT_FOUND" }, 404) as never
  }

  const walletAddress = walletAddressSchema.safeParse(user.walletAddress)

  return c.json({
    userId: user.id,
    email: user.email,
    walletAddress: walletAddress.success ? walletAddress.data : null,
    walletStatus: user.walletStatus,
    onboardingStep: user.onboardingStep,
    evmAddress: user.evmAddress,
  })
})

authRoute.openapi(logoutRoute, (c) => {
  deleteCookie(c, COOKIE_NAMES.jwt, SESSION_COOKIE_OPTS)
  deleteCookie(c, COOKIE_NAMES.refreshToken, SESSION_COOKIE_OPTS)
  deleteCookie(c, COOKIE_NAMES.email, SESSION_COOKIE_OPTS)
  return c.json({ success: true })
})
