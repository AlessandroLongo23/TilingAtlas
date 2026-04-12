import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
	findCampaignByHash,
	fetchTilingsForCampaign,
	type CampaignTiling,
} from "@/lib/services/campaignService";
import { TilingsClient } from "./_tilings-client";

const PAGE_SIZE = 48;

export default async function TilingsPage({
	params,
	searchParams,
}: {
	params: Promise<{ experimentHash: string }>;
	searchParams: Promise<{ page?: string; k?: string }>;
}) {
	const { experimentHash } = await params;
	const sp = await searchParams;
	const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10));
	const k = sp.k ? parseInt(sp.k, 10) : null;

	const sb = await createClient();
	const campaign = await findCampaignByHash(experimentHash, sb);
	if (!campaign) notFound();

	// Storage-backed (pipeline-storage) pagination is deferred: full implementation
	// matches source's +page.server.ts. For now we handle the DB-backed path, which
	// covers all user-created campaigns.
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
