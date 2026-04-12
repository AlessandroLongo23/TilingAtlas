import { createClient } from "@/lib/supabase/server";
import { fetchAllTilings, type CampaignTiling } from "@/lib/services/campaignService";
import { LibraryClient } from "./_library-client";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
	const sb = await createClient();
	const tilings = await fetchAllTilings({}, sb);
	return <LibraryClient tilings={tilings as CampaignTiling[]} />;
}
