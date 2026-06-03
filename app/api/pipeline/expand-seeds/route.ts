import { NextResponse } from "next/server";
import zlib from "node:zlib";
import { SeedExpander, SeedConfiguration } from "@/classes";
import { roundNumbersInJson } from "@/lib/utils/utils";
import { validateParamsFolder } from "@/lib/algorithm/paramsFolder";
import { polygonToShort } from "@/lib/algorithm/pipelineStorageFormat";
import { compactSeedName } from "@/lib/utils/compactSeedName";
import { BATCH_SIZE } from "@/lib/constants";
import { PIPELINE_BUCKET } from "@/lib/services/pipelineStorage";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { streamLine } from "@/lib/api/streamLine";
import { badRequest, serviceUnavailable } from "@/lib/api/responses";

export const runtime = "nodejs";
export const maxDuration = 300;

async function loadSeedConfigBatches(
	supabase: SupabaseClient,
	paramsFolder: string,
	k: number,
	m: number,
): Promise<{ configs: unknown[]; vcLibrary: string[] }> {
	const { data: manifestBlob } = await supabase.storage
		.from(PIPELINE_BUCKET)
		.download(`${paramsFolder}/seedConfigurations/k=${k}/m=${m}/manifest.json`);
	const { data: vcLibraryBlob } = await supabase.storage
		.from(PIPELINE_BUCKET)
		.download(`${paramsFolder}/seedConfigurations/vcLibrary.json`);

	if (!manifestBlob) return { configs: [], vcLibrary: [] };

	const manifest = JSON.parse(await manifestBlob.text());
	const total = manifest.total ?? 0;
	const vcLibrary: string[] = vcLibraryBlob ? JSON.parse(await vcLibraryBlob.text()) : [];
	const configs: unknown[] = [];

	for (let i = 0; i < total; i += BATCH_SIZE) {
		const batchIndex = Math.floor(i / BATCH_SIZE);
		const baseName = `seedConfigurations_${String(batchIndex).padStart(4, "0")}`;
		const { data: batchBlob } = await supabase.storage
			.from(PIPELINE_BUCKET)
			.download(`${paramsFolder}/seedConfigurations/k=${k}/m=${m}/${baseName}.json.gz`);
		if (!batchBlob) continue;
		const buf = Buffer.from(await batchBlob.arrayBuffer());
		configs.push(...JSON.parse(zlib.gunzipSync(buf).toString("utf8")));
	}
	return { configs, vcLibrary };
}

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as {
			paramsFolder?: string;
			k?: number;
			m?: number;
			stream?: boolean;
		};
		const paramsFolder = validateParamsFolder(body?.paramsFolder);
		const k = typeof body?.k === "number" ? body.k : 1;
		const m = typeof body?.m === "number" ? body.m : 1;
		const useStream = body?.stream === true;

		if (!paramsFolder) {
			return badRequest(
				"paramsFolder is required and must contain only letters, digits, underscores, or hyphens",
			);
		}

		const supabase = createServiceRoleClient();
		if (!supabase) {
			return serviceUnavailable("SUPABASE_SERVICE_ROLE_KEY not configured.");
		}

		const { configs, vcLibrary } = await loadSeedConfigBatches(supabase, paramsFolder, k, m);
		if (configs.length === 0) {
			return badRequest(
				`No seed configurations found for k=${k}/m=${m}. Run Generate Seed Configurations first.`,
			);
		}

		const expander = new SeedExpander(k);
		// Per-seed wall-clock cap so one pathological hard seed cannot hang the request to the
		// 300s function timeout. Capped seeds produce NO tilings and are surfaced (never silent).
		expander.maxExpandMs = k >= 2 ? 90_000 : 0;
		const cappedNames: string[] = [];
		const folderPath = `${paramsFolder}/expandedSeeds/k=${k}/m=${m}`;

		const processAll = async (
			onProgress?: (i: number, seedName: string) => void,
		): Promise<{ n: string; p: Record<string, unknown>[] }[]> => {
			const out: { n: string; p: Record<string, unknown>[] }[] = [];
			for (let i = 0; i < configs.length; i++) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const seed = (SeedConfiguration as any).decodeCompact(configs[i], vcLibrary);
				onProgress?.(i, seed.name);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(expander.expand as any)(seed, (patch: any[]) => {
					const encodedPolygons = patch.map((p) => polygonToShort(p.encode() as Record<string, unknown>));
					out.push({
						n: seed.name,
						p: roundNumbersInJson(encodedPolygons) as Record<string, unknown>[],
					});
				});
				if (expander.lastExpandCapped) cappedNames.push(seed.name);
			}
			if (cappedNames.length > 0) {
				console.warn(
					`expand-seeds: ${cappedNames.length} seed(s) hit the 90s cap (INCOMPLETE, no tilings): ${cappedNames.join(", ")}`,
				);
			}
			return out;
		};

		const uploadBatches = async (items: { n: string; p: Record<string, unknown>[] }[]) => {
			for (let i = 0; i < items.length; i += BATCH_SIZE) {
				const batchIndex = Math.floor(i / BATCH_SIZE);
				const batchData = items.slice(i, i + BATCH_SIZE);
				const compressed = zlib.gzipSync(JSON.stringify(batchData), { level: 9 });
				await supabase.storage.from(PIPELINE_BUCKET).upload(
					`${folderPath}/expandedSeeds_${String(batchIndex).padStart(4, "0")}.json.gz`,
					new Blob([compressed]),
					{ contentType: "application/gzip", upsert: true },
				);
			}
			if (items.length > 0) {
				const manifest = {
					format: "full",
					shortKeys: true,
					compressed: true,
					total: items.length,
					batchSize: BATCH_SIZE,
				};
				await supabase.storage.from(PIPELINE_BUCKET).upload(
					`${folderPath}/manifest.json`,
					new Blob([JSON.stringify(manifest)]),
					{ contentType: "application/json", upsert: true },
				);
			}
		};

		if (useStream) {
			const stream = new ReadableStream({
				async start(controller) {
					try {
						const items = await processAll((i, seedName) => {
							const progress = ((i + 1) / configs.length) * 85;
							streamLine(controller, {
								progress,
								message: `Expanding seed ${compactSeedName(seedName)}`,
							});
						});
						streamLine(controller, { progress: 90, message: "Uploading…" });
						await uploadBatches(items);
						streamLine(controller, {
							progress: 100,
							message: `Expanded ${items.length} seeds`
								+ (cappedNames.length ? ` (⚠ ${cappedNames.length} capped, INCOMPLETE)` : ''),
							done: true,
							paramsFolder,
							k,
							m,
							expandedCount: items.length,
							cappedSeeds: cappedNames.length,
							cappedNames,
						});
					} catch (err) {
						console.error("expand-seeds error:", err);
						streamLine(controller, { error: err instanceof Error ? err.message : "Unknown error" });
					}
					controller.close();
				},
			});
			return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
		}

		const items = await processAll();
		await uploadBatches(items);
		return NextResponse.json({
			paramsFolder, k, m, expandedCount: items.length,
			cappedSeeds: cappedNames.length, cappedNames,
		});
	} catch (err) {
		console.error("expand-seeds error:", err);
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
