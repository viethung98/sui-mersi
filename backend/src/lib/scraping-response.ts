import type {
  ScrapingProduct,
  ScrapingProductDetailResponse,
} from "../types/product.js";

export function extractScrapingProductDetail(
  body: ScrapingProductDetailResponse,
): ScrapingProduct | null {
  if (!body.data) return null;
  if ("asin" in body.data) return body.data as ScrapingProduct;
  if ("data" in body.data)
    return (body.data as { data: ScrapingProduct | null }).data ?? null;
  return null;
}
