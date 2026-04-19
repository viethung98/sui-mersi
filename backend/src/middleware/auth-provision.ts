import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { crossmintAuth } from "../lib/crossmint.js"
import { db } from "../db/client.js"
import { users } from "../db/schema/users.js"
import { provisionEvmWallet, generateSuiKeypair } from "../services/wallet-service.js"
import { buildCreateCartTx } from "../services/cart-onchain-service-live.js"
import { signAndSubmitAs } from "../services/sui-relayer.js"
import { getRelayerKeypair } from "../lib/sui-client.js"
import { env } from "../lib/env.js"
import logger from "../lib/logger.js"
import { initUserMemory } from "../lib/memwal.js"

type ProvisionResult =
  | { ok: true; userId: string; email: string; walletAddress: string | null; evmAddress: string | null; onboardingStep: number }
  | { ok: false; status: number; error: string; code: string }

export async function provisionNewUser(crossmintUserId: string, emailHint?: string): Promise<ProvisionResult> {
  let email: string = emailHint ?? ""
  if (!email) {
    try {
      const profile = await crossmintAuth.getUser(crossmintUserId) as { email?: string }
      email = profile.email ?? ""
    } catch (err) {
      logger.error({ err, crossmintUserId }, "Failed to fetch user profile")
    }
  }
  if (!email) {
    logger.error({ crossmintUserId, event: "provision_no_email" }, "No email available for user provisioning")
    return { ok: false, status: 500, error: "User profile missing email", code: "NO_EMAIL" }
  }

  let internalUserId: string | undefined
  try {
    const inserted = await db
      .insert(users)
      .values({ crossmintUserId, email, walletStatus: "pending" })
      .onConflictDoNothing()
      .returning({ id: users.id })

    internalUserId =
      inserted[0]?.id ??
      (
        await db.query.users?.findFirst({
          where: eq(users.crossmintUserId, crossmintUserId),
        })
      )?.id
  } catch (err) {
    logger.error({ err, crossmintUserId, email, event: "user_insert_failed" }, "DB insert failed")
    return { ok: false, status: 500, error: "Internal Server Error", code: "USER_CREATE_FAILED" }
  }

  if (!internalUserId) {
    return { ok: false, status: 500, error: "Internal Server Error", code: "USER_CREATE_FAILED" }
  }

  let suiKeypair: { suiAddress: string; suiPrivateKeyEncrypted: string }
  try {
    suiKeypair = generateSuiKeypair()
  } catch (err) {
    logger.error({ err, crossmintUserId, event: "sui_keypair_failed" }, "Sui keypair generation failed")
    await db.delete(users).where(eq(users.id, internalUserId)).catch(() => undefined)
    return { ok: false, status: 500, error: "Internal Server Error", code: "SUI_KEYPAIR_FAILED" }
  }

  const evmResult = await Effect.runPromise(Effect.either(provisionEvmWallet(email)))
  if (evmResult._tag === "Left") {
    const err = evmResult.left
    logger.error(
      {
        crossmintUserId,
        cause: err.cause instanceof Error ? err.cause.message : String(err.cause),
        event: "evm_wallet_provision_failed",
      },
      "EVM wallet provisioning failed — rolling back user row",
    )
    await db.delete(users).where(eq(users.id, internalUserId)).catch(() => undefined)
    return { ok: false, status: 503, error: "Service Unavailable", code: "WALLET_PROVISION_FAILED" }
  }

  const { evmAddress, evmWalletId } = evmResult.right

  try {
    await db
      .update(users)
      .set({
        walletAddress: suiKeypair.suiAddress,
        crossmintWalletId: evmWalletId,
        evmAddress,
        suiPrivateKeyEncrypted: suiKeypair.suiPrivateKeyEncrypted,
        walletStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(users.id, internalUserId))
  } catch (err) {
    logger.error({ err, internalUserId, event: "wallet_update_failed" }, "Failed to update user with wallet")
    return { ok: false, status: 500, error: "Internal Server Error", code: "WALLET_UPDATE_FAILED" }
  }

  if (env.CART_SERVICE === "onchain" && env.SUI_CONTRACT_ADDRESS) {
    try {
      const tx = buildCreateCartTx(suiKeypair.suiAddress)
      const cartResult = await Effect.runPromise(
        Effect.either(signAndSubmitAs(tx, getRelayerKeypair(), `create-cart-${internalUserId}`)),
      )
      if (cartResult._tag === "Right") {
        logger.info(
          { userId: internalUserId, walletAddress: suiKeypair.suiAddress, digest: cartResult.right.digest },
          "On-chain cart created by relayer",
        )
      } else {
        const causeMsg = cartResult.left.cause instanceof Error
          ? cartResult.left.cause.message
          : String(cartResult.left.cause ?? "")
        if (causeMsg.includes("MoveAbort") && causeMsg.includes(", 2)")) {
          logger.debug({ userId: internalUserId }, "create_cart: cart already exists — skipping")
        } else {
          logger.error({ cause: causeMsg, userId: internalUserId }, "create_cart PTB failed with unexpected error")
        }
      }
    } catch (err) {
      logger.error({ err, internalUserId }, "create_cart: relayer keypair error")
    }
  }

  initUserMemory(internalUserId).catch(() => {/* non-fatal */})
  return {
    ok: true,
    userId: internalUserId,
    email,
    walletAddress: suiKeypair.suiAddress,
    evmAddress,
    onboardingStep: 0,
  }
}
