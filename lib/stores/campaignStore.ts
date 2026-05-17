import { create } from "zustand";
import {
	fetchCampaigns,
	fetchAllTilings,
	type Campaign,
	type CampaignTiling,
} from "@/lib/services/campaignService";

export interface CampaignTilingFilters {
	kValues?: number[];
	polygonNames?: string[];
	wallpaperGroup?: string;
	exhaustiveOnly?: boolean;
}

interface CampaignStoreState {
	campaigns: Campaign[];
	tilings: CampaignTiling[];
	loading: boolean;
	initialized: boolean;
	ready: boolean;

	initialize: () => Promise<void>;
	refresh: () => Promise<void>;
	filterTilings: (filters?: CampaignTilingFilters) => CampaignTiling[];
}

export const useCampaignStore = create<CampaignStoreState>()((set, get) => ({
	campaigns: [],
	tilings: [],
	loading: false,
	initialized: false,
	ready: false,

	async initialize() {
		if (get().initialized) return;
		set({ loading: true });
		try {
			const [campaigns, tilings] = await Promise.all([
				fetchCampaigns(),
				fetchAllTilings(),
			]);
			set({ campaigns, tilings, initialized: true, ready: true });
		} catch (err) {
			console.error("Error initializing campaign store:", err);
		} finally {
			set({ loading: false });
		}
	},

	async refresh() {
		set({ loading: true });
		try {
			const [campaigns, tilings] = await Promise.all([
				fetchCampaigns(),
				fetchAllTilings(),
			]);
			set({ campaigns, tilings });
		} catch (err) {
			console.error("Error refreshing campaign store:", err);
		} finally {
			set({ loading: false });
		}
	},

	filterTilings(filters: CampaignTilingFilters = {}) {
		const { campaigns, tilings } = get();
		return tilings.filter((t) => {
			if (filters.kValues && filters.kValues.length > 0 && !filters.kValues.includes(t.k)) return false;
			if (filters.polygonNames && filters.polygonNames.length > 0) {
				const hasAll = filters.polygonNames.every((name) => t.polygon_names.includes(name));
				if (!hasAll) return false;
			}
			if (filters.wallpaperGroup && t.wallpaper_group !== filters.wallpaperGroup) return false;
			if (filters.exhaustiveOnly) {
				const campaign = campaigns.find((c) => c.id === t.campaign_id);
				if (!campaign?.is_exhaustive) return false;
			}
			return true;
		});
	},
}));

export const campaignStore = {
	get campaigns() { return useCampaignStore.getState().campaigns; },
	get tilings() { return useCampaignStore.getState().tilings; },
	get loading() { return useCampaignStore.getState().loading; },
	get initialized() { return useCampaignStore.getState().initialized; },
	initialize: () => useCampaignStore.getState().initialize(),
	refresh: () => useCampaignStore.getState().refresh(),
	filterTilings: (f?: CampaignTilingFilters) => useCampaignStore.getState().filterTilings(f),
};
