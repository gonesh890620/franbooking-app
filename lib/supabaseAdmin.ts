import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in Vercel Environment Variables.");
  if (!key) throw new Error("Missing Supabase server key. Add SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables.");
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return client;
}
