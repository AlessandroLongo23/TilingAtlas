import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/services/getCampaign";
import { ExpandedSeedsClient } from "./_expanded-seeds-client";

export default async function ExpandedSeedsPage({
	params,
}: {
	params: Promise<{ experimentHash: string }>;
}) {
	const { experimentHash } = await params;
	const campaign = await getCampaign(experimentHash);
	if (!campaign) notFound();
	return (
		<ExpandedSeedsClient
			polygonNames={campaign.polygon_config?.names ?? []}
			kValues={campaign.k_values ?? []}
		/>
	);
}
