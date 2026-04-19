import { Effect, Layer } from "effect"
import { eq, and, or, isNull } from "drizzle-orm"
import { db } from "../db/client.js"
import { users } from "../db/schema/users.js"
import { cartItems } from "../db/schema/cart-items.js"
import { orders } from "../db/schema/orders.js"
import { orderItems } from "../db/schema/order-items.js"
import {
  DatabaseError,
  CartItemNotFoundError,
  CheckoutNoWalletError,
  CheckoutMissingAddressError,
  InsufficientFundsError,
  CheckoutOrderCreationError,
} from "../lib/errors.js"
import { buildCrossmintProductLocator } from "../lib/crossmint-product-locator.js"
import { createCrossmintOrder } from "../lib/crossmint-client.js"
import { toDatabaseError } from "../lib/effect-utils.js"
import logger from "../lib/logger.js"
import type { CheckoutServiceShape } from "./checkout-service.js"
import { CheckoutService } from "./checkout-service.js"

const impl: CheckoutServiceShape = {
  checkout: (userId, cartItemId) =>
    Effect.gen(function* () {
      const user = yield* Effect.tryPromise({
          try: () =>
            db
              .select()
              .from(users)
              .where(eq(users.id, userId))
              .then((rows) => rows[0] ?? null),
          catch: toDatabaseError,
        })

      if (!user) {
        return yield* Effect.fail(new DatabaseError({ cause: "User not found" }))
      }

      if (!user.crossmintWalletId || !user.walletAddress || !user.evmAddress) {
        return yield* Effect.fail(new CheckoutNoWalletError({ userId }))
      }

      const hasAddress =
        user.firstName &&
        user.lastName &&
        user.street &&
        user.city &&
        user.zip &&
        user.country;
      if (!hasAddress) {
        return yield * Effect.fail(new CheckoutMissingAddressError({ userId }));
      }

      const cartItem = yield* Effect.tryPromise({
          try: () =>
            db
              .select()
              .from(cartItems)
              .where(
                and(
                  or(
                    eq(cartItems.id, cartItemId),
                    eq(cartItems.onChainObjectId, cartItemId),
                  ),
                  eq(cartItems.userId, userId),
                  isNull(cartItems.deletedAt),
                ),
              )
              .then((rows) => rows[0] ?? null),
          catch: toDatabaseError,
        })

      if (!cartItem) {
        return yield* Effect.fail(new CartItemNotFoundError({ itemId: cartItemId }))
      }

      const productLocator = buildCrossmintProductLocator({
        productId: cartItem.productId,
        productUrl: cartItem.productUrl,
        retailer: cartItem.retailer,
      })

      if (!productLocator) {
        return yield* Effect.fail(
          new CheckoutOrderCreationError({
            cause: `Cart item ${cartItem.id} has no valid Crossmint product locator source`,
          }),
        )
      }

      const crossmintResponse = yield* createCrossmintOrder({
        email: user.email,
        physicalAddress: {
          name: `${user.firstName} ${user.lastName}`,
          line1: user.street!,
          line2: user.apt ?? undefined,
          city: user.city!,
          state: user.state ?? "",
          postalCode: user.zip!,
          country: user.country!,
        },
        // Checkout payment runs on Base Sepolia, so use the user's EVM wallet
        // rather than the app's separate Sui address used for cart state.
        payerAddress: user.evmAddress,
        lineItems: [{ productLocator }],
      })

      const crossmintOrder = crossmintResponse.order

      if (crossmintOrder.payment.status === "crypto-payer-insufficient-funds") {
        return yield* Effect.fail(
          new InsufficientFundsError({ orderId: crossmintOrder.orderId }),
        )
      }

      const serializedTx = crossmintOrder.payment.preparation?.serializedTransaction
      if (!serializedTx) {
        logger.error(
          { orderId: crossmintOrder.orderId, payment: crossmintOrder.payment },
          "No serialized transaction in Crossmint response",
        )
        return yield* Effect.fail(
          new CheckoutOrderCreationError({
            cause: `Missing serializedTransaction in Crossmint response for order ${crossmintOrder.orderId}`,
          }),
        )
      }

      const localOrder = yield* Effect.tryPromise({
          try: () =>
            db.transaction(async (tx) => {
              const [order] = await tx
                .insert(orders)
                .values({
                  userId,
                  type: "checkout",
                  crossmintOrderId: crossmintOrder.orderId,
                  status: "awaiting_approval",
                })
                .returning();

              await tx.insert(orderItems).values({
                orderId: order.id,
                cartItemId: cartItem.id,
                productId: cartItem.productId,
                productName: cartItem.productName,
                price: cartItem.price,
                image: cartItem.image,
                size: cartItem.size,
                color: cartItem.color,
                productUrl: cartItem.productUrl,
                retailer: cartItem.retailer,
                onChainObjectId: cartItem.onChainObjectId ?? null,
              })

              return order;
            }),
          catch: toDatabaseError,
        })

      // On-chain checkout PTB is submitted later by the Crossmint webhook
      // (POST /api/webhooks/crossmint) when phase = "orders.payment.succeeded".
      // This ensures on-chain state only changes after payment is confirmed.

      logger.info(
        {
          userId,
          orderId: localOrder.id,
          crossmintOrderId: crossmintOrder.orderId,
        },
        "Checkout order created — awaiting frontend approval",
      )

      return {
        orderId: localOrder.id,
        crossmintOrderId: crossmintOrder.orderId,
        phase: "awaiting-approval",
        serializedTransaction: serializedTx,
        walletAddress: user.evmAddress,
      }
    }),
}

export const CheckoutServiceLive = Layer.succeed(CheckoutService, impl)
