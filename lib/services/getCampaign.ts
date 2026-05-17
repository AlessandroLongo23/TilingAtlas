import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { findCampaignByHash, type Campaign } from "./campaignService";

export const getCampaign = cache(async (hash: string): Promise<Campaign | null> => {
	const sb = await createClient();
	return findCampaignByHash(hash, sb);
});
