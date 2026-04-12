import { NextResponse } from "next/server";
import { PIPELINE_BUCKET } from "@/lib/services/pipelineStorage";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
	try {
		const supabase = createServiceRoleClient();
		if (!supabase) return NextResponse.json({ folders: [] });

		const { data, error } = await supabase.storage.from(PIPELINE_BUCKET).list("", { limit: 500 });
		if (error) return NextResponse.json({ folders: [] });

		const folders = (data ?? [])
			.filter((f) => f.name && !f.name.startsWith("."))
			.map((f) => f.name);

		return NextResponse.json({ folders });
	} catch {
		return NextResponse.json({ folders: [] });
	}
}
