import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/services/getCampaign";
import { SeedsClient } from "./_seeds-client";

export default async function SeedsPage({
	params,
}: {
	params: Promise<{ experimentHash: string }>;
}) {
	const { experimentHash } = await params;
	const campaign = await getCampaign(experimentHash);
	if (!campaign) notFound();
	return (
		<SeedsClient
			polygonNames={campaign.polygon_config?.names ?? []}
			kValues={campaign.k_values ?? []}
		/>
	);
}
