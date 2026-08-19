"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useConfiguration, resolveDeform } from "@/stores/configuration";
import { syncCanvasSize } from "@/lib/render/canvasSize";
import { captureOverride, offerFrame } from "@/lib/render/capture";
import { applyMat2, invertMat2, type Mat2 } from "@/lib/render/flatView";
import { useIsDark } from "@/components/freedraw/freedraw-canvas";
import { blendedSquaring, exactSquaring, squaringAvailability, squaringLabels } from "@/lib/squaring/playSquaring";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

// The two things the flat pipeline cannot draw for a squared torus: the sizes, and the lattice.
//
// The squaring goes to the canvas as an ordinary translation cell, which is what buys it pan, zoom,
// rotate, the wrap-around fill and the image export for free. What that pipeline draws is TILES — it has
// no type and no notion of a cell outline — so the two controls that ask for exactly those live here, on
// a 2-D layer above it, in the same shape as components/truchet-overlay.tsx:
//
//   THE CAMERA IS NOT ITS OWN. `controls` is read fresh every frame, the same object the flat canvas's
//   uniforms come from, so turning the overlay on cannot move the picture by a pixel.
//
//   IT TAKES NO INPUT. pointer-events: none, so every gesture falls through to the canvas that owns it.
//
// Sizes are drawn only where the class is integral, because only then are they integers. Off the lattice
// `squaringLabels` returns null and there is nothing to print — see the note there.

/** Below this the number is a smudge, so the tile is left as colour instead. */
const MIN_LABEL_PX = 9;
/** How much of a tile's width the text may take before it is dropped. */
const LABEL_FIT = 0.78;

export function SquaringOverlay({ selected }: { selected: CatalogueTiling | null }) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const dark = useIsDark();
	const on = useConfiguration((s) => s.squaring);
	const cls = useConfiguration((s) => s.squaringClass);
	const numbers = useConfiguration((s) => s.squaringNumbers);
	const lattice = useConfiguration((s) => s.squaringLattice);

	const avail = squaringAvailability(selected);
	const support = avail.ok ? avail.support : null;

	// The same squaring the canvas is drawing, resolved the same way: the exact solve when the class is
	// integral, the blend otherwise. Memoised, never recomputed inside the frame loop.
	const drawn = useMemo(() => {
		if (!on || !support) return null;
		const sq = exactSquaring(support, cls) ?? blendedSquaring(support, cls);
		if (!sq) return null;
		const l = squaringLabels(support, sq);
		if (l) return l;
		// An off-lattice class still has a lattice to outline, even with no sides worth printing.
		const k = Math.sqrt(
			Math.abs(support.map.basis[0][0] * support.map.basis[1][1] - support.map.basis[0][1] * support.map.basis[1][0]) /
				Math.abs(Number(sq.covolume)),
		);
		if (!Number.isFinite(k) || k <= 0) return null;
		return {
			labels: [],
			basis: [
				[Number(sq.lattice[0][0]) * k, Number(sq.lattice[0][1]) * k],
				[Number(sq.lattice[1][0]) * k, Number(sq.lattice[1][1]) * k],
			] as [[number, number], [number, number]],
		};
	}, [on, support, cls]);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas || !drawn) return;
		const { w, h, dpr } = syncCanvasSize(canvas);
		if (w <= 0 || h <= 0) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		const cfg = useConfiguration.getState();
		const c = cfg.controls;
		if (!c.zoom) return;
		const deform = resolveDeform(cfg) as Mat2;
		const rot = (c.rotation * Math.PI) / 180;
		const cosR = Math.cos(rot);
		const sinR = Math.sin(rot);
		// The flat shader puts a world point at uOffset + uZoom·(c·x + s·y, s·x − c·y) in CENTRED css
		// pixels, after the deform. Matching it exactly is what keeps this layer glued to the tiles.
		const project = (x: number, y: number): [number, number] => {
			const d = applyMat2(deform, x, y);
			return [
				w / 2 + c.offset.x + c.zoom * (cosR * d.x + sinR * d.y),
				h / 2 + c.offset.y + c.zoom * (sinR * d.x - cosR * d.y),
			];
		};

		const [a1, a2] = drawn.basis;
		// WHICH LATTICE CELLS ARE ON SCREEN, solved rather than bounded. Running the projection backwards
		// from the four viewport corners gives the exact integer range, which matters: a bound taken from
		// the viewport diagonal over the shortest period runs to hundreds of steps at low zoom, and the
		// label pass is O(range² × squares) per frame.
		const invDeform = invertMat2(deform);
		if (!invDeform) return;
		const unproject = (sx: number, sy: number): [number, number] => {
			const px = (sx - w / 2 - c.offset.x) / c.zoom;
			const py = (sy - h / 2 - c.offset.y) / c.zoom;
			// [[cos, sin], [sin, −cos]] is an involution, so the forward formula inverts itself.
			const X = cosR * px + sinR * py;
			const Y = sinR * px - cosR * py;
			const d = applyMat2(invDeform, X, Y);
			return [d.x, d.y];
		};
		const latDet = a1[0] * a2[1] - a1[1] * a2[0];
		if (Math.abs(latDet) < 1e-12) return;
		let uLo = Infinity;
		let uHi = -Infinity;
		let vLo = Infinity;
		let vHi = -Infinity;
		for (const [sx, sy] of [
			[0, 0],
			[w, 0],
			[0, h],
			[w, h],
		]) {
			const [x, y] = unproject(sx, sy);
			const u = (x * a2[1] - y * a2[0]) / latDet;
			const v = (y * a1[0] - x * a1[1]) / latDet;
			uLo = Math.min(uLo, u);
			uHi = Math.max(uHi, u);
			vLo = Math.min(vLo, v);
			vHi = Math.max(vHi, v);
		}
		// One cell of margin, then a hard cap: at extreme zoom-out the honest range is thousands of cells
		// and none of it would be legible anyway. Capping is a visible truncation of the lattice grid, not
		// of the tiling — the tiles themselves come from the flat renderer and are unaffected.
		const CAP = 60;
		const i0 = Math.max(Math.floor(uLo) - 1, -CAP);
		const i1 = Math.min(Math.ceil(uHi) + 1, CAP);
		const j0 = Math.max(Math.floor(vLo) - 1, -CAP);
		const j1 = Math.min(Math.ceil(vHi) + 1, CAP);

		if (lattice) {
			ctx.save();
			ctx.strokeStyle = dark ? "rgba(235,235,235,0.42)" : "rgba(70,70,70,0.42)";
			ctx.lineWidth = 1;
			ctx.setLineDash([6, 5]);
			// Two families of lines: the parallelogram grid of the image lattice, not one lonely outline.
			for (let i = i0; i <= i1; i++) {
				const p = project(i * a1[0] + j0 * a2[0], i * a1[1] + j0 * a2[1]);
				const q = project(i * a1[0] + j1 * a2[0], i * a1[1] + j1 * a2[1]);
				ctx.beginPath();
				ctx.moveTo(p[0], p[1]);
				ctx.lineTo(q[0], q[1]);
				ctx.stroke();
			}
			for (let j = j0; j <= j1; j++) {
				const p = project(i0 * a1[0] + j * a2[0], i0 * a1[1] + j * a2[1]);
				const q = project(i1 * a1[0] + j * a2[0], i1 * a1[1] + j * a2[1]);
				ctx.beginPath();
				ctx.moveTo(p[0], p[1]);
				ctx.lineTo(q[0], q[1]);
				ctx.stroke();
			}
			ctx.restore();
		}

		if (numbers && drawn.labels.length > 0) {
			ctx.save();
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			// A halo in the opposite ink, so a number reads on a pale tile and on a dark one without this
			// layer having to know what colour the tile under it came out.
			ctx.fillStyle = dark ? "rgba(240,240,240,0.92)" : "rgba(20,20,20,0.88)";
			ctx.strokeStyle = dark ? "rgba(10,10,10,0.55)" : "rgba(255,255,255,0.7)";
			ctx.lineJoin = "round";
			for (let i = i0; i <= i1; i++) {
				for (let j = j0; j <= j1; j++) {
					const ox = i * a1[0] + j * a2[0];
					const oy = i * a1[1] + j * a2[1];
					for (const lab of drawn.labels) {
						const [px, py] = project(lab.cx + ox, lab.cy + oy);
						if (px < -60 || py < -30 || px > w + 60 || py > h + 30) continue;
						// The tile's own width on screen sets the type size, so a number never outgrows the
						// square it belongs to however far the view is zoomed.
						const boxPx = lab.side * c.zoom;
						const size = Math.min((boxPx * LABEL_FIT) / Math.max(1, lab.text.length * 0.62), boxPx * 0.42);
						if (size < MIN_LABEL_PX) continue;
						ctx.font = `${size.toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
						ctx.lineWidth = Math.max(1, size * 0.16);
						ctx.strokeText(lab.text, px, py);
						ctx.fillText(lab.text, px, py);
					}
				}
			}
			ctx.restore();
		}

		if (captureOverride()) offerFrame(canvas);
	}, [drawn, numbers, lattice, dark]);

	// One frame loop while the overlay is up: the flat canvas eases zoom and pan in place with no state
	// change to react to, so redrawing on the same cadence is the only way to stay glued to it.
	useEffect(() => {
		if (!drawn) return;
		let raf = 0;
		const tick = () => {
			draw();
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [draw, drawn]);

	if (!drawn || (!numbers && !lattice)) return null;

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 z-10 h-full w-full"
			style={{ pointerEvents: "none" }}
			aria-hidden
		/>
	);
}
