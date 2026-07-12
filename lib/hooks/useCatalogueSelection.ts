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

	// The URL key we've actually SATISFIED (found in `sorted` and selected). Seeded to the mount-time key
	// ONLY if it was present at mount — if the initializer fell back to sorted[0] because the key wasn't
	// loaded yet (a lazy k≥8 / composable shard still fetching), we leave this null so the effect keeps
	// retrying as `sorted` grows. Once satisfied, we never re-assert it against a later in-page pick
	// (which changes `selected` but not the URL) — that divergence used to snap selection back.
	const appliedKeyRef = useRef<string | null>(
		requestedKey && sorted.some((t) => t.canonicalKey === requestedKey) ? requestedKey : null,
	);

	useEffect(() => {
		if (!requestedKey || requestedKey === appliedKeyRef.current) return;
		const m = sorted.find((t) => t.canonicalKey === requestedKey);
		if (m) {
			appliedKeyRef.current = requestedKey;
			setSelected(m);
		}
	}, [requestedKey, sorted]);

	return { selected, setSelected };
}
