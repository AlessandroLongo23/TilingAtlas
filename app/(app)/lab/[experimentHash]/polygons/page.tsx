import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findCampaignByHash } from "@/lib/services/campaignService";
import { PolygonsClient } from "./_polygons-client";

export default async function PolygonsPage({
	params,
}: {
	params: Promise<{ experimentHash: string }>;
}) {
	const { experimentHash } = await params;
	const sb = await createClient();
	const campaign = await findCampaignByHash(experimentHash, sb);
	if (!campaign) notFound();
	return <PolygonsClient polygonNames={campaign.polygon_config?.names ?? []} />;
}
