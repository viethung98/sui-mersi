import Redis from "ioredis"
import { suiClient } from "../lib/sui-client.js"
import { env } from "../lib/env.js"
import { db } from "../db/client.js"
import { orders } from "../db/schema/orders.js"
import { cartItems } from "../db/schema/cart-items.js"
import { users } from "../db/schema/users.js"
import { eq } from "drizzle-orm"
import logger from "../lib/logger.js"

interface CartCreatedEvent {
  owner: string
}

interface CartItemAddedEvent {
  owner: string
  item_id: string      // u64 serialized as string in Sui JSON RPC
  product_id: string
  product_name: string
  price: string        // u64 serialized as string (cents)
  image: string
  size: string
  color: string
  product_url: string
  retailer: string
}

interface CartItemRemovedEvent {
  owner: string
  item_id: string
  product_id: string
  product_name: string
  price: string
  image: string
  size: string
  color: string
  product_url: string
  retailer: string
}

interface OrderCreatedEvent {
  owner: string
  order_id: string
  item_id: string      // u64 serialized as string — the single item that was checked out
  product_id: string
  product_name: string
  price: string        // u64 serialized as string (cents)
  image: string
  size: string
  color: string
  product_url: string
  retailer: string
}

const CURSOR_KEY = "sui:indexer:cursor"
const CURSOR_TTL = 30 * 24 * 60 * 60 // 30 days

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true })
  }
  return redis
}

async function loadCursor(): Promise<{ txDigest: string; eventSeq: string } | null> {
  try {
    const raw = await getRedis().get(CURSOR_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // Redis unavailable — fall back to null (re-scan from beginning)
  }
  return null
}

async function saveCursor(cursor: { txDigest: string; eventSeq: string }): Promise<void> {
  try {
    await getRedis().set(CURSOR_KEY, JSON.stringify(cursor), "EX", CURSOR_TTL)
  } catch {
    // Non-fatal — next restart will re-scan recent events
  }
}

let eventCursor: { txDigest: string; eventSeq: string } | null = null
let running = false

async function processCartCreated(event: CartCreatedEvent): Promise<void> {
  logger.info({ owner: event.owner }, "Indexer: CartCreated")
}

async function processCartItemAdded(event: CartItemAddedEvent, txDigest: string): Promise<void> {
  const user = await db.query.users?.findFirst({
    where: eq(users.walletAddress, event.owner),
    columns: { id: true },
  })

  if (!user) {
    logger.warn({ owner: event.owner, itemId: event.item_id }, "Indexer: CartItemAdded — user not found, skipping")
    return
  }

  await db
    .insert(cartItems)
    .values({
      userId: user.id,
      productId: event.product_id,
      productName: event.product_name,
      price: Number(event.price),
      image: event.image || null,
      size: event.size || null,
      color: event.color || null,
      productUrl: event.product_url || null,
      retailer: event.retailer || null,
      txDigest,
      onChainObjectId: String(event.item_id),
    })
    .onConflictDoNothing()

  logger.info(
    { owner: event.owner, itemId: event.item_id, productId: event.product_id, txDigest },
    "Indexer: CartItemAdded — row inserted",
  )
}

async function processCartItemRemoved(event: CartItemRemovedEvent): Promise<void> {
  await db
    .update(cartItems)
    .set({ deletedAt: new Date() })
    .where(eq(cartItems.onChainObjectId, String(event.item_id)))

  logger.info({ itemId: event.item_id, productId: event.product_id }, "Indexer: CartItemRemoved — soft deleted")
}

async function processOrderCreated(event: OrderCreatedEvent): Promise<void> {
  const user = await db.query.users?.findFirst({
    where: eq(users.walletAddress, event.owner),
    columns: { id: true },
  })

  if (!user) {
    logger.warn({ owner: event.owner }, "Indexer: OrderCreated — user not found, skipping")
    return
  }

  await db
    .insert(orders)
    .values({
      userId: user.id,
      type: "checkout",
      crossmintOrderId: event.order_id,
    })
    .onConflictDoNothing()

  await db
    .update(cartItems)
    .set({ deletedAt: new Date() })
    .where(eq(cartItems.onChainObjectId, String(event.item_id)))

  logger.info(
    { userId: user.id, orderId: event.order_id, itemId: event.item_id, productId: event.product_id },
    "Indexer: OrderCreated — order synced, cart item soft deleted",
  )
}

async function pollOnce(): Promise<void> {
  if (!env.SUI_CONTRACT_ADDRESS) return

  try {
    const result = await suiClient.queryEvents({
      query: {
        MoveModule: {
          package: env.SUI_CONTRACT_ADDRESS,
          module: "cart",
        },
      },
      cursor: eventCursor ?? undefined,
      limit: 50,
      order: "ascending",
    })

    if (result.data.length > 0) {
      logger.info(
        { count: result.data.length, hasNextPage: result.hasNextPage, cursor: eventCursor },
        "Indexer: events received",
      )
    } else {
      logger.debug({ cursor: eventCursor }, "Indexer: no new events")
    }

    for (const suiEvent of result.data) {
      const type = suiEvent.type ?? ""
      try {
        if (type.endsWith("::cart::CartCreated")) {
          await processCartCreated(suiEvent.parsedJson as CartCreatedEvent)
        } else if (type.endsWith("::cart::CartItemAdded")) {
          await processCartItemAdded(suiEvent.parsedJson as CartItemAddedEvent, suiEvent.id.txDigest)
        } else if (type.endsWith("::cart::CartItemRemoved")) {
          await processCartItemRemoved(suiEvent.parsedJson as CartItemRemovedEvent)
        } else if (type.endsWith("::cart::OrderCreated")) {
          await processOrderCreated(suiEvent.parsedJson as OrderCreatedEvent)
        } else {
          logger.warn({ type }, "Indexer: unknown event type — skipping")
        }
      } catch (eventErr) {
        logger.error(
          { type, eventId: suiEvent.id, err: eventErr instanceof Error ? eventErr.message : String(eventErr) },
          "Indexer: event processing failed — skipping",
        )
      }
    }

    // Always persist the cursor when we receive one — even when hasNextPage=false (caught up).
    // Without this, restarts re-scan from the last "hasNextPage=true" checkpoint, reprocessing
    // all events in between. Operations are idempotent but re-scanning is wasteful.
    // Note: Sui uses BFT consensus with near-instant finality, making chain reorgs negligible.
    // Events indexed once will not be invalidated; no rollback logic is needed.
    if (result.nextCursor) {
      eventCursor = result.nextCursor as { txDigest: string; eventSeq: string }
      await saveCursor(eventCursor)
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "Indexer: poll failed",
    )
  }
}

const POLL_INTERVAL_MS = 2_000

export async function startIndexer(): Promise<void> {
  if (running) return
  running = true

  eventCursor = await loadCursor()
  logger.info(
    { contractAddress: env.SUI_CONTRACT_ADDRESS || "(not configured)", hasCursor: !!eventCursor },
    "Indexer started",
  )

  const tick = async () => {
    if (!running) return
    await pollOnce()
    if (running) setTimeout(tick, POLL_INTERVAL_MS)
  }

  tick()
}

function stopIndexer(): void {
  running = false
  logger.info("Indexer stopped")
}
