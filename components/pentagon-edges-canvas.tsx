"use client";

import { useMemo } from "react";
import { ParametricEdgesCanvas } from "@/components/freedraw/parametric-edges-view";
import { solveEdgeBoard } from "@/lib/pentagon/edge-board";
import type { PentEdgeRecord } from "@/lib/pentagon/edgeDevelop";
import { pentEdgePattern } from "@/lib/pentagon/edgeShelfPattern";
import { useConfiguration } from "@/stores/configuration";

// The parametric-pentagon edge shelf's flat view. Everything below the build — the style plumbing, the
// FreedrawCanvas, the fallback message — is shared with every other parametric board in
// components/freedraw/parametric-edges-view.tsx. What is this board's own is the two lines here: which
// store field holds its parameters, and how to solve the Kershner closure at them.
//
// The sliders themselves live in PentagonEdgesControls, which stays mounted when the conformal lens
// takes this canvas's place.

export function PentagonEdgesCanvas({ pattern }: { pattern: PentEdgeRecord }) {
	const params = useConfiguration((s) => s.pentParams);
	const solved = useMemo(() => solveEdgeBoard(params), [params]);
	// The whole per-parameter cost lives here. Everything downstream — pan, zoom, spin, fill mode — reads
	// this without touching the develop again.
	const built = useMemo(
		() => (solved.ok ? pentEdgePattern(pattern, solved.board) : null),
		[pattern, solved],
	);

	return (
		<ParametricEdgesCanvas
			built={built}
			unbuildable={solved.ok ? undefined : "Not a pentagon at these angles."}
		/>
	);
}
