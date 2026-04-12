import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
	findCampaignByHash,
	fetchTilingsForCampaign,
	type CampaignTiling,
} from "@/lib/services/campaignService";
import {
	getTranslationalCellsManifestUrl,
	getTranslationalCellsBatchUrl,
} from "@/lib/services/pipelineStorage";
import { fetchPipelineJsonArray } from "@/lib/services/pipelineFetch";
import { TilingsClient } from "./_tilings-client";

const PAGE_SIZE = 48;

export default async function TilingsPage({
	params,
	searchParams,
}: {
	params: Promise<{ experimentHash: string }>;
	searchParams: Promise<{ page?: string; k?: string; m?: string }>;
}) {
	const { experimentHash } = await params;
	const sp = await searchParams;
	const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10));
	const k = sp.k ? parseInt(sp.k, 10) : null;
	const m = sp.m ? parseInt(sp.m, 10) : 1;

	const sb = await createClient();
	const campaign = await findCampaignByHash(experimentHash, sb);
	if (!campaign) notFound();

	// Storage-backed (Gold Standard) campaigns — page through gzip-batched
	// translationalCells/k=*/m=*/ manifests in Supabase Storage.
	if (campaign.data_source === "pipeline-storage" && campaign.params_folder) {
		const folder = campaign.params_folder;
		const selectedK = k ?? campaign.k_values?.[0] ?? 1;
		const manifestUrl = getTranslationalCellsManifestUrl(folder, selectedK, m);

		const manifest = await fetch(manifestUrl)
			.then((r) => (r.ok ? r.json() : null))
			.catch(() => null);

		const total = manifest?.total ?? 0;
		const batchSize = manifest?.batchSize ?? PAGE_SIZE;
		const offset = (pageNum - 1) * PAGE_SIZE;
		const batchIndex = Math.floor(offset / batchSize);
		const batchCount = Math.ceil(total / batchSize);

		const tilings =
			batchIndex < batchCount
				? ((await fetchPipelineJsonArray(
						getTranslationalCellsBatchUrl(folder, selectedK, m, batchIndex),
					)) as CampaignTiling[])
				: [];

		return (
			<TilingsClient
				tilings={tilings}
				total={total}
				page={pageNum}
				pageSize={PAGE_SIZE}
				k={selectedK}
				kValues={campaign.k_values ?? []}
			/>
		);
	}

	// DB-backed path (user campaigns).
	const all = await fetchTilingsForCampaign(campaign.id, sb);
	const filtered = k !== null ? all.filter((t) => t.k === k) : all;
	const total = filtered.length;
	const offset = (pageNum - 1) * PAGE_SIZE;
	const paged = filtered.slice(offset, offset + PAGE_SIZE) as CampaignTiling[];

	return (
		<TilingsClient
			tilings={paged}
			total={total}
			page={pageNum}
			pageSize={PAGE_SIZE}
			k={k}
			kValues={campaign.k_values ?? []}
		/>
	);
}
