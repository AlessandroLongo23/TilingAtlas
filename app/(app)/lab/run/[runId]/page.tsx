import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRun, fetchRunSeeds, fetchFoundTilings } from "@/lib/services/runsService";
import { RunView } from "@/components/run/run-view";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
	const { runId } = await params;
	const sb = await createClient();
	const run = await fetchRun(sb, runId);
	if (!run) notFound();
	const [seeds, tilings] = await Promise.all([fetchRunSeeds(sb, runId), fetchFoundTilings(sb, runId)]);
	return <RunView runId={runId} initialRun={run} initialSeeds={seeds} initialTilings={tilings} />;
}
