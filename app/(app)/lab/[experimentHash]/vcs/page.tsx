import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findCampaignByHash } from "@/lib/services/campaignService";
import { VCsClient } from "./_vcs-client";

export default async function VCsPage({
	params,
}: {
	params: Promise<{ experimentHash: string }>;
}) {
	const { experimentHash } = await params;
	const sb = await createClient();
	const campaign = await findCampaignByHash(experimentHash, sb);
	if (!campaign) notFound();
	return <VCsClient polygonNames={campaign.polygon_config?.names ?? []} />;
}
