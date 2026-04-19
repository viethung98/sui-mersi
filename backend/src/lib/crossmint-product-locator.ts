export function buildCrossmintProductLocator({
  productId,
  productUrl,
  retailer,
}: {
  productId: string | null | undefined;
  productUrl?: string | null;
  retailer?: string | null;
}): string | null {
  if (!productId && !productUrl) return null;
  const prefix = (retailer ?? "amazon").toLowerCase();
  const locator = productId ?? productUrl!;
  return `${prefix}:${locator}`;
}
