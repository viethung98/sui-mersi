'use client';

import { useState, useCallback } from 'react';
import { parseSSEStream } from './sse-client';
import { DEBUG_CHAT_STREAM } from './debug';
import { createChatSession } from '@/lib/api/sessions';
import type { ChatMessage, MessagePart, SSEEvent } from './types';

const CHAT_URL = '/api/chat';

interface Options {
  sessionId: string | null;
  initialMessages?: ChatMessage[];
  onSessionCreated?: (sessionId: string) => void;
}

export function useSSEChat({ sessionId, initialMessages = [], onSessionCreated }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text }],
      };
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', parts: [] };

      if (DEBUG_CHAT_STREAM) {
        console.info('[chat-state] send:start', {
          sessionId,
          assistantId,
          text,
        });
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      let accText = '';

      const updateAssistant = (updater: (parts: MessagePart[]) => MessagePart[]) => {
        setMessages((prev) => {
          const idx = prev.findLastIndex((m) => m.id === assistantId);
          if (idx === -1) return prev;
          const nextParts = updater(prev[idx].parts);

          if (DEBUG_CHAT_STREAM) {
            console.debug('[chat-state] assistant:update', {
              sessionId: activeSessionIdRef.current,
              assistantId,
              partCount: nextParts.length,
              parts: nextParts,
            });
          }

          return [
            ...prev.slice(0, idx),
            { ...prev[idx], parts: nextParts },
            ...prev.slice(idx + 1),
          ];
        });
      };

      const activeSessionIdRef = { current: sessionId as string | null };

      setIsStreaming(true);

      try {
        let activeSessionId = sessionId;
        if (!activeSessionId) {
          const session = await createChatSession();
          activeSessionId = session.id;
          activeSessionIdRef.current = activeSessionId;
          onSessionCreated?.(activeSessionId);
          if (DEBUG_CHAT_STREAM) {
            console.info('[chat-state] session:created', { sessionId: activeSessionId });
          }
        }

        activeSessionIdRef.current = activeSessionId;

        const res = await fetch(CHAT_URL, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: text }], sessionId: activeSessionId }),
        });

        if (DEBUG_CHAT_STREAM) {
          console.info('[chat-stream] response', {
            sessionId: activeSessionId,
            status: res.status,
            statusText: res.statusText,
            contentType: res.headers.get('content-type'),
          });
        }

        if (!res.ok) {
          const errText = await res.text();
          updateAssistant(() => [{ type: 'text', text: `Error ${res.status}: ${errText}` }]);
          return;
        }

        await parseSSEStream(res.body!, (evt: SSEEvent) => {
          if (DEBUG_CHAT_STREAM) {
            console.debug('[chat-stream] normalized-event', evt);
          }

          switch (evt.type) {
            case 'text-delta':
              accText += evt.delta;
              updateAssistant((parts) => {
                const last = parts[parts.length - 1];
                if (last?.type === 'text') {
                  return [...parts.slice(0, -1), { type: 'text', text: accText }];
                }
                return [...parts, { type: 'text', text: accText }];
              });
              break;

            case 'tool-call':
              if (DEBUG_CHAT_STREAM) {
                console.info('[chat-state] tool-call', {
                  sessionId: activeSessionId,
                  toolCallId: evt.toolCallId,
                  toolName: evt.toolName,
                  args: evt.args,
                });
              }
              updateAssistant((parts) => [
                ...parts,
                { type: 'tool-loading', toolCallId: evt.toolCallId, toolName: evt.toolName },
              ]);
              break;

            case 'tool-result':
              if (DEBUG_CHAT_STREAM) {
                const productCount =
                  evt.result && typeof evt.result === 'object' && Array.isArray((evt.result as { products?: unknown[] }).products)
                    ? (evt.result as { products: unknown[] }).products.length
                    : null;

                console.info('[chat-state] tool-result:received', {
                  sessionId: activeSessionId,
                  toolCallId: evt.toolCallId,
                  toolName: evt.toolName,
                  productCount,
                  result: evt.result,
                });
              }

              updateAssistant((parts) => {
                const hasMatchingLoading = parts.some(
                  (p) => p.type === 'tool-loading' && p.toolCallId === evt.toolCallId,
                );

                if (!hasMatchingLoading) {
                  if (DEBUG_CHAT_STREAM) {
                    console.warn('[chat-state] tool-result:missing-loading-placeholder', {
                      sessionId: activeSessionId,
                      toolCallId: evt.toolCallId,
                      toolName: evt.toolName,
                    });
                  }

                  return [
                    ...parts,
                    {
                      type: 'tool-result',
                      toolCallId: evt.toolCallId,
                      toolName: evt.toolName,
                      result: evt.result,
                    },
                  ];
                }

                return parts.map((p) =>
                  p.type === 'tool-loading' && p.toolCallId === evt.toolCallId
                    ? {
                        type: 'tool-result',
                        toolCallId: evt.toolCallId,
                        toolName: evt.toolName,
                        result: evt.result,
                      }
                    : p,
                );
              });
              break;

            case 'data-part':
              if (DEBUG_CHAT_STREAM) {
                console.info('[chat-state] data-part:received', {
                  sessionId: activeSessionId,
                  dataPartType: evt.dataPartType,
                  id: evt.id,
                  data: evt.data,
                  transient: evt.transient,
                });
              }

              updateAssistant((parts) => {
                const nextPart: MessagePart = {
                  type: evt.dataPartType,
                  id: evt.id,
                  data: evt.data,
                };

                if (!evt.id) {
                  return [...parts, nextPart];
                }

                const existingIndex = parts.findIndex(
                  (part) => part.type === evt.dataPartType && 'id' in part && part.id === evt.id,
                );

                if (existingIndex === -1) {
                  return [...parts, nextPart];
                }

                return [
                  ...parts.slice(0, existingIndex),
                  nextPart,
                  ...parts.slice(existingIndex + 1),
                ];
              });
              break;

            case 'error':
              updateAssistant((parts) => [
                ...parts,
                { type: 'text', text: `\n\n⚠️ ${evt.error}` },
              ]);
              break;

            case 'finish':
              if (DEBUG_CHAT_STREAM) {
                console.info('[chat-state] stream:finish-event', {
                  sessionId: activeSessionId,
                  assistantId,
                });
              }
              break;
          }
        });

        if (DEBUG_CHAT_STREAM) {
          console.info('[chat-stream] complete', {
            sessionId: activeSessionId,
            assistantText: accText,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (DEBUG_CHAT_STREAM) {
          console.error('[chat-stream] failed', err);
        }
        updateAssistant((parts) => [...parts, { type: 'text', text: `\n\n⚠️ ${msg}` }]);
      } finally {
        if (DEBUG_CHAT_STREAM) {
          console.info('[chat-state] send:complete', {
            sessionId: activeSessionIdRef.current,
            assistantId,
          });
        }
        setIsStreaming(false);
      }
    },
    [sessionId, isStreaming, onSessionCreated],
  );

  return { messages, sendMessage, isStreaming };
}
