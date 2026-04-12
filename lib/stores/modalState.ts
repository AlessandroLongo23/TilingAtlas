import { create } from "zustand";

interface TilingModalState {
	isOpen: boolean;
	setOpen: (isOpen: boolean) => void;
}

export const useTilingModal = create<TilingModalState>()((set) => ({
	isOpen: false,
	setOpen: (isOpen) => set({ isOpen }),
}));

export interface TilingFilters {
	searchTerm: string;
	selectedTypes: string[];
	selectedPolygons: string[];
	selectedVertexTypes: string[];
	showDual: boolean;
	polygonFilterMode: "exact" | "include" | "exclude";
	vertexTypeFilterMode: "exact" | "include" | "exclude";
}

interface TilingFiltersState extends TilingFilters {
	set: (patch: Partial<TilingFilters>) => void;
	reset: () => void;
}

const defaultFilters: TilingFilters = {
	searchTerm: "",
	selectedTypes: [],
	selectedPolygons: [],
	selectedVertexTypes: [],
	showDual: false,
	polygonFilterMode: "exact",
	vertexTypeFilterMode: "exact",
};

export const useTilingFilters = create<TilingFiltersState>()((set) => ({
	...defaultFilters,
	set: (patch) => set(patch),
	reset: () => set(defaultFilters),
}));
