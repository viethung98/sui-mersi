import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { Effect, Layer } from "effect"
import { CheckoutService } from "../services/checkout-service.js"
import type { AuthVariables } from "../middleware/auth.js"
import { runService, serviceErrorJson, errorTagToStatus } from "../lib/effect-utils.js"
import {
  CheckoutRequestSchema,
  CheckoutResponseSchema,
  commonErrors,
  cookieSecurity,
  errorResponse,
  validationHook,
} from "../lib/openapi-schemas.js"


const checkoutRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Checkout"],
  security: cookieSecurity,
  summary: "Checkout a single cart item via Crossmint",
  request: {
    body: {
      content: { "application/json": { schema: CheckoutRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: CheckoutResponseSchema } },
      description: "Order created and payment initiated",
    },
    ...errorResponse(400, "Missing wallet or address"),
    ...errorResponse(404, "Cart item not found"),
    ...errorResponse(422, "Insufficient USDC funds"),
    ...errorResponse(502, "Crossmint API error"),
    ...commonErrors,
  },
})

export function createCheckoutRoutes(layer: Layer.Layer<CheckoutService>) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: validationHook,
  })

  app.openapi(checkoutRoute, async (c) => {
    const userId = c.get("userId")
    const { cartItemId } = c.req.valid("json")
    const result = await runService(
      CheckoutService.pipe(
        Effect.flatMap((s) => s.checkout(userId, cartItemId)),
        Effect.provide(layer),
      ),
    )
    if (result._tag === "Left") {
      const err = result.left as { _tag: string; message?: string }
      return serviceErrorJson(c, err, errorTagToStatus(err._tag))
    }
    return c.json(result.right, 201)
  })

  return app
}
