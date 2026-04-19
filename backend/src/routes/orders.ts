import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { Effect, Layer } from "effect"
import { OrderService } from "../services/order-service.js"
import type { AuthVariables } from "../middleware/auth.js"
import { runService, serviceErrorJson, errorTagToStatus } from "../lib/effect-utils.js"
import {
  OrderSummarySchema,
  OrderListSchema,
  OrderListQuerySchema,
  OrderIdParamSchema,
  commonErrors,
  cookieSecurity,
  errorResponse,
  validationHook,
} from "../lib/openapi-schemas.js"


const listOrdersRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Orders"],
  security: cookieSecurity,
  summary: "List user's orders with optional filters and pagination",
  request: { query: OrderListQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: OrderListSchema } },
      description: "Paginated order list",
    },
    ...commonErrors,
  },
})

const getOrderRoute = createRoute({
  method: "get",
  path: "/{orderId}",
  tags: ["Orders"],
  security: cookieSecurity,
  summary: "Get order detail with live status",
  request: { params: OrderIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: OrderSummarySchema } },
      description: "Order detail from Crossmint",
    },
    ...errorResponse(404, "Order not found"),
    ...errorResponse(502, "Crossmint API unavailable"),
    ...commonErrors,
  },
})

export function createOrderRoutes(layer: Layer.Layer<OrderService>) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: validationHook,
  })

  app.openapi(listOrdersRoute, async (c) => {
    const userId = c.get("userId")
    const query = c.req.valid("query")
    const params = {
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      type: query.type || undefined,
      phase: query.phase || undefined,
      status: query.status || undefined,
    }
    const result = await runService(
      OrderService.pipe(
        Effect.flatMap((s) => s.listOrders(userId, params)),
        Effect.provide(layer),
      ),
    )
    if (result._tag === "Left") {
      const err = result.left as { _tag: string; message?: string }
      return serviceErrorJson(c, err, errorTagToStatus(err._tag))
    }
    return c.json(result.right, 200)
  })

  app.openapi(getOrderRoute, async (c) => {
    const userId = c.get("userId")
    const { orderId } = c.req.valid("param")
    const result = await runService(
      OrderService.pipe(
        Effect.flatMap((s) => s.getOrder(userId, orderId)),
        Effect.provide(layer),
      ),
    )
    if (result._tag === "Left") {
      const err = result.left as { _tag: string; message?: string }
      return serviceErrorJson(c, err, errorTagToStatus(err._tag))
    }
    return c.json(result.right, 200)
  })

  return app
}
