import { NextResponse } from "next/server";
import { generatePolygons } from "@/lib/algorithm/pipeline-core";
import { PolygonType, type GeneratorParameters } from "@/classes";
import { toRadians } from "@/lib/utils/geometry";
import { PIPELINE_BUCKET } from "@/lib/services/pipelineStorage";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { badRequest, serviceUnavailable } from "@/lib/api/responses";

export const runtime = "nodejs";

function parseParameters(body: unknown): Record<string, { n_max: number; angle?: number }> {
	const params: Record<string, { n_max: number; angle?: number }> = {};
	if (!body || typeof body !== "object") return params;
	const b = body as Record<string, unknown>;

	const types = [
		PolygonType.REGULAR,
		PolygonType.STAR_REGULAR,
		PolygonType.STAR_PARAMETRIC,
		PolygonType.EQUILATERAL,
	] as const;

	for (const type of types) {
		const cfg = b[type] as { enabled?: boolean; n_max?: number; angle?: number } | undefined;
		if (!cfg?.enabled) continue;
		const n_max = typeof cfg.n_max === "number" ? Math.max(3, Math.min(24, cfg.n_max)) : 12;
		const entry: { n_max: number; angle?: number } = { n_max };
		if (
			(type === PolygonType.STAR_REGULAR || type === PolygonType.EQUILATERAL) &&
			typeof cfg.angle === "number"
		) {
			entry.angle = toRadians(Math.max(1, Math.min(180, cfg.angle)));
		}
		if (type === PolygonType.EQUILATERAL && !entry.angle) entry.angle = toRadians(30);
		params[type] = entry;
	}
	return params;
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const raw = parseParameters(body);

		const parameters: GeneratorParameters = {};
		if (raw[PolygonType.REGULAR]) parameters[PolygonType.REGULAR] = raw[PolygonType.REGULAR];
		if (raw[PolygonType.STAR_REGULAR]) parameters[PolygonType.STAR_REGULAR] = raw[PolygonType.STAR_REGULAR];
		if (raw[PolygonType.STAR_PARAMETRIC]) parameters[PolygonType.STAR_PARAMETRIC] = raw[PolygonType.STAR_PARAMETRIC];
		if (raw[PolygonType.EQUILATERAL]) {
			const eq = raw[PolygonType.EQUILATERAL];
			parameters[PolygonType.EQUILATERAL] = { n_max: eq.n_max, angle: eq.angle ?? Math.PI / 6 };
		}

		if (Object.keys(parameters).length === 0) {
			return badRequest("At least one polygon type must be enabled");
		}

		const { names, paramsFolder } = generatePolygons(parameters);

		const supabase = createServiceRoleClient();
		if (!supabase) {
			return serviceUnavailable(
				"SUPABASE_SERVICE_ROLE_KEY not configured. Add it to .env.local for pipeline uploads.",
			);
		}

		const path = `${paramsFolder}/polygons.json`;
		const blob = new Blob([JSON.stringify(names, null, 4)], { type: "application/json" });
		const { error } = await supabase.storage.from(PIPELINE_BUCKET).upload(path, blob, {
			contentType: "application/json",
			upsert: true,
		});

		if (error) {
			console.error("Pipeline upload error:", error);
			return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
		}

		return NextResponse.json({ paramsFolder, polygonCount: names.length });
	} catch (err) {
		console.error("generate-polygons error:", err);
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
