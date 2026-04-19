export type TextPart = { type: 'text'; text: string };

export type ToolLoadingPart = {
  type: 'tool-loading';
  toolCallId: string;
  toolName: string;
};

export type ToolResultPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
};

export type MemwalActivityStatus =
  | 'loading'
  | 'success'
  | 'empty'
  | 'disabled'
  | 'error';

export type MemwalActivityMemory = {
  blobId: string;
  text: string;
  distance: number | null;
};

export type MemwalActivityData = {
  source: 'memwal';
  status: MemwalActivityStatus;
  message: string;
  namespace: string;
  query: string;
  memories: MemwalActivityMemory[];
  injectedIntoPrompt: boolean;
};

export type MemwalActivityPart = {
  type: 'data-memwal-activity';
  id?: string;
  data: MemwalActivityData;
};

export type GenericDataPart = {
  type: `data-${string}`;
  id?: string;
  data: unknown;
};

export type MessagePart =
  | TextPart
  | ToolLoadingPart
  | ToolResultPart
  | MemwalActivityPart
  | GenericDataPart;

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
};

// SSE events from the AI SDK v6 protocol
export type SSEEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | {
      type: 'data-part';
      dataPartType: `data-${string}`;
      id?: string;
      data: unknown;
      transient?: boolean;
    }
  | { type: 'error'; error: string }
  | { type: 'finish' };
