import { createHmac, timingSafeEqual } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { cartItems } from "../db/schema/cart-items.js";
import { orderItems } from "../db/schema/order-items.js";
import { orders } from "../db/schema/orders.js";
import { users } from "../db/schema/users.js";
import { env } from "../lib/env.js";
import logger from "../lib/logger.js";
import { getRelayerKeypair, getUserKeypair } from "../lib/sui-client.js";
import { buildCheckoutTx } from "../services/cart-onchain-service-live.js";
import {
  signAndSubmitAs,
  signAndSubmitSponsored,
} from "../services/sui-relayer.js";

// Svix webhook signature verification — spec: https://docs.svix.com/receiving/verifying-payloads/how-manual
function verifySvixSignature(
  rawBody: string,
  headers: { svixId: string; svixTimestamp: string; svixSignature: string },
  secret: string,
): boolean {
  try {
    const ts = parseInt(headers.svixTimestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

    const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const key = Buffer.from(keyB64, "base64");

    const signedContent = `${headers.svixId}.${headers.svixTimestamp}.${rawBody}`;
    const expected = createHmac("sha256", key)
      .update(signedContent)
      .digest("base64");

    // svix-signature may contain multiple space-separated "v1,<sig>" entries (multi-sig)
    return headers.svixSignature.split(" ").some((entry) => {
      const sig = entry.startsWith("v1,") ? entry.slice(3) : entry;
      try {
        return timingSafeEqual(
          Buffer.from(sig, "base64"),
          Buffer.from(expected, "base64"),
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

const TYPE_TO_STATUS: Record<string, string> = {
  "orders.payment.succeeded": "payment_confirmed",
  "orders.delivery.initiated": "in_progress",
  "orders.delivery.completed": "delivered",
  "orders.delivery.failed": "cancelled",
  "orders.payment.failed": "cancelled",
};

const SUCCESS_TYPES = new Set([
  "orders.payment.succeeded",
  "orders.delivery.completed",
]);

async function setCartItemVisibilityForOrder(
  orderIdentifier: string,
  deletedAt: Date | null,
) {
  const rows = await db
    .select({ cartItemId: orderItems.cartItemId })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(eq(orders.crossmintOrderId, orderIdentifier));

  const cartItemIds = rows
    .map((row) => row.cartItemId)
    .filter((cartItemId): cartItemId is string => !!cartItemId);

  if (!cartItemIds.length) {
    return;
  }

  await db
    .update(cartItems)
    .set({ deletedAt })
    .where(inArray(cartItems.id, cartItemIds));
}

export const webhookCrossmintRoute = new Hono();

webhookCrossmintRoute.post("/crossmint", async (c) => {
  if (!env.CROSSMINT_WEBHOOK_SECRET) {
    logger.warn("CROSSMINT_WEBHOOK_SECRET not configured — rejecting webhook");
    return c.json(
      { error: "Webhook not configured", code: "WEBHOOK_NOT_CONFIGURED" },
      503,
    );
  }

  const rawBody = await c.req.text();

  // Crossmint sends both svix-* and webhook-* header variants
  const svixId = c.req.header("svix-id") ?? c.req.header("webhook-id") ?? "";
  const svixTimestamp =
    c.req.header("svix-timestamp") ?? c.req.header("webhook-timestamp") ?? "";
  const svixSignature =
    c.req.header("svix-signature") ?? c.req.header("webhook-signature") ?? "";

  logger.debug(
    {
      svixId,
      svixTimestamp,
      hasSig: !!svixSignature,
      bodyLen: rawBody.length,
    },
    "Crossmint webhook: verifying signature",
  );

  if (
    !svixId ||
    !svixTimestamp ||
    !svixSignature ||
    !verifySvixSignature(
      rawBody,
      { svixId, svixTimestamp, svixSignature },
      env.CROSSMINT_WEBHOOK_SECRET,
    )
  ) {
    logger.warn(
      { svixId, svixTimestamp, hasSig: !!svixSignature },
      "Crossmint webhook signature verification failed",
    );
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  let body: {
    type?: string;
    actionId?: string;
    data?: {
      orderId?: string;
      lineItems?: Array<{ callData?: { orderHash?: string } }>;
      quote?: { totalPrice?: { amount?: string } };
      payment?: { received?: { txId?: string; amount?: string } };
    };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, 400);
  }

  const { type, data, actionId } = body;
  const orderIdentifier = data?.orderId ?? actionId;
  const paymentTxId = data?.payment?.received?.txId ?? null;
  const totalPriceAmount =
    data?.quote?.totalPrice?.amount ?? data?.payment?.received?.amount ?? null;

  if (!type) {
    return c.json({ ok: true });
  }

  logger.info(
    { type, orderIdentifier, paymentTxId },
    "Crossmint webhook received",
  );

  const status = TYPE_TO_STATUS[type];
  if (status && orderIdentifier) {
    try {
      await db
        .update(orders)
        .set({
          status,
          ...(paymentTxId ? { paymentHash: paymentTxId } : {}),
          ...(totalPriceAmount ? { amountUsdc: totalPriceAmount } : {}),
        })
        .where(eq(orders.crossmintOrderId, orderIdentifier));
      logger.info(
        { type, orderIdentifier, status, paymentTxId, totalPriceAmount },
        "Order status updated",
      );
    } catch (err) {
      logger.error(
        { err, type, orderIdentifier },
        "Failed to update order status",
      );
    }
  }

  if (orderIdentifier) {
    const shouldHideCartItems =
      type === "orders.payment.succeeded" ||
      type === "orders.delivery.initiated" ||
      type === "orders.delivery.completed";
    const shouldRestoreCartItems =
      type === "orders.payment.failed" || type === "orders.delivery.failed";

    if (shouldHideCartItems || shouldRestoreCartItems) {
      try {
        await setCartItemVisibilityForOrder(
          orderIdentifier,
          shouldRestoreCartItems ? null : new Date(),
        );
      } catch (err) {
        logger.error(
          { err, type, orderIdentifier },
          "Failed to sync cart item visibility for order",
        );
      }
    }
  }

  if (
    SUCCESS_TYPES.has(type ?? "") &&
    orderIdentifier &&
    env.CART_SERVICE === "onchain" &&
    env.SUI_CONTRACT_ADDRESS
  ) {
    try {
      const row = await db
        .select({
          txHash: orders.txHash,
          onChainObjectId: orderItems.onChainObjectId,
          walletAddress: users.walletAddress,
          suiPrivateKeyEncrypted: users.suiPrivateKeyEncrypted,
        })
        .from(orders)
        .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
        .innerJoin(users, eq(users.id, orders.userId))
        .where(eq(orders.crossmintOrderId, orderIdentifier))
        .limit(1)
        .then((r) => r[0] ?? null);

      if (!row?.onChainObjectId || !row.walletAddress) {
        logger.debug(
          { orderIdentifier },
          "On-chain checkout skipped — no onChainObjectId or walletAddress",
        );
      } else if (row.txHash) {
        logger.debug(
          { orderIdentifier, txHash: row.txHash },
          "On-chain checkout skipped — tx_hash already set",
        );
      } else {
        const tx = buildCheckoutTx(
          row.walletAddress,
          orderIdentifier,
          row.onChainObjectId,
        );
        const submitEffect = row.suiPrivateKeyEncrypted
          ? signAndSubmitSponsored(
              tx,
              getUserKeypair(row.suiPrivateKeyEncrypted),
              `checkout-${orderIdentifier}`,
            )
          : signAndSubmitAs(
              tx,
              getRelayerKeypair(),
              `checkout-${orderIdentifier}`,
            );

        await Effect.runPromise(
          submitEffect.pipe(
            Effect.flatMap((result) =>
              Effect.tryPromise({
                try: () =>
                  db
                    .update(orders)
                    .set({ txHash: result.digest })
                    .where(eq(orders.crossmintOrderId, orderIdentifier))
                    .then(() => result),
                catch: (err) => ({
                  _tag: "DbUpdateError" as const,
                  cause: err,
                }),
              }),
            ),
            Effect.tap((result) =>
              Effect.sync(() =>
                logger.info(
                  { digest: result.digest, orderIdentifier },
                  "On-chain checkout completed — tx_hash saved",
                ),
              ),
            ),
            Effect.tapError((e) =>
              Effect.sync(() =>
                logger.warn(
                  { cause: e, orderIdentifier },
                  "On-chain checkout PTB failed — non-fatal",
                ),
              ),
            ),
            Effect.ignore,
          ),
        );
      }
    } catch (err) {
      logger.error(
        { err, orderIdentifier },
        "Error during on-chain checkout PTB dispatch",
      );
    }
  }

  return c.json({ ok: true });
});
