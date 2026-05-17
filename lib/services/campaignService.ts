/**
 * Campaign service — CRUD operations for search_campaigns and the new tilings table.
 *
 * Browser reads: uses the anon supabase client (imported from lib/supabase/client).
 * Server writes: callers (route handlers, RSCs) pass their own service-role client via the
 * optional `client` parameter so this module stays isomorphic.
 */

import { supabase as browserClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BATCH_SIZE } from "@/lib/constants";
import type { GeneratorParameters } from "@/classes";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PolygonConfig {
	parameters: GeneratorParameters;
	names: string[];
}

export interface NewCampaign {
	polygonConfig: PolygonConfig;
	kValues: number[];
	kLimit: number;
	isExhaustive: boolean;
	uniqueHash?: string;
	authorName?: string;
	dataSource?: "worker" | "pipeline-storage";
	paramsFolder?: string;
}

export interface NewTiling {
	campaign_id: string;
	k: number;
	m: number;
	encoded_tiling: Record<string, unknown>;
	translational_cell: Record<string, unknown> | null;
	polygon_names: string[];
	wallpaper_group: string | null;
	is_regular: boolean;
	is_star: boolean;
}

export interface Campaign {
	id: string;
	polygon_config: PolygonConfig;
	k_values: number[];
	k_limit: number;
	is_exhaustive: boolean;
	status: "pending" | "running" | "completed" | "failed";
	created_at: string;
	completed_at: string | null;
	tiling_count: number;
	unique_hash: string | null;
	author_name: string | null;
	completed_steps: string[];
	data_source: "worker" | "pipeline-storage";
	params_folder: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClient(client?: SupabaseClient): SupabaseClient {
	const c = client ?? browserClient;
	if (!c) throw new Error("Supabase client not available");
	return c;
}

// ─── Campaign operations ──────────────────────────────────────────────────────

export async function createCampaign(
	config: NewCampaign,
	client?: SupabaseClient
): Promise<{ id: string } | { error: string }> {
	const sb = getClient(client);

	const { data, error } = await sb
		.from("search_campaigns")
		.insert({
			polygon_config: config.polygonConfig,
			k_values: config.kValues,
			k_limit: config.kLimit,
			is_exhaustive: config.isExhaustive,
			status: "pending",
			unique_hash: config.uniqueHash ?? null,
			author_name: config.authorName ?? null,
			data_source: config.dataSource ?? "worker",
			params_folder: config.paramsFolder ?? null,
		})
		.select("id")
		.single();

	if (error) {
		console.error("createCampaign error:", error);
		return { error: error.message };
	}

	return { id: data.id };
}

export async function findCampaignByHash(
	hash: string,
	client?: SupabaseClient
): Promise<Campaign | null> {
	const sb = getClient(client);

	const { data, error } = await sb
		.from("search_campaigns")
		.select("*")
		.eq("unique_hash", hash)
		.maybeSingle();

	if (error) {
		console.error("findCampaignByHash error:", error);
		return null;
	}

	return data as Campaign | null;
}

export async function updateCampaignStatus(
	id: string,
	status: "running" | "completed" | "failed",
	completedAt?: Date,
	client?: SupabaseClient
): Promise<void> {
	const sb = getClient(client);

	const update: Record<string, unknown> = { status };
	if (completedAt) {
		update.completed_at = completedAt.toISOString();
	}

	const { error } = await sb
		.from("search_campaigns")
		.update(update)
		.eq("id", id);

	if (error) {
		console.error("updateCampaignStatus error:", error);
	}
}

export async function updateCompletedSteps(
	id: string,
	steps: string[],
	client?: SupabaseClient
): Promise<void> {
	const sb = getClient(client);

	const { error } = await sb
		.from("search_campaigns")
		.update({ completed_steps: steps })
		.eq("id", id);

	if (error) {
		console.error("updateCompletedSteps error:", error);
	}
}

export async function updateCampaignTilingCount(
	id: string,
	count: number,
	client?: SupabaseClient
): Promise<void> {
	const sb = getClient(client);

	const { error } = await sb
		.from("search_campaigns")
		.update({ tiling_count: count })
		.eq("id", id);

	if (error) {
		console.error("updateCampaignTilingCount error:", error);
	}
}

export async function fetchCampaigns(client?: SupabaseClient): Promise<Campaign[]> {
	const sb = getClient(client);

	const { data, error } = await sb
		.from("search_campaigns")
		.select("*")
		.order("created_at", { ascending: false });

	if (error) {
		console.error("fetchCampaigns error:", error);
		return [];
	}

	return (data ?? []) as Campaign[];
}

export async function fetchCampaignsPage(
	limit: number,
	offset: number,
	client?: SupabaseClient
): Promise<{ campaigns: Campaign[]; total: number }> {
	const sb = getClient(client);

	const { data, error, count } = await sb
		.from("search_campaigns")
		.select("*", { count: "exact" })
		.order("data_source", { ascending: false })
		.order("created_at", { ascending: false })
		.range(offset, offset + limit - 1);

	if (error) {
		console.error("fetchCampaignsPage error:", error);
		return { campaigns: [], total: 0 };
	}

	return { campaigns: (data ?? []) as Campaign[], total: count ?? 0 };
}

// ─── Tiling operations ────────────────────────────────────────────────────────

export interface CampaignTiling {
	id: string;
	campaign_id: string;
	k: number;
	m: number;
	encoded_tiling: Record<string, unknown>;
	translational_cell: Record<string, unknown> | null;
	polygon_names: string[];
	wallpaper_group: string | null;
	is_regular: boolean;
	is_star: boolean;
	image_url: string | null;
	created_at: string;
}

export async function insertTilings(
	tilings: NewTiling[],
	client?: SupabaseClient
): Promise<{ inserted: number; error?: string }> {
	if (tilings.length === 0) return { inserted: 0 };

	const sb = getClient(client);
	let inserted = 0;

	for (let i = 0; i < tilings.length; i += BATCH_SIZE) {
		const batch = tilings.slice(i, i + BATCH_SIZE);

		const { error } = await sb.from("tilings").insert(batch);

		if (error) {
			console.error("insertTilings batch error:", error);
			return { inserted, error: error.message };
		}

		inserted += batch.length;
	}

	return { inserted };
}

export async function fetchTilingsForCampaign(
	campaignId: string,
	client?: SupabaseClient
): Promise<CampaignTiling[]> {
	const sb = getClient(client);

	const { data, error } = await sb
		.from("tilings")
		.select("*")
		.eq("campaign_id", campaignId)
		.order("k", { ascending: true })
		.order("m", { ascending: true });

	if (error) {
		console.error("fetchTilingsForCampaign error:", error);
		return [];
	}

	return (data ?? []) as CampaignTiling[];
}

export async function fetchAllTilings(
	filters: {
		kValues?: number[];
		polygonNames?: string[];
		wallpaperGroup?: string;
		exhaustiveOnly?: boolean;
		requireCell?: boolean;
	} = {},
	client?: SupabaseClient
): Promise<CampaignTiling[]> {
	const sb = getClient(client);

	let query = sb
		.from("tilings")
		.select("*, campaign:search_campaigns(id, is_exhaustive)")
		.order("k", { ascending: true })
		.order("m", { ascending: true });

	if (filters.kValues && filters.kValues.length > 0) {
		query = query.in("k", filters.kValues);
	}

	if (filters.polygonNames && filters.polygonNames.length > 0) {
		query = query.contains("polygon_names", filters.polygonNames);
	}

	if (filters.wallpaperGroup) {
		query = query.eq("wallpaper_group", filters.wallpaperGroup);
	}

	if (filters.requireCell) {
		query = query.not("translational_cell", "is", null);
	}

	const { data, error } = await query;

	if (error) {
		console.error("fetchAllTilings error:", error);
		return [];
	}

	let results = (data ?? []) as (CampaignTiling & { campaign: Campaign })[];

	if (filters.exhaustiveOnly) {
		results = results.filter((t) => t.campaign?.is_exhaustive);
	}

	return results;
}

/**
 * Fetch a single random `translational_cell` blob without scanning the whole
 * table. Two cheap queries: COUNT(*) then a one-row range at a random offset.
 * Used by the landing page background, which only needs one cell.
 */
export async function fetchRandomTilingCell(
	client?: SupabaseClient
): Promise<Record<string, unknown> | null> {
	const sb = getClient(client);

	const { count, error: countError } = await sb
		.from("tilings")
		.select("id", { count: "exact", head: true })
		.not("translational_cell", "is", null);

	if (countError || !count) {
		if (countError) console.error("fetchRandomTilingCell count error:", countError);
		return null;
	}

	const offset = Math.floor(Math.random() * count);
	const { data, error } = await sb
		.from("tilings")
		.select("translational_cell")
		.not("translational_cell", "is", null)
		.range(offset, offset);

	if (error) {
		console.error("fetchRandomTilingCell error:", error);
		return null;
	}

	const row = data?.[0] as { translational_cell: Record<string, unknown> | null } | undefined;
	return row?.translational_cell ?? null;
}
