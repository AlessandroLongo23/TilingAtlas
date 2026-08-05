"use client";

import { useMemo } from "react";
import { ParametricEdgesThumbnail } from "@/components/freedraw/parametric-edges-view";
import { PENT_EDGE_DEFAULTS, solveEdgeBoard } from "@/lib/pentagon/edge-board";
import type { PentEdgeRecord } from "@/lib/pentagon/edgeDevelop";
import { pentEdgePattern } from "@/lib/pentagon/edgeShelfPattern";

// Static preview of one parametric-pentagon edge system. Drawn at the board's DEFAULT parameter point;
// the drawing itself is shared with every parametric shelf (parametric-edges-view.tsx).

export function PentagonEdgesThumbnail({ pattern }: { pattern: PentEdgeRecord }) {
	// Shared cache with the interactive canvas, so opening a record that is already in the grid costs
	// nothing: both ask for the same (record, default board) key.
	const built = useMemo(() => {
		const solved = solveEdgeBoard(PENT_EDGE_DEFAULTS);
		return solved.ok ? pentEdgePattern(pattern, solved.board) : null;
	}, [pattern]);

	return <ParametricEdgesThumbnail built={built} label={`Pentagon edge system ${pattern.id}`} />;
}
