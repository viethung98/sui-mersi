import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc"
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography"
import { env } from "./env.js"
import { decrypt } from "./crypto.js"

const network = (env.NODE_ENV === "production" ? "mainnet" : "testnet") as
  | "mainnet"
  | "testnet"
  | "devnet"
  | "localnet"

export const suiClient = new SuiJsonRpcClient({
  url: env.SUI_RPC_URL || getJsonRpcFullnodeUrl(network),
  network,
})

let _relayerKeypair: Ed25519Keypair | null = null

export function getRelayerKeypair(): Ed25519Keypair {
  if (_relayerKeypair) return _relayerKeypair
  if (!env.SUI_RELAYER_PRIVATE_KEY) {
    throw new Error("SUI_RELAYER_PRIVATE_KEY is not configured")
  }
  const { secretKey } = decodeSuiPrivateKey(env.SUI_RELAYER_PRIVATE_KEY)
  _relayerKeypair = Ed25519Keypair.fromSecretKey(secretKey)
  return _relayerKeypair
}

export function getUserKeypair(suiPrivateKeyEncrypted: string): Ed25519Keypair {
  if (!env.WALLET_ENCRYPTION_KEY) {
    throw new Error("WALLET_ENCRYPTION_KEY is not configured")
  }
  const bech32Key = decrypt(suiPrivateKeyEncrypted, env.WALLET_ENCRYPTION_KEY)
  const { secretKey } = decodeSuiPrivateKey(bech32Key)
  return Ed25519Keypair.fromSecretKey(secretKey)
}

export async function getSuiObject(objectId: string) {
  return suiClient.getObject({
    id: objectId,
    options: { showContent: true, showType: true },
  })
}

export async function getSuiBalance(address: string): Promise<bigint> {
  const coins = await suiClient.getCoins({ owner: address, coinType: "0x2::sui::SUI" })
  return coins.data.reduce((sum: bigint, c: { balance: string }) => sum + BigInt(c.balance), BigInt(0))
}

/**
 * Polls until the transaction is confirmed or `timeoutMs` elapses.
 * ONLY call from background/indexer paths — never from an HTTP request handler,
 * as this can hold a connection for up to `timeoutMs` (default 30 s).
 */
export async function waitForTransaction(digest: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const tx = await suiClient.getTransactionBlock({
        digest,
        options: { showEffects: true },
      })
      if (tx.effects?.status?.status === "success") return tx
      if (tx.effects?.status?.status === "failure") {
        throw new Error(`Transaction failed: ${tx.effects.status.error}`)
      }
    } catch (err) {
      // Suppress transient "not found / not indexed yet" errors; re-throw anything else
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.toLowerCase().includes("not found") && !msg.toLowerCase().includes("not exist")) {
        throw err
      }
    }
    await new Promise((r) => setTimeout(r, 1_000))
  }
  throw new Error(`Transaction ${digest} timed out after ${timeoutMs}ms`)
}

export { SUI_USDC_COIN_TYPE } from './coin.js'

export type PaymentReceipt = {
  payment_type: 'Registry' | 'Ephemeral'
  nonce: string
  amount: string
  receiver: string
  coin_type: string
  timestamp_ms: string
}

type RawPaymentReceipt = {
  payment_type?: PaymentReceipt["payment_type"] | { variant?: PaymentReceipt["payment_type"] }
  nonce?: string
  amount?: string
  payment_amount?: string
  receiver?: string
  coin_type?: string
  timestamp_ms?: string
}

function normalizeHexString(value: string): string {
  return value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`
}

export const PAYMENT_RECEIPT_EVENT_TYPE = '0x7e069abe383e80d32f2aec17b3793da82aabc8c2edf84abbf68dd7f8a9::payment_kit::PaymentReceipt'

export async function getPaymentReceipt(txDigest: string): Promise<PaymentReceipt | null> {
  const tx = await suiClient.getTransactionBlock({
    digest: txDigest,
    options: { showEvents: true }
  })

  if (tx.effects?.status?.status === 'failure') {
    return null
  }

  const event = (tx.events ?? []).find(e => e.type.includes('PaymentReceipt'))
  const parsed = event?.parsedJson as RawPaymentReceipt | null | undefined
  if (!parsed?.nonce || !parsed.receiver || !parsed.coin_type || !(parsed.payment_amount ?? parsed.amount)) {
    return null
  }

  return {
    payment_type:
      typeof parsed.payment_type === "object"
        ? (parsed.payment_type.variant ?? "Ephemeral")
        : (parsed.payment_type ?? "Ephemeral"),
    nonce: parsed.nonce,
    amount: parsed.payment_amount ?? parsed.amount ?? "0",
    receiver: normalizeHexString(parsed.receiver),
    coin_type: normalizeHexString(parsed.coin_type),
    timestamp_ms: parsed.timestamp_ms ?? "0",
  }
}
