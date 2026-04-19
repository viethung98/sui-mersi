#!/usr/bin/env bun
/**
 * Inserts (or upserts) a single mock user into the database with a known
 * Sui Ed25519 private key, useful for manual testing without a Crossmint login.
 *
 * Usage:
 *   bun run scripts/seed-mock-user.ts
 *
 * Reads DATABASE_URL and WALLET_ENCRYPTION_KEY from .env automatically.
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519"
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography"
import { eq } from "drizzle-orm"
import { db } from "../src/db/client.js"
import { users } from "../src/db/schema/users.js"
import { encrypt } from "../src/lib/crypto.js"
import { env } from "../src/lib/env.js"

const SUI_PRIVATE_KEY = env.DEV_SUI_PRIVATE_KEY
if (!SUI_PRIVATE_KEY) {
  console.error("DEV_SUI_PRIVATE_KEY must be set in .env")
  process.exit(1)
}

const MOCK_CROSSMINT_USER_ID = "mock-user-001"
const MOCK_EMAIL = "mock@test.local"
const MOCK_EVM_ADDRESS = "0x0000000000000000000000000000000000000001"

// Derive Sui address from the private key
const { secretKey } = decodeSuiPrivateKey(SUI_PRIVATE_KEY)
const keypair = Ed25519Keypair.fromSecretKey(secretKey)
const suiAddress = keypair.getPublicKey().toSuiAddress()

// Encrypt the private key at rest
if (!env.WALLET_ENCRYPTION_KEY || env.WALLET_ENCRYPTION_KEY.length !== 64) {
  console.error("WALLET_ENCRYPTION_KEY must be set and be 64 hex chars")
  process.exit(1)
}
const encryptedKey = encrypt(SUI_PRIVATE_KEY, env.WALLET_ENCRYPTION_KEY)

console.log(`\nMock user details:`)
console.log(`  crossmintUserId : ${MOCK_CROSSMINT_USER_ID}`)
console.log(`  email           : ${MOCK_EMAIL}`)
console.log(`  suiAddress      : ${suiAddress}`)
console.log(`  evmAddress      : ${MOCK_EVM_ADDRESS}`)
console.log(`  privateKey      : ${SUI_PRIVATE_KEY}`)
console.log(`  encryptedKey    : ${encryptedKey}\n`)

// Delete existing mock user then re-insert (idempotent)
await db.delete(users).where(eq(users.crossmintUserId, MOCK_CROSSMINT_USER_ID))

const [inserted] = await db
  .insert(users)
  .values({
    crossmintUserId: MOCK_CROSSMINT_USER_ID,
    email: MOCK_EMAIL,
    walletAddress: suiAddress,
    crossmintWalletId: "wlt-mock-001",
    evmAddress: MOCK_EVM_ADDRESS,
    suiPrivateKeyEncrypted: encryptedKey,
    walletStatus: "active",
    onboardingStep: 3,
    displayName: "Mock User",
    firstName: "Mock",
    lastName: "User",
    street: "123 Mock St",
    city: "San Francisco",
    state: "CA",
    zip: "94107",
    country: "US",
    topsSize: "M",
    bottomsSize: "32",
    footwearSize: "10",
  })
  .returning()

console.log(`✓ Mock user inserted — id: ${inserted.id}`)
process.exit(0)
