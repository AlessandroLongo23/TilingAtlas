"use client";

import { useEffect, useMemo, useRef } from "react";
import { PENT_EDGE_DEFAULTS, solveEdgeBoard } from "@/lib/pentagon/edge-board";
import type { PentEdgeRecord } from "@/lib/pentagon/edgeDevelop";
import { pentEdgePattern } from "@/lib/pentagon/edgeShelfPattern";
import { drawFreedraw, fitView } from "@/lib/freedraw/render";

// Static preview of one parametric-pentagon edge system, for the library grid and the /play sidebar.
// It draws at the shelf's DEFAULT parameter point, not the live one: a thumbnail's job is to identify
// the record, and the record is the decoration, which is the same object at every parameter point.
//
// Same renderer as the interactive view, one call instead of a canvas component — a gallery can hold
// hundreds of these and each one mounting its own resize observer and frame loop is a real cost.

const SIZE = 220;

export function PentagonEdgesThumbnail({ pattern }: { pattern: PentEdgeRecord }) {
	const ref = useRef<HTMLCanvasElement>(null);
	// Shared cache with the interactive canvas, so opening a record that is already in the grid costs
	// nothing: both ask for the same (record, default board) key.
	const built = useMemo(() => {
		const solved = solveEdgeBoard(PENT_EDGE_DEFAULTS);
		return solved.ok ? pentEdgePattern(pattern, solved.board) : null;
	}, [pattern]);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas || !built?.pattern) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
		canvas.width = SIZE * dpr;
		canvas.height = SIZE * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		drawFreedraw(ctx, SIZE, SIZE, built.pattern, fitView(SIZE, SIZE, built.cells), {
			// Tiles filled by face orbit, drawn edges over them, no scaffold: at this size the faint grid
			// is noise, and the fill is what makes one record distinguishable from the next in a grid.
			fillMode: "orbit",
			showScaffold: false,
			showVertices: false,
			showLattice: false,
			lineWidth: 1.2,
			dark: false,
		});
	}, [built]);

	return (
		<canvas
			ref={ref}
			style={{ width: "100%", height: "100%", display: "block" }}
			aria-label={`Pentagon edge system ${pattern.id}`}
		/>
	);
}
