import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface SchemaInfo {
  name: string;
}

export interface TableInfo {
  name: string;
  schema: string;
  table_type: string;
  estimated_rows: number;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
  is_primary_key: boolean;
  ordinal_position: number;
}

export interface IndexInfo {
  name: string;
  is_unique: boolean;
  is_primary: boolean;
  columns: string;
  index_type: string;
}

export interface ForeignKeyInfo {
  name: string;
  column_name: string;
  foreign_table_schema: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

export interface FunctionInfo {
  name: string;
  schema: string;
  return_type: string;
  argument_types: string;
}

export interface SequenceInfo {
  name: string;
  schema: string;
}

export interface CompletionTable {
  schema: string;
  name: string;
  table_type: string;
  columns: string[];
}

export interface CompletionSchema {
  tables: CompletionTable[];
}

interface DatabaseState {
  schemas: SchemaInfo[];
  tablesBySchema: Record<string, TableInfo[]>;
  functionsBySchema: Record<string, FunctionInfo[]>;
  sequencesBySchema: Record<string, SequenceInfo[]>;
  isLoadingSchemas: boolean;
  completions: CompletionSchema | null;

  loadSchemas: (connectionId: string) => Promise<void>;
  loadTables: (connectionId: string, schema: string) => Promise<void>;
  loadFunctions: (connectionId: string, schema: string) => Promise<void>;
  loadSequences: (connectionId: string, schema: string) => Promise<void>;
  loadCompletions: (connectionId: string) => Promise<void>;
  reset: () => void;
}

export const useDatabaseStore = create<DatabaseState>()((set, _get) => ({
  schemas: [],
  tablesBySchema: {},
  functionsBySchema: {},
  sequencesBySchema: {},
  isLoadingSchemas: false,
  completions: null,

  loadSchemas: async (connectionId) => {
    set({ isLoadingSchemas: true });
    try {
      const schemas = await invoke<SchemaInfo[]>("list_schemas", { connectionId });
      set({ schemas });
    } catch (err) {
      console.error("Şemalar yüklenemedi:", err);
    } finally {
      set({ isLoadingSchemas: false });
    }
  },

  loadTables: async (connectionId, schema) => {
    try {
      const tables = await invoke<TableInfo[]>("list_tables", { connectionId, schema });
      set((state) => ({
        tablesBySchema: { ...state.tablesBySchema, [schema]: tables },
      }));
    } catch (err) {
      console.error("Tablolar yüklenemedi:", err);
    }
  },

  loadFunctions: async (connectionId, schema) => {
    try {
      const functions = await invoke<FunctionInfo[]>("list_functions", { connectionId, schema });
      set((state) => ({
        functionsBySchema: { ...state.functionsBySchema, [schema]: functions },
      }));
    } catch (err) {
      console.error("Fonksiyonlar yüklenemedi:", err);
    }
  },

  loadSequences: async (connectionId, schema) => {
    try {
      const sequences = await invoke<SequenceInfo[]>("list_sequences", { connectionId, schema });
      set((state) => ({
        sequencesBySchema: { ...state.sequencesBySchema, [schema]: sequences },
      }));
    } catch (err) {
      console.error("Sequence'lar yüklenemedi:", err);
    }
  },

  loadCompletions: async (connectionId) => {
    try {
      const completions = await invoke<CompletionSchema>("get_schema_completions", { connectionId });
      set({ completions });
    } catch (err) {
      console.error("Autocomplete verisi yüklenemedi:", err);
    }
  },

  reset: () =>
    set({
      schemas: [],
      tablesBySchema: {},
      functionsBySchema: {},
      sequencesBySchema: {},
      isLoadingSchemas: false,
      completions: null,
    }),
}));
