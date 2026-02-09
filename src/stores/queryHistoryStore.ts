import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { QueryHistoryEntry } from "../types/queryHistory";
import { fromRustHistoryEntry, toRustHistoryEntry } from "../types/queryHistory";

interface QueryHistoryStore {
  entries: QueryHistoryEntry[];
  isLoaded: boolean;

  loadHistory: () => Promise<void>;
  addEntry: (params: Omit<QueryHistoryEntry, "id" | "isFavorite">) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useQueryHistoryStore = create<QueryHistoryStore>()((set) => ({
  entries: [],
  isLoaded: false,

  loadHistory: async () => {
    try {
      const raw = await invoke<unknown[]>("get_query_history");
      const entries = raw.map(fromRustHistoryEntry);
      set({ entries, isLoaded: true });
    } catch (err) {
      console.error("Failed to load query history:", err);
      set({ isLoaded: true });
    }
  },

  addEntry: async (params) => {
    const entry: QueryHistoryEntry = {
      ...params,
      id: crypto.randomUUID(),
      isFavorite: false,
    };

    try {
      await invoke("add_query_history", { entry: toRustHistoryEntry(entry) });
      // Add to local state at the beginning
      set((state) => ({
        entries: [entry, ...state.entries],
      }));
    } catch (err) {
      console.error("Failed to add query history entry:", err);
    }
  },

  toggleFavorite: async (id) => {
    try {
      await invoke("toggle_query_favorite", { id });
      set((state) => ({
        entries: state.entries.map((e) =>
          e.id === id ? { ...e, isFavorite: !e.isFavorite } : e
        ),
      }));
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  },

  deleteEntry: async (id) => {
    try {
      await invoke("delete_query_history_entry", { id });
      set((state) => ({
        entries: state.entries.filter((e) => e.id !== id),
      }));
    } catch (err) {
      console.error("Failed to delete history entry:", err);
    }
  },

  clearHistory: async () => {
    try {
      await invoke("clear_query_history");
      set({ entries: [] });
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  },
}));
