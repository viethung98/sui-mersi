import { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";

import { env } from "./lib/env.js";
import logger from "./lib/logger.js";
import { authMiddleware } from "./middleware/auth.js";
import { onboardingGate } from "./middleware/onboarding-gate.js";
import { onboardingRoute } from "./routes/onboarding.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRoute } from "./routes/health.js";
import { createChatRoute } from "./routes/chat.js";
import { authRoute } from "./routes/auth.js";
import { createSessionRoutes } from "./routes/sessions.js";
import { MockProductServiceLive } from "./services/mock-product-service.js";
import { ScrapingProductServiceLive } from "./services/scraping-product-service.js";
import { CacheServiceLive } from "./services/cache-service.js";
import { Layer } from "effect";
import { ChatSessionServiceLive } from "./services/chat-session-service-live.js";
import { createCheckoutRoutes } from "./routes/checkout.js";
import { CheckoutServiceLive } from "./services/checkout-service-live.js";
import { createOrderRoutes } from "./routes/orders.js";
import { OrderServiceLive } from "./services/order-service-live.js";
import { createCartRoutes } from "./routes/cart.js";
import { CartServiceLive } from "./services/cart-service-live.js";
import { CartOnchainServiceLive } from "./services/cart-onchain-service-live.js";
import { depositRoute } from "./routes/deposit.js";
import { webhookCrossmintRoute } from "./routes/webhook-crossmint.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { startIndexer } from "./services/indexer.js";

const productServiceLayer =
  env.PRODUCT_SERVICE === "scraping"
    ? ScrapingProductServiceLive.pipe(Layer.provide(CacheServiceLive))
    : MockProductServiceLive;

const cartServiceLayer =
  env.CART_SERVICE === "onchain"
    ? CartOnchainServiceLive
    : CartServiceLive.pipe(Layer.provide(CacheServiceLive));

const app = new OpenAPIHono();

app.openAPIRegistry.registerComponent("securitySchemes", "CookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "crossmint-jwt",
  description: "Crossmint JWT session cookie",
});

const ALLOWED_ORIGINS = new Set([
  "http://localhost:8080",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "null", // file:// origin for local test pages
]);

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin") ?? "";
  if (c.req.method === "OPTIONS" && ALLOWED_ORIGINS.has(origin)) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,Cookie,X-Refresh-Token",
        Vary: "Origin",
      },
    });
  }
  await next();
  if (ALLOWED_ORIGINS.has(origin)) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
    c.res.headers.set("Vary", "Origin");
  }
});

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const status = c.res.status;
  const logFn = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
  logger[logFn](
    { method: c.req.method, path: c.req.path, status, ms },
    `${c.req.method} ${c.req.path} ${status} ${ms}ms`,
  );
});

app.onError(errorHandler);

app.route("/health", healthRoute);

app.doc("/doc", {
  openapi: "3.1.0",
  info: {
    title: "ComAgent API",
    version: "0.1.0",
    description: "AI Shopping Assistant — ReAct chat agent backend",
  },
});
app.get("/swagger", (c) => {
  return c.html(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/><title>ComAgent API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
</head><body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
SwaggerUIBundle({
  url: "/doc",
  dom_id: "#swagger-ui",
  requestInterceptor: (req) => { req.credentials = "include"; return req; },
});
</script>
</body></html>`);
});

app.get("/test", async (c) => {
  const file = Bun.file("test-chat.html");
  return new Response(await file.text(), { headers: { "Content-Type": "text/html" } });
});

app.use("/api/*", async (c, next) => {
  if (
    (c.req.path === "/api/auth/session" && c.req.method === "POST") ||
    (c.req.path === "/api/auth/logout" && c.req.method === "POST")
  ) return next();
  if (c.req.path.startsWith("/api/dev/")) return next();
  if (c.req.path.startsWith("/api/webhooks/")) return next();
  return (authMiddleware as MiddlewareHandler)(c, next);
});

app.use("/api/onboarding/*", rateLimitMiddleware);

app.route("/api/onboarding", onboardingRoute);

app.route("/api/auth", authRoute);

app.use("/api/chat/*", rateLimitMiddleware);
app.use("/api/sessions/*", rateLimitMiddleware);
app.use("/api/checkout/*", rateLimitMiddleware);
app.use("/api/orders/*", rateLimitMiddleware);
app.use("/api/cart/*", rateLimitMiddleware);

app.use("/api/chat/*", onboardingGate);
app.use("/api/sessions/*", onboardingGate);
app.use("/api/checkout/*", onboardingGate);
app.use("/api/orders/*", onboardingGate);
app.use("/api/cart/*", onboardingGate);

app.route("/api/deposit", depositRoute);
app.route("/api/webhooks", webhookCrossmintRoute);

app.route(
  "/api/chat",
  createChatRoute(productServiceLayer, ChatSessionServiceLive, cartServiceLayer, CheckoutServiceLive),
);
app.route("/api/sessions", createSessionRoutes(ChatSessionServiceLive));
app.route("/api/checkout", createCheckoutRoutes(CheckoutServiceLive));
app.route("/api/orders", createOrderRoutes(OrderServiceLive));
app.route("/api/cart", createCartRoutes(cartServiceLayer));

if (env.NODE_ENV !== "production") {
  const { devRoute } = await import("./routes/dev.js");
  app.route("/api/dev", devRoute);
}

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
  idleTimeout: 120, // seconds — LLM streaming + scraping API calls need more than 10s default
});

logger.info(
  {
    port: env.PORT,
    productService: env.PRODUCT_SERVICE,
    cartService: env.CART_SERVICE,
    nodeEnv: env.NODE_ENV,
  },
  `Hono server listening on port ${env.PORT}`,
);

if (env.PRODUCT_SERVICE === "scraping" && !env.SCRAPING_SERVICE_URL) {
  logger.warn("SCRAPING_SERVICE_URL is not set — scraping service will fall back to http://localhost:3000 and likely fail");
}

if (env.SUI_CONTRACT_ADDRESS) {
  startIndexer();
}

export { app };
export type AppServer = typeof server;
