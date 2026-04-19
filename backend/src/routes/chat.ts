import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { streamText, convertToModelMessages, stepCountIs, createIdGenerator, type UIMessage } from "ai";
import { model } from "../lib/model.js";
import { Effect, Layer } from "effect";
import { systemPrompt } from "../lib/chat-system-prompt.js";
import { makeProductTools } from "../services/product-tools.js";
import { makeCartTools } from "../services/cart-tools.js";
import { ProductService } from "../services/product-service.js";
import { CartService } from "../services/cart-service.js";
import { CheckoutService } from "../services/checkout-service.js";
import { ChatSessionService } from "../services/chat-session-service.js";
import type { AuthVariables } from "../middleware/auth.js";
import logger from "../lib/logger.js"
import { extractTextFromParts } from "../lib/message-utils.js";
import {
  recallUserShoppingPreferences,
  wrapModelWithMemory,
} from "../lib/memwal.js";
import {
  errorResponse,
  commonErrors,
  cookieSecurity,
  validationHook,
} from "../lib/openapi-schemas.js";

function toUIMessage(msgId: string | null, role: string, parts: unknown): UIMessage {
  const id = msgId ?? crypto.randomUUID()
  if (Array.isArray(parts) && parts.length > 0 && parts[0]?.type) {
    const converted = parts.map((p: any) => {
      if (p.type === "tool-invocation" && p.toolInvocation) {
        const ti = p.toolInvocation
        return {
          type: `tool-${ti.toolName}`,
          toolCallId: ti.toolCallId,
          state: ti.state === "result" ? "output-available" : ti.state,
          input: ti.args ?? {},
          output: ti.result ?? null,
        }
      }
      return p
    })
    return { id, role: role as UIMessage["role"], parts: converted }
  }
  return {
    id,
    role: role as UIMessage["role"],
    parts: [{ type: "text", text: typeof parts === "string" ? parts : JSON.stringify(parts) }],
  }
}

function summarizeProductsForLog(output: any) {
  if (!Array.isArray(output?.products)) return undefined

  return output.products.map((product: any) => ({
    id: product.id,
    name: product.name,
    brand: product.brand ?? null,
    price: product.price ?? null,
    currency: product.currency ?? null,
    retailer: product.retailer ?? null,
    rating: product.rating ?? null,
    product_url: product.product_url ?? null,
  }))
}

const messageSchema = z
  .object({
    role: z.enum(["user", "assistant", "system", "data"]),
    content: z.unknown(),
  })
  .passthrough();

const chatRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1)
    .openapi({ description: "At least one message is required" }),
  sessionId: z.string().uuid().optional(),
});

const postChatRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Chat"],
  security: cookieSecurity,
  summary: "Send a chat message and stream LLM response",
  request: {
    body: {
      content: { "application/json": { schema: chatRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "text/event-stream": { schema: z.string() } },
      description: "Streamed LLM response with X-Session-Id header",
    },
    ...errorResponse(400, "Bad request — validation error"),
    ...errorResponse(403, "Forbidden — session owned by another user"),
    ...errorResponse(404, "Session not found"),
    ...commonErrors,
  },
});

export function createChatRoute(
  productServiceLayer: Layer.Layer<ProductService>,
  sessionServiceLayer: Layer.Layer<ChatSessionService>,
  cartServiceLayer: Layer.Layer<CartService>,
  checkoutServiceLayer: Layer.Layer<CheckoutService>,
) {
  const productTools = makeProductTools(productServiceLayer);
  const chat = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: validationHook,
  });

  const runSession = <A, E>(effect: Effect.Effect<A, E, ChatSessionService>) =>
    Effect.runPromise(
      effect.pipe(Effect.provide(sessionServiceLayer), Effect.either),
    );

  chat.openapi(postChatRoute, async (c) => {
    const userId = c.get("userId");
    const { messages, sessionId: reqSessionId } = c.req.valid("json");
    const requestStartedAt = Date.now();

    let sessionId: string;
    let existingUIMessages: UIMessage[] = [];

    if (!reqSessionId) {
      const createResult = await runSession(
        ChatSessionService.pipe(Effect.flatMap((s) => s.create(userId))),
      );
      if (createResult._tag === "Left") {
        const err = createResult.left as { _tag: string; message?: string };
        logger.error({ err, userId }, "Failed to create chat session");
        return c.json(
          { error: "Failed to create session", code: err._tag },
          500,
        );
      }
      sessionId = createResult.right.id;
    } else {
      const getResult = await runSession(
        ChatSessionService.pipe(
          Effect.flatMap((s) => s.getWithMessages(reqSessionId, userId)),
        ),
      );
      if (getResult._tag === "Left") {
        const err = getResult.left as { _tag: string; message?: string };
        if (err._tag === "SessionNotFound") {
          return c.json({ error: "Session not found", code: err._tag }, 404);
        }
        if (err._tag === "SessionOwnershipError") {
          return c.json({ error: "Forbidden", code: err._tag }, 403);
        }
        return c.json({ error: "Session error", code: err._tag }, 500);
      }
      sessionId = reqSessionId;
      existingUIMessages = getResult.right.messages.map((m) =>
        toUIMessage(m.msgId ?? null, m.role, m.parts),
      );
    }

    const generateMessageId = createIdGenerator({ prefix: "msg", size: 16 });

    const lastMsg = messages[messages.length - 1];
    const rawContent = (lastMsg as any).content ?? "";
    const userUIMessage: UIMessage = {
      id: generateMessageId(),
      role: "user",
      parts: [{ type: "text", text: typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent) }],
    };
    const allUIMessages = [...existingUIMessages, userUIMessage];

    const tools = {
      ...productTools,
      ...makeCartTools(userId, cartServiceLayer, checkoutServiceLayer),
    };

    const shoppingPreferenceContext = await recallUserShoppingPreferences(userId)
    const effectiveSystemPrompt = shoppingPreferenceContext
      ? `${systemPrompt}

## Remembered Shopping Preferences

${shoppingPreferenceContext}

Use these remembered preferences to personalize product search and recommendations.
- Apply tops size for shirts, jackets, and tops when relevant.
- Apply bottoms size for pants, shorts, and bottoms when relevant.
- Apply footwear size for shoes, boots, and sandals when relevant.
- Do not ask the user to repeat these preferences unless they want to override them or the product requires a more specific choice.`
      : systemPrompt

    const memoryModel = wrapModelWithMemory(model, userId)
    const result = streamText({
      model: memoryModel,
      system: effectiveSystemPrompt,
      messages: await convertToModelMessages(allUIMessages, { ignoreIncompleteToolCalls: true }),
      tools,
      stopWhen: stepCountIs(5),
      onStepFinish: async ({ toolCalls, toolResults }) => {
        for (const tc of toolCalls as any[]) {
          logger.info(
            {
              sessionId,
              tool: tc.toolName,
              toolCallId: tc.toolCallId,
              args: tc.args,
              elapsedMs: Date.now() - requestStartedAt,
            },
            `Tool call: ${tc.toolName}`,
          )
        }
        for (const tr of toolResults as any[]) {
          const output = tr.result ?? tr.output
          const productCount = output?.products?.length ?? (output?.id ? 1 : 0)
          logger.info(
            {
              sessionId,
              tool: tr.toolName,
              toolCallId: tr.toolCallId,
              productCount,
              elapsedMs: Date.now() - requestStartedAt,
            },
            `Tool result: ${tr.toolName}`,
          )

          if (tr.toolName === "searchProducts" && output?.products) {
            logger.info(
              {
                sessionId,
                tool: tr.toolName,
                toolCallId: tr.toolCallId,
                elapsedMs: Date.now() - requestStartedAt,
                frontendPayload: output,
                productSummaries: summarizeProductsForLog(output),
              },
              "Sending searchProducts payload to frontend",
            )
          }
        }
      },
    });

    const response = result.toUIMessageStreamResponse({
      originalMessages: allUIMessages,
      generateMessageId,
      onError: (err) => {
        logger.error({ err, sessionId, userId }, "Chat stream failed");
        return "The shopping assistant hit a temporary problem. Please try again in a moment.";
      },
      onFinish: async ({ messages: finalMessages }) => {
        try {
          const newMessages = finalMessages.slice(allUIMessages.length);
          const toPersist = [userUIMessage, ...newMessages];
          const assistantMessages = newMessages.filter((m) => m.role === "assistant")
          const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]

          if (lastAssistantMessage) {
            logger.info(
              {
                sessionId,
                messageId: lastAssistantMessage.id,
                elapsedMs: Date.now() - requestStartedAt,
                assistantText: extractTextFromParts(lastAssistantMessage.parts),
                assistantParts: lastAssistantMessage.parts,
              },
              "Final assistant response sent to frontend",
            )
          }

          await Effect.runPromise(
            ChatSessionService.pipe(
              Effect.flatMap((s) =>
                s.saveMessages(
                  sessionId,
                  toPersist.map((m) => ({ id: m.id, role: m.role, parts: m.parts })),
                ),
              ),
              Effect.provide(sessionServiceLayer),
            ),
          );

          const totalMessages = existingUIMessages.length + toPersist.length;
          if (totalMessages <= 2) {
            await Effect.runPromise(
              ChatSessionService.pipe(
                Effect.flatMap((s) => s.autoTitle(sessionId)),
                Effect.provide(sessionServiceLayer),
                Effect.either,
              ),
            );
          }
        } catch (err) {
          logger.error({ err, sessionId }, "Failed to persist messages");
        }
      },
    });

    response.headers.set("X-Session-Id", sessionId);
    return response;
  });

  return chat;
}
