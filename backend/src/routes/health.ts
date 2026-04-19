import { Hono } from "hono"
import { Effect } from "effect"
import { db } from "../db/client.js"
import { CacheService, CacheServiceLive } from "../services/cache-service.js"
import { env } from "../lib/env.js"
import { sql } from "drizzle-orm"

const health = new Hono()

health.get("/live", (c) => c.json({ status: "ok" }))

health.get("/", async (c) => {
  const startTime = process.uptime()

  const dbCheck = db
    .execute(sql`SELECT 1`)
    .then((): "connected" => "connected")
    .catch((): "error" => "error")

  const redisCheck = Effect.runPromise(
    Effect.gen(function* () {
      const cache = yield* CacheService
      return yield* cache.health()
    }).pipe(
      Effect.provide(CacheServiceLive),
      Effect.orElse(() => Effect.succeed(false))
    )
  ).then((ok): "connected" | "error" => (ok ? "connected" : "error"))
   .catch((): "error" => "error")

  const [dbStatus, redisStatus] = await Promise.all([dbCheck, redisCheck])

  const allHealthy = dbStatus === "connected" && redisStatus === "connected"

  return c.json(
    {
      status: allHealthy ? "ok" : "degraded",
      services: {
        database: dbStatus,
        redis: redisStatus,
        productService: env.PRODUCT_SERVICE,
      },
      uptime: Math.floor(startTime),
    },
    allHealthy ? 200 : 503
  )
})

export { health as healthRoute }
