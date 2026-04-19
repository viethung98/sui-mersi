import { Effect, Layer } from "effect"
import { eq, and, desc, count, asc } from "drizzle-orm"
import { generateText } from "ai"
import { model } from "../lib/model.js"
import { db } from "../db/client.js"
import { chatSessions } from "../db/schema/chat-sessions.js"
import { chatMessages } from "../db/schema/chat-messages.js"
import { DatabaseError, SessionNotFound, SessionOwnershipError, AIServiceError } from "../lib/errors.js"
import { toDatabaseError } from "../lib/effect-utils.js"
import { extractTextFromParts } from "../lib/message-utils.js"
import { ChatSessionService } from "./chat-session-service.js"
import type { ChatSession } from "../db/schema/chat-sessions.js"

const assertOwnership = (
  sessionId: string,
  userId: string,
): Effect.Effect<ChatSession, SessionNotFound | SessionOwnershipError | DatabaseError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, sessionId))
        .limit(1)
        .then((rows) => rows[0]),
    catch: toDatabaseError,
  }).pipe(
    Effect.flatMap(
      (session): Effect.Effect<ChatSession, SessionNotFound | SessionOwnershipError> => {
        if (!session) return Effect.fail(new SessionNotFound({ sessionId }))
        if (session.userId !== userId) return Effect.fail(new SessionOwnershipError({ sessionId }))
        return Effect.succeed(session)
      },
    ),
  )

const impl: import("./chat-session-service.js").ChatSessionServiceShape = {
  create: (userId, title) =>
    Effect.tryPromise({
      try: () =>
        db
          .insert(chatSessions)
          .values({ userId, title: title ?? null })
          .returning()
          .then((rows) => rows[0]),
      catch: toDatabaseError,
    }),

  list: (userId, limit, offset) =>
    Effect.tryPromise({
      try: async () => {
        const [sessions, [{ value: total }]] = await Promise.all([
          db
            .select()
            .from(chatSessions)
            .where(eq(chatSessions.userId, userId))
            .orderBy(desc(chatSessions.updatedAt))
            .limit(limit)
            .offset(offset),
          db
            .select({ value: count() })
            .from(chatSessions)
            .where(eq(chatSessions.userId, userId)),
        ])
        return { sessions, total: Number(total) }
      },
      catch: toDatabaseError,
    }),

  getWithMessages: (sessionId, userId) =>
    Effect.tryPromise({
      try: async () => {
        const rows = await db
          .select({ session: chatSessions, message: chatMessages })
          .from(chatSessions)
          .leftJoin(chatMessages, eq(chatMessages.sessionId, chatSessions.id))
          .where(eq(chatSessions.id, sessionId))
          .orderBy(asc(chatMessages.createdAt))
        const first = rows[0]
        if (!first?.session) throw new SessionNotFound({ sessionId })
        if (first.session.userId !== userId) throw new SessionOwnershipError({ sessionId })
        return { ...first.session, messages: rows.map((r) => r.message).filter((m): m is NonNullable<typeof m> => m !== null) }
      },
      catch: (cause) => {
        if (cause instanceof SessionNotFound || cause instanceof SessionOwnershipError) return cause
        return toDatabaseError(cause)
      },
    }),

  rename: (sessionId, userId, title) =>
    assertOwnership(sessionId, userId).pipe(
      Effect.flatMap(() =>
        Effect.tryPromise({
          try: () =>
            db
              .update(chatSessions)
              .set({ title, updatedAt: new Date() })
              .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
              .returning()
              .then((rows) => rows[0] as ChatSession | undefined),
          catch: toDatabaseError,
        }),
      ),
      Effect.flatMap((row) =>
        row ? Effect.succeed(row) : Effect.fail(new SessionNotFound({ sessionId })),
      ),
    ),

  delete: (sessionId, userId) =>
    assertOwnership(sessionId, userId).pipe(
      Effect.flatMap(() =>
        Effect.tryPromise({
          try: () =>
            db
              .delete(chatSessions)
              .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId))),
          catch: toDatabaseError,
        }),
      ),
      Effect.map(() => undefined),
    ),

  saveMessages: (sessionId, messages) =>
    Effect.tryPromise({
      try: async () => {
        const [rows] = await Promise.all([
          db.insert(chatMessages).values(messages.map((m) => ({ sessionId, msgId: m.id ?? null, role: m.role, parts: m.parts }))).returning(),
          db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, sessionId)),
        ])
        return rows
      },
      catch: toDatabaseError,
    }),

  autoTitle: (sessionId) =>
    Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, sessionId))
          .orderBy(asc(chatMessages.createdAt))
          .limit(3),
      catch: toDatabaseError,
    }).pipe(
      Effect.flatMap((messages) =>
        Effect.tryPromise({
          try: async () => {
            const preview = messages
              .map((m) => `${m.role}: ${extractTextFromParts(m.parts)}`)
              .join("\n")
            const { text } = await generateText({
              model,
              prompt: `Generate a short title (max 50 characters) for this chat session based on these messages:\n\n${preview}\n\nRespond with only the title, no quotes or punctuation.`,
              maxOutputTokens: 20,
            })
            const title = text.trim().slice(0, 50)
            await db
              .update(chatSessions)
              .set({ title, updatedAt: new Date() })
              .where(eq(chatSessions.id, sessionId))
            return title
          },
          catch: (cause) => new AIServiceError({ cause }),
        }),
      ),
    ),
}

export const ChatSessionServiceLive = Layer.succeed(ChatSessionService, impl)
