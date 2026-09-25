import { create } from "zustand";

// The phone sheet a page's PageSidebar turns into (components/page-sidebar.tsx). One store for the
// page, because a page mounts one PageSidebar at a time: a "dock" sidebar reads `snap`, a "modal"
// sidebar reads `open`. Pages drive it from their own buttons (an info button that raises the dock, a
// "Filters" button in the header, a "Show N results" footer that closes the modal).
//
// Desktop never reads any of this: the sidebar there is the plain w-80 column.

/** Resting heights of a dock sheet: the 68px header, half the screen, or up to the top bar. */
export type SheetSnap = "peek" | "half" | "full";

interface MobileSheetState {
	/** Dock snap. `null` until a page sets one, which means "the sidebar's `defaultSnap`". */
	snap: SheetSnap | null;
	/** Whether a modal sheet is open. */
	open: boolean;
	setSnap: (snap: SheetSnap | null) => void;
	/** Tap-on-header behaviour: peek opens to half, anything taller drops back to peek. */
	toggleSnap: () => void;
	setOpen: (open: boolean) => void;
}

export const useMobileSheet = create<MobileSheetState>()((set) => ({
	snap: null,
	open: false,
	setSnap: (snap) => set({ snap }),
	toggleSnap: () => set((s) => ({ snap: (s.snap ?? "peek") === "peek" ? "half" : "peek" })),
	setOpen: (open) => set({ open }),
}));
