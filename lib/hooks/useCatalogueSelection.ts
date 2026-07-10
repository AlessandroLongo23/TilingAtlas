import { useEffect, useRef, useState } from "react";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

// Selection state for the /play viewer. Seeds from the `?tiling=<canonicalKey>` URL param (how
// "Open in Play" hands a tiling off from /library) and follows *changes* to that param — but never
// re-asserts it against a later in-page pick, so the sidebar picker isn't clobbered back to the URL.
export function useCatalogueSelection(sorted: CatalogueTiling[], requestedKey: string | null) {
	const [selected, setSelected] = useState<CatalogueTiling | null>(() => {
		if (requestedKey) {
			const m = sorted.find((t) => t.canonicalKey === requestedKey);
			if (m) return m;
		}
		return sorted[0] ?? null;
	});

	// The URL key we've already applied. Seeded to the mount-time key (the initializer above already
	// honored it) so the first effect run is a no-op. We react only when `requestedKey` genuinely
	// changes — i.e. a fresh "Open in Play" navigation — not when the user picks in the sidebar
	// (which changes `selected` but not the URL). That divergence used to snap selection back.
	const appliedKeyRef = useRef<string | null>(requestedKey);

	useEffect(() => {
		if (!requestedKey || requestedKey === appliedKeyRef.current) return;
		appliedKeyRef.current = requestedKey;
		const m = sorted.find((t) => t.canonicalKey === requestedKey);
		if (m) setSelected(m);
	}, [requestedKey, sorted]);

	return { selected, setSelected };
}
