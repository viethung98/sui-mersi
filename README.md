# Mersi — AI Shopping Agent

**Mersi** is an AI-powered shopping agent that lets users discover products via natural language chat, add items to cart, and complete purchases through a blockchain-backed checkout flow.

**Docs:** [mersi-docs.dev.cmdocs.app](https://mersi-docs.dev.cmdocs.app/getting-started)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USERS                                      │
│         ┌──────────────────────────────────────────────────┐           │
│         │  Landing (/), Chat (/app), Login (/login),         │           │
│         │  Onboarding (/onboarding)                         │           │
│         └────────────────────────┬───────────────────────────┘           │
└──────────────────────────────────┼──────────────────────────────────────┘
                                   │ :3000
┌──────────────────────────────────▼──────────────────────────────────────┐
│                         FRONTEND (Next.js 16)                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  TanStack Query  │  Zustand (cart/session/orders)  │  Tailwind v4  │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│  ┌─────────────────────────────────▼────────────────────────────────┐  │
│  │               API Proxy (/api/* → backend)                        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                   │ :3001 (Railway)
┌──────────────────────────────────▼──────────────────────────────────────┐
│                         BACKEND (Bun + Hono)                            │
│                                                                         │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────────┐     │
│  │  Auth      │  │  Chat     │  │  Cart    │  │  Checkout         │     │
│  │  (Crossmint│  │  (ReAct)  │  │  (Redis/ │  │  (Crossmint/      │     │
│  │   Wallet)  │  │  + SSE    │  │   Sui)   │  │   Athenic)        │     │
│  └────────────┘  └───────────┘  └──────────┘  └───────────────────┘     │
│                                                                         │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────────┐     │
│  │  Sessions  │  │  Orders   │  │  Deposit │  │  Onboarding       │     │
│  │            │  │           │  │  (USDC)  │  │                   │     │
│  └────────────┘  └───────────┘  └──────────┘  └───────────────────┘     │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Service Layer (Effect DI)                     │   │
│  │  ChatSession │ Cart (offchain/onchain) │ Checkout │ Order        │   │
│  └─────────────────────────────────────┬────────────────────────────┘   │
└─────────────────────────────────────────│───────────────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
        ┌─────▼─────┐             ┌───────▼───────┐             ┌──────▼──────┐
        │ PostgreSQL│             │    Redis      │             │    Sui      │
        │  (Neon)   │             │  (Railway)    │             │  Blockchain │
        └───────────┘             └──────────────-┘             └─────────────┘
```

## Tech Stack

### Frontend
- **Framework:** Next.js 16.1.6 (App Router, React 19, TypeScript)
- **Styling:** Tailwind CSS v4
- **State:** Zustand (cart, sessions, orders) + TanStack Query (server state)
- **HTTP:** Ky (with credentials-based cookie auth)
- **Auth:** Crossmint Wallet Connect

### Backend
- **Runtime:** Bun 1.x
- **Framework:** Hono v4 + OpenAPI (@hono/zod-openapi)
- **ORM:** Drizzle v0.38 + postgres.js v3.4
- **AI:** Vercel AI SDK v6 + @ai-sdk/openai v2 (OpenRouter)
- **Functional DI:** Effect v3
- **Cache:** ioredis v5.4
- **Blockchain:** @mysten/sui v2.15
- **Auth:** @crossmint/server-sdk v1.2
- **Memory:** [MemWal](https://docs.memwal.ai/llms-full.txt) — encrypted AI memory layer on Walrus storage
- **Payments:** [@mysten/payment-kit](../frontend/node_modules/@mysten/payment-kit/docs/llms-index.md) — Sui payment SDK
- **UI Specs:** @json-render/core + @json-render/react — AI-generated React components from JSON specs

## Feature Modules

### Chat (AI Shopping Agent)
The core feature — a ReAct-style agent that:
- Searches products via natural language
- Maintains shopping cart (add/remove/clear)
- Executes checkout and tracks orders
- Streams responses via Server-Sent Events (SSE)

### Cart
Supports two modes (selected via `CART_SERVICE` env var):
- **Offchain (Redis):** `CART_SERVICE=offchain` — fast, low-cost cart storage
- **Onchain (Sui):** `CART_SERVICE=onchain` — blockchain-backed cart with indexed events

### Checkout
- Crossmint/Athenic payment integration
- On-chain order recording via Sui relayer
- Multi-step: cart → payment → confirmation

### AI UI Rendering (json-render)
`@json-render/core` + `@json-render/react` renders AI-generated product UI specs as real React components.

**Spec format** (flat element map):
```json
{
  "root": "grid",
  "elements": {
    "grid":  { "type": "ProductGrid", "props": { "query": "shoes", "totalResults": 24 }, "children": ["card-1", "card-2"] },
    "card-1": { "type": "ProductCard", "props": { "id": "abc", "name": "Air Max", "price": 14999, ... } }
  }
}
```

**Flow:**
1. AI agent calls `searchProducts` → returns product data in tool result
2. Frontend intercepts `tool-result` event, calls `buildProductGridSpec(result)` → returns spec
3. Spec passed to `<Renderer spec={spec} registry={registry} />` → renders actual React components
4. `ProductCard` wired to `onAddToCart` handler from chat context

**Backend exports** (`src/lib/`):
- `product-catalog.ts` — `defineSchema` with Zod prop schemas (`ProductCard`, `ProductGrid`, `ProductDetailCard`) + component descriptions for LLM prompting
- `product-spec-builders.ts` — `buildProductGridSpec()` / `buildProductDetailSpec()` for converting tool results to JSON specs

**Frontend** (`test-app/`):
- `registry.tsx` — `defineRegistry` wiring React components to the catalog
- `App.tsx` — `<JSONUIProvider>` + `<Renderer>` rendering specs returned from chat tool results

### Memory (MemWal)
Encrypted AI memory layer on Walrus storage with Sui smart contract ownership. Used to persist shopping preferences across sessions.

**Onboarding (step 3):** When a user sets clothing sizes, their preferences are saved as encrypted facts to MemWal under `memwal:user:<userId>:shopping-profile`:
```
"Shopper is based in country code US."
"Preferred tops size is M."
"Preferred bottoms size is 32."
"Preferred footwear size is 10."
```

**Every chat message:** Before generating a response, the agent:
1. Semantically recalls relevant memories from the shopping-profile namespace
2. Injects them into the system prompt as remembered preferences
3. Wraps the model with `withMemWal()` middleware for auto-inject + auto-save

**Explicit `/remember`:** Users can say `/remember I prefer loose fitting pants` at any time — this stores the fact directly.

### Deposit (Sui Payment Kit)
USDC deposit flow via `@mysten/payment-kit` — deep-link/QR code, no browser wallet needed.

**Flow:**
1. Frontend generates `sui:pay?...` URI via `createPaymentTransactionUri()` with receiver (user's Sui address), amount, USDC coin type, and UUID nonce
2. User scans QR / clicks link → opens mobile wallet app
3. User confirms → Sui transaction executes on-chain
4. Frontend polls Sui fullnode for `PaymentReceipt` event matching nonce + amount
5. On success, calls `POST /deposit/verify` → backend verifies on-chain event → funds Crossmint USDMX wallet

**Key types:**
- `createPaymentTransactionUri()` — builds `sui:pay?...` URI
- `parsePaymentTransactionUri()` — parses incoming payment URIs
- `PaymentReceipt` event — emitted on successful payment

**Coin type:** `0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC` (testnet)

If `MEMWAL_ACCOUNT_ID` / `MEMWAL_DELEGATE_KEY` are not set, MemWal silently degrades — chat continues without memory.

### Onboarding
Multi-step profile setup:
1. Shipping address
2. Sizing preferences
3. Payment method setup

## Project Structure

```
├── frontend/                     # Next.js 16 web app
│   ├── app/                     # App Router pages
│   │   ├── (auth)/              # Auth group (login, onboarding)
│   │   ├── (main)/              # Protected app group (chat)
│   │   └── page.tsx             # Landing page
│   ├── components/chat/         # Chat UI components
│   │   ├── ChatShell.tsx
│   │   ├── ChatWindow.tsx
│   │   ├── ChatSidebar.tsx
│   │   ├── MessageBubble.tsx
│   │   └── InputBar.tsx
│   ├── lib/                     # Frontend utilities
│   │   ├── api/                 # API client & route handlers
│   │   │   ├── client.ts        # Ky HTTP client
│   │   │   ├── sessions.ts      # Session CRUD
│   │   │   ├── cart.ts          # Cart operations
│   │   │   └── checkout.ts      # Checkout & orders
│   │   ├── chat/                # Chat-specific hooks
│   │   │   └── use-sse-chat.ts  # SSE streaming hook
│   │   ├── api/                 # API client & route handlers
│   │   │   ├── client.ts        # Ky HTTP client
│   │   │   ├── sessions.ts      # Session CRUD
│   │   │   ├── cart.ts          # Cart operations
│   │   │   ├── checkout.ts      # Checkout & orders
│   │   │   ├── sui-deposit.ts  # Sui Payment Kit deposit (URI, polling, verify)
│   │   │   └── deposit.ts       # Backend deposit verification
│   │   ├── session-store.ts     # Zustand: current session
│   │   ├── cart-store.ts        # Zustand: shopping cart
│   │   └── orders-store.ts      # Zustand: order history
│   ├── proxy.ts                 # Auth routing middleware
│   └── next.config.ts           # API proxy rewrites → backend
│
├── backend/                     # Bun + Hono API server
│   ├── src/
│   │   ├── index.ts             # Server entry, middleware, routes
│   │   ├── routes/              # Hono route handlers
│   │   │   ├── auth.ts          # Crossmint wallet auth
│   │   │   ├── chat.ts          # ReAct agent + SSE streaming
│   │   │   ├── cart.ts          # Cart management
│   │   │   ├── checkout.ts      # Checkout flow
│   │   │   ├── orders.ts        # Order CRUD
│   │   │   ├── sessions.ts      # Chat session CRUD
│   │   │   ├── onboarding.ts    # Multi-step onboarding
│   │   │   ├── deposit.ts       # USDC deposit
│   │   │   └── webhook-*.ts     # Crossmint webhooks
│   │   ├── services/            # Business logic (Effect Layer DI)
│   │   │   ├── chat-session-service-live.ts
│   │   │   ├── cart-service-live.ts        # Redis-backed
│   │   │   ├── cart-onchain-service-live.ts # Sui blockchain
│   │   │   ├── checkout-service-live.ts
│   │   │   ├── order-service-live.ts
│   │   │   ├── scraping-product-service.ts  # Scraping API
│   │   │   └── mock-product-service.ts      # Dev mock data
│   │   ├── middleware/         # Auth, onboarding gate, errors, rate-limit
│   │   ├── db/                  # Drizzle ORM
│   │   │   ├── schema/          # Table definitions
│   │   │   └── client.ts        # Postgres singleton
│   │   └── lib/                 # AI model, tools, prompts, env
│   └── Dockerfile
│
└── diagrams/                     # System architecture diagrams (Mermaid)
```

## Environment Variables

### Frontend (`.env`)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend URL (default: `https://comagent-dev.up.railway.app`) |
| `NEXT_PUBLIC_CROSSMINT_API_KEY` | Crossmint client key |
| `NEXT_PUBLIC_SCAN_API_KEY` | Blockchain scan API key |

### Backend (`.env`)
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `REDIS_URL` | Railway Redis connection string |
| `OPENROUTER_API_KEY` | OpenRouter API key (AI model) |
| `CROSSMINT_API_KEY` | Crossmint server-side API key |
| `SUI_RELAYER_PRIVATE_KEY` | Sui relayer private key |
| `SUI_CONTRACT_ADDRESS` | On-chain contract address |
| `PRODUCT_SERVICE` | `scraping` (default) or `mock` |
| `CART_SERVICE` | `onchain` (default) or `offchain` |
| `SCRAPING_SERVICE_URL` | Product scraping service URL |

## API Proxy

The frontend proxies all `/api/*` requests to the backend via `next.config.ts` rewrites. This eliminates CORS issues and keeps credentials (cookies) confined to the proxy boundary.

```
Browser → Next.js (:3000) → Hono API (:3001)
```

## Authentication Flow

1. User visits `/login` → Crossmint wallet modal
2. Crossmint returns JWT → stored in `crossmint-jwt` cookie
3. Frontend proxy forwards cookie on all `/api/*` requests
4. Backend `authMiddleware` validates JWT on every protected route
5. `onboardingGate` middleware blocks non-onboarded users from chat/checkout/cart

## Key Patterns

### Service Selection (Dependency Injection)
```typescript
// At startup, Effect Layer selects implementation
const cartServiceLayer = env.CART_SERVICE === "onchain"
  ? CartOnchainServiceLive
  : CartServiceLive.pipe(Layer.provide(CacheServiceLive));
```

### Streaming Chat
```
POST /api/chat → SSE stream of text-delta, tool-call, tool-result events
```

### API Route Registration
```typescript
// Service layers are bound at route creation
app.route("/api/chat", createChatRoute(productServiceLayer, ChatSessionServiceLive, cartServiceLayer, CheckoutServiceLive));
```

## Reference Documentation

- [MemWal](https://docs.memwal.ai/llms-full.txt) — encrypted AI memory layer (Walrus + Sui smart contracts)
- [Payment Kit SDK](../frontend/node_modules/@mysten/payment-kit/docs/llms-index.md) — Sui blockchain payment SDK (registry & ephemeral payments, URI utilities)

## Diagrams

See the `diagrams/` directory for:
- `architecture.mmd` — Full system architecture (Mermaid)
- `flow-auth.mmd` — Authentication flow (Mermaid)
- `flow-chat.mmd` — Chat message flow (Mermaid)
- `flow-checkout.mmd` — Checkout flow (Mermaid)

## Scripts

### Frontend
```bash
cd frontend && bun install && bun dev    # Start dev server
bun gen:api                              # Generate TypeScript types from backend OpenAPI
```

### Backend
```bash
cd backend && bun install && bun run dev # Start dev server
bun test                                 # Run tests
bunx drizzle-kit migrate                 # Apply DB migrations
bun run codegen                          # Run Sui TypeScript codegen
```
