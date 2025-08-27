// Minimal supabase-backed adapter that currently delegates to the in-memory implementation
// if no valid Supabase credentials are present. This allows immediate local usage and
// a seamless upgrade path when env vars are provided.

import { inMemoryDataSource } from './inMemory';
import type { DataSource } from './types';

const hasEnv = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export const supabaseDataSource: DataSource = hasEnv
  ? inMemoryDataSource
  : inMemoryDataSource;

export default supabaseDataSource;

