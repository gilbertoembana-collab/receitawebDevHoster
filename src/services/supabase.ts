import { createClient } from '@supabase/supabase-js';

// Dynamically extract variables to prevent static TypeScript meta property checking issues
const getSupabaseEnv = () => {
  try {
    return {
      url: ((import.meta as any).env?.VITE_SUPABASE_URL as string) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || '',
      anonKey: ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || ''
    };
  } catch (e) {
    return {
      url: (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || '',
      anonKey: (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || ''
    };
  }
};

const env = getSupabaseEnv();

// Initialize Supabase Client (Only if credentials are set, preventing crashes if not configured yet)
export const supabase = env.url && env.anonKey 
  ? createClient(env.url, env.anonKey)
  : null;

/**
 * Helper to check if Supabase Client is configured and active
 */
export const isSupabaseConfigured = (): boolean => {
  return !!supabase;
};
