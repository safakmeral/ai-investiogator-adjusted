// Edge Function'lar için Supabase admin client
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

let cached: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY tanımlı değil');
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
