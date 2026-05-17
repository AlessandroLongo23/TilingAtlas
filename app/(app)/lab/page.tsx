import { createClient } from "@/lib/supabase/server";
import { fetchCampaignsPage } from "@/lib/services/campaignService";
import { CAMPAIGNS_PER_PAGE } from "@/lib/constants";
import { LabListClient } from "./_lab-list-client";

export const dynamic = "force-dynamic";

export default async function LabListPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const params = await searchParams;
	const page = Math.max(1, parseInt(params.page ?? "1", 10));
	const offset = (page - 1) * CAMPAIGNS_PER_PAGE;
	const sb = await createClient();
	const { campaigns, total } = await fetchCampaignsPage(CAMPAIGNS_PER_PAGE, offset, sb);

	return (
		<LabListClient
			campaigns={campaigns}
			total={total}
			page={page}
			pageSize={CAMPAIGNS_PER_PAGE}
		/>
	);
}
