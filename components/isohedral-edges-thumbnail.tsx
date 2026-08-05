"use client";

import { useMemo } from "react";
import { ParametricEdgesThumbnail } from "@/components/freedraw/parametric-edges-view";
import { solveIhBoard } from "@/lib/isohedral/edge-board";
import type { IhEdgeRecord } from "@/lib/isohedral/edgeDevelop";
import { ihEdgePattern } from "@/lib/isohedral/edgeShelfPattern";

// Static preview of one isohedral edge system. Drawn at the type's DEFAULT parameter point; the drawing
// itself is shared with every parametric shelf (parametric-edges-view.tsx).

export function IsohedralEdgesThumbnail({ pattern }: { pattern: IhEdgeRecord }) {
	// Shared cache with the interactive canvas, so opening a record that is already in the grid costs
	// nothing when the sliders have not moved: both ask for the same (record, default board) key.
	const built = useMemo(() => {
		const solved = solveIhBoard(pattern.ih);
		return solved.ok ? ihEdgePattern(pattern, solved.board) : null;
	}, [pattern]);

	return <ParametricEdgesThumbnail built={built} label={`Isohedral edge system ${pattern.id}`} />;
}
