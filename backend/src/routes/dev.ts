import { Hono } from "hono"
import { setCookie } from "hono/cookie"
import { eq } from "drizzle-orm"
import Redis from "ioredis"
import { Effect } from "effect"
import { db } from "../db/client.js"
import { users } from "../db/schema/users.js"
import { SESSION_COOKIE_OPTS, COOKIE_NAMES } from "../lib/cookies.js"
import { encrypt } from "../lib/crypto.js"
import { env } from "../lib/env.js"
import { getUserKeypair } from "../lib/sui-client.js"
import { signAndSubmitAs } from "../services/sui-relayer.js"
import { buildCreateCartTx } from "../services/cart-onchain-service-live.js"
import logger from "../lib/logger.js"

const DEV_CROSSMINT_USER_ID = "dev-test-user-001"
const MOCK_CROSSMINT_USER_ID = "mock-user-001"
const DEV_WALLET_ADDRESS = "0xdeadbeef000000000000000000000000000000000000000000000000deadbeef"
const DEV_EVM_ADDRESS = "0xdeadbeef000000000000000000000000deadbeef"
const DEV_WALLET_ID = "wlt-dev-test-001"
const DEV_EMAIL = "dev@test.local"
async function seedSmokeTestProducts(): Promise<void> {
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, connectTimeout: 3000 })
  await redis.connect()
  await redis.set(
    "scraping:product:smoke-test-product-001",
    JSON.stringify({ productId: "smoke-test-product-001", name: "Smoke Test Tee" }),
    "EX",
    3600,
  )
  await redis.set(
    "scraping:product:smoke-test-product-002",
    JSON.stringify({ productId: "smoke-test-product-002", name: "Smoke Test Hat" }),
    "EX",
    3600,
  )
  await redis.quit()
}

function getDevEncryptedKey(): string | undefined {
  if (!env.DEV_SUI_PRIVATE_KEY) return undefined
  if (!env.WALLET_ENCRYPTION_KEY || env.WALLET_ENCRYPTION_KEY.length !== 64) return undefined
  try {
    return encrypt(env.DEV_SUI_PRIVATE_KEY, env.WALLET_ENCRYPTION_KEY)
  } catch {
    return undefined
  }
}

export const devRoute = new Hono()

/** POST /api/dev/login — recreates dev user and sets an unsigned JWT cookie (dev only). */
devRoute.post("/login", async (c) => {
  await db.delete(users).where(eq(users.crossmintUserId, DEV_CROSSMINT_USER_ID))
  await db.insert(users).values({
    crossmintUserId: DEV_CROSSMINT_USER_ID,
    email: DEV_EMAIL,
    walletAddress: DEV_WALLET_ADDRESS,
    crossmintWalletId: DEV_WALLET_ID,
    evmAddress: DEV_EVM_ADDRESS,
    suiPrivateKeyEncrypted: getDevEncryptedKey() ?? null,
    walletStatus: "active",
  })

  const now = Math.floor(Date.now() / 1000)
  const payloadB64 = btoa(
    JSON.stringify({ sub: DEV_CROSSMINT_USER_ID, iat: now, exp: now + 3600 }),
  )
  const jwt = `eyJhbGciOiJub25lIn0.${payloadB64}.dev`

  setCookie(c, COOKIE_NAMES.jwt, jwt, SESSION_COOKIE_OPTS)
  setCookie(c, COOKIE_NAMES.refreshToken, "dev-refresh-token", SESSION_COOKIE_OPTS)

  try { await seedSmokeTestProducts() } catch { /* non-fatal */ }

  const devEncryptedKey = getDevEncryptedKey()
  if (env.CART_SERVICE === "onchain" && env.SUI_CONTRACT_ADDRESS && devEncryptedKey) {
    try {
      const keypair = getUserKeypair(devEncryptedKey)
      const tx = buildCreateCartTx(DEV_WALLET_ADDRESS)
      await Effect.runPromise(signAndSubmitAs(tx, keypair, "dev-cart-init"))
    } catch (err) {
      const msg = String(err)
      if (!msg.includes("MoveAbort")) {
        logger.warn({ err: msg }, "dev cart on-chain init failed (non-fatal)")
      }
    }
  }

  return c.json({ ok: true, email: DEV_EMAIL, walletAddress: DEV_WALLET_ADDRESS, evmAddress: DEV_EVM_ADDRESS })
})

/** POST /api/dev/logout — removes dev user from DB and clears session cookie. */
devRoute.post("/logout", async (c) => {
  await db.delete(users).where(eq(users.crossmintUserId, DEV_CROSSMINT_USER_ID))
  setCookie(c, COOKIE_NAMES.jwt, "", { ...SESSION_COOKIE_OPTS, maxAge: 0 })
  setCookie(c, COOKIE_NAMES.refreshToken, "", { ...SESSION_COOKIE_OPTS, maxAge: 0 })
  return c.json({ ok: true })
})

/**
 * POST /api/dev/login-mock — authenticates as seeded mock user without resetting it.
 * If CART_SERVICE=onchain, creates the on-chain cart only when it doesn't already exist.
 * Run scripts/seed-mock-user.ts before using this endpoint.
 */
devRoute.post("/login-mock", async (c) => {
  const [user] = await db.select().from(users).where(eq(users.crossmintUserId, MOCK_CROSSMINT_USER_ID))
  if (!user) {
    return c.json(
      { error: "Mock user not found — run: bun run scripts/seed-mock-user.ts", code: "MOCK_USER_NOT_FOUND" },
      404,
    )
  }

  try { await seedSmokeTestProducts() } catch { /* non-fatal */ }

  const mockNow = Math.floor(Date.now() / 1000)
  const payloadB64 = btoa(
    JSON.stringify({ sub: MOCK_CROSSMINT_USER_ID, iat: mockNow, exp: mockNow + 3600 }),
  )
  const jwt = `eyJhbGciOiJub25lIn0.${payloadB64}.dev`
  setCookie(c, COOKIE_NAMES.jwt, jwt, SESSION_COOKIE_OPTS)
  setCookie(c, COOKIE_NAMES.refreshToken, "dev-refresh-token", SESSION_COOKIE_OPTS)

  return c.json({ ok: true, email: user.email, walletAddress: user.walletAddress, evmAddress: user.evmAddress })
})
