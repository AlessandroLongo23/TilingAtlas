import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared service-role Supabase client factory for /api/pipeline/* handlers.
 * Returns null when SUPABASE_SERVICE_ROLE_KEY is missing so callers can
 * short-circuit with a 503.
 */
export function createServiceRoleClient(): SupabaseClient | null {
	const url = process.env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceRoleKey) return null;
	return createSupabaseClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
