import { createClient } from '@supabase/supabase-js';
import { LIVE, storeKey } from '../config';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Demo builds never talk to the server.
export const supabase = LIVE && url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: storeKey('myvotehub-auth') } })
  : null;

/** Unwraps a Supabase response, turning errors into thrown Errors with a readable message. */
export function must({ data, error }) {
  if (error) throw new Error(error.message?.replace(/^.*?exception: /i, '') || 'Something went wrong');
  return data;
}
