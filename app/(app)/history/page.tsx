import { createClient } from "@/lib/supabase/server";
import { fetchRecentRuns } from "@/lib/services/runsService";
import { RunsHistoryTable } from "@/components/run/runs-history-table";

export const dynamic = "force-dynamic";

// The run history: every enumeration run we've done (a read-only mirror of the local scout, public.runs),
// as one live table — traceability + performance. Per-run drill-down lives at /history/run/[id].
export default async function HistoryPage() {
	const sb = await createClient();
	const runs = await fetchRecentRuns(sb, 500);
	return (
		<div className="flex-1 min-h-0 overflow-y-auto">
			<RunsHistoryTable initialRuns={runs} />
		</div>
	);
}
