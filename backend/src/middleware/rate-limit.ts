import { createMiddleware } from "hono/factory"
import { env } from "../lib/env.js"
import { redis } from "../lib/redis.js"
import type { AuthVariables } from "./auth.js"

export const rateLimitMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const userId = c.get("userId")
    const key = `rate:${userId}`

    // Atomic INCR + conditional EXPIRE + TTL via Lua — returns [count, ttl] in one round-trip
    const results = await redis.eval(
      `local c = redis.call('INCR', KEYS[1])
       if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
       local ttl = redis.call('TTL', KEYS[1])
       return {c, ttl}`,
      1, key, "60",
    ) as [number, number]

    const count = results[0]
    const ttl = results[1]

    if (count > env.RATE_LIMIT_RPM) {
      c.header("Retry-After", String(Math.max(ttl, 1)))
      return c.json(
        { error: "Rate limit exceeded", code: "RATE_LIMIT_EXCEEDED" },
        429,
      )
    }

    await next()
  },
)
