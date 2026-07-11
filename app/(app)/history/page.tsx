import { createClient } from "@/lib/supabase/server";
import { fetchCampaignsPage } from "@/lib/services/campaignService";
import { fetchRecentRuns } from "@/lib/services/runsService";
import { CAMPAIGNS_PER_PAGE } from "@/lib/constants";
import { LabListClient } from "./_lab-list-client";
import { RunsSection } from "@/components/run/runs-section";

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
	const [{ campaigns, total }, runs] = await Promise.all([
		fetchCampaignsPage(CAMPAIGNS_PER_PAGE, offset, sb),
		fetchRecentRuns(sb, 12),
	]);

	// Unified /lab: the live run-console (new) above the existing campaign journal (kept per the
	// keep-all-stages decision — docs/FRONTEND_LAB_PLAN.md §"Decisions locked").
	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			<RunsSection initialRuns={runs} />
			<div className="flex-1 min-h-0 flex">
				<LabListClient
					campaigns={campaigns}
					total={total}
					page={page}
					pageSize={CAMPAIGNS_PER_PAGE}
				/>
			</div>
		</div>
	);
}
