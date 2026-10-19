// Server-only Supabase client with the secret key: bypasses row level security. Use it only for server-owned tables
// (qloo_cache), never with input that decides whose rows to touch. Null when the key is not configured.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function adminClient() {
  if (client === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
    client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }
  return client;
}
