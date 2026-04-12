import { createClient } from "@/lib/supabase/server";
import { fetchCampaignsPage } from "@/lib/services/campaignService";
import { LabListClient } from "./_lab-list-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function LabListPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const params = await searchParams;
	const page = Math.max(1, parseInt(params.page ?? "1", 10));
	const offset = (page - 1) * PAGE_SIZE;
	const sb = await createClient();
	const { campaigns, total } = await fetchCampaignsPage(PAGE_SIZE, offset, sb);

	return (
		<LabListClient
			campaigns={campaigns}
			total={total}
			page={page}
			pageSize={PAGE_SIZE}
		/>
	);
}
