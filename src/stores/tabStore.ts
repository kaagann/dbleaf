import { create } from "zustand";

export interface TabState {
  page?: number;
  sorting?: Array<{ id: string; desc: boolean }>;
  scrollTop?: number;
  sql?: string;
  result?: any;
  error?: string | null;
  activeStructureTab?: string;
}

export interface Tab {
  id: string;
  type: "table" | "query" | "structure" | "history" | "er-diagram";
  title: string;
  schema?: string;
  table?: string;
  tableType?: "table" | "view";
  isPreview: boolean;
  isDirty: boolean;
  state: TabState;
}

let queryTabCounter = 0;

const MAX_TABS = 30;

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;

  openTableTab: (
    schema: string,
    table: string,
    tableType: "table" | "view",
    isPreview: boolean
  ) => void;
  openStructureTab: (schema: string, table: string) => void;
  openQueryTab: (sql?: string) => void;
  openHistoryTab: () => void;
  openErDiagramTab: (schema: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  promotePreview: (tabId: string) => void;
  updateTabState: (tabId: string, state: Partial<TabState>) => void;
  setTabDirty: (tabId: string, dirty: boolean) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  closeAllTabs: () => void;
}

export const useTabStore = create<TabStore>()((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTableTab: (schema, table, tableType, isPreview) => {
    const { tabs } = get();
    const tabId = `table-${schema}-${table}`;

    // If tab already exists, just activate it
    const existing = tabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    // Check tab limit
    if (tabs.length >= MAX_TABS) {
      return; // silently refuse
    }

    // If opening as preview, replace existing preview tab
    if (isPreview) {
      const previewIdx = tabs.findIndex((t) => t.isPreview);
      if (previewIdx !== -1) {
        const newTabs = [...tabs];
        newTabs[previewIdx] = {
          id: tabId,
          type: "table",
          title: `${schema}.${table}`,
          schema,
          table,
          tableType,
          isPreview: true,
          isDirty: false,
          state: {},
        };
        set({ tabs: newTabs, activeTabId: tabId });
        return;
      }
    }

    // Add new tab
    const newTab: Tab = {
      id: tabId,
      type: "table",
      title: `${schema}.${table}`,
      schema,
      table,
      tableType,
      isPreview,
      isDirty: false,
      state: {},
    };

    set({ tabs: [...tabs, newTab], activeTabId: tabId });
  },

  openStructureTab: (schema, table) => {
    const { tabs } = get();
    const tabId = `structure-${schema}-${table}`;

    const existing = tabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    if (tabs.length >= MAX_TABS) return;

    const newTab: Tab = {
      id: tabId,
      type: "structure",
      title: `${schema}.${table}`,
      schema,
      table,
      isPreview: false,
      isDirty: false,
      state: {},
    };

    set({ tabs: [...tabs, newTab], activeTabId: tabId });
  },

  openQueryTab: (sql) => {
    const { tabs } = get();
    if (tabs.length >= MAX_TABS) return;

    queryTabCounter++;
    const tabId = `query-${queryTabCounter}`;

    const newTab: Tab = {
      id: tabId,
      type: "query",
      title: `Sorgu ${queryTabCounter}`,
      isPreview: false,
      isDirty: false,
      state: { sql: sql || "" },
    };

    set({ tabs: [...tabs, newTab], activeTabId: tabId });
  },

  openHistoryTab: () => {
    const { tabs } = get();
    const tabId = "history";

    const existing = tabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    if (tabs.length >= MAX_TABS) return;

    const newTab: Tab = {
      id: tabId,
      type: "history",
      title: "Sorgu Geçmişi",
      isPreview: false,
      isDirty: false,
      state: {},
    };

    set({ tabs: [...tabs, newTab], activeTabId: tabId });
  },

  openErDiagramTab: (schema) => {
    const { tabs } = get();
    const tabId = `er-diagram-${schema}`;

    const existing = tabs.find((t) => t.id === tabId);
    if (existing) {
      set({ activeTabId: tabId });
      return;
    }

    if (tabs.length >= MAX_TABS) return;

    const newTab: Tab = {
      id: tabId,
      type: "er-diagram",
      title: `ER: ${schema}`,
      schema,
      isPreview: false,
      isDirty: false,
      state: {},
    };

    set({ tabs: [...tabs, newTab], activeTabId: tabId });
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    const newTabs = tabs.filter((t) => t.id !== tabId);

    // If closing active tab, activate neighbor
    let newActiveId = activeTabId;
    if (activeTabId === tabId) {
      if (newTabs.length === 0) {
        newActiveId = null;
      } else if (idx < newTabs.length) {
        newActiveId = newTabs[idx].id;
      } else {
        newActiveId = newTabs[newTabs.length - 1].id;
      }
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  promotePreview: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, isPreview: false } : t
      ),
    }));
  },

  updateTabState: (tabId, partialState) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, state: { ...t.state, ...partialState } } : t
      ),
    }));
  },

  setTabDirty: (tabId, dirty) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, isDirty: dirty } : t
      ),
    }));
  },

  reorderTabs: (fromIndex, toIndex) => {
    set((state) => {
      const newTabs = [...state.tabs];
      const [moved] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, moved);
      return { tabs: newTabs };
    });
  },

  closeAllTabs: () => {
    set({ tabs: [], activeTabId: null });
  },
}));
