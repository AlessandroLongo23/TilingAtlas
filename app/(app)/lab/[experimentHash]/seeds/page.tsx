import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findCampaignByHash } from "@/lib/services/campaignService";
import { SeedsClient } from "./_seeds-client";

export default async function SeedsPage({
	params,
}: {
	params: Promise<{ experimentHash: string }>;
}) {
	const { experimentHash } = await params;
	const sb = await createClient();
	const campaign = await findCampaignByHash(experimentHash, sb);
	if (!campaign) notFound();
	return (
		<SeedsClient
			polygonNames={campaign.polygon_config?.names ?? []}
			kValues={campaign.k_values ?? []}
		/>
	);
}
