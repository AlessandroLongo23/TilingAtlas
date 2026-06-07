import { createClient } from "@/lib/supabase/server";
import { fetchCatalogue, type CatalogueTiling } from "@/lib/services/catalogueService";
import { PlayClient } from "./_play-client";

export const dynamic = "force-dynamic";

// /play is a read-only VIEWER over the certified-results catalogue (open a tiling from /library via
// ?tiling=<canonical_key>). The rulestring playground + legacy_tilings browse were retired
// (FRONTEND_ROADMAP.md Phase 3); it no longer reads the legacy `tilings` table.
export default async function PlayPage() {
	let tilings: CatalogueTiling[] = [];
	try {
		const sb = await createClient();
		tilings = await fetchCatalogue(sb);
	} catch (e) {
		console.error("Play: failed to load the certified catalogue", e);
	}
	return <PlayClient tilings={tilings} />;
}
