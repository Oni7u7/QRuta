import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente con service role. Solo se importa desde código de servidor
// (route handlers / server components); las variables no llevan NEXT_PUBLIC_.
let client: SupabaseClient | null = null;

export function supabaseAdmin() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
