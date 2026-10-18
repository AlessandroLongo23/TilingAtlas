import { create } from "zustand";

// Edge shapes the reader has dragged on the Tegula shelf, per tiling id: one handle [x, y] per edge
// class (lib/tilings/tegula.ts). Its own store for the reason familyAlphas has one: a drag writes on
// every pointer move. Absent id ⇒ the type's shipped default. Kept for the session, so coming back to a
// type finds it as it was left.
interface TegulaShapesState {
	byId: Record<string, number[][]>;
	set: (id: string, shape: number[][]) => void;
	reset: (id: string) => void;
}

export const useTegulaShapes = create<TegulaShapesState>()((set) => ({
	byId: {},
	set: (id, shape) => set((s) => ({ byId: { ...s.byId, [id]: shape } })),
	reset: (id) =>
		set((s) => {
			const byId = { ...s.byId };
			delete byId[id];
			return { byId };
		}),
}));
