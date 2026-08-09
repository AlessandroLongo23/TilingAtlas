"use client";

import { useCallback, useEffect, useRef } from "react";
import { prepare, screenMapper } from "@/lib/render/figureCanvas";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// One rejected assembly per local rule, drawn from what the solver actually tests.
//
// Three of the four are not separate passes at all: they are the three ways the FACE WALK in
// checkpart() (tools/ctrnact-oracle/eu_solver.cpp:246-275) can fail. The walk starts at a dart, steps
// to its right neighbour, crosses the glued edge, and repeats:
//
//     free = glue[rfree]
//     if (free == -1)    { if (count > L) return false; }        // LOST TRAIL — open, over length
//     else if (free == i){ if (L % count != 0) return false; }    // FALSE CLOSURE — closed, count ∤ L
//     else               { if (actual != expect) return false; }  // MISMATCH — corner class changed
//
// `L` is the tile's word length (n, for a regular n-gon) and `expect` advances by CLASS_NEXT, which is
// the identity for regular tiles — so on the regular palette the mismatch test reads: every corner you
// meet walking round one face must belong to the same kind of tile.
//
// The fourth, MIRROR BREAK, is the guard on the gluing itself (eu_solver.cpp:646):
//
//     bool mirrored  = (mirro[firstfree] == firstfree);
//     bool mirroredi = (mirro[i] == i);
//     if (mirrored == mirroredi) { ...glue... }
//
// A dart with mirro[i] == i is its own mirror image, one without is not, and only like joins like.
//
// Two things the first version got wrong, both reported by AL. The half-edges were drawn as separate
// segments with their faces pressed together, but a gluing joins two HALF-EDGES end to end into one
// edge and the faces then lie alongside it — so the mismatch panel is one horizontal edge with a face
// above and a face below, and the seam in the middle is where the two halves meet. And the lost-trail
// walk was drawn on a hexagon, which is a picture of geometry the search does not have; it is unrolled
// here, because a walk that has over-run its tile cannot be drawn on that tile.

const REJECT = "hsl(2 70% 46%)";
const ACCEPT = "hsl(150 55% 33%)";
const INK = "rgba(20,20,20,0.88)";
const SOFT = "rgba(20,20,20,0.42)";
const GHOST = "rgba(20,20,20,0.22)";

const fill = (n: number) => hsbToHsla(polygonHue(n), 40, 100, 0.9);
const line = (n: number) => hsbToHsla(polygonHue(n), 55, 62, 1);

interface Api {
	ctx: CanvasRenderingContext2D;
	/** world units → CSS px, so a width of n/s is n pixels at any panel size */
	s: number;
	text: (x: number, y: number, str: string, o?: { colour?: string; size?: number; weight?: number }) => void;
}

/** A dot: a vertex of the assembly. */
function vertexDot({ ctx, s }: Api, x: number, y: number, r = 5) {
	ctx.fillStyle = INK;
	ctx.beginPath();
	ctx.arc(x, y, r / s, 0, 2 * Math.PI);
	ctx.fill();
}

/** An open ring: a free end, with nothing glued to it yet. */
function freeEnd({ ctx, s }: Api, x: number, y: number) {
	ctx.fillStyle = "#fff";
	ctx.beginPath();
	ctx.arc(x, y, 4.6 / s, 0, 2 * Math.PI);
	ctx.fill();
	ctx.strokeStyle = INK;
	ctx.lineWidth = 2.2 / s;
	ctx.stroke();
}

const RULES: { title: string; note: string; draw: (api: Api) => void }[] = [
	{
		title: "Mismatch",
		note: "two half-edges make one edge, so one face above it — but its ends report a hexagon and a square",
		draw: (api) => {
			const { ctx, s, text } = api;
			const y = 0.02, x0 = -0.95, x1 = 0.95;
			const band = (a: number, b: number, top: boolean, n: number) => {
				ctx.fillStyle = fill(n);
				ctx.strokeStyle = line(n);
				ctx.lineWidth = 1.2 / s;
				ctx.beginPath();
				ctx.rect(a, top ? y : y - 0.56, b - a, 0.56);
				ctx.fill();
				ctx.stroke();
			};
			band(x0, 0, true, 6);
			band(0, x1, true, 4);
			band(x0, 0, false, 3);
			band(0, x1, false, 3);
			// the edge the two half-edges make, end to end, with the seam where they meet
			ctx.strokeStyle = INK;
			ctx.lineWidth = 3.4 / s;
			ctx.lineCap = "butt";
			ctx.beginPath();
			ctx.moveTo(x0, y);
			ctx.lineTo(x1, y);
			ctx.stroke();
			ctx.strokeStyle = REJECT;
			ctx.setLineDash([5 / s, 4 / s]);
			ctx.lineWidth = 2 / s;
			ctx.beginPath();
			ctx.moveTo(0, y + 0.56);
			ctx.lineTo(0, y - 0.56);
			ctx.stroke();
			ctx.setLineDash([]);
			vertexDot(api, x0, y);
			vertexDot(api, x1, y);
			text(-0.48, y + 0.28, "6", { colour: "rgba(20,20,20,0.75)", size: 0.95, weight: 700 });
			text(0.48, y + 0.28, "4", { colour: "rgba(20,20,20,0.75)", size: 0.95, weight: 700 });
			text(-0.48, y - 0.28, "3", { colour: "rgba(20,20,20,0.75)", size: 0.95, weight: 700 });
			text(0.48, y - 0.28, "3", { colour: "rgba(20,20,20,0.75)", size: 0.95, weight: 700 });
			text(0, 0.86, "✗", { colour: REJECT, size: 1.15, weight: 700 });
			text(0, -0.86, "✓", { colour: ACCEPT, size: 1.05, weight: 700 });
		},
	},
	{
		title: "Mirror break",
		note: "the mirror fixes one half-edge and moves the other, and only like may join like",
		draw: (api) => {
			const { ctx, s, text } = api;
			const cy = 0.2, r = 0.5;
			const vertex = (cx: number, onAxis: boolean) => {
				// Mirrors running along the edges leave one on the axis; mirrors running between them
				// leave none, and the reflection carries that half-edge to a different one.
				const phase = onAxis ? 0 : Math.PI / 4;
				ctx.strokeStyle = GHOST;
				ctx.lineWidth = 1.6 / s;
				for (let i = 0; i < 4; i++) {
					const a = (Math.PI / 2) * i + phase;
					ctx.beginPath();
					ctx.moveTo(cx, cy);
					ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
					ctx.stroke();
				}
				ctx.setLineDash([5 / s, 4 / s]);
				ctx.strokeStyle = "rgba(20,20,20,0.5)";
				ctx.lineWidth = 1.6 / s;
				ctx.beginPath();
				ctx.moveTo(cx - 0.66, cy);
				ctx.lineTo(cx + 0.66, cy);
				ctx.stroke();
				ctx.setLineDash([]);
				const a = phase;
				ctx.strokeStyle = INK;
				ctx.lineWidth = 3.6 / s;
				ctx.lineCap = "round";
				ctx.beginPath();
				ctx.moveTo(cx, cy);
				ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
				ctx.stroke();
				if (!onAxis) {
					// where the mirror sends it: a different half-edge, so the two are not interchangeable
					ctx.strokeStyle = REJECT;
					ctx.beginPath();
					ctx.moveTo(cx, cy);
					ctx.lineTo(cx + Math.cos(-a) * r, cy + Math.sin(-a) * r);
					ctx.stroke();
					ctx.lineWidth = 1.5 / s;
					ctx.setLineDash([4 / s, 3 / s]);
					ctx.beginPath();
					ctx.arc(cx, cy, r * 0.74, -a, a);
					ctx.stroke();
					ctx.setLineDash([]);
				}
				vertexDot(api, cx, cy, 4.5);
			};
			vertex(-0.72, true);
			vertex(0.72, false);
			text(0, cy, "✗", { colour: REJECT, size: 1.15, weight: 700 });
			text(-0.72, -0.58, "fixed by the mirror", { colour: SOFT, size: 0.66 });
			text(-0.72, -0.85, "mirro[i] = i", { colour: INK, size: 0.72, weight: 600 });
			text(0.72, -0.58, "moved by it", { colour: SOFT, size: 0.66 });
			text(0.72, -0.85, "mirro[i] ≠ i", { colour: INK, size: 0.72, weight: 600 });
		},
	},
	{
		title: "Lost trail",
		note: "the walk around one face has passed seven corners and both its ends are still free",
		draw: (api) => {
			const { ctx, s, text } = api;
			// Unrolled: a walk that has over-run its tile cannot be drawn on that tile, and the search
			// has no geometry here anyway. Each wedge is one corner the walk has consumed.
			const n = 7, step = 0.26, y = 0.14;
			const x0 = -((n - 1) * step) / 2;
			for (let i = 0; i < n; i++) {
				const x = x0 + i * step;
				if (i < n - 1) {
					ctx.strokeStyle = INK;
					ctx.lineWidth = 2.6 / s;
					ctx.lineCap = "butt";
					ctx.beginPath();
					ctx.moveTo(x, y);
					ctx.lineTo(x + step, y);
					ctx.stroke();
				}
			}
			for (let i = 0; i < n; i++) {
				const x = x0 + i * step;
				const over = i === n - 1;
				ctx.fillStyle = over ? "hsl(2 70% 46% / 0.3)" : fill(6);
				ctx.strokeStyle = over ? REJECT : line(6);
				ctx.lineWidth = 1.2 / s;
				ctx.beginPath();
				ctx.moveTo(x, y);
				ctx.arc(x, y, 0.135, Math.PI * 0.16, Math.PI * 0.84);
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
				vertexDot(api, x, y, 3.4);
				text(x, y - 0.26, String(i + 1), { colour: over ? REJECT : SOFT, size: 0.6, weight: over ? 700 : 400 });
			}
			// both ends of the walk still free: that is what "still open" means
			const xa = x0 - 0.2, xb = x0 + (n - 1) * step + 0.2;
			ctx.strokeStyle = INK;
			ctx.lineWidth = 2.6 / s;
			ctx.beginPath();
			ctx.moveTo(x0, y);
			ctx.lineTo(xa, y);
			ctx.moveTo(x0 + (n - 1) * step, y);
			ctx.lineTo(xb, y);
			ctx.stroke();
			freeEnd(api, xa, y);
			freeEnd(api, xb, y);
			text(0, 0.62, "count = 7 > 6 = L", { colour: REJECT, size: 0.72, weight: 600 });
			text(0, -0.66, "and still open at both ends", { colour: SOFT, size: 0.66 });
		},
	},
	{
		title: "False closure",
		note: "a closed walk of 3 edges suits a hexagon; one of 4 cannot, because 4 does not divide 6",
		draw: (api) => {
			const { ctx, s, text } = api;
			// A closed walk of `count` edges round a tile of word length L is legal exactly when
			// L % count == 0. Marks cut the boundary into count equal arcs, and they land on corners
			// precisely in that case.
			const one = (cx: number, count: number, ok: boolean) => {
				const R = 0.48, cy = 0.28;
				const v = Array.from({ length: 6 }, (_, i) => {
					const a = Math.PI / 2 + (Math.PI * i) / 3;
					return [cx + Math.cos(a) * R, cy + Math.sin(a) * R] as [number, number];
				});
				ctx.strokeStyle = SOFT;
				ctx.lineWidth = 1.8 / s;
				ctx.beginPath();
				ctx.moveTo(v[0][0], v[0][1]);
				for (let i = 1; i < 6; i++) ctx.lineTo(v[i][0], v[i][1]);
				ctx.closePath();
				ctx.stroke();
				for (let i = 0; i < count; i++) {
					const t = (6 * i) / count;
					const j = Math.floor(t) % 6, f = t - Math.floor(t);
					const px = v[j][0] + (v[(j + 1) % 6][0] - v[j][0]) * f;
					const py = v[j][1] + (v[(j + 1) % 6][1] - v[j][1]) * f;
					const corner = f < 1e-9;
					ctx.fillStyle = corner ? (ok ? ACCEPT : INK) : REJECT;
					ctx.beginPath();
					ctx.arc(px, py, (corner ? 5 : 6.5) / s, 0, 2 * Math.PI);
					ctx.fill();
				}
				text(cx, -0.46, `count = ${count}`, { colour: SOFT, size: 0.66 });
				text(cx, -0.74, ok ? "6 % 3 = 0" : "6 % 4 ≠ 0", { colour: ok ? ACCEPT : REJECT, size: 0.74, weight: 600 });
			};
			one(-0.72, 3, true);
			one(0.72, 4, false);
		},
	},
];

/** Half-width of the world box every panel is drawn in, shared so nothing looks rescaled. */
const BOX = 1.3;

function RulePanel({ rule }: { rule: (typeof RULES)[number] }) {
	const host = useRef<HTMLDivElement | null>(null);
	const canvas = useRef<HTMLCanvasElement | null>(null);

	const paint = useCallback(() => {
		const h = host.current, c = canvas.current;
		if (!h || !c) return;
		const p = prepare(h, c, { minX: -BOX, maxX: BOX, minY: -BOX * 0.8, maxY: BOX * 0.8 }, 0.98);
		if (!p) return;
		const { ctx, s, dpr } = p;
		const base = Math.max(11, Math.min(20, h.clientWidth * 0.085));

		const queued: { x: number; y: number; str: string; colour: string; size: number; weight: number }[] = [];
		rule.draw({
			ctx,
			s,
			text: (x, y, str, o) =>
				queued.push({ x, y, str, colour: o?.colour ?? INK, size: o?.size ?? 1, weight: o?.weight ?? 400 }),
		});

		// Text last, in screen space: anything written through the world transform comes out mirrored.
		const toScreen = screenMapper(ctx, dpr);
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		for (const q of queued) {
			ctx.font = `${q.weight} ${base * q.size}px ui-sans-serif, system-ui, sans-serif`;
			ctx.fillStyle = q.colour;
			const [sx, sy] = toScreen(q.x, q.y);
			ctx.fillText(q.str, sx, sy);
		}
	}, [rule]);

	useEffect(() => {
		paint();
		const h = host.current;
		if (!h) return;
		const ro = new ResizeObserver(paint);
		ro.observe(h);
		return () => ro.disconnect();
	}, [paint]);

	return (
		<figure className="m-0 flex min-w-[12rem] flex-1 flex-col gap-1.5">
			<figcaption className="text-center text-[clamp(0.7rem,1vh+0.24vw,1rem)] font-medium text-fg">
				{rule.title}
			</figcaption>
			<div ref={host} className="relative aspect-[5/4] w-full rounded-xl border border-line bg-surface-base">
				<canvas ref={canvas} className="absolute inset-0 h-full w-full" />
			</div>
			<div className="text-center text-[clamp(0.56rem,0.78vh+0.15vw,0.76rem)] leading-snug text-fg-muted">
				{rule.note}
			</div>
		</figure>
	);
}

export function LocalRules() {
	return (
		<div className="not-prose flex w-full flex-wrap items-start justify-center gap-4">
			{RULES.map((r) => (
				<RulePanel key={r.title} rule={r} />
			))}
		</div>
	);
}
