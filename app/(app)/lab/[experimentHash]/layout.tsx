import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findCampaignByHash } from "@/lib/services/campaignService";
import {
	getSeedConfigurationsManifestUrl,
	getExpandedSeedsManifestUrl,
	getTranslationalCellsManifestUrl,
} from "@/lib/services/pipelineStorage";
import { ExperimentLayoutClient } from "./_experiment-layout-client";

interface LayoutProps {
	params: Promise<{ experimentHash: string }>;
	children: React.ReactNode;
}

async function manifestTotal(url: string): Promise<number> {
	try {
		const r = await fetch(url);
		if (!r.ok) return 0;
		const j = await r.json();
		return j?.total ?? 0;
	} catch {
		return 0;
	}
}

async function sumManifestTotals(
	urlFn: (folder: string, k: number, m: number) => string,
	folder: string,
	kValues: number[],
) {
	let total = 0;
	for (const k of kValues) {
		for (let m = 1; m <= 20; m++) {
			const count = await manifestTotal(urlFn(folder, k, m));
			if (count === 0) break;
			total += count;
		}
	}
	return total;
}

export default async function ExperimentLayout({ params, children }: LayoutProps) {
	const { experimentHash } = await params;
	const sb = await createClient();
	const campaign = await findCampaignByHash(experimentHash, sb);
	if (!campaign) redirect("/lab");
	if (!campaign) notFound();

	let badgeCounts: { seeds: number; expandedSeeds: number; tilings: number } | null = null;
	if (campaign.data_source === "pipeline-storage" && campaign.params_folder) {
		const folder = campaign.params_folder;
		const kValues = campaign.k_values ?? [];
		const [seeds, expandedSeeds, tilings] = await Promise.all([
			sumManifestTotals(getSeedConfigurationsManifestUrl, folder, kValues),
			sumManifestTotals(getExpandedSeedsManifestUrl, folder, kValues),
			sumManifestTotals(getTranslationalCellsManifestUrl, folder, kValues),
		]);
		badgeCounts = { seeds, expandedSeeds, tilings };
	}

	return (
		<ExperimentLayoutClient campaign={campaign} badgeCounts={badgeCounts}>
			{children}
		</ExperimentLayoutClient>
	);
}
