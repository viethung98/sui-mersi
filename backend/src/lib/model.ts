import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { LanguageModel } from "ai"
import { env } from "./env.js"

// Uses @openrouter/ai-sdk-provider (not @ai-sdk/openai + custom baseURL) because
// the generic approach had broken streaming tool-call lifecycle events (fixed in v2.3.1+).
const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
})

export const model: LanguageModel = openrouter.chat(env.LLM_MODEL)
