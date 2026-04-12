/**
 * Legacy tiling store — pulls classic tilings + groups + image map from Supabase.
 * Ported from the SvelteKit $state/writable hybrid to a Zustand store.
 *
 * Note: prefer TanStack Query for fresh reads in Phase 5. This store is kept to mirror
 * the legacy API surface consumed by existing components until they're rewritten.
 */

import { create } from "zustand";
import { supabase } from "@/lib/supabase/client";
import { listTilingImagesFromStorage } from "@/lib/services/tilingStorageList";

export interface LegacyTiling {
	original_id: number;
	name: string;
	rulestring: string;
	cr_notation: string;
	group_id: string;
	dual_name: string;
	is_regular: boolean;
	is_semiregular: boolean;
	is_star: boolean;
	is_concave: boolean;
	alternatives: string[];
	image_url: string;
	dual_image_url: string;
}

export interface LegacyTilingGroup {
	id: string;
	title: string;
	k: number;
	m: number;
	has_dual: boolean;
	is_concave: boolean;
}

export interface FilterOptions {
	isRegular?: boolean;
	isSemiregular?: boolean;
	isStar?: boolean;
	isConcave?: boolean;
	groupId?: string;
}

interface LegacyTilingStoreState {
	groups: LegacyTilingGroup[];
	tilings: LegacyTiling[];
	storageImageMap: Map<string, { standard: string; dual: string }>;
	loading: boolean;
	error: string | null;
	initialized: boolean;
	ready: boolean;
	tilingsUpdatedAt: number;

	initialize: () => Promise<void>;
	refresh: () => Promise<void>;
	getTilingByRulestring: (rulestring: string) => LegacyTiling | undefined;
	getTilingsByGroup: (groupId: string) => LegacyTiling[];
	filterTilings: (filters?: FilterOptions) => LegacyTiling[];
	tilingRules: () => ReturnType<typeof buildLegacyFormat>;
}

function buildLegacyFormat(
	groups: LegacyTilingGroup[],
	tilings: LegacyTiling[],
	storageImageMap: Map<string, { standard: string; dual: string }>,
	tilingsUpdatedAt: number,
) {
	const groupMap = new Map<string, ReturnType<typeof mkGroup>>();
	function mkGroup(g: LegacyTilingGroup) {
		return { title: g.title, id: g.id, dual: g.has_dual, rules: [] as unknown[] };
	}
	for (const g of groups) groupMap.set(g.id, mkGroup(g));
	for (const t of tilings) {
		const g = groupMap.get(t.group_id);
		if (!g) continue;
		const key = `${t.group_id}:${t.rulestring}`;
		const imgs = storageImageMap.get(key);
		const imageUrl = imgs?.standard || t.image_url;
		const dualImageUrl = imgs?.dual || t.dual_image_url;
		g.rules.push({
			id: t.original_id,
			name: t.name,
			cr: t.cr_notation,
			rulestring: t.rulestring,
			dualname: t.dual_name,
			alternatives: t.alternatives,
			imageUrl: imageUrl ? `${imageUrl}?t=${tilingsUpdatedAt}` : imageUrl,
			dualImageUrl: dualImageUrl ? `${dualImageUrl}?t=${tilingsUpdatedAt}` : dualImageUrl,
			isRegular: t.is_regular,
			isSemiregular: t.is_semiregular,
			isStar: t.is_star,
			isConcave: t.is_concave,
		});
	}
	return [...groupMap.values()].filter((g) => g.rules.length > 0);
}

async function fetchGroups(): Promise<LegacyTilingGroup[]> {
	if (!supabase) return [];
	const { data, error } = await supabase
		.from("legacy_tiling_groups")
		.select("*")
		.order("display_order", { ascending: true });
	if (error) {
		console.error("Error fetching tiling groups:", error);
		return [];
	}
	return (data ?? []) as LegacyTilingGroup[];
}

async function fetchTilings(): Promise<LegacyTiling[]> {
	if (!supabase) return [];
	const { data, error } = await supabase
		.from("legacy_tilings")
		.select(`
			*,
			group:legacy_tiling_groups (
				id, title, k, m, has_dual, is_concave
			)
		`)
		.order("original_id", { ascending: true });
	if (error) {
		console.error("Error fetching tilings:", error);
		return [];
	}
	return (data ?? []) as LegacyTiling[];
}

export const useLegacyTilingStore = create<LegacyTilingStoreState>()((set, get) => ({
	groups: [],
	tilings: [],
	storageImageMap: new Map(),
	loading: false,
	error: null,
	initialized: false,
	ready: false,
	tilingsUpdatedAt: Date.now(),

	async initialize() {
		if (get().initialized || !supabase) return;
		set({ loading: true, error: null });
		try {
			const [groupsData, tilingsData, imageMap] = await Promise.all([
				fetchGroups(),
				fetchTilings(),
				listTilingImagesFromStorage(),
			]);
			set({
				groups: groupsData,
				tilings: tilingsData,
				storageImageMap: imageMap,
				initialized: true,
				ready: true,
			});
		} catch (err) {
			console.error("Error initializing tiling store:", err);
			set({ error: err instanceof Error ? err.message : "unknown" });
		} finally {
			set({ loading: false });
		}
	},

	async refresh() {
		set({ loading: true });
		try {
			const [groupsData, tilingsData, imageMap] = await Promise.all([
				fetchGroups(),
				fetchTilings(),
				listTilingImagesFromStorage(),
			]);
			set({
				groups: groupsData,
				tilings: tilingsData,
				storageImageMap: imageMap,
				tilingsUpdatedAt: Date.now(),
			});
		} catch (err) {
			console.error("Error refreshing tiling store:", err);
		} finally {
			set({ loading: false });
		}
	},

	getTilingByRulestring(rulestring) {
		return get().tilings.find((t) => t.rulestring === rulestring);
	},
	getTilingsByGroup(groupId) {
		return get().tilings.filter((t) => t.group_id === groupId);
	},
	filterTilings(filters: FilterOptions = {}) {
		return get().tilings.filter((t) => {
			if (filters.isRegular !== undefined && t.is_regular !== filters.isRegular) return false;
			if (filters.isSemiregular !== undefined && t.is_semiregular !== filters.isSemiregular) return false;
			if (filters.isStar !== undefined && t.is_star !== filters.isStar) return false;
			if (filters.isConcave !== undefined && t.is_concave !== filters.isConcave) return false;
			if (filters.groupId && t.group_id !== filters.groupId) return false;
			return true;
		});
	},
	tilingRules() {
		const { groups, tilings, storageImageMap, tilingsUpdatedAt } = get();
		return buildLegacyFormat(groups, tilings, storageImageMap, tilingsUpdatedAt);
	},
}));

/** Back-compat alias — source exported `tilingStore` as the facade. */
export const tilingStore = {
	get groups() { return useLegacyTilingStore.getState().groups; },
	get tilings() { return useLegacyTilingStore.getState().tilings; },
	get loading() { return useLegacyTilingStore.getState().loading; },
	get error() { return useLegacyTilingStore.getState().error; },
	get initialized() { return useLegacyTilingStore.getState().initialized; },
	get tilingsUpdatedAt() { return useLegacyTilingStore.getState().tilingsUpdatedAt; },
	get tilingRules() { return useLegacyTilingStore.getState().tilingRules(); },
	initialize: () => useLegacyTilingStore.getState().initialize(),
	refresh: () => useLegacyTilingStore.getState().refresh(),
	getTilingByRulestring: (r: string) => useLegacyTilingStore.getState().getTilingByRulestring(r),
	getTilingsByGroup: (g: string) => useLegacyTilingStore.getState().getTilingsByGroup(g),
	filterTilings: (f?: FilterOptions) => useLegacyTilingStore.getState().filterTilings(f),
};

export function getTilingRules() {
	return useLegacyTilingStore.getState().tilingRules();
}
