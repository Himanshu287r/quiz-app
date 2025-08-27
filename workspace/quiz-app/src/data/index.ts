import type { DataSource } from './types';
import { inMemoryDataSource } from './inMemory';
import { supabaseDataSource } from './supabase';

function hasSupabaseEnv(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

let dataSource: DataSource | null = null;

export function getDataSource(): DataSource {
  if (dataSource) return dataSource;
  dataSource = hasSupabaseEnv() ? supabaseDataSource : inMemoryDataSource;
  return dataSource;
}

export * from './types';

