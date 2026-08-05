"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { FreedrawCanvas } from "@/components/freedraw/freedraw-canvas";
import { drawFreedraw, fitView, thumbnailCells } from "@/lib/freedraw/render";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import { useConfiguration } from "@/stores/configuration";

// The two views a PARAMETRIC edge shelf needs, written once.
//
// A parametric shelf — the Kershner pentagons, the isohedral types, and whatever board arrives next —
// ships records that carry NO geometry: the tile is a family, so the patch is rebuilt at whatever point
// of it the sliders name. Everything after that rebuild is identical across boards, because the patch is
// a FreedrawPatch and the renderer is the one every Euclidean edge system already uses. These two
// components are that "everything after".
//
// WHAT STAYS WITH THE BOARD, and why the split falls here: subscribing to the right store fields. The
// pentagon board reads `pentParams`, the isohedral board reads `ihEdgeParams` and `ihEdgeBulge`, and a
// future board will read its own. That is a hook call, so it cannot be handed over in a prop without
// either calling a hook through a variable or collapsing every board's parameters into one shapeless
// bag. So each board keeps a ~20-line component that subscribes, solves and builds, then hands the
// result here. The duplication that mattered — the style plumbing, the fallback message, the whole
// thumbnail — is gone.

/** What a shelf's pattern builder returns. `lib/pentagon/edgeShelfPattern.ts` and its isohedral twin
 *  both satisfy this structurally, which is the point of the shape. */
export interface BuiltShelfPattern {
	pattern: FreedrawPattern | null;
	reason: string | null;
	/** World units across the shorter canvas side at the home zoom. Sized from the period, not fixed: the
	 *  cell's world size swings by an order of magnitude across a family, and a constant would fill the
	 *  screen at one end and vanish at the other. */
	cells: number;
}

/**
 * The interactive view: the same record redrawn wherever the sliders put the tile.
 *
 * Nothing about the record changes as they move, which is precisely the shelf's claim — the decoration
 * is a combinatorial object and the tile is a parameter. Drawing goes through FreedrawCanvas, so the
 * patch is a period stamped across the view: panning and zooming cost nothing and the figure never runs
 * out. What is expensive is rebuilding the patch, and that happens once per parameter change, upstream
 * of here, not once per frame.
 */
export function ParametricEdgesCanvas({
	built,
	unbuildable,
}: {
	built: BuiltShelfPattern | null;
	/** What to say when the BOARD itself could not be solved here — degenerate angles, a closure that
	 *  does not close. Distinct from a board that solved but whose period could not be recovered, which
	 *  this component reports from `built.reason`. */
	unbuildable?: string;
}) {
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

	if (!built?.pattern) {
		return (
			<div className="flex h-full w-full items-center justify-center px-8 text-center text-xs text-fg-muted">
				{unbuildable ?? `No period could be built here — ${built?.reason ?? "the develop found none"}.`}
			</div>
		);
	}

	return (
		<FreedrawCanvas
			pattern={built.pattern}
			style={style}
			cells={built.cells}
			interactive
			rotation={rotation}
			onRotationChange={setRotation}
		/>
	);
}

const SIZE = 220;

/**
 * The static preview, for the library grid and the /play sidebar.
 *
 * Drawn at the shelf's DEFAULT parameter point, never the live one: a thumbnail's job is to identify the
 * record, and the record is the decoration, which is the same object at every parameter point.
 *
 * Same renderer as the interactive view, one call instead of a canvas component — a gallery can hold
 * hundreds of these, and each one mounting its own resize observer and frame loop is a real cost.
 */
export function ParametricEdgesThumbnail({
	built,
	label,
}: {
	built: BuiltShelfPattern | null;
	label: string;
}) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas || !built?.pattern) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
		canvas.width = SIZE * dpr;
		canvas.height = SIZE * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		// `cells` is a COUNT, tuned for a canvas five times this wide, so handing it over unscaled draws the
		// tiles at a fifth their readable size. thumbnailCells is that scaling, in one place.
		drawFreedraw(ctx, SIZE, SIZE, built.pattern, fitView(SIZE, SIZE, thumbnailCells(built.cells)), {
			// Tiles filled by face orbit, drawn edges over them, no scaffold: at this size the faint grid is
			// noise, and the fill is what makes one record distinguishable from the next in a grid.
			fillMode: "orbit",
			showScaffold: false,
			showVertices: false,
			showLattice: false,
			lineWidth: 1.2,
			dark: false,
		});
	}, [built]);

	return (
		<canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} aria-label={label} />
	);
}
