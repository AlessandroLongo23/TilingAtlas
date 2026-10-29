import { create } from "zustand";

// Rotation orders the reader has set on a Tegula type, per tiling id, one per cone point in
// lib/tilings/orbifoldMorph.ts `conePoints` order. Absent id ⇒ the type as catalogued. Kept for the
// session, like the edge shapes beside it (tegulaShapes.ts).
interface OrbifoldMorphState {
	byId: Record<string, number[]>;
	/** The class (conePoints index) whose row the pointer is over: every canvas marks its points. */
	hover: number | null;
	setHover: (k: number | null) => void;
	set: (id: string, orders: number[]) => void;
	reset: (id: string) => void;
}

export const useOrbifoldMorph = create<OrbifoldMorphState>()((set) => ({
	byId: {},
	hover: null,
	setHover: (hover) => set({ hover }),
	set: (id, orders) => set((s) => ({ byId: { ...s.byId, [id]: orders } })),
	reset: (id) =>
		set((s) => {
			const byId = { ...s.byId };
			delete byId[id];
			return { byId };
		}),
}));
