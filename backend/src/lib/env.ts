import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CROSSMINT_SERVER_API_KEY: z
    .string()
    .min(1, "CROSSMINT_SERVER_API_KEY is required"),

  DEV_SUI_PRIVATE_KEY: z.string().optional(),

  CROSSMINT_API_URL: z.string().default("https://staging.crossmint.com"),
  CROSSMINT_EVM_CHAIN_TYPE: z.string().default("base-sepolia"),
  CROSSMINT_WEBHOOK_SECRET: z.string().default(""),

  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  LLM_MODEL: z.string().default("openai/gpt-4o"),

  // Direct endpoint for migrations — bypasses PgBouncer session issues
  DATABASE_URL_DIRECT: z.string().optional(),

  PORT: z.coerce.number().int().positive().default(3000),
  PRODUCT_SERVICE: z.string().default("mock"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  RATE_LIMIT_RPM: z.coerce.number().int().positive().default(30),
  SCRAPING_SERVICE_URL: z.string().default(""),
  SCRAPING_SERVICE_API_KEY: z.string().default(""),

  SUI_RPC_URL: z.string().default("https://fullnode.testnet.sui.io:443"),
  SUI_CONTRACT_ADDRESS: z.string().default(""),
  SUI_CART_REGISTRY_ID: z.string().default(""),
  SUI_RELAYER_PRIVATE_KEY: z.string().default(""),
  WALLET_ENCRYPTION_KEY: z.string().default(""),
  CART_SERVICE: z.enum(["db", "onchain"]).default("db"),

  MEMWAL_SERVER_URL: z.string().default("https://relayer.memwal.ai"),
  MEMWAL_DELEGATE_KEY: z.string().default(""),
  MEMWAL_ACCOUNT_ID: z.string().default(""),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  BETTERSTACK_SOURCE_TOKEN: z.string().default(""),
  BETTERSTACK_INGESTING_HOST: z.string().default(""),
});

export const env = envSchema
  .superRefine((data, ctx) => {
    if (data.CART_SERVICE === "onchain") {
      if (!data.SUI_CONTRACT_ADDRESS) {
        ctx.addIssue({
          code: "custom",
          path: ["SUI_CONTRACT_ADDRESS"],
          message: "SUI_CONTRACT_ADDRESS is required when CART_SERVICE=onchain",
        });
      }
      if (!data.SUI_CART_REGISTRY_ID) {
        ctx.addIssue({
          code: "custom",
          path: ["SUI_CART_REGISTRY_ID"],
          message: "SUI_CART_REGISTRY_ID is required when CART_SERVICE=onchain",
        });
      }
      if (!data.SUI_RELAYER_PRIVATE_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["SUI_RELAYER_PRIVATE_KEY"],
          message:
            "SUI_RELAYER_PRIVATE_KEY is required when CART_SERVICE=onchain",
        });
      }
    }
  })
  .parse(process.env);

export type Env = typeof env;
