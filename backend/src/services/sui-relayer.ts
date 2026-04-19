import { Effect } from "effect"
import type { Transaction } from "@mysten/sui/transactions"
import type { SuiEvent, SuiTransactionBlockResponse } from "@mysten/sui/jsonRpc"
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"
import { suiClient, getRelayerKeypair } from "../lib/sui-client.js"
import { DatabaseError } from "../lib/errors.js"
import logger from "../lib/logger.js"

export interface SubmitResult {
  digest: string
  status: "success" | "failure" | "pending"
  events: SuiEvent[]
}

const RPC_TIMEOUT_MS = 15_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxAttempts) break
      const delay = Math.min(200 * 2 ** (attempt - 1) + Math.random() * 100, 5_000)
      logger.warn({ attempt, label, delay }, "Sui transaction attempt failed — retrying")
      await sleep(delay)
    }
  }
  throw lastErr
}

function resolveStatus(resp: SuiTransactionBlockResponse): "success" | "failure" | "pending" {
  const s = resp.effects?.status?.status
  if (s === "success") return "success"
  if (s === "failure") return "failure"
  return "pending"
}

const rpcTimeout = () =>
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Sui RPC timeout after ${RPC_TIMEOUT_MS}ms`)), RPC_TIMEOUT_MS),
  )

async function executeSignAndSubmit(tx: Transaction, keypair: Ed25519Keypair, label: string): Promise<SubmitResult> {
  tx.setSenderIfNotSet(keypair.getPublicKey().toSuiAddress())

  const txBytes = await tx.build({ client: suiClient })
  const { bytes, signature } = await keypair.signTransaction(txBytes)

  logger.info({ label }, "Submitting Sui transaction")

  const resp = await withRetry(
    () => Promise.race([
      suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: { showEffects: true, showEvents: true },
      }),
      rpcTimeout(),
    ]),
    label,
  )

  const status = resolveStatus(resp)
  logger.info({ digest: resp.digest, status, label }, "Sui transaction submitted")
  return { digest: resp.digest, status, events: resp.events ?? [] }
}

// Gas strategy for sponsored txs: if user balance ≥ GAS_THRESHOLD_MIST, user pays own gas
// (standard single-signer); otherwise relayer sponsors (dual-signer sponsored tx).
// Required when the Move contract checks ctx.sender() == user address.
const GAS_THRESHOLD_MIST = BigInt(10_000_000) // 0.01 SUI

async function executeSponsored(
  tx: Transaction,
  userKeypair: Ed25519Keypair,
  label: string,
): Promise<SubmitResult> {
  const userAddress = userKeypair.getPublicKey().toSuiAddress()

  const relayerKeypair = getRelayerKeypair()
  const relayerAddress = relayerKeypair.getPublicKey().toSuiAddress()

  const [balanceResp, gasCoins] = await Promise.all([
    suiClient.getBalance({ owner: userAddress, coinType: "0x2::sui::SUI" }),
    suiClient.getCoins({ owner: relayerAddress, coinType: "0x2::sui::SUI" }),
  ])
  const userBalance = BigInt(balanceResp.totalBalance)

  if (userBalance >= GAS_THRESHOLD_MIST) {
    logger.info({ label, userBalance: userBalance.toString() }, "User has sufficient SUI — paying own gas")
    return executeSignAndSubmit(tx, userKeypair, label)
  }

  logger.info({ label, userBalance: userBalance.toString() }, "User has insufficient SUI — relayer sponsoring gas")

  tx.setSender(userAddress)
  const gasCoin = gasCoins.data[0]
  if (!gasCoin) throw new Error(`Relayer has no SUI coins for gas — label: ${label}`)

  tx.setGasOwner(relayerAddress)
  tx.setGasPayment([{
    objectId: gasCoin.coinObjectId,
    version: gasCoin.version,
    digest: gasCoin.digest,
  }])

  const txBytes = await tx.build({ client: suiClient })
  const { signature: userSig } = await userKeypair.signTransaction(txBytes)
  const { signature: relayerSig } = await relayerKeypair.signTransaction(txBytes)

  logger.info({ label }, "Submitting sponsored Sui transaction")

  const resp = await withRetry(
    () => Promise.race([
      suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: [userSig, relayerSig],
        options: { showEffects: true, showEvents: true },
      }),
      rpcTimeout(),
    ]),
    label,
  )

  const status = resolveStatus(resp)
  logger.info({ digest: resp.digest, status, label }, "Sponsored Sui transaction submitted")
  return { digest: resp.digest, status, events: resp.events ?? [] }
}

export const signAndSubmitAs = (
  tx: Transaction,
  keypair: Ed25519Keypair,
  label = "sui-tx",
): Effect.Effect<SubmitResult, DatabaseError> =>
  Effect.tryPromise({
    try: () => executeSignAndSubmit(tx, keypair, label),
    catch: (cause) => {
      logger.error({ cause, label }, "Sui transaction submission failed")
      return new DatabaseError({ cause })
    },
  })

export const signAndSubmit = (
  tx: Transaction,
  label = "sui-tx",
): Effect.Effect<SubmitResult, DatabaseError> =>
  Effect.tryPromise({
    try: () => executeSignAndSubmit(tx, getRelayerKeypair(), label),
    catch: (cause) => {
      logger.error({ cause, label }, "Sui transaction submission failed")
      return new DatabaseError({ cause })
    },
  })

export const signAndSubmitSponsored = (
  tx: Transaction,
  userKeypair: Ed25519Keypair,
  label = "sui-tx-sponsored",
): Effect.Effect<SubmitResult, DatabaseError> =>
  Effect.tryPromise({
    try: () => executeSponsored(tx, userKeypair, label),
    catch: (cause) => {
      logger.error({ cause, label }, "Sponsored Sui transaction failed")
      return new DatabaseError({ cause })
    },
  })

