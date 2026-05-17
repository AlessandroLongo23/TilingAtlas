import { NextResponse } from "next/server";
import { generateVCs } from "@/lib/algorithm/pipeline-core";
import { compareVertexConfigurationNames } from "@/lib/utils/geometry";
import { validateParamsFolder } from "@/lib/algorithm/paramsFolder";
import { PIPELINE_BUCKET } from "@/lib/services/pipelineStorage";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { streamLine } from "@/lib/api/streamLine";
import { badRequest, serviceUnavailable } from "@/lib/api/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { paramsFolder?: string; polygonNames?: string[]; stream?: boolean };
		const paramsFolder = validateParamsFolder(body?.paramsFolder);
		const polygonNames = Array.isArray(body?.polygonNames) ? body.polygonNames : [];
		const useStream = body?.stream === true;

		if (!paramsFolder) {
			return badRequest(
				"paramsFolder is required and must contain only letters, digits, underscores, or hyphens",
			);
		}
		if (polygonNames.length === 0) {
			return badRequest("At least one polygon must be selected");
		}

		const supabase = createServiceRoleClient();
		if (!supabase) {
			return serviceUnavailable("SUPABASE_SERVICE_ROLE_KEY not configured.");
		}

		const compute = async () => {
			const newVcNames = generateVCs(polygonNames);
			let finalVcNames = newVcNames;
			const vcsPath = `${paramsFolder}/vcs.json`;
			const { data: existingVcs } = await supabase.storage.from(PIPELINE_BUCKET).download(vcsPath);
			if (existingVcs) {
				try {
					const text = await existingVcs.text();
					const existingNames: string[] = JSON.parse(text || "[]");
					const combined = new Set([...existingNames, ...newVcNames]);
					finalVcNames = [...combined].sort((a, b) => compareVertexConfigurationNames(a, b));
				} catch {
					// keep newVcNames on parse failure
				}
			}
			const vcsBlob = new Blob([JSON.stringify(finalVcNames, null, 4)], { type: "application/json" });
			const { error: vcsError } = await supabase.storage.from(PIPELINE_BUCKET).upload(vcsPath, vcsBlob, {
				contentType: "application/json",
				upsert: true,
			});
			if (vcsError) throw new Error(`Upload failed: ${vcsError.message}`);
			return { newCount: newVcNames.length, vcCount: finalVcNames.length };
		};

		if (useStream) {
			const stream = new ReadableStream({
				async start(controller) {
					try {
						streamLine(controller, { progress: 20, message: "Extracting vertex configurations from polygons…" });
						const { newCount, vcCount } = await compute();
						streamLine(controller, { progress: 85, message: "Uploading…" });
						streamLine(controller, {
							progress: 100,
							message: `Generated ${vcCount} vertex configurations`,
							done: true,
							paramsFolder,
							vcCount,
							newCount,
						});
					} catch (err) {
						console.error("generate-vcs error:", err);
						streamLine(controller, { error: err instanceof Error ? err.message : "Unknown error" });
					}
					controller.close();
				},
			});
			return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
		}

		const { newCount, vcCount } = await compute();
		return NextResponse.json({ paramsFolder, vcCount, newCount });
	} catch (err) {
		console.error("generate-vcs error:", err);
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
