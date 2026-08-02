"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { prepare, screenMapper } from "@/lib/render/figureCanvas";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// The abstract vertex as the engine holds it, and NOT as a vertex configuration, which is what it
// becomes the moment the tiles and the edges are drawn whole.
//
// Three things the drawing has to get right, each of them something an earlier version got wrong:
//
//   Half-edges are half. An edge of the tiling runs between two vertices and this one owns only its
//   end of it, so each half-edge is solid to the midpoint, stops at an open ring — the free end a
//   gluing will later join — and continues as a dashed ghost of an edge that does not exist yet.
//   Drawn full length they are edges, and the picture is a vertex configuration.
//
//   The tiles are not there either. Between two consecutive half-edges the vertex sees a CORNER, not
//   a polygon: a wedge of the right angle, named by the tile it will belong to. Which tile that
//   actually turns out to be is settled by the search, not by this object.
//
//   The angles are real. They are part of the data — "a cyclic sequence of half-edges WITH the angles
//   between them" — so each wedge spans its true share of the turn: 2, 3, 4 and 3 of 12 for 3.4.6.4.
//   An earlier version spaced them equally to signal "no geometry here", which only looked like a
//   claim that every angle is 90 degrees.
//
// What the object genuinely lacks is a position and an orientation, and the figure shows that by
// having neither: no axes, no origin, nothing outside the vertex itself. There is nothing to drag.
//
// The unit is the engine's. From alphabets/gen_alphabet.py: a configuration is a cyclic word of
// corner classes whose unit sum is exactly D, and a regular n-gon's corner spans (D/2 - D/n) units of
// 2π/D. With D = 12 a triangle is 2 units, a square 3, a hexagon 4, a dodecagon 5.

/** The regular palette's angular unit count: one unit is 2π/D. See gen_alphabet.py. */
const D = 12;
/** A regular n-gon's corner, in those units. */
const cornerUnits = (n: number) => D / 2 - D / n;

/** Where the half-edge stops: half of a unit edge. The dashed remainder belongs to nobody yet. */
const HALF = 0.5;
/** Radius of the corner wedges. Kept inside HALF so the stubs read as edges, not as pie slices. */
const WEDGE = 0.38;

const INK = "rgba(20,20,20,0.88)";
const GHOST = "rgba(20,20,20,0.3)";

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (i: number) => String(i).split("").map((d) => SUB[+d]).join("");

export function AbstractVertex({ word = "3.4.6.4" }: { word?: string }) {
	const host = useRef<HTMLDivElement | null>(null);
	const canvas = useRef<HTMLCanvasElement | null>(null);

	const model = useMemo(() => {
		const ns = word.split(".").map(Number);
		if (ns.length < 3 || ns.some((n) => !Number.isFinite(n) || n < 3)) return null;
		const units = ns.map(cornerUnits);
		const sum = units.reduce((a, b) => a + b, 0);
		// Half-edge directions: the running total of the corners before each one. The first sits at 12
		// o'clock only so the picture has a top; nothing in the data says so.
		const dirs: number[] = [];
		let a = Math.PI / 2;
		for (const u of units) {
			dirs.push(a);
			a += (2 * Math.PI * u) / D;
		}
		return { ns, units, sum, dirs };
	}, [word]);

	const paint = useCallback(() => {
		const h = host.current, c = canvas.current;
		if (!h || !c || !model) return;
		const p = prepare(h, c, { minX: -1.26, maxX: 1.26, minY: -1.26, maxY: 1.26 }, 0.98);
		if (!p) return;
		const { ctx, s, dpr } = p;
		const m = model.ns.length;

		// The corners, as wedges of their true angle. A wedge, not a tile: this is all the vertex sees.
		for (let i = 0; i < m; i++) {
			const from = model.dirs[i];
			const to = from + (2 * Math.PI * model.units[i]) / D;
			const hue = polygonHue(model.ns[i]);
			ctx.fillStyle = hsbToHsla(hue, 40, 100, 0.85);
			ctx.strokeStyle = hsbToHsla(hue, 55, 62, 1);
			ctx.lineWidth = 1.3 / s;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.arc(0, 0, WEDGE, from, to);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
		}

		// The half-edges: solid to the midpoint, then the half that does not exist yet, dashed.
		for (const d of model.dirs) {
			const cx = Math.cos(d), cy = Math.sin(d);
			ctx.strokeStyle = GHOST;
			ctx.lineWidth = 1.6 / s;
			ctx.setLineDash([5 / s, 4 / s]);
			ctx.beginPath();
			ctx.moveTo(cx * HALF, cy * HALF);
			ctx.lineTo(cx, cy);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.strokeStyle = INK;
			ctx.lineWidth = 3.4 / s;
			ctx.lineCap = "butt";
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(cx * HALF, cy * HALF);
			ctx.stroke();
			// the free end, drawn open because nothing is glued to it yet
			ctx.fillStyle = "#fff";
			ctx.beginPath();
			ctx.arc(cx * HALF, cy * HALF, 4.6 / s, 0, 2 * Math.PI);
			ctx.fill();
			ctx.strokeStyle = INK;
			ctx.lineWidth = 2.2 / s;
			ctx.stroke();
		}

		ctx.fillStyle = INK;
		ctx.beginPath();
		ctx.arc(0, 0, 5 / s, 0, 2 * Math.PI);
		ctx.fill();

		// Text last, in screen space: the world transform would mirror it.
		const toScreen = screenMapper(ctx, dpr);
		const base = Math.max(12, Math.min(22, h.clientWidth * 0.055));
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		model.dirs.forEach((d, i) => {
			const [sx, sy] = toScreen(Math.cos(d) * 1.17, Math.sin(d) * 1.17);
			ctx.font = `600 ${base}px ui-sans-serif, system-ui, sans-serif`;
			ctx.fillStyle = INK;
			ctx.fillText(`h${sub(i)}`, sx, sy);
		});
		for (let i = 0; i < m; i++) {
			const mid = model.dirs[i] + (Math.PI * model.units[i]) / D;
			const [sx, sy] = toScreen(Math.cos(mid) * (WEDGE + 0.2), Math.sin(mid) * (WEDGE + 0.2));
			ctx.font = `700 ${base}px ui-sans-serif, system-ui, sans-serif`;
			ctx.fillStyle = "rgba(20,20,20,0.9)";
			ctx.fillText(String(model.ns[i]), sx, sy - base * 0.34);
			ctx.font = `${base * 0.76}px ui-sans-serif, system-ui, sans-serif`;
			ctx.fillStyle = "rgba(20,20,20,0.5)";
			ctx.fillText(`${model.units[i]}u`, sx, sy + base * 0.6);
		}
	}, [model]);

	useEffect(() => {
		paint();
		const h = host.current;
		if (!h) return;
		const ro = new ResizeObserver(paint);
		ro.observe(h);
		return () => ro.disconnect();
	}, [paint]);

	if (!model) {
		return (
			<div className="not-prose rounded-xl border border-line bg-surface-overlay/30 p-4 text-center text-sm text-fg-muted">
				{word} is not a configuration
			</div>
		);
	}

	return (
		<figure className="not-prose m-0 flex flex-col items-center gap-2">
			<div ref={host} className="relative aspect-square h-[46vh] rounded-2xl border border-line bg-surface-base">
				<canvas ref={canvas} className="absolute inset-0 h-full w-full" />
			</div>
			<figcaption className="max-w-[36rem] text-center text-[clamp(0.6rem,0.85vh+0.2vw,0.86rem)] leading-snug text-fg-muted">
				<span className="font-mono text-fg-secondary">
					{model.ns.join(".")}&nbsp;&nbsp;{model.units.join(" + ")} = {model.sum} = D
				</span>
				<br />
				each half-edge stops at the middle of an edge; the dashed half belongs to a vertex the search has
				not chosen yet, and no position or orientation is recorded anywhere
			</figcaption>
		</figure>
	);
}
