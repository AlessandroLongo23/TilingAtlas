"use client";

import { useEffect, useState } from "react";
import { Archive, X } from "lucide-react";

const KEY = "legacyStageBannerDismissed";

/**
 * Banner on the kept expander-era stage pages (TA note 3, docs/FRONTEND_LAB_PLAN.md §4). These pages
 * describe the superseded expand-and-extract pipeline, NOT the live solve-for-period algorithm that
 * produces the certified counts. Unlabeled they reopen the thesis↔artifact divergence in the UI.
 * Dismiss persists in localStorage (set after mount → no SSR/hydration mismatch).
 */
export function LegacyStageBanner() {
	const [dismissed, setDismissed] = useState(false);
	useEffect(() => {
		if (localStorage.getItem(KEY) === "1") setDismissed(true);
	}, []);
	if (dismissed) return null;
	return (
		<div className="shrink-0 flex items-center gap-2 px-6 py-1.5 bg-yellow-400/5 border-b border-yellow-500/20 text-[11px] text-yellow-500">
			<Archive size={12} className="shrink-0" />
			<span className="min-w-0">
				These stages describe the <strong>superseded expand-and-extract</strong> pipeline, not the live
				solve-for-period algorithm. The certified counts come from the scout — see <strong>Live runs</strong> on{" "}
				<code className="font-mono">/lab</code>. Kept for reference; to be re-mapped onto the live algorithm.
			</span>
			<button
				onClick={() => {
					setDismissed(true);
					localStorage.setItem(KEY, "1");
				}}
				className="ml-auto shrink-0 text-yellow-500/70 hover:text-yellow-400 transition-colors"
				aria-label="Dismiss"
			>
				<X size={13} />
			</button>
		</div>
	);
}
