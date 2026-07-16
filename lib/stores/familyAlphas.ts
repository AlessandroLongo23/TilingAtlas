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
	// TARGET tuple (one per parameter α, β, …), in degrees. The slider and the Command+drag scrub both
	// write this. null ⇒ unset.
	values: number[] | null;
	// LIVE, eased render tuple that the canvas draw loops draw from. Mutated IN PLACE each frame (no
	// setState — the panel subscribes to `values`, not `live`, so no re-render). null ⇒ the draw loop
	// reseeds it from `values` this frame (mount, or a selection change via resetLive), no ease.
	live: number[] | null;
	set: (values: number[] | null) => void;
	// Force `live` back to null so it reseeds for a NEW family instead of gliding across two unrelated
	// tilings. Called on selection change; NOT on a slider/scrub tick (that would kill the smoothing).
	resetLive: () => void;
}

export const useFamilyAlphas = create<FamilyAlphasState>()((set) => ({
	values: null,
	live: null,
	set: (values) => set({ values }),
	resetLive: () => set({ live: null }),
}));
