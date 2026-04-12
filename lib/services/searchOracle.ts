/**
 * Search Oracle — answers "has this polygon set / k-range already been searched?"
 *
 * Keeps the coverage query client-side (superset check over completed campaigns)
 * to avoid PostgREST JSONB edge cases. Performant at small campaign table sizes.
 */

import { supabase } from "@/lib/supabase/client";
import { findCampaignByHash, type Campaign } from "./campaignService";
import { computeExperimentHash } from "@/utils/experimentHash";

export type OracleStatus = "Full" | "Partial" | "Unknown";

export interface OracleResult {
	status: OracleStatus;
	/** unique_hash of the covering campaign — use to build /lab/[hash]/tilings link */
	coveringHash?: string;
	coveringCampaignId?: string;
	partialCampaignIds?: string[];
}

/**
 * Query the search oracle to determine coverage status.
 *
 * Fast path: look up by deterministic hash first (single index scan).
 * Fallback: client-side superset scan for Partial coverage.
 */
export async function querySearchOracle(
	selectedPolygonNames: string[],
	requestedKValues: number[]
): Promise<OracleResult> {
	if (!supabase || selectedPolygonNames.length === 0 || requestedKValues.length === 0) {
		return { status: "Unknown" };
	}

	try {
		const hash = await computeExperimentHash(selectedPolygonNames, requestedKValues, true);
		const exact = await findCampaignByHash(hash);
		if (exact && exact.status === "completed") {
			return { status: "Full", coveringHash: hash, coveringCampaignId: exact.id };
		}
		if (exact && exact.status === "running") {
			return { status: "Partial", coveringHash: hash, coveringCampaignId: exact.id };
		}
	} catch {
		// fall through
	}

	const maxK = Math.max(...requestedKValues);

	const { data, error } = await supabase
		.from("search_campaigns")
		.select("id, unique_hash, polygon_config, k_values, k_limit, is_exhaustive")
		.eq("status", "completed")
		.gte("k_limit", maxK);

	if (error || !data) {
		console.error("querySearchOracle error:", error);
		return { status: "Unknown" };
	}

	const campaigns = data as Pick<
		Campaign,
		"id" | "unique_hash" | "polygon_config" | "k_values" | "k_limit" | "is_exhaustive"
	>[];

	const matching = campaigns.filter((c) => {
		const campaignNames: string[] = c.polygon_config?.names ?? [];
		return selectedPolygonNames.every((name) => campaignNames.includes(name));
	});

	if (matching.length === 0) {
		return { status: "Unknown" };
	}

	const exhaustive = matching.find((c) => c.is_exhaustive);
	if (exhaustive) {
		return {
			status: "Full",
			coveringHash: exhaustive.unique_hash ?? undefined,
			coveringCampaignId: exhaustive.id,
		};
	}

	return {
		status: "Partial",
		partialCampaignIds: matching.map((c) => c.id),
	};
}
