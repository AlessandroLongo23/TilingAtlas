import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/services/getCampaign";
import { VCsClient } from "./_vcs-client";

export default async function VCsPage({
	params,
}: {
	params: Promise<{ experimentHash: string }>;
}) {
	const { experimentHash } = await params;
	const campaign = await getCampaign(experimentHash);
	if (!campaign) notFound();
	return <VCsClient polygonNames={campaign.polygon_config?.names ?? []} />;
}
