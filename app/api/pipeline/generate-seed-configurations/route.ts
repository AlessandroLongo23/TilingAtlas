import { NextResponse } from "next/server";
import zlib from "node:zlib";
import {
	CompatibilityGraph,
	VertexConfiguration,
	SeedSetExtractor,
	SeedBuilder,
} from "@/classes";
import { compareVertexConfigurationNames } from "@/lib/utils/geometry";
import { roundNumbersInJson } from "@/lib/utils/utils";
import { getEffectiveUniqueCount } from "@/lib/utils/vcChiral";
import { validateParamsFolder } from "@/lib/algorithm/paramsFolder";
import { BATCH_SIZE } from "@/lib/constants";
import { PIPELINE_BUCKET } from "@/lib/services/pipelineStorage";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_K = 2;

function streamLine(controller: ReadableStreamDefaultController<Uint8Array>, data: object) {
	controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + "\n"));
}

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { paramsFolder?: string; vcNames?: string[]; stream?: boolean };
		const paramsFolder = validateParamsFolder(body?.paramsFolder);
		const selectedVcNames = Array.isArray(body?.vcNames) ? body.vcNames : [];
		const useStream = body?.stream === true;

		if (!paramsFolder) {
			return NextResponse.json(
				{ error: "paramsFolder is required and must contain only letters, digits, underscores, or hyphens" },
				{ status: 400 },
			);
		}

		const supabase = createServiceRoleClient();
		if (!supabase) {
			return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 503 });
		}

		// Determine which VCs to use
		const vcsRes = await supabase.storage.from(PIPELINE_BUCKET).download(`${paramsFolder}/vcs.json`);
		if (!vcsRes.data) {
			return NextResponse.json(
				{ error: "Missing vcs.json. Run Generate Vertex Configurations first." },
				{ status: 400 },
			);
		}
		const allVcNames: string[] = JSON.parse(await vcsRes.data.text());
		let vcNames: string[];
		if (selectedVcNames.length > 0) {
			vcNames = selectedVcNames
				.filter((n) => allVcNames.includes(n))
				.sort((a, b) => compareVertexConfigurationNames(a, b));
			if (vcNames.length === 0) {
				return NextResponse.json({ error: "No valid selected VCs found in vcs.json." }, { status: 400 });
			}
		} else {
			vcNames = [...allVcNames].sort((a, b) => compareVertexConfigurationNames(a, b));
		}

		// Compute compatibility graph
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const vcInstances = vcNames.map((name) => (VertexConfiguration as any).fromName(name));
		const adjacencyList: Record<string, string[]> = {};
		for (const vc of vcInstances) adjacencyList[vc.name] = [];
		for (let i = 0; i < vcInstances.length; i++) {
			for (let j = i + 1; j < vcInstances.length; j++) {
				if (vcInstances[i].isCompatible(vcInstances[j])) {
					adjacencyList[vcInstances[i].name].push(vcInstances[j].name);
					adjacencyList[vcInstances[j].name].push(vcInstances[i].name);
				}
			}
		}

		await supabase.storage.from(PIPELINE_BUCKET).upload(
			`${paramsFolder}/compatibilityGraph.json`,
			new Blob([JSON.stringify(adjacencyList, null, 4)], { type: "application/json" }),
			{ contentType: "application/json", upsert: true },
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const compatibilityGraph = (CompatibilityGraph as any).fromAdjacencyList(adjacencyList, vcInstances);
		const extractor = new SeedSetExtractor(compatibilityGraph);

		const seedSetsByK = new Map<number, Map<number, string[][]>>();
		for (let k = 1; k <= MAX_K; k++) {
			const seedSets = extractor.findSeedSets(k);
			const byM = new Map<number, string[][]>();
			for (const seedSet of seedSets) {
				const m = new Set(seedSet).size;
				if (!byM.has(m)) byM.set(m, []);
				byM.get(m)!.push(seedSet);
			}
			seedSetsByK.set(k, byM);
		}

		for (const [k, byM] of seedSetsByK) {
			for (const [m, sets] of byM) {
				await supabase.storage.from(PIPELINE_BUCKET).upload(
					`${paramsFolder}/seedSets/k=${k}/m=${m}.json`,
					new Blob([JSON.stringify(sets, null, 4)], { type: "application/json" }),
					{ contentType: "application/json", upsert: true },
				);
			}
		}

		await supabase.storage.from(PIPELINE_BUCKET).upload(
			`${paramsFolder}/seedConfigurations/vcLibrary.json`,
			new Blob([JSON.stringify(vcNames)], { type: "application/json" }),
			{ contentType: "application/json", upsert: true },
		);

		let totalSeeds = 0;
		for (let k = 1; k <= MAX_K; k++) {
			const byM = seedSetsByK.get(k)!;
			const allSeedSets = [...byM.values()].flat();
			if (allSeedSets.length === 0) continue;

			const seedBuilder = new SeedBuilder();
			const seedConfigurations = seedBuilder.buildSeeds(k, 1, {
				seedSetLoader: () => allSeedSets,
			});

			const byEffectiveM = new Map<number, typeof seedConfigurations>();
			for (const sc of seedConfigurations) {
				const names = sc.vertexConfigurations.map((vc) => vc.name);
				const effectiveM = getEffectiveUniqueCount(names);
				if (!byEffectiveM.has(effectiveM)) byEffectiveM.set(effectiveM, []);
				byEffectiveM.get(effectiveM)!.push(sc);
			}

			for (const [effectiveM, seeds] of byEffectiveM) {
				const compactData = seeds.map((sc) => sc.encodeCompact(vcNames, true));
				const total = compactData.length;
				const folderPath = `${paramsFolder}/seedConfigurations/k=${k}/m=${effectiveM}`;
				for (let i = 0; i < total; i += BATCH_SIZE) {
					const batchIndex = Math.floor(i / BATCH_SIZE);
					const batch = compactData.slice(i, i + BATCH_SIZE);
					const rounded = roundNumbersInJson(batch) as typeof batch;
					const compressed = zlib.gzipSync(JSON.stringify(rounded), { level: 9 });
					const filePath = `${folderPath}/seedConfigurations_${String(batchIndex).padStart(4, "0")}.json.gz`;
					await supabase.storage.from(PIPELINE_BUCKET).upload(filePath, new Blob([compressed]), {
						contentType: "application/gzip",
						upsert: true,
					});
				}
				const manifest = {
					format: "compact",
					vcLibrary: true,
					shortKeys: true,
					compressed: true,
					total,
					batchSize: BATCH_SIZE,
				};
				await supabase.storage.from(PIPELINE_BUCKET).upload(
					`${folderPath}/manifest.json`,
					new Blob([JSON.stringify(manifest)]),
					{ contentType: "application/json", upsert: true },
				);
				totalSeeds += total;
			}
		}

		if (useStream) {
			const stream = new ReadableStream({
				async start(controller) {
					streamLine(controller, {
						progress: 100,
						message: `Generated ${totalSeeds} seed configurations`,
						done: true,
						paramsFolder,
						seedConfigCount: totalSeeds,
					});
					controller.close();
				},
			});
			return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
		}

		return NextResponse.json({ paramsFolder, seedConfigCount: totalSeeds });
	} catch (err) {
		console.error("generate-seed-configurations error:", err);
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
