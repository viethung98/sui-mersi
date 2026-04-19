import { Effect, Layer, Either } from "effect"
import { tool, type ToolSet } from "ai"
import { z } from "zod"
import { ProductService } from "./product-service.js"
import type { ProductDetailToolResult, ProductSearchToolResult } from "../types/product.js"
import logger from "../lib/logger.js"

const searchParamsSchema = z.object({
  query: z.string().describe("Core product keywords only (for example, 'running shoes'). Keep it short. Do not include price or size constraints in the query text."),
  category: z.string().optional().describe("ONLY if user explicitly asks. Must match Amazon categories exactly (e.g., 'Wrist Watches' not 'Watches')"),
  brand: z.string().optional().describe("ONLY if user explicitly mentions a brand name"),
  minRating: z.number().min(0).max(5).optional().describe("ONLY if user explicitly asks for highly-rated products"),
  page: z.number().int().min(1).optional().describe("Page number for pagination (default 1)"),
  limit: z.number().int().min(1).max(20).optional().describe("Number of results (default 20, max 20)"),
})

const detailParamsSchema = z.object({
  productId: z.string().describe("Product ID to retrieve details for"),
})

type SearchToolParams = z.infer<typeof searchParamsSchema>
type DetailToolParams = z.infer<typeof detailParamsSchema>

export function makeProductTools(layer: Layer.Layer<ProductService>): ToolSet {
  const run = <A, E>(effect: Effect.Effect<A, E, ProductService>) => {
    // Effect.provide narrows the requirement to never — cast needed due to generic inference limit
    const provided = effect.pipe(Effect.provide(layer), Effect.either) as unknown as Effect.Effect<
      Either.Either<A, E>,
      never,
      never
    >
    return Effect.runPromise(provided)
  }

  const tools: ToolSet = {
    searchProducts: tool({
      description:
        "Search for products matching the user's requirements. Supports filtering by " +
        "brand, category, and rating. Supports pagination with page and limit.",
      inputSchema: searchParamsSchema,
      execute: async (params: SearchToolParams): Promise<ProductSearchToolResult> => {
        const result = await run(
          ProductService.pipe(Effect.flatMap((s) => s.search(params))),
        )

        if (result._tag === "Right") return result.right

        logger.warn(
          { err: result.left, params, tool: "searchProducts" },
          "Scraping search failed during chat tool execution",
        )
        return {
          products: [],
          totalResults: 0,
          query: params.query,
          unavailable: true,
          error: "Product search is temporarily unavailable.",
          suggestion: "Ask the user to try again in a moment.",
        }
      },
    }),
    getProductDetails: tool({
      description:
        "Get detailed information about a specific product by its ID. Use this when the user wants " +
        "more details about a product returned from searchProducts.",
      inputSchema: detailParamsSchema,
      execute: async ({ productId }: DetailToolParams): Promise<ProductDetailToolResult> => {
        const result = await run(
          ProductService.pipe(
            Effect.flatMap((s) => s.getDetails(productId)),
            Effect.catchTag("ProductNotFound", () => Effect.succeed(null)),
          ),
        )

        if (result._tag === "Right") return result.right

        logger.warn(
          { err: result.left, productId, tool: "getProductDetails" },
          "Scraping detail lookup failed during chat tool execution",
        )
        return {
          unavailable: true,
          error: "Product details are temporarily unavailable.",
          suggestion: "Ask the user to try again in a moment.",
        }
      },
    }),
  }

  return tools
}
