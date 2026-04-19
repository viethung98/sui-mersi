import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { db } from "../db/client.js";
import { users } from "../db/schema/users.js";
import { runService, serviceErrorJson, errorTagToStatus } from "../lib/effect-utils.js";
import { env } from "../lib/env.js";
import {
  AddCartItemSchema,
  CartAddressSchema,
  CartInfoSchema,
  CartInitSchema,
  CartItemIdParamSchema,
  CartItemSchema,
  CartListSchema,
  commonErrors,
  cookieSecurity,
  errorResponse,
  validationHook,
} from "../lib/openapi-schemas.js";
import { getUserKeypair } from "../lib/sui-client.js";
import type { AuthVariables } from "../middleware/auth.js";
import {
  fetchCartAddress,
  fetchCartInfo,
} from "../services/cart-onchain-reads.js";
import { buildCreateCartTx } from "../services/cart-onchain-service-live.js";
import { CartService } from "../services/cart-service.js";
import { signAndSubmitAs } from "../services/sui-relayer.js";


const listCartRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Cart"],
  security: cookieSecurity,
  summary: "List cart items",
  responses: {
    200: {
      content: { "application/json": { schema: CartListSchema } },
      description: "User's cart items",
    },
    ...commonErrors,
  },
});

const addCartItemRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Cart"],
  security: cookieSecurity,
  summary: "Add item to cart",
  request: {
    body: {
      content: { "application/json": { schema: AddCartItemSchema } },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: CartItemSchema } },
      description: "Item added to cart",
    },
    ...errorResponse(400, "Cart is full (max 10 items)"),
    ...errorResponse(409, "Item variant already in cart"),
    ...commonErrors,
  },
});

const removeCartItemRoute = createRoute({
  method: "delete",
  path: "/{itemId}",
  tags: ["Cart"],
  security: cookieSecurity,
  summary: "Remove item from cart",
  request: { params: CartItemIdParamSchema },
  responses: {
    204: { description: "Item removed" },
    ...errorResponse(404, "Cart item not found"),
    ...commonErrors,
  },
});

const initCartRoute = createRoute({
  method: "post",
  path: "/init",
  tags: ["Cart"],
  security: cookieSecurity,
  summary: "Create the on-chain Cart object for the authenticated user",
  responses: {
    200: {
      content: { "application/json": { schema: CartInitSchema } },
      description: "Cart created or already exists",
    },
    ...errorResponse(400, "Wallet not provisioned or contract not configured"),
    ...commonErrors,
  },
});

const getCartAddressRoute = createRoute({
  method: "get",
  path: "/address",
  tags: ["Cart"],
  security: cookieSecurity,
  summary: "Get on-chain Cart object address",
  responses: {
    200: {
      content: { "application/json": { schema: CartAddressSchema } },
      description: "Cart object address on Sui",
    },
    ...commonErrors,
  },
});

const getCartInfoRoute = createRoute({
  method: "get",
  path: "/info",
  tags: ["Cart"],
  security: cookieSecurity,
  summary: "Get on-chain cart info (address + item count)",
  responses: {
    200: {
      content: { "application/json": { schema: CartInfoSchema } },
      description: "On-chain cart state",
    },
    ...commonErrors,
  },
});


export function createCartRoutes(layer: Layer.Layer<CartService>) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: validationHook,
  });

  app.openapi(listCartRoute, async (c) => {
    const userId = c.get("userId");
    const result = await runService(
      CartService.pipe(
        Effect.flatMap((s) => s.listItems(userId)),
        Effect.provide(layer),
      ),
    );
    if (result._tag === "Left") {
      const err = result.left as { _tag: string; message?: string };
      return serviceErrorJson(c, err, errorTagToStatus(err._tag));
    }
    return c.json(
      {
        items: result.right.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      },
      200,
    ) as never;
  });

  app.openapi(addCartItemRoute, async (c) => {
    const userId = c.get("userId");
    const data = c.req.valid("json");
    const result = await runService(
      CartService.pipe(
        Effect.flatMap((s) => s.addItem(userId, data)),
        Effect.provide(layer),
      ),
    );
    if (result._tag === "Left") {
      const err = result.left as { _tag: string; message?: string };
      return serviceErrorJson(c, err, errorTagToStatus(err._tag));
    }
    const item = result.right;
    return c.json(
      { ...item, createdAt: item.createdAt.toISOString() },
      201,
    ) as never;
  });

  app.openapi(removeCartItemRoute, async (c) => {
    const userId = c.get("userId");
    const { itemId } = c.req.valid("param");
    const result = await runService(
      CartService.pipe(
        Effect.flatMap((s) => s.removeItem(userId, itemId)),
        Effect.provide(layer),
      ),
    );
    if (result._tag === "Left") {
      const err = result.left as { _tag: string; message?: string };
      return serviceErrorJson(c, err, errorTagToStatus(err._tag));
    }
    return c.body(null, 204);
  });

  app.openapi(initCartRoute, async (c) => {
    const userId = c.get("userId");
    const [user] = await db
      .select({
        walletAddress: users.walletAddress,
        suiPrivateKeyEncrypted: users.suiPrivateKeyEncrypted,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user?.walletAddress || !user.suiPrivateKeyEncrypted) {
      return c.json(
        { error: "Wallet not provisioned", code: "WALLET_NOT_PROVISIONED" },
        400,
      ) as never;
    }
    if (!env.SUI_CONTRACT_ADDRESS) {
      return c.json(
        { error: "Contract not configured", code: "CONTRACT_NOT_CONFIGURED" },
        400,
      ) as never;
    }

    try {
      const keypair = getUserKeypair(user.suiPrivateKeyEncrypted);
      const tx = buildCreateCartTx(user.walletAddress);
      await Effect.runPromise(
        signAndSubmitAs(tx, keypair, `create-cart-${userId}`),
      );
      return c.json({ created: true, message: "Cart created" }, 200);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("MoveAbort")) { // code 2 = ECartAlreadyExists
        return c.json({ created: false, message: "Cart already exists" }, 200);
      }
      return c.json(
        { error: "Failed to create cart", code: "CREATE_CART_FAILED" },
        500,
      ) as never;
    }
  });

  app.openapi(getCartAddressRoute, async (c) => {
    const walletAddress = c.get("user").walletAddress ?? null;
    if (!walletAddress) {
      return c.json(
        { error: "Wallet not provisioned", code: "WALLET_NOT_PROVISIONED" },
        500,
      ) as never;
    }
    const cartAddress = await fetchCartAddress(walletAddress);
    return c.json({ cartAddress, exists: cartAddress !== null }, 200);
  });

  app.openapi(getCartInfoRoute, async (c) => {
    const walletAddress = c.get("user").walletAddress ?? null;
    if (!walletAddress) {
      return c.json(
        { error: "Wallet not provisioned", code: "WALLET_NOT_PROVISIONED" },
        500,
      ) as never;
    }
    const info = await fetchCartInfo(walletAddress);
    return c.json(info, 200);
  });

  return app;
}
