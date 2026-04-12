import { create } from "zustand";

export interface HeaderState {
	title: string;
	badge: string | null;
	subtitle: string | null;
	set: (state: Partial<Omit<HeaderState, "set" | "reset">>) => void;
	reset: () => void;
}

export const useHeader = create<HeaderState>()((set) => ({
	title: "",
	badge: null,
	subtitle: null,
	set: (state) => set(state),
	reset: () => set({ title: "", badge: null, subtitle: null }),
}));
