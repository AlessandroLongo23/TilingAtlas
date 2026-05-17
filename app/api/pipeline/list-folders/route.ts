import { NextResponse } from "next/server";
import { PIPELINE_BUCKET } from "@/lib/services/pipelineStorage";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { serviceUnavailable } from "@/lib/api/responses";

export const runtime = "nodejs";

export async function GET() {
	const supabase = createServiceRoleClient();
	if (!supabase) return serviceUnavailable("SUPABASE_SERVICE_ROLE_KEY not configured.");

	const { data, error } = await supabase.storage.from(PIPELINE_BUCKET).list("", { limit: 500 });
	if (error) return serviceUnavailable(`Storage list failed: ${error.message}`);

	const folders = (data ?? [])
		.filter((f) => f.name && !f.name.startsWith("."))
		.map((f) => f.name);

	return NextResponse.json({ folders });
}
