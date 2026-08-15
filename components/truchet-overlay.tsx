"use client";

import { useCallback, useEffect, useRef } from "react";
import { useIsDark } from "@/components/freedraw/freedraw-canvas";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import { drawFreedraw, type FreedrawView } from "@/lib/freedraw/render";
import { syncCanvasSize } from "@/lib/render/canvasSize";
import { useConfiguration } from "@/stores/configuration";

// The Truchet figures over a PLAIN tiling, as a true overlay.
//
// It is not a renderer. The flat canvas underneath keeps drawing the tiling and keeps owning every
// pointer gesture — drag, wheel, right-click to reset — and this layer only paints the black figures on
// top of it, in the same place. Two things make that work, and both were wrong when it first shipped:
//
//   THE CAMERA IS NOT ITS OWN. It reads `controls` from the store every frame, the same object the flat
//   canvas's uniforms come from, so toggling the overlay cannot move the picture. See `viewOf` for the
//   arithmetic that turns those uniforms into this renderer's (cx, cy, scale, rot).
//
//   IT TAKES NO INPUT. pointer-events: none, so gestures fall through to the canvas that owns them.
//   With the layer swallowing them instead, right-click reached the browser instead of the reset handler.
//
// The flat layer is BLANKED while this is up (canvas.tsx reads `truchetActive`), so this paints its own
// ground. The figures are the picture: a tiling drawn under them is a second picture, and one that
// trailed a frame behind on a drag, since the two layers ease on separate frame loops. What the board
// looks like underneath is the Grid toggle's job — the same faint grey scaffold the freedraw boards draw.

/**
 * The flat pipeline's uniforms as this renderer's view.
 *
 * The shader places a world point at `uOffset + uZoom * (c*x + s*y, s*x - c*y)` in centred CSS pixels
 * (lib/render/flatTilingGL.ts), while drawFreedraw places it at `(w/2 + (x - cx)*scale, h/2 - (y - cy)*
 * scale)` and then turns the context by `rot` about the centre. Setting the two equal for every world
 * point gives scale = zoom, rot = the same angle, and the centre below — which at rot 0 is the
 * `cx = -offset.x/zoom, cy = +offset.y/zoom` pair the freedraw canvas already used.
 *
 * The offset is read UNWRAPPED. The flat renderer wraps its own pan by the tiling's lattice to keep its
 * instance grid bounded, and that is invisible there because a lattice vector is a symmetry of the
 * tiling — but it is NOT a symmetry of a shuffled Truchet pattern, whose period is six cells. Reading
 * the true offset keeps this layer in world position while the tiling slides under its own symmetry.
 */
function viewOf(zoom: number, offX: number, offY: number, rotDeg: number): FreedrawView {
	const rot = (rotDeg * Math.PI) / 180;
	const a = -offX / zoom;
	const b = -offY / zoom;
	return {
		cx: a * Math.cos(rot) + b * Math.sin(rot),
		cy: a * Math.sin(rot) - b * Math.cos(rot),
		scale: zoom,
		rot,
	};
}

export function TruchetOverlay({ pattern }: { pattern: FreedrawPattern }) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const dark = useIsDark();
	const showScaffold = useConfiguration((s) => s.freedrawScaffold);
	const lineWidth = useConfiguration((s) => s.lineWidth);
	const arcWiring = useConfiguration((s) => s.freedrawArcWiring);
	const arcTwist = useConfiguration((s) => s.freedrawArcTwist);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const { w, h, dpr } = syncCanvasSize(canvas);
		if (w <= 0 || h <= 0) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		// The live camera, read fresh every frame. `controls` is mutated in place by the flat canvas's
		// own loop (no per-frame setState), so subscribing to it in React would see nothing move.
		const c = useConfiguration.getState().controls;
		if (!c.zoom) return;
		drawFreedraw(ctx, w, h, pattern, viewOf(c.zoom, c.offset.x, c.offset.y, c.rotation), {
			fillMode: "none",
			showScaffold,
			showVertices: false,
			showLattice: false,
			lineWidth,
			showArcs: true,
			arcRule: { wiring: arcWiring, twist: arcTwist ? 1 : 0 },
			dark,
		});
	}, [pattern, showScaffold, lineWidth, arcWiring, arcTwist, dark]);

	// One frame loop, running as long as the overlay is up. The flat canvas eases zoom and pan toward
	// their targets in place, so there is no state change to react to — the only way to stay glued to it
	// is to redraw on the same cadence.
	useEffect(() => {
		let raf = 0;
		const tick = () => {
			draw();
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [draw]);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 z-10 h-full w-full"
			style={{ pointerEvents: "none" }}
			aria-hidden
		/>
	);
}
