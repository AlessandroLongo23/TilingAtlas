import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/services/getCampaign";
import { PolygonsClient } from "./_polygons-client";

export default async function PolygonsPage({
	params,
}: {
	params: Promise<{ experimentHash: string }>;
}) {
	const { experimentHash } = await params;
	const campaign = await getCampaign(experimentHash);
	if (!campaign) notFound();
	return <PolygonsClient polygonNames={campaign.polygon_config?.names ?? []} />;
}
