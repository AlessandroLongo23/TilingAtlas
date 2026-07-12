import { create } from "zustand";

// The free-angle family slider values (one per parameter α, β, …), in degrees, for the /play parametric
// view. Deliberately its OWN store, not a field on the configuration store: dragging a slider writes here
// on every pointer move, and the configuration store has a whole-store subscriber (the sidebar's
// TilingsTab does `useConfiguration()` with no selector), so routing high-frequency slider writes through
// it would re-render the entire tiling catalogue every tick. Isolated here, the only React subscriber is
// the small ParamSliderPanel; the canvas draw loops read `getState().values` imperatively each frame.
// Persisted across tiling selections (the /play page reconciles it into each family's valid range) so the
// slider keeps its position instead of snapping back to the family default. null ⇒ unset.
interface FamilyAlphasState {
	values: number[] | null;
	set: (values: number[] | null) => void;
}

export const useFamilyAlphas = create<FamilyAlphasState>()((set) => ({
	values: null,
	set: (values) => set({ values }),
}));
