import { create } from "zustand";
import { CURRENT_VERSION } from "@/lib/updates/entries";
import { getLastSeenUpdate, setLastSeenUpdate } from "@/lib/updates/lastSeen";

// "What's new" state, shared by the gate that decides whether to open the modal (components/
// updates/updates-gate.tsx) and the nav button that lights a dot and opens it on click
// (components/nav.tsx). Same shape as screenshotPreview: plain create(), no middleware.
//
// `lastSeen` starts undefined, not null, because null already means "first visit". Nothing
// reads localStorage until init() runs on the client — reading during render would make the server
// and client markup disagree, and the dot would flash on every hydration.

interface UpdatesState {
	/** undefined until init() has run; null = a genuine first visit. */
	lastSeen: string | null | undefined;
	isOpen: boolean;
	/** Client-only. Reads the marker; on a first visit writes the current version and shows nothing. */
	init: () => void;
	open: () => void;
	/** Closing is what marks the news as read — an accidental open must not swallow it. */
	close: () => void;
}

export const useUpdates = create<UpdatesState>()((set, get) => ({
	lastSeen: undefined,
	isOpen: false,
	init: () => {
		if (get().lastSeen !== undefined) return; // already initialised this page load
		const stored = getLastSeenUpdate();
		if (stored === null) {
			// First visit: mark current and stay quiet. Keep the state at the current version so the
			// dot is dark and the modal has nothing to show.
			setLastSeenUpdate(CURRENT_VERSION);
			set({ lastSeen: CURRENT_VERSION });
			return;
		}
		set({ lastSeen: stored });
	},
	open: () => set({ isOpen: true }),
	close: () => {
		setLastSeenUpdate(CURRENT_VERSION);
		set({ isOpen: false, lastSeen: CURRENT_VERSION });
	},
}));
