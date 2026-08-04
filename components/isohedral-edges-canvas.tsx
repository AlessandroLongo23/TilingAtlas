"use client";

import { useCallback, useMemo } from "react";
import { FreedrawCanvas } from "@/components/freedraw/freedraw-canvas";
import { solveIhBoardFor } from "@/lib/isohedral/edge-board";
import type { IhEdgeRecord } from "@/lib/isohedral/edgeDevelop";
import { ihEdgePattern } from "@/lib/isohedral/edgeShelfPattern";
import { useConfiguration } from "@/stores/configuration";

// The isohedral edge shelf's flat view: the SAME record redrawn at whatever point of the isohedral
// type's family the sliders name. Nothing about the record changes as they move — it ships no geometry
// at all — so what the sliders demonstrate is precisely the shelf's claim, that the decoration is a
// combinatorial object and the tile is a parameter. The sliders live in IsohedralEdgesControls.
//
// The drawing is FreedrawCanvas, the same renderer every other Euclidean edge system uses: the patch
// built at the current parameter point is a period, and that canvas stamps a period across the view, so
// panning and zooming cost nothing and the figure never runs out. What is expensive is rebuilding the
// patch, which happens once per parameter change and not once per frame.

export function IsohedralEdgesCanvas({ pattern }: { pattern: IhEdgeRecord }) {
	const stored = useConfiguration((s) => s.ihEdgeParams);
	const bulge = useConfiguration((s) => s.ihEdgeBulge);

	// The freedraw controls in the Options tab drive this view too — one store field per control, so the
	// keyboard shortcuts and the `lw`/`rot` URL params already work here without a second code path.
	const fillMode = useConfiguration((s) => s.freedrawFill);
	const showScaffold = useConfiguration((s) => s.freedrawScaffold);
	const showVertices = useConfiguration((s) => s.freedrawVertices);
	const showLattice = useConfiguration((s) => s.freedrawLattice);
	const lineWidth = useConfiguration((s) => s.lineWidth);
	const rotation = useConfiguration((s) => s.rotation);
	const setRotation = useCallback(
		(deg: number) => useConfiguration.getState().set({ rotation: deg }),
		[],
	);

	const style = useMemo(
		() => ({ fillMode, showScaffold, showVertices, showLattice, lineWidth }),
		[fillMode, showScaffold, showVertices, showLattice, lineWidth],
	);

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

	if (!built?.pattern) {
		return (
			<div className="flex h-full w-full items-center justify-center px-8 text-center text-xs text-fg-muted">
				{solved.ok
					? `No period could be built here — ${built?.reason ?? "the develop found none"}.`
					: solved.error === "degenerate"
						? "The tile degenerates at these parameters."
						: "This type cannot be built here."}
			</div>
		);
	}

	return (
		<FreedrawCanvas
			pattern={built.pattern}
			style={style}
			// Sized from the period, not fixed: the cell's world size swings by an order of magnitude
			// across the family, and a constant here would fill the screen at one end and vanish at the other.
			cells={built.cells}
			interactive
			rotation={rotation}
			onRotationChange={setRotation}
		/>
	);
}
