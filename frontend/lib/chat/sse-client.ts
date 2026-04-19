// SSE client for AI SDK v6 UI Message Stream protocol.
// Compatible event types: text-delta, tool-call, tool-result,
// tool-output-available, tool-input-available, finish, error, start.

import { DEBUG_CHAT_STREAM } from './debug';
import type { SSEEvent } from './types';

export async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // toolCallId → toolName (tool-output-available lacks toolName)
  const toolNameMap = new Map<string, string>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;

        if (DEBUG_CHAT_STREAM) {
          console.debug('[chat-stream] raw', raw);
        }

        try {
          const evt = JSON.parse(raw);

          switch (evt.type) {
            case 'text-delta':
              if (DEBUG_CHAT_STREAM) {
                console.debug('[chat-stream] event', { type: 'text-delta', delta: evt.delta ?? '' });
              }
              onEvent({ type: 'text-delta', delta: evt.delta ?? '' });
              break;

            case 'tool-call':
            case 'tool-call-end':
            case 'tool-input-available': {
              const callId = evt.toolCallId ?? evt.id ?? '';
              const toolName = evt.toolName ?? '';
              if (callId && toolName) toolNameMap.set(callId, toolName);
              if (DEBUG_CHAT_STREAM) {
                console.debug('[chat-stream] event', {
                  type: 'tool-call',
                  toolCallId: callId,
                  toolName,
                  args: evt.args ?? evt.input,
                });
              }
              onEvent({ type: 'tool-call', toolCallId: callId, toolName, args: evt.args ?? evt.input });
              break;
            }

            case 'tool-result':
            case 'tool-output-available': {
              const callId = evt.toolCallId ?? evt.id ?? '';
              const toolName = evt.toolName ?? toolNameMap.get(callId) ?? '';
              if (DEBUG_CHAT_STREAM) {
                console.debug('[chat-stream] event', {
                  type: 'tool-result',
                  toolCallId: callId,
                  toolName,
                  result: evt.result ?? evt.output,
                });
              }
              onEvent({
                type: 'tool-result',
                toolCallId: callId,
                toolName,
                result: evt.result ?? evt.output,
              });
              break;
            }

            case 'error':
              if (DEBUG_CHAT_STREAM) {
                console.debug('[chat-stream] event', {
                  type: 'error',
                  error: evt.errorText ?? JSON.stringify(evt),
                });
              }
              onEvent({ type: 'error', error: evt.errorText ?? JSON.stringify(evt) });
              break;

            case 'finish':
              if (DEBUG_CHAT_STREAM) {
                console.debug('[chat-stream] event', { type: 'finish' });
              }
              onEvent({ type: 'finish' });
              break;

            default:
              if (typeof evt.type === 'string' && evt.type.startsWith('data-')) {
                if (DEBUG_CHAT_STREAM) {
                  console.debug('[chat-stream] event', {
                    type: 'data-part',
                    dataPartType: evt.type,
                    id: evt.id,
                    data: evt.data,
                    transient: evt.transient,
                  });
                }
                onEvent({
                  type: 'data-part',
                  dataPartType: evt.type,
                  id: typeof evt.id === 'string' ? evt.id : undefined,
                  data: evt.data,
                  transient: evt.transient === true,
                });
              }
              break;

            // Noise — intentionally ignored
            case 'text-start':
            case 'text-end':
            case 'tool-call-start':
            case 'tool-call-delta':
            case 'start-step':
            case 'finish-step':
            case 'reasoning-start':
            case 'reasoning-delta':
            case 'reasoning-end':
            case 'source':
              break;

          }
        } catch {
          // skip unparseable lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
