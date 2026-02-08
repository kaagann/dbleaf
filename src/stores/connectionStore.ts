import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ConnectionConfig } from "../types/connection";

// Rust backend'e gönderirken camelCase -> snake_case dönüşümü
function toRustConfig(conn: ConnectionConfig) {
  return {
    id: conn.id,
    name: conn.name,
    host: conn.host,
    port: conn.port,
    username: conn.username,
    password: conn.password,
    database: conn.database,
    ssl_mode: conn.sslMode,
    color: conn.color,
    last_connected_at: conn.lastConnectedAt || null,
    created_at: conn.createdAt,
  };
}

// Rust'tan gelen snake_case -> camelCase dönüşümü
function fromRustConfig(raw: any): ConnectionConfig {
  return {
    id: raw.id,
    name: raw.name,
    host: raw.host,
    port: raw.port,
    username: raw.username,
    password: raw.password,
    database: raw.database,
    sslMode: raw.ssl_mode,
    color: raw.color,
    lastConnectedAt: raw.last_connected_at || undefined,
    createdAt: raw.created_at,
  };
}

interface ConnectionState {
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  isLoading: boolean;
  loadConnections: () => Promise<void>;
  saveToBackend: (connections: ConnectionConfig[]) => Promise<void>;
  addConnection: (conn: ConnectionConfig) => Promise<void>;
  updateConnection: (id: string, updates: Partial<ConnectionConfig>) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  setActiveConnection: (id: string | null) => void;
  updateLastConnected: (id: string) => Promise<void>;
  testConnection: (conn: ConnectionConfig) => Promise<string>;
  connectToDb: (conn: ConnectionConfig) => Promise<string>;
  disconnectFromDb: (connectionId: string) => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  connections: [],
  activeConnectionId: null,
  isLoading: false,

  loadConnections: async () => {
    set({ isLoading: true });
    try {
      const raw: any[] = await invoke("load_connections");
      const connections = raw.map(fromRustConfig);
      set({ connections });
    } catch (err) {
      console.error("Bağlantılar yüklenemedi:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  saveToBackend: async (connections) => {
    try {
      await invoke("save_connections", {
        connections: connections.map(toRustConfig),
      });
    } catch (err) {
      console.error("Bağlantılar kaydedilemedi:", err);
    }
  },

  addConnection: async (conn) => {
    const newConnections = [...get().connections, conn];
    set({ connections: newConnections });
    await get().saveToBackend(newConnections);
  },

  updateConnection: async (id, updates) => {
    const newConnections = get().connections.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    );
    set({ connections: newConnections });
    await get().saveToBackend(newConnections);
  },

  deleteConnection: async (id) => {
    const state = get();
    const newConnections = state.connections.filter((c) => c.id !== id);
    set({
      connections: newConnections,
      activeConnectionId:
        state.activeConnectionId === id ? null : state.activeConnectionId,
    });
    await get().saveToBackend(newConnections);
  },

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  updateLastConnected: async (id) => {
    const newConnections = get().connections.map((c) =>
      c.id === id
        ? { ...c, lastConnectedAt: new Date().toISOString() }
        : c
    );
    set({ connections: newConnections });
    await get().saveToBackend(newConnections);
  },

  testConnection: async (conn) => {
    return await invoke<string>("test_connection", {
      config: toRustConfig(conn),
    });
  },

  connectToDb: async (conn) => {
    return await invoke<string>("connect_db", {
      config: toRustConfig(conn),
    });
  },

  disconnectFromDb: async (connectionId) => {
    await invoke("disconnect_db", { connectionId });
    set({ activeConnectionId: null });
  },
}));
