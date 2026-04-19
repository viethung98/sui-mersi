import { MemWal } from "@mysten-incubation/memwal"
import { withMemWal } from "@mysten-incubation/memwal/ai"
import { env } from "./env.js"
import logger from "./logger.js"
import {
  buildShoppingPreferenceFacts,
  formatShoppingPreferenceContext,
  type ShoppingPreferenceProfile,
} from "./shopping-preferences.js"

const CHAT_NAMESPACE_PREFIX = "memwal:user:"
const PROFILE_NAMESPACE_SUFFIX = ":shopping-profile"
const SHOPPING_PREFERENCE_QUERY =
  "shopping preferences, onboarding profile, clothing sizes, shoe size, preferred fit, country"

function isConfigured(): boolean {
  return !!(env.MEMWAL_DELEGATE_KEY && env.MEMWAL_ACCOUNT_ID)
}

function chatNamespace(userId: string): string {
  return `${CHAT_NAMESPACE_PREFIX}${userId}`
}

function shoppingProfileNamespace(userId: string): string {
  return `${CHAT_NAMESPACE_PREFIX}${userId}${PROFILE_NAMESPACE_SUFFIX}`
}

function baseMemwalConfig(namespace: string) {
  return {
    key: env.MEMWAL_DELEGATE_KEY,
    accountId: env.MEMWAL_ACCOUNT_ID,
    serverUrl: env.MEMWAL_SERVER_URL,
    namespace,
  }
}

function modelMemwalConfig(userId: string) {
  return {
    ...baseMemwalConfig(chatNamespace(userId)),
    maxMemories: 5,
    autoSave: true,
  }
}

export function wrapModelWithMemory(model: any, userId: string): any {
  if (!isConfigured()) return model
  try {
    return withMemWal(model, modelMemwalConfig(userId))
  } catch (err) {
    logger.warn({ userId, err }, "MemWal: withMemWal failed — using plain model")
    return model
  }
}

export async function initUserMemory(userId: string): Promise<void> {
  if (!isConfigured()) return
  try {
    const client = MemWal.create(baseMemwalConfig(chatNamespace(userId)))
    await client.remember("Memory initialized for new user")
    logger.info({ userId }, "MemWal: memory initialized")
  } catch (err) {
    logger.warn({ userId, err }, "MemWal: memory init failed (non-fatal)")
  }
}

export async function rememberUserShoppingProfile(
  userId: string,
  profile: ShoppingPreferenceProfile,
): Promise<void> {
  if (!isConfigured()) return

  const facts = buildShoppingPreferenceFacts(profile)
  if (!facts.length) return

  try {
    const client = MemWal.create(
      baseMemwalConfig(shoppingProfileNamespace(userId)),
    )
    await Promise.all(facts.map((fact) => client.remember(fact)))
    logger.info(
      { userId, factCount: facts.length },
      "MemWal: stored shopping preferences",
    )
  } catch (err) {
    logger.warn(
      { userId, err },
      "MemWal: shopping preference save failed (non-fatal)",
    )
  }
}

export async function recallUserShoppingPreferences(
  userId: string,
): Promise<string | null> {
  if (!isConfigured()) return null

  try {
    const client = MemWal.create(
      baseMemwalConfig(shoppingProfileNamespace(userId)),
    )
    const result = await client.recall(SHOPPING_PREFERENCE_QUERY, 10)
    return formatShoppingPreferenceContext(
      result.results.map((memory) => memory.text),
    )
  } catch (err) {
    logger.warn(
      { userId, err },
      "MemWal: shopping preference recall failed (non-fatal)",
    )
    return null
  }
}
