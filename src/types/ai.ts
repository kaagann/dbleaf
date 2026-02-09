// ── API-level types (match Rust structs) ──

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// ── Streaming events from Rust ──

export interface AiStreamTokenEvent {
  type: "token";
  content: string;
}

export interface AiStreamToolCallStartEvent {
  type: "tool_call_start";
  id: string;
  name: string;
}

export interface AiStreamToolCallArgsEvent {
  type: "tool_call_args";
  id: string;
  args_delta: string;
}

export interface AiStreamToolResultEvent {
  type: "tool_result";
  id: string;
  name: string;
  result: string;
}

export interface AiStreamDoneEvent {
  type: "done";
  message: {
    role: string;
    content: string | null;
    tool_calls: null;
    tool_call_id: null;
    name: null;
  };
}

export interface AiStreamErrorEvent {
  type: "error";
  message: string;
}

export type AiStreamEvent =
  | AiStreamTokenEvent
  | AiStreamToolCallStartEvent
  | AiStreamToolCallArgsEvent
  | AiStreamToolResultEvent
  | AiStreamDoneEvent
  | AiStreamErrorEvent;

// ── UI-level display types ──

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: DisplayToolCall[];
  timestamp: string;
  isStreaming?: boolean;
}

export interface DisplayToolCall {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  isExpanded: boolean;
}

export interface AiSettings {
  apiKey: string;
  model: string;
}
