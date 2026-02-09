import { create } from "zustand";
import { invoke, Channel } from "@tauri-apps/api/core";
import type {
  AiSettings,
  ChatMessage,
  DisplayMessage,
  DisplayToolCall,
  AiStreamEvent,
} from "../types/ai";

// Convert frontend camelCase to Rust snake_case
function toRustMessage(msg: ChatMessage) {
  return {
    role: msg.role,
    content: msg.content,
    tool_calls: msg.toolCalls?.map((tc) => ({
      id: tc.id,
      call_type: tc.type,
      function: tc.function,
    })) ?? null,
    tool_call_id: msg.toolCallId ?? null,
    name: msg.name ?? null,
  };
}

interface AiState {
  // Settings
  apiKey: string;
  model: string;
  settingsLoaded: boolean;

  // Chat state
  messages: DisplayMessage[];
  conversationHistory: ChatMessage[];
  isStreaming: boolean;
  isPanelOpen: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AiSettings) => Promise<void>;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  sendMessage: (
    text: string,
    connectionId: string,
    dbContext: string
  ) => Promise<void>;
  clearChat: () => void;
  toggleToolCallExpanded: (messageId: string, toolCallId: string) => void;
}

export const useAiStore = create<AiState>()((set, get) => ({
  apiKey: "",
  model: "gpt-4o-mini",
  settingsLoaded: false,
  messages: [],
  conversationHistory: [],
  isStreaming: false,
  isPanelOpen: false,

  loadSettings: async () => {
    try {
      const settings = await invoke<{ api_key: string; model: string }>(
        "load_ai_settings"
      );
      set({
        apiKey: settings.api_key,
        model: settings.model,
        settingsLoaded: true,
      });
    } catch {
      set({ settingsLoaded: true });
    }
  },

  saveSettings: async (settings) => {
    await invoke("save_ai_settings", {
      settings: {
        api_key: settings.apiKey,
        model: settings.model,
      },
    });
    set({ apiKey: settings.apiKey, model: settings.model });
  },

  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),
  openPanel: () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false }),

  clearChat: () => set({ messages: [], conversationHistory: [] }),

  toggleToolCallExpanded: (messageId, toolCallId) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId && msg.toolCalls
          ? {
              ...msg,
              toolCalls: msg.toolCalls.map((tc) =>
                tc.id === toolCallId
                  ? { ...tc, isExpanded: !tc.isExpanded }
                  : tc
              ),
            }
          : msg
      ),
    }));
  },

  sendMessage: async (text, connectionId, dbContext) => {
    const state = get();
    if (state.isStreaming || !state.apiKey) return;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    const userDisplayMsg: DisplayMessage = {
      id: userMsgId,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    const userApiMsg: ChatMessage = {
      role: "user",
      content: text,
    };

    const assistantDisplayMsg: DisplayMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      toolCalls: [],
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    set({
      messages: [...state.messages, userDisplayMsg, assistantDisplayMsg],
      conversationHistory: [...state.conversationHistory, userApiMsg],
      isStreaming: true,
    });

    let accContent = "";
    let accToolCalls: DisplayToolCall[] = [];

    try {
      const channel = new Channel<AiStreamEvent>();

      channel.onmessage = (event: AiStreamEvent) => {
        switch (event.type) {
          case "token":
            accContent += event.content;
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantMsgId ? { ...m, content: accContent } : m
              ),
            }));
            break;

          case "tool_call_start":
            accToolCalls.push({
              id: event.id,
              name: event.name,
              arguments: "",
              isExpanded: false,
            });
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, toolCalls: [...accToolCalls] }
                  : m
              ),
            }));
            break;

          case "tool_call_args":
            accToolCalls = accToolCalls.map((tc) =>
              tc.id === event.id
                ? { ...tc, arguments: tc.arguments + event.args_delta }
                : tc
            );
            break;

          case "tool_result":
            accToolCalls = accToolCalls.map((tc) =>
              tc.id === event.id ? { ...tc, result: event.result } : tc
            );
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, toolCalls: [...accToolCalls] }
                  : m
              ),
            }));
            break;

          case "done":
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: event.message.content || accContent,
                      isStreaming: false,
                    }
                  : m
              ),
              conversationHistory: [
                ...s.conversationHistory,
                {
                  role: "assistant" as const,
                  content: event.message.content || accContent,
                },
              ],
              isStreaming: false,
            }));
            break;

          case "error":
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: `Hata: ${event.message}`,
                      isStreaming: false,
                    }
                  : m
              ),
              isStreaming: false,
            }));
            break;
        }
      };

      // Trim conversation to last 40 messages to stay within context limits
      const history = get().conversationHistory;
      const trimmed =
        history.length > 40 ? history.slice(-40) : history;

      await invoke("ai_chat", {
        connectionId,
        messages: trimmed.map(toRustMessage),
        dbContext,
        channel,
      });
    } catch (err: unknown) {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: `Hata: ${err instanceof Error ? err.message : String(err)}`,
                isStreaming: false,
              }
            : m
        ),
        isStreaming: false,
      }));
    }
  },
}));
