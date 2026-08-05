"use client";

import { useMemo } from "react";
import { ParametricEdgesCanvas } from "@/components/freedraw/parametric-edges-view";
import { solveIhBoardFor } from "@/lib/isohedral/edge-board";
import type { IhEdgeRecord } from "@/lib/isohedral/edgeDevelop";
import { ihEdgePattern } from "@/lib/isohedral/edgeShelfPattern";
import { useConfiguration } from "@/stores/configuration";

// The isohedral edge shelf's flat view — the pentagon shelf's story with the board coming from Tactile
// instead of a bespoke closure solver, so it reaches any of the 93 types. Everything below the build is
// shared (components/freedraw/parametric-edges-view.tsx); what is this board's own is which store fields
// hold its parameters and that its tile can bow, which is the extra `bulge` subscription.
//
// The sliders live in IsohedralEdgesControls.

export function IsohedralEdgesCanvas({ pattern }: { pattern: IhEdgeRecord }) {
	const stored = useConfiguration((s) => s.ihEdgeParams);
	const bulge = useConfiguration((s) => s.ihEdgeBulge);
	const solved = useMemo(
		() => solveIhBoardFor(pattern.ih, stored, bulge),
		[pattern.ih, stored, bulge],
	);
	// The whole per-parameter cost lives here. Everything downstream — pan, zoom, spin, fill mode — reads
	// this without touching the develop again.
	const built = useMemo(
		() => (solved.ok ? ihEdgePattern(pattern, solved.board) : null),
		[pattern, solved],
	);

	return (
		<ParametricEdgesCanvas
			built={built}
			unbuildable={
				solved.ok
					? undefined
					: solved.error === "degenerate"
						? "The tile degenerates at these parameters."
						: solved.error === "unbowable"
							? "This board cannot bow: its edge class carries no direction, so a bow would be mirrored on half the edges. Straighten the sliders to draw it."
							: "This type cannot be built here."
			}
		/>
	);
}
