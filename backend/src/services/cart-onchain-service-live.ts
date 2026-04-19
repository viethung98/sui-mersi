import { Effect, Layer } from "effect"
import { Transaction } from "@mysten/sui/transactions"
import { eq, and, desc, isNull } from "drizzle-orm"
import { db } from "../db/client.js"
import { cartItems } from "../db/schema/cart-items.js"
import { users } from "../db/schema/users.js"
import {
  DatabaseError,
  CartFullError,
  CartItemNotFoundError,
} from "../lib/errors.js"
import { toDatabaseError } from "../lib/effect-utils.js"
import { env } from "../lib/env.js"
import { signAndSubmit, signAndSubmitSponsored, signAndSubmitAs } from "./sui-relayer.js"
import { getUserKeypair, getRelayerKeypair } from "../lib/sui-client.js"
import { fetchCartAddress } from "./cart-onchain-reads.js"
import { CartService } from "./cart-service.js"
import type { CartServiceShape, AddCartItemData } from "./cart-service.js"
import logger from "../lib/logger.js"
import {
  createCart,
  addItem,
  removeItem,
  checkout,
} from "../generated/cart/cart.js"

const CONTRACT = env.SUI_CONTRACT_ADDRESS
const REGISTRY_ID = env.SUI_CART_REGISTRY_ID
const MAX_CART_ITEMS = 10

function ensureCartExists(walletAddress: string, userId: string): Effect.Effect<void, DatabaseError> {
  return Effect.tryPromise({
    try: () => fetchCartAddress(walletAddress),
    catch: toDatabaseError,
  }).pipe(
    Effect.flatMap((address) => {
      if (address !== null) return Effect.void
      logger.warn({ userId, walletAddress }, "Cart not found on-chain — auto-creating via relayer")
      const tx = buildCreateCartTx(walletAddress)
      return signAndSubmitAs(tx, getRelayerKeypair(), `create-cart-${userId}`).pipe(
        Effect.flatMap((result) => {
          logger.info({ userId, digest: result.digest }, "Cart auto-created")
          return Effect.void
        }),
        Effect.catchAll((err) => {
          const msg = err.cause instanceof Error ? err.cause.message : String(err.cause ?? "")
          // Abort code 2 = ECartAlreadyExists — race condition, safe to ignore
          if (msg.includes(", 2)") || msg.includes("ECartAlreadyExists")) return Effect.void
          return Effect.fail(err)
        }),
      )
    }),
  )
}

function makeOnchainCartImpl(): CartServiceShape {
  return {
    listItems: (userId) =>
      Effect.tryPromise({
        try: () =>
          db
            .select()
            .from(cartItems)
            .where(and(eq(cartItems.userId, userId), isNull(cartItems.deletedAt)))
            .orderBy(desc(cartItems.createdAt)),
        catch: toDatabaseError,
      }),

    addItem: (userId, data) =>
      Effect.gen(function* () {
        const user = yield* Effect.tryPromise({
          try: () =>
            db.select({
              walletAddress: users.walletAddress,
              suiPrivateKeyEncrypted: users.suiPrivateKeyEncrypted,
            }).from(users).where(eq(users.id, userId)).then((rows) => rows[0] ?? null),
          catch: toDatabaseError,
        })

        if (!user?.walletAddress) {
          return yield* Effect.fail(new DatabaseError({ cause: "User wallet not provisioned" }))
        }

        const existing = yield* Effect.tryPromise({
          try: () =>
            db.select({ id: cartItems.id }).from(cartItems)
              .where(and(eq(cartItems.userId, userId), isNull(cartItems.deletedAt))),
          catch: toDatabaseError,
        })

        if (existing.length >= MAX_CART_ITEMS) {
          return yield* Effect.fail(new CartFullError({ userId }))
        }

        if (!CONTRACT) {
          return yield* Effect.fail(new DatabaseError({ cause: "SUI_CONTRACT_ADDRESS not configured" }))
        }

        yield* ensureCartExists(user.walletAddress, userId)

        const itemId = crypto.randomUUID()
        const tx = buildAddItemTx(user.walletAddress, itemId, data)
        const label = `add-cart-${userId}-${data.productId}`

        const submitResult = yield* (user.suiPrivateKeyEncrypted
          ? Effect.try({
              try: () => getUserKeypair(user.suiPrivateKeyEncrypted!),
              catch: toDatabaseError,
            }).pipe(
              Effect.flatMap((userKeypair) => signAndSubmitSponsored(tx, userKeypair, label)),
            )
          : signAndSubmit(tx, label))

        if (submitResult.status === "failure") {
          return yield* Effect.fail(
            new DatabaseError({ cause: `On-chain add_item failed: ${submitResult.digest}` }),
          )
        }

        logger.info(
          { userId, txDigest: submitResult.digest, productId: data.productId, itemId },
          "Cart item added on-chain — indexer will sync DB",
        )

        return {
          id: itemId,
          userId,
          productId: data.productId,
          productName: data.productName,
          price: data.price,
          image: data.image ?? null,
          size: data.size ?? null,
          color: data.color ?? null,
          productUrl: data.productUrl ?? null,
          retailer: data.retailer ?? null,
          txDigest: submitResult.digest,
          onChainObjectId: itemId,
          createdAt: new Date(),
          deletedAt: null,
        }
      }),

    removeItem: (userId, itemId) =>
      Effect.gen(function* () {
        const user = yield* Effect.tryPromise({
          try: () =>
            db.select({
              walletAddress: users.walletAddress,
              suiPrivateKeyEncrypted: users.suiPrivateKeyEncrypted,
            }).from(users).where(eq(users.id, userId)).then((rows) => rows[0] ?? null),
          catch: toDatabaseError,
        })

        if (!user?.walletAddress) {
          return yield* Effect.fail(new CartItemNotFoundError({ itemId }))
        }

        if (!CONTRACT) {
          return yield* Effect.fail(new DatabaseError({ cause: "SUI_CONTRACT_ADDRESS not configured" }))
        }

        const tx = buildRemoveItemTx(user.walletAddress, itemId)
        const label = `remove-cart-${itemId}`

        const submitResult = yield* (user.suiPrivateKeyEncrypted
          ? Effect.try({
              try: () => getUserKeypair(user.suiPrivateKeyEncrypted!),
              catch: toDatabaseError,
            }).pipe(
              Effect.flatMap((userKeypair) => signAndSubmitSponsored(tx, userKeypair, label)),
            )
          : signAndSubmit(tx, label))

        if (submitResult.status === "failure") {
          logger.error({ itemId, digest: submitResult.digest }, "On-chain remove_item failed")
          return yield* Effect.fail(
            new DatabaseError({ cause: `On-chain remove_item failed: ${submitResult.digest}` }),
          )
        }

        logger.info({ itemId, digest: submitResult.digest }, "On-chain remove_item succeeded — indexer will soft delete")
      }),
  }
}

function buildAddItemTx(ownerAddress: string, itemId: string, data: AddCartItemData): Transaction {
  const tx = new Transaction()
  tx.add(addItem({
    package: CONTRACT,
    arguments: {
      registry: REGISTRY_ID,
      owner: ownerAddress,
      itemId,
      productId: data.productId,
      productName: data.productName,
      price: BigInt(data.price),
      image: data.image,
      size: data.size,
      color: data.color,
      productUrl: data.productUrl,
      retailer: data.retailer,
    },
  }))
  return tx
}

function buildRemoveItemTx(ownerAddress: string, itemId: string): Transaction {
  const tx = new Transaction()
  tx.add(removeItem({
    package: CONTRACT,
    arguments: {
      registry: REGISTRY_ID,
      owner: ownerAddress,
      itemId,
    },
  }))
  return tx
}

export function buildCreateCartTx(ownerAddress: string): Transaction {
  const tx = new Transaction()
  tx.add(createCart({
    package: CONTRACT,
    arguments: {
      registry: REGISTRY_ID,
      owner: ownerAddress,
    },
  }))
  return tx
}

export function buildCheckoutTx(ownerAddress: string, orderId: string, itemId: string): Transaction {
  const tx = new Transaction()
  tx.add(checkout({
    package: CONTRACT,
    arguments: {
      registry: REGISTRY_ID,
      owner: ownerAddress,
      orderId,
      itemId,
    },
  }))
  return tx
}

export const CartOnchainServiceLive = Layer.succeed(CartService, makeOnchainCartImpl())
