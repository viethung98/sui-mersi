#!/usr/bin/env bun
/**
 * Cart smoke test — mock user (mock@test.local) cart flow.
 * Prerequisite: run scripts/seed-mock-user.ts once before this script.
 *
 * Flow:
 *   1. Initialize cart (login-mock handles on-chain createCart if CART_SERVICE=onchain)
 *   2. Add item to cart
 *   3. Add another item (test multiple items)
 *   4. Remove item from cart
 *   5. Fetch cart state
 *
 * Reads from .env (Bun loads it automatically).
 * Optional: SERVER_URL — default http://localhost:3000
 */

const BASE = (process.env.SERVER_URL ?? "http://localhost:3000").replace(/\/$/, "")

let cookies = ""

function extractCookies(res: Response): void {
  const setCookieHeaders = res.headers.getSetCookie?.() ?? []
  if (setCookieHeaders.length === 0) return
  const jar: Record<string, string> = {}
  for (const pair of cookies.split(";")) {
    const [k, v] = pair.trim().split("=")
    if (k) jar[k.trim()] = v ?? ""
  }
  for (const header of setCookieHeaders) {
    const [pair] = header.split(";")
    const [k, v] = pair.split("=")
    if (k) jar[k.trim()] = v?.trim() ?? ""
  }
  cookies = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ")
}

async function req(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (cookies) headers["Cookie"] = cookies

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  extractCookies(res)

  let parsed: unknown
  const ct = res.headers.get("content-type") ?? ""
  if (ct.includes("application/json")) {
    parsed = await res.json()
  } else {
    parsed = await res.text()
  }

  return { status: res.status, body: parsed }
}

const get  = (path: string)                => req("GET",    path)
const post = (path: string, body?: unknown) => req("POST",   path, body)
const del_ = (path: string)                => req("DELETE", path)

// Wait for the on-chain indexer to propagate an event to the DB (poll interval = 2s)
const waitIndexer = (ms = 3000) => new Promise<void>((r) => setTimeout(r, ms))

type StepResult = { name: string; ok: boolean; detail?: string }
const results: StepResult[] = []
let aborted = false

async function step(
  name: string,
  fn: () => Promise<void>,
  opts: { critical?: boolean } = {},
): Promise<void> {
  if (aborted) {
    results.push({ name, ok: false, detail: "skipped (prior critical failure)" })
    return
  }
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name}`)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    results.push({ name, ok: false, detail })
    console.error(`  ✗ ${name}: ${detail}`)
    if (opts.critical) aborted = true
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

let itemId1: string | null = null
let itemId2: string | null = null

async function cleanup() {
  for (const id of [itemId1, itemId2]) {
    if (id) { try { await del_(`/api/cart/${id}`) } catch { /* best effort */ } }
  }
  itemId1 = null
  itemId2 = null
  try { await post("/api/dev/logout") } catch { /* best effort */ }
  cookies = ""
}

console.log(`\nCart smoke test → ${BASE}\n`)
const start = Date.now()

try {
  await step("1. login-mock", async () => {
    cookies = ""
    const r = await post("/api/dev/login-mock")
    assert(r.status === 200, `expected 200, got ${r.status} — ${JSON.stringify(r.body)}`)
    assert(cookies.includes("crossmint-jwt"), "crossmint-jwt cookie not set")
    const b = r.body as Record<string, unknown>
    console.log(`    wallet: ${b.walletAddress}`)
  }, { critical: true })

  await step("1a. check cart address on-chain", async () => {
    const r = await get("/api/cart/address")
    assert(r.status === 200, `expected 200, got ${r.status} — ${JSON.stringify(r.body)}`)
    const b = r.body as Record<string, unknown>
    console.log(`    cartAddress: ${b.cartAddress ?? "(none — cart not yet created)"}`)
    console.log(`    exists: ${b.exists}`)
  })

  await step("1b. create cart if not exists", async () => {
    const addrRes = await get("/api/cart/address")
    assert(addrRes.status === 200, `expected 200, got ${addrRes.status}`)
    const { exists, cartAddress } = addrRes.body as Record<string, unknown>
    if (exists) {
      console.log(`    cart already exists at ${cartAddress} — skipping create`)
      return
    }
    const r = await post("/api/cart/init")
    assert(r.status === 200, `expected 200, got ${r.status} — ${JSON.stringify(r.body)}`)
    const b = r.body as Record<string, unknown>
    console.log(`    ${b.message}`)
  }, { critical: true })

  // Clear stale items from a prior run so unique constraints don't fire
  await step("clear stale items from prior run", async () => {
    const r = await get("/api/cart")
    assert(r.status === 200, `expected 200, got ${r.status}`)
    const items = (r.body as Record<string, unknown>).items as Record<string, unknown>[]
    if (items?.length > 0) {
      console.log(`    removing ${items.length} stale item(s)`)
      for (const item of items) {
        const id = (item.onChainObjectId ?? item.id) as string
        try { await del_(`/api/cart/${id}`) } catch { /* best effort */ }
      }
    }
  })

  await step("2. add first item to cart", async () => {
    const r = await post("/api/cart", {
      productId: "smoke-test-product-001",
      productName: "Smoke Test Tee",
      price: 2999,
      image: "https://example.com/tee.jpg",
      size: "M",
      color: "Black",
      productUrl: "https://example.com/product/tee",
      retailer: "smoke-test-store",
    })
    assert(r.status === 201, `expected 201, got ${r.status} — ${JSON.stringify(r.body)}`)
    itemId1 = (r.body as Record<string, unknown>).id as string
    console.log(`    id (on-chain): ${itemId1}`)
  })

  await step("3. add second item to cart", async () => {
    const r = await post("/api/cart", {
      productId: "smoke-test-product-002",
      productName: "Smoke Test Hat",
      price: 1499,
      image: "https://example.com/hat.jpg",
      size: "ONE",
      color: "Blue",
      productUrl: "https://example.com/product/hat",
      retailer: "smoke-test-store",
    })
    assert(r.status === 201, `expected 201, got ${r.status} — ${JSON.stringify(r.body)}`)
    itemId2 = (r.body as Record<string, unknown>).id as string
    console.log(`    id (on-chain): ${itemId2}`)
  })

  await step("wait for indexer to sync adds", async () => {
    console.log("    waiting 3s for indexer propagation...")
    await waitIndexer()
  })

  await step("cart has 2 items", async () => {
    const r = await get("/api/cart")
    assert(r.status === 200, `expected 200, got ${r.status}`)
    const items = (r.body as Record<string, unknown>).items as unknown[]
    assert(Array.isArray(items) && items.length === 2, `expected 2 items, got ${items?.length}`)
  })

  await step("4. remove first item from cart", async () => {
    assert(itemId1 !== null, "itemId1 not set")
    const r = await del_(`/api/cart/${itemId1}`)
    assert(r.status === 204, `expected 204, got ${r.status}`)
    itemId1 = null
  })

  await step("wait for indexer to sync removal", async () => {
    console.log("    waiting 3s for indexer propagation...")
    await waitIndexer()
  })

  await step("5. fetch cart state — 1 item remains", async () => {
    const r = await get("/api/cart")
    assert(r.status === 200, `expected 200, got ${r.status}`)
    const items = (r.body as Record<string, unknown>).items as Record<string, unknown>[]
    assert(Array.isArray(items) && items.length === 1, `expected 1 item, got ${items?.length}`)
    const item = items[0]!
    console.log(`    remaining: ${item.productName} (onChainObjectId: ${item.onChainObjectId}, price: ${item.price})`)
  })

} finally {
  await cleanup()
}

const elapsed = ((Date.now() - start) / 1000).toFixed(2)
const passed  = results.filter(r => r.ok).length
const failed  = results.filter(r => !r.ok).length
const skipped = results.filter(r => !r.ok && r.detail?.startsWith("skipped")).length

console.log(`\n${"─".repeat(52)}`)
console.log(`  ${passed} passed  ${failed} failed  ${skipped} skipped  [${elapsed}s]`)
console.log(`${"─".repeat(52)}`)

if (failed > 0) {
  console.log("\nFailures:")
  for (const r of results.filter(r => !r.ok && !r.detail?.startsWith("skipped"))) {
    console.error(`  ✗ ${r.name}: ${r.detail}`)
  }
  process.exit(1)
}
export { }

