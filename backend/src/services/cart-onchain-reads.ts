import { Transaction } from "@mysten/sui/transactions"
import { bcs } from "@mysten/sui/bcs"
import { suiClient } from "../lib/sui-client.js"
import { env } from "../lib/env.js"
import { getCartAddress, getCartItemCount } from "../generated/cart/cart.js"

export interface CartOnchainInfo {
  cartAddress: string | null
  itemCount: number
  exists: boolean
}

async function devInspect(tx: Transaction, sender: string) {
  return suiClient.devInspectTransactionBlock({ transactionBlock: tx, sender })
}

/**
 * Fetches the on-chain Cart object address for a wallet.
 * Returns null if the cart has not been created or config is missing.
 */
export async function fetchCartAddress(walletAddress: string): Promise<string | null> {
  if (!env.SUI_CONTRACT_ADDRESS || !env.SUI_CART_REGISTRY_ID) return null
  try {
    const tx = new Transaction()
    tx.add(getCartAddress({ package: env.SUI_CONTRACT_ADDRESS, arguments: { registry: env.SUI_CART_REGISTRY_ID } }))
    const result = await devInspect(tx, walletAddress)
    if (result.effects.status.status !== "success") return null

    const returnVal = result.results?.[0]?.returnValues?.[0]
    if (!returnVal) return null

    // address is 32 raw bytes; decode to hex string
    const bytes = Uint8Array.from(returnVal[0])
    const addr = "0x" + Buffer.from(bytes).toString("hex")
    // @0x0 means cart doesn't exist
    if (addr === "0x" + "0".repeat(64)) return null
    return addr
  } catch {
    return null
  }
}

/**
 * Fetches on-chain item count for a wallet's cart.
 * Returns 0 if the cart doesn't exist or config is missing.
 */
export async function fetchCartItemCount(walletAddress: string): Promise<number> {
  if (!env.SUI_CONTRACT_ADDRESS || !env.SUI_CART_REGISTRY_ID) return 0
  try {
    const tx = new Transaction()
    tx.add(getCartItemCount({ package: env.SUI_CONTRACT_ADDRESS, arguments: { registry: env.SUI_CART_REGISTRY_ID } }))
    const result = await devInspect(tx, walletAddress)
    if (result.effects.status.status !== "success") return 0

    const returnVal = result.results?.[0]?.returnValues?.[0]
    if (!returnVal) return 0

    const count = bcs.u64().parse(Uint8Array.from(returnVal[0]))
    return Number(count)
  } catch {
    return 0
  }
}

/**
 * Fetches combined on-chain cart info for a wallet.
 */
export async function fetchCartInfo(walletAddress: string): Promise<CartOnchainInfo> {
  const [cartAddress, itemCount] = await Promise.all([
    fetchCartAddress(walletAddress),
    fetchCartItemCount(walletAddress),
  ])
  return {
    cartAddress,
    itemCount,
    exists: cartAddress !== null,
  }
}
