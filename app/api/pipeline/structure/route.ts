import { NextResponse } from "next/server";
import { validateParamsFolder } from "@/lib/algorithm/paramsFolder";
import { PIPELINE_BUCKET } from "@/lib/services/pipelineStorage";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { badRequest, serviceUnavailable } from "@/lib/api/responses";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type KmEntry = { k: number; m: number; total: number };

async function discoverKm(
	supabase: SupabaseClient,
	folder: string,
	prefix: string,
	out: KmEntry[],
): Promise<void> {
	const { data: kDirs } = await supabase.storage
		.from(PIPELINE_BUCKET)
		.list(`${folder}/${prefix}`);
	if (!kDirs?.length) return;

	for (const kDir of kDirs) {
		if (!kDir.name?.startsWith("k=")) continue;
		const k = parseInt(kDir.name.replace("k=", ""), 10);
		if (Number.isNaN(k)) continue;

		const { data: mDirs } = await supabase.storage
			.from(PIPELINE_BUCKET)
			.list(`${folder}/${prefix}/${kDir.name}`);
		if (!mDirs?.length) continue;

		for (const mDir of mDirs) {
			if (!mDir.name?.startsWith("m=")) continue;
			const m = parseInt(mDir.name.replace("m=", ""), 10);
			if (Number.isNaN(m)) continue;

			const manifestPath = `${folder}/${prefix}/${kDir.name}/${mDir.name}/manifest.json`;
			const { data: manifestBlob } = await supabase.storage
				.from(PIPELINE_BUCKET)
				.download(manifestPath);
			if (!manifestBlob) continue;
			try {
				const manifest = JSON.parse(await manifestBlob.text());
				out.push({ k, m, total: manifest.total ?? 0 });
			} catch {
				// Skip invalid manifests
			}
		}
	}
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const folder = validateParamsFolder(url.searchParams.get("folder"));
	if (!folder) {
		return badRequest(
			"folder query param required and must contain only letters, digits, underscores, or hyphens",
		);
	}

	const supabase = createServiceRoleClient();
	if (!supabase) {
		return serviceUnavailable("SUPABASE_SERVICE_ROLE_KEY not configured.");
	}

	const result = {
		seedConfigurations: [] as KmEntry[],
		expandedSeeds: [] as KmEntry[],
		translationalCells: [] as KmEntry[],
	};
	await Promise.all([
		discoverKm(supabase, folder, "seedConfigurations", result.seedConfigurations),
		discoverKm(supabase, folder, "expandedSeeds", result.expandedSeeds),
		discoverKm(supabase, folder, "translationalCells", result.translationalCells),
	]);

	return NextResponse.json(result);
}
