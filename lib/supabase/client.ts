import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createClient(): SupabaseClient {
  return createBrowserClient(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Browser-side singleton for read-only Supabase access from services.
 * Null on the server — server code should use `@/lib/supabase/server` instead.
 */
export const supabase: SupabaseClient | null =
  typeof window !== "undefined" &&
  process.env.PUBLIC_SUPABASE_URL &&
  process.env.PUBLIC_SUPABASE_ANON_KEY
    ? createClient()
    : null;
