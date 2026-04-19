import { Effect, Layer } from "effect"
import { eq, desc, sql, and } from "drizzle-orm"
import { db } from "../db/client.js"
import { orders } from "../db/schema/orders.js"
import { orderItems } from "../db/schema/order-items.js"
import { OrderNotFoundError } from "../lib/errors.js"
import { toDatabaseError } from "../lib/effect-utils.js"
import { getCrossmintOrder } from "../lib/crossmint-client.js"
import type { CrossmintOrderResponse } from "../lib/crossmint-client.js"
import { CheckoutOrderCreationError } from "../lib/errors.js"
import { redis } from "../lib/redis.js"
import { OrderService } from "./order-service.js"
import type { OrderServiceShape, OrderSummary, OrderItemSnapshot, ListOrdersParams } from "./order-service.js"

const CROSSMINT_ORDER_CACHE_TTL = 30 // seconds

function getCachedCrossmintOrder(
  crossmintOrderId: string,
): Effect.Effect<CrossmintOrderResponse["order"], CheckoutOrderCreationError> {
  return Effect.gen(function* () {
    const cacheKey = `crossmint:order:${crossmintOrderId}`

    const hit = yield* Effect.tryPromise({ try: () => redis.get(cacheKey), catch: () => null }).pipe(
      Effect.orElse(() => Effect.succeed(null)),
    )
    if (hit) {
      return JSON.parse(hit) as CrossmintOrderResponse["order"]
    }

    const order = yield* getCrossmintOrder(crossmintOrderId)

    yield* Effect.tryPromise({
      try: () => redis.set(cacheKey, JSON.stringify(order), "EX", CROSSMINT_ORDER_CACHE_TTL),
      catch: () => undefined,
    }).pipe(Effect.ignore)

    return order
  })
}

const TERMINAL_STATUSES = new Set(["delivered", "cancelled"])

function toItemSnapshot(item: typeof orderItems.$inferSelect | null): OrderItemSnapshot | undefined {
  if (!item) return undefined
  return {
    productId: item.productId,
    productName: item.productName,
    price: item.price,
    image: item.image ?? null,
    size: item.size ?? null,
    color: item.color ?? null,
    productUrl: item.productUrl ?? null,
    retailer: item.retailer ?? null,
  }
}

function buildOrderSummary(
  localId: string,
  crossmintOrderId: string,
  orderType: string,
  localStatus: string,
  createdAt: Date,
  item: typeof orderItems.$inferSelect | null,
  crossmintOrder?: {
    phase: string
    payment?: { status?: string; currency?: string }
    quote?: { totalPrice?: { amount: string; currency: string } }
  },
): OrderSummary {
  const createdAtIso = createdAt.toISOString()
  if (!crossmintOrder) {
    return {
      orderId: localId,
      crossmintOrderId,
      type: orderType,
      phase: localStatus,
      status: localStatus,
      item: toItemSnapshot(item),
      payment: { status: localStatus, currency: "usdc" },
      createdAt: createdAtIso,
    }
  }
  return {
    orderId: localId,
    crossmintOrderId,
    type: orderType,
    phase: crossmintOrder.phase,
    status: localStatus,
    item: toItemSnapshot(item),
    payment: {
      status: crossmintOrder.payment?.status ?? "unknown",
      currency: crossmintOrder.payment?.currency ?? "usdc",
    },
    quote: crossmintOrder.quote ? { totalPrice: crossmintOrder.quote.totalPrice } : undefined,
    createdAt: createdAtIso,
  }
}

const impl: OrderServiceShape = {
  listOrders: (userId, params?: ListOrdersParams) =>
    Effect.gen(function* () {
      const page = Math.max(1, params?.page ?? 1)
      const limit = Math.min(100, Math.max(1, params?.limit ?? 20))
      const offset = (page - 1) * limit

      const conditions = [eq(orders.userId, userId)]
      if (params?.type) conditions.push(eq(orders.type, params.type))
      if (params?.status) conditions.push(eq(orders.status, params.status))
      const whereConditions = conditions.length === 1 ? conditions[0] : and(...conditions)

      const [totalRows, rows] = yield* Effect.all([
        Effect.tryPromise({
          try: () =>
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(orders)
              .where(whereConditions)
              .then((r) => r[0]?.count ?? 0),
          catch: toDatabaseError,
        }),
        Effect.tryPromise({
          try: () =>
            db
              .select({ order: orders, item: orderItems })
              .from(orders)
              .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
              .where(whereConditions)
              .orderBy(desc(orders.createdAt))
              .limit(limit)
              .offset(offset),
          catch: toDatabaseError,
        }),
      ], { concurrency: "unbounded" })

      const results: OrderSummary[] = yield* Effect.all(
        rows.map(({ order: local, item }) => {
          if (!local.crossmintOrderId) {
            return Effect.succeed(
              buildOrderSummary(local.id, "", local.type, local.status, local.createdAt, item)
            )
          }

          if (TERMINAL_STATUSES.has(local.status)) {
            return Effect.succeed(
              buildOrderSummary(local.id, local.crossmintOrderId, local.type, local.status, local.createdAt, item)
            )
          }

          return getCachedCrossmintOrder(local.crossmintOrderId).pipe(
            Effect.map((crossmintOrder) =>
              buildOrderSummary(local.id, local.crossmintOrderId!, local.type, local.status, local.createdAt, item, crossmintOrder)
            ),
            Effect.catchAll(() =>
              Effect.succeed(
                buildOrderSummary(local.id, local.crossmintOrderId!, local.type, local.status, local.createdAt, item)
              )
            ),
          )
        }),
        { concurrency: 5 },
      )

      const filtered = params?.phase ? results.filter((o) => o.phase === params.phase) : results

      return {
        orders: filtered,
        total: params?.phase ? filtered.length : totalRows,
        page,
        limit,
      }
    }),

  getOrder: (userId, orderId) =>
    Effect.gen(function* () {
      const rows = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ order: orders, item: orderItems })
            .from(orders)
            .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
            .where(eq(orders.id, orderId))
            .limit(1),
        catch: toDatabaseError,
      })

      const row = rows[0] ?? null

      if (!row || row.order.userId !== userId) {
        return yield* Effect.fail(new OrderNotFoundError({ orderId }))
      }

      const { order: local, item } = row

      if (!local.crossmintOrderId) {
        return buildOrderSummary(local.id, "", local.type, local.status, local.createdAt, item)
      }

      if (TERMINAL_STATUSES.has(local.status)) {
        return buildOrderSummary(local.id, local.crossmintOrderId, local.type, local.status, local.createdAt, item)
      }

      const crossmintOrder = yield* getCachedCrossmintOrder(local.crossmintOrderId)

      return buildOrderSummary(local.id, local.crossmintOrderId, local.type, local.status, local.createdAt, item, crossmintOrder)
    }),
}

export const OrderServiceLive = Layer.succeed(OrderService, impl)
