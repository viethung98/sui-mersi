import { Effect } from "effect"
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"
import { env } from "../lib/env.js"
import { encrypt } from "../lib/crypto.js"
import { WalletProvisioningError } from "../lib/errors.js"
import logger from "../lib/logger.js"

export interface EvmWalletResult {
  evmAddress: string
  evmWalletId: string
}

export interface SuiKeypairResult {
  suiAddress: string
  suiPrivateKeyEncrypted: string
}

interface CrossmintWalletResponse {
  address?: string
  id?: string
  error?: boolean
  message?: string
}

export const provisionEvmWallet = (
  email: string,
): Effect.Effect<EvmWalletResult, WalletProvisioningError> =>
  Effect.tryPromise({
    try: async () => {
      const url = `${env.CROSSMINT_API_URL}/api/2025-06-09/wallets`
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-API-KEY": env.CROSSMINT_SERVER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chainType: env.CROSSMINT_EVM_CHAIN_TYPE,
          linkedUser: `email:${email}`,
          owner: `email:${email}`,
          config: {
            adminSigner: { type: "email", email },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      })

      const data = (await response.json()) as CrossmintWalletResponse

      if (!response.ok || data.error || !data.address) {
        const errMsg = data.message ?? `EVM wallet provisioning failed: ${response.status}`
        logger.error({ status: response.status, data, email }, errMsg)
        throw new Error(errMsg)
      }

      logger.info({ email, chain: env.CROSSMINT_EVM_CHAIN_TYPE }, "EVM wallet provisioned via Crossmint")
      const evmWalletId = data.id || data.address
      return { evmAddress: data.address, evmWalletId }
    },
    catch: (cause) => new WalletProvisioningError({ cause }),
  })

export function generateSuiKeypair(): SuiKeypairResult {
  if (!env.WALLET_ENCRYPTION_KEY || env.WALLET_ENCRYPTION_KEY.length !== 64) {
    throw new Error("WALLET_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)")
  }
  const keypair = Ed25519Keypair.generate()
  const suiAddress = keypair.getPublicKey().toSuiAddress()
  const privateKeyBech32 = keypair.getSecretKey()
  const suiPrivateKeyEncrypted = encrypt(privateKeyBech32, env.WALLET_ENCRYPTION_KEY)
  logger.info({ suiAddress }, "Sui keypair generated")
  return { suiAddress, suiPrivateKeyEncrypted }
}
