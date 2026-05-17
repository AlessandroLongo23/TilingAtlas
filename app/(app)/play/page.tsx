import { fetchAllTilings } from "@/lib/services/campaignService";
import { createClient } from "@/lib/supabase/server";
import { PlayClient } from "./_play-client";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
	let tilings: Awaited<ReturnType<typeof fetchAllTilings>> = [];
	try {
		const sb = await createClient();
		tilings = await fetchAllTilings({ requireCell: true }, sb);
	} catch (e) {
		console.error("Play: failed to load new-algorithm tilings", e);
	}
	return <PlayClient newTilings={tilings} />;
}
