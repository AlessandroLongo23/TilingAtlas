"use client";

import { useCallback, useMemo } from "react";
import { FreedrawCanvas } from "@/components/freedraw/freedraw-canvas";
import { solveEdgeBoard } from "@/lib/pentagon/edge-board";
import type { PentEdgeRecord } from "@/lib/pentagon/edgeDevelop";
import { pentEdgePattern } from "@/lib/pentagon/edgeShelfPattern";
import { useConfiguration } from "@/stores/configuration";

// The parametric-pentagon edge shelf's flat view: the SAME record redrawn at whatever point of the
// family the sliders name. Nothing about the record changes as they move — it ships no geometry at all —
// so what the sliders demonstrate is precisely the shelf's claim, that the decoration is a combinatorial
// object and the pentagon is a parameter. The sliders themselves live in PentagonEdgesControls, which
// stays mounted when the conformal lens takes this canvas's place.
//
// The drawing is FreedrawCanvas, the same renderer every other Euclidean edge system uses: the patch
// built at the current parameter point is a period, and that canvas stamps a period across the view, so
// panning and zooming cost nothing and the figure never runs out. What is expensive is rebuilding the
// patch, which happens once per parameter change and not once per frame.

export function PentagonEdgesCanvas({ pattern }: { pattern: PentEdgeRecord }) {
	const params = useConfiguration((s) => s.pentParams);

	// The freedraw controls in the Options tab drive this view too — one store field per control, so the
	// keyboard shortcuts and the `lw`/`rot` URL params already work here without a second code path.
	const fillMode = useConfiguration((s) => s.freedrawFill);
	const showScaffold = useConfiguration((s) => s.freedrawScaffold);
	const showVertices = useConfiguration((s) => s.freedrawVertices);
	const showLattice = useConfiguration((s) => s.freedrawLattice);
	const lineWidth = useConfiguration((s) => s.lineWidth);
	const rotation = useConfiguration((s) => s.rotation);
	const setRotation = useCallback((deg: number) => useConfiguration.getState().set({ rotation: deg }), []);

	const style = useMemo(
		() => ({ fillMode, showScaffold, showVertices, showLattice, lineWidth }),
		[fillMode, showScaffold, showVertices, showLattice, lineWidth],
	);

	const solved = useMemo(() => solveEdgeBoard(params), [params]);
	// The whole per-parameter cost lives here. Everything downstream — pan, zoom, spin, fill mode — reads
	// this without touching the develop again.
	const built = useMemo(
		() => (solved.ok ? pentEdgePattern(pattern, solved.board) : null),
		[pattern, solved],
	);

	if (!built?.pattern) {
		return (
			<div className="flex h-full w-full items-center justify-center px-8 text-center text-xs text-fg-muted">
				{solved.ok
					? `No period could be built here — ${built?.reason ?? "the develop found none"}.`
					: "Not a pentagon at these angles."}
			</div>
		);
	}

	return (
		<FreedrawCanvas
			pattern={built.pattern}
			style={style}
			// Sized from the period, not fixed: the cell's world size swings by an order of magnitude across
			// the family, and a constant here would fill the screen at one end and vanish at the other.
			cells={built.cells}
			interactive
			rotation={rotation}
			onRotationChange={setRotation}
		/>
	);
}
