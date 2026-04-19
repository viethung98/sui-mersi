import { Effect, Layer } from "effect"
import { tool, type ToolSet } from "ai"
import { z } from "zod"
import { CartService } from "./cart-service.js"
import { CheckoutService } from "./checkout-service.js"
import type { CartItem } from "../db/schema/cart-items.js"
import type { CheckoutResult } from "./checkout-service.js"
import logger from "../lib/logger.js"

interface ViewCartResult {
  items: Array<{
    id: string
    productId: string
    productName: string
    price: number
    priceFormatted: string
    image: string
    size: string
    color: string
    productUrl: string
    retailer: string
  }>
  total: number
  totalFormatted: string
  itemCount: number
}

interface AddToCartResult {
  success: boolean
  item: {
    id: string
    productId: string
    productName: string
    price: number
    priceFormatted: string
    size: string
    color: string
  }
  message: string
}

interface RemoveFromCartResult {
  success: boolean
  message: string
}

const addToCartSchema = z.object({
  productId: z.string().describe("Product ID (ASIN) from searchProducts result"),
  productName: z.string().describe("Full product name"),
  price: z.number().int().describe("Price in cents (e.g., 14999 for $149.99)"),
  image: z.string().url().describe("Primary product image URL"),
  size: z.string().default("Default").describe("Selected size (e.g., 'M', '10', 'Default')"),
  color: z.string().default("Default").describe("Selected color (e.g., 'Black', 'Default')"),
  productUrl: z.string().url().describe("Product page URL"),
  retailer: z.string().describe("Retailer name (e.g., 'Amazon')"),
})

const removeFromCartSchema = z.object({
  itemId: z.string().uuid().describe("Cart item UUID from viewCart results"),
})

const checkoutSchema = z.object({
  cartItemId: z.string().uuid().describe("Cart item UUID to checkout from viewCart results"),
})

export function makeCartTools(
  userId: string,
  cartLayer: Layer.Layer<CartService>,
  checkoutLayer: Layer.Layer<CheckoutService>,
): ToolSet {
  const runCartEither = <A, E>(eff: Effect.Effect<A, E, CartService>) =>
    Effect.runPromise(Effect.either(eff.pipe(Effect.provide(cartLayer))))

  const runCheckoutEither = <A, E>(eff: Effect.Effect<A, E, CheckoutService>) =>
    Effect.runPromise(Effect.either(eff.pipe(Effect.provide(checkoutLayer))))

  return {
    viewCart: tool({
      description:
        "View the current contents of the user's shopping cart. " +
        "Call this to show the cart, before checkout, or when the user asks what's in their cart.",
      inputSchema: z.object({}),
      execute: async (): Promise<ViewCartResult> => {
        const result = await runCartEither(
          CartService.pipe(Effect.flatMap((s) => s.listItems(userId))),
        )

        if (result._tag === "Left") {
          logger.warn({ userId, error: String(result.left) }, "Tool: viewCart failed")
          return { items: [], total: 0, totalFormatted: "$0.00", itemCount: 0 }
        }

        const items = result.right
        const mapped = items.map((item: CartItem) => ({
          id: item.onChainObjectId ?? item.id,
          productId: item.productId,
          productName: item.productName,
          price: item.price,
          priceFormatted: `$${(item.price / 100).toFixed(2)}`,
          image: item.image ?? "",
          size: item.size ?? "",
          color: item.color ?? "",
          productUrl: item.productUrl ?? "",
          retailer: item.retailer ?? "",
        }))

        const totalCents = items.reduce((s: number, i: CartItem) => s + i.price, 0)

        logger.info({ userId, itemCount: items.length }, "Tool: viewCart")
        return {
          items: mapped,
          total: totalCents,
          totalFormatted: `$${(totalCents / 100).toFixed(2)}`,
          itemCount: items.length,
        }
      },
    }),

    addToCart: tool({
      description:
        "Add a product to the user's shopping cart. ONLY call after the user explicitly says they want to add an item to cart. " +
        "Use product data from a previous searchProducts or getProductDetails call.",
      inputSchema: addToCartSchema,
      execute: async (params): Promise<AddToCartResult> => {
        const result = await runCartEither(
          CartService.pipe(Effect.flatMap((s) => s.addItem(userId, params))),
        )

        if (result._tag === "Left") {
          const err = result.left as { _tag?: string; message?: string }
          logger.warn({ userId, productId: params.productId, error: err._tag }, "Tool: addToCart failed")
          return {
            success: false,
            item: {} as AddToCartResult["item"],
            message: err.message ?? "Failed to add item to cart",
          }
        }

        const item = result.right
        logger.info({ userId, productId: params.productId }, "Tool: addToCart")
        return {
          success: true,
          item: {
            id: item.id,
            productId: item.productId,
            productName: item.productName,
            price: item.price,
            priceFormatted: `$${(item.price / 100).toFixed(2)}`,
            size: item.size ?? "",
            color: item.color ?? "",
          },
          message: `Added "${item.productName}" to cart`,
        }
      },
    }),

    removeFromCart: tool({
      description:
        "Remove a specific item from the cart by its cart item UUID. " +
        "Call viewCart first to get the itemId.",
      inputSchema: removeFromCartSchema,
      execute: async ({ itemId }): Promise<RemoveFromCartResult> => {
        const result = await runCartEither(
          CartService.pipe(Effect.flatMap((s) => s.removeItem(userId, itemId))),
        )

        if (result._tag === "Left") {
          const err = result.left as { _tag?: string; message?: string }
          logger.warn({ userId, itemId, error: err._tag }, "Tool: removeFromCart failed")
          return { success: false, message: err.message ?? "Failed to remove item from cart" }
        }

        logger.info({ userId, itemId }, "Tool: removeFromCart")
        return { success: true, message: "Item removed from cart" }
      },
    }),

    initiateCheckout: tool({
      description:
        "Start the checkout process for one cart item. " +
        "The user must have a provisioned wallet and shipping address before checkout. " +
        "Returns an order ID and transaction details. Call viewCart first to get the cartItemId from item.id.",
      inputSchema: checkoutSchema,
      execute: async ({ cartItemId }): Promise<CheckoutResult> => {
        const result = await runCheckoutEither(
          CheckoutService.pipe(Effect.flatMap((s) => s.checkout(userId, cartItemId))),
        )

        if (result._tag === "Left") {
          const err = result.left as { _tag?: string; message?: string }
          logger.warn({ userId, cartItemId, error: err._tag }, "Tool: initiateCheckout failed")
          throw new Error(err.message ?? "Checkout failed")
        }

        logger.info({ userId, cartItemId, orderId: result.right.orderId }, "Tool: initiateCheckout")
        return result.right
      },
    }),
  }
}
