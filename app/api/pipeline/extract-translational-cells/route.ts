import { NextResponse } from "next/server";
import zlib from "node:zlib";
import { TranslationalCellExtractor } from "@/classes";
import { roundNumbersInJson } from "@/lib/utils/utils";
import { validateParamsFolder } from "@/lib/algorithm/paramsFolder";
import { polygonToShort, polygonFromShort } from "@/lib/algorithm/pipelineStorageFormat";
import { compactSeedName } from "@/lib/utils/compactSeedName";
import { BATCH_SIZE } from "@/lib/constants";
import { PIPELINE_BUCKET } from "@/lib/services/pipelineStorage";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { streamLine } from "@/lib/api/streamLine";
import { badRequest, serviceUnavailable } from "@/lib/api/responses";

export const runtime = "nodejs";
export const maxDuration = 300;

async function loadExpandedSeedsBatches(
	supabase: SupabaseClient,
	paramsFolder: string,
	k: number,
	m: number,
): Promise<{ n: string; p: Record<string, unknown>[] }[]> {
	const { data: manifestBlob } = await supabase.storage
		.from(PIPELINE_BUCKET)
		.download(`${paramsFolder}/expandedSeeds/k=${k}/m=${m}/manifest.json`);
	if (!manifestBlob) return [];
	const manifest = JSON.parse(await manifestBlob.text());
	const total = manifest.total ?? 0;
	const items: { n: string; p: Record<string, unknown>[] }[] = [];

	for (let i = 0; i < total; i += BATCH_SIZE) {
		const batchIndex = Math.floor(i / BATCH_SIZE);
		const baseName = `expandedSeeds_${String(batchIndex).padStart(4, "0")}`;
		const { data: batchBlob } = await supabase.storage
			.from(PIPELINE_BUCKET)
			.download(`${paramsFolder}/expandedSeeds/k=${k}/m=${m}/${baseName}.json.gz`);
		if (!batchBlob) continue;
		const buf = Buffer.from(await batchBlob.arrayBuffer());
		items.push(...JSON.parse(zlib.gunzipSync(buf).toString("utf8")));
	}
	return items;
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

		const items = await loadExpandedSeedsBatches(supabase, paramsFolder, k, m);
		if (items.length === 0) {
			return badRequest(`No expanded seeds found for k=${k}/m=${m}. Run Expand Seeds first.`);
		}

		const extractor = new TranslationalCellExtractor();
		const folderPath = `${paramsFolder}/translationalCells/k=${k}/m=${m}`;

		const processAll = (
			onProgress?: (i: number, seedName: string) => void,
		): {
			cells: {
				n: string;
				p: Record<string, unknown>[];
				b: [[number, number], [number, number]];
				o: [number, number];
			}[];
			skipped: number;
		} => {
			const cells: {
				n: string;
				p: Record<string, unknown>[];
				b: [[number, number], [number, number]];
				o: [number, number];
			}[] = [];
			let skipped = 0;
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				onProgress?.(i, item.n ?? "?");
				const polygons = (item.p ?? []).map((p: Record<string, unknown>) => polygonFromShort(p));
				if (polygons.length === 0) {
					skipped++;
					continue;
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const result = (extractor.extract as any)(polygons);
				if (!result) {
					skipped++;
					continue;
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const encodedCell = result.cellPolygons.map((p: any) => polygonToShort(p.encode() as Record<string, unknown>));
				const [v1, v2] = result.basis;
				cells.push({
					n: item.n ?? "",
					p: roundNumbersInJson(encodedCell) as Record<string, unknown>[],
					b: [[v1.x, v1.y], [v2.x, v2.y]],
					o: [result.origin.x, result.origin.y],
				});
			}
			return { cells, skipped };
		};

		const uploadCells = async (cells: unknown[]) => {
			for (let i = 0; i < cells.length; i += BATCH_SIZE) {
				const batchIndex = Math.floor(i / BATCH_SIZE);
				const batchData = cells.slice(i, i + BATCH_SIZE);
				const compressed = zlib.gzipSync(JSON.stringify(batchData), { level: 9 });
				await supabase.storage.from(PIPELINE_BUCKET).upload(
					`${folderPath}/translationalCells_${String(batchIndex).padStart(4, "0")}.json.gz`,
					new Blob([compressed]),
					{ contentType: "application/gzip", upsert: true },
				);
			}
			if (cells.length > 0) {
				const manifest = {
					format: "full",
					shortKeys: true,
					compressed: true,
					total: cells.length,
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
						const { cells, skipped } = processAll((i, seedName) => {
							const progress = ((i + 1) / items.length) * 90;
							const name = seedName.startsWith("[") ? seedName : `[${seedName}]`;
							streamLine(controller, {
								progress,
								message: `Extracting translational cell from seed ${compactSeedName(name)}`,
							});
						});
						streamLine(controller, { progress: 92, message: "Uploading…" });
						await uploadCells(cells);
						streamLine(controller, {
							progress: 100,
							message: `Extracted ${cells.length} translational cells`,
							done: true,
							paramsFolder,
							k,
							m,
							extractedCount: cells.length,
							skipped,
						});
					} catch (err) {
						console.error("extract-translational-cells error:", err);
						streamLine(controller, { error: err instanceof Error ? err.message : "Unknown error" });
					}
					controller.close();
				},
			});
			return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
		}

		const { cells, skipped } = processAll();
		await uploadCells(cells);
		return NextResponse.json({ paramsFolder, k, m, extractedCount: cells.length, skipped });
	} catch (err) {
		console.error("extract-translational-cells error:", err);
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
