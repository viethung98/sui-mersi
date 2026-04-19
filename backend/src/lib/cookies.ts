import { env } from "./env.js"

export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  path: "/",
  sameSite: "Lax" as const,
  secure: env.NODE_ENV === "production",
}

export const COOKIE_NAMES = {
  jwt: "crossmint-jwt",
  refreshToken: "crossmint-refresh-token",
  email: "crossmint-email",
} as const
