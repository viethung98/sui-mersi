import { Hono } from "hono";
import { db } from "../db/client.js";
import { orders } from "../db/schema/orders.js";
import { USDC } from "../lib/coin.js";
import { fundCrossmintWallet } from "../lib/crossmint-client.js";
import { runService } from "../lib/effect-utils.js";
import logger from "../lib/logger.js";
import { DepositVerifyRequestSchema } from "../lib/openapi-schemas.js";
import { getPaymentReceipt } from "../lib/sui-client.js";
import { requireAuth } from "../middleware/auth.js";

export const depositRoute = new Hono()
  .use(requireAuth())
  .post("/verify", async (c) => {
    const user = c.get("user");

    if (!user.walletAddress || !user.evmAddress) {
      return c.json({ success: false, error: "Wallet not provisioned" }, 400);
    }

    const parseResult = DepositVerifyRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parseResult.success) {
      return c.json({ success: false, error: parseResult.error.issues[0]?.message ?? "Invalid request body" }, 400);
    }
    const { txDigest, nonce, amount, coinType } = parseResult.data;

    if (!USDC.isCoinType(coinType)) {
      return c.json({ success: false, error: "Invalid coin type" }, 400);
    }

    const receipt = await getPaymentReceipt(txDigest);
    if (!receipt) {
      return c.json(
        { success: false, error: "No PaymentReceipt event found" },
        400,
      );
    }

    if (receipt.nonce !== nonce) {
      return c.json({ success: false, error: "Nonce mismatch" }, 400);
    }
    if (BigInt(receipt.amount) !== BigInt(amount)) {
      return c.json({ success: false, error: "Amount mismatch" }, 400);
    }
    if (!USDC.isCoinType(receipt.coin_type)) {
      return c.json({ success: false, error: "Invalid coin type" }, 400);
    }

    if (receipt.receiver.toLowerCase() !== user.walletAddress.toLowerCase()) {
      return c.json({ success: false, error: "Receiver mismatch" }, 400);
    }

    // Insert before funding — unique constraint on tx_hash prevents replay attacks
    const usdcAmount = USDC.fromMists(BigInt(amount));
    try {
      await db.insert(orders).values({
        userId: c.get("userId"),
        type: "deposit",
        txHash: txDigest,
        status: "payment_confirmed",
        amountUsdc: String(usdcAmount),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("idx_orders_tx_hash")) {
        return c.json({ success: false, error: "Deposit already processed" }, 409);
      }
      logger.error({ err, txDigest }, "Failed to record deposit order");
      return c.json({ success: false, error: "Internal server error" }, 500);
    }

    const faucetResult = await runService(
      fundCrossmintWallet(user.evmAddress, usdcAmount, "base-sepolia"),
    );

    if (faucetResult._tag === "Left") {
      const err = faucetResult.left as { message?: string };
      return c.json(
        {
          success: false,
          error: `Faucet failed: ${err.message ?? "Unknown error"}`,
        },
        500,
      );
    }

    const usdmxAmount =
      faucetResult.right[0]?.balances?.total ?? String(usdcAmount);
    if (!faucetResult.right[0]?.balances?.total) {
      logger.warn(
        { txDigest },
        "Faucet returned no balances — using USDC amount as fallback",
      );
    }

    return c.json({
      success: true,
      txDigest,
      usdcAmount,
      usdmxAmount,
    });
  });
