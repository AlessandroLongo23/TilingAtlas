import { create } from "zustand";

// Immersive (fullscreen-canvas) mode for /play: hides the app chrome (the header Nav + the sidebar) so
// the tiling canvas fills the whole app window. Its own tiny store because both the global Nav and the
// play page read it, and layout state has no business on the configuration store (which a whole-store
// subscriber, TilingsTab, re-renders on). The play page resets it to false on unmount so navigating away
// can never strand a hidden header on another route.
interface ImmersiveState {
	immersive: boolean;
	set: (immersive: boolean) => void;
	toggle: () => void;
}

export const useImmersive = create<ImmersiveState>()((set) => ({
	immersive: false,
	set: (immersive) => set({ immersive }),
	toggle: () => set((s) => ({ immersive: !s.immersive })),
}));
