"use client";

import { useCallback, useEffect, useRef } from "react";
import { prepare, screenMapper } from "@/lib/render/figureCanvas";
import { hsbToHsla, polygonHue, TILE_FILL_ALPHA } from "@/lib/utils/renderTiling";

// One rejected assembly per local rule, in the order the slide lists them.
//
// Every example is the one the proof program states, not one invented for the picture
// (docs/defense/SIX_OBLIGATIONS.md:95-108):
//
//   Mismatch      "A half-edge with a triangle left and a square right can only meet one with a
//                  square left and a triangle right."
//   Mirror break  "A half-edge lying on an axis of symmetry is its own mirror image; one not on an
//                  axis is not. The two kinds cannot be glued to each other."
//   Lost trail    "A hexagon can carry at most five completed edges and two dangling half-edges
//                  before it is forced to close."
//   False closure "A hexagon closing with three full edges is fine... A hexagon closing with four is
//                  impossible."
//
// Three of the four are drawn as the FAILING case alone; false closure needs its legal neighbour
// beside it, because "must divide" is a statement about a pair of numbers and one hexagon cannot
// carry it.
//
// Shapes are drawn in world coordinates with y up; text is QUEUED and flushed afterwards in screen
// space, because anything written through the world transform comes out upside down.

const REJECT = "hsl(2 70% 46%)";
const ACCEPT = "hsl(150 55% 33%)";
const INK = "rgba(20,20,20,0.85)";
const SOFT = "rgba(20,20,20,0.45)";

const tileFill = (n: number) => hsbToHsla(polygonHue(n), 40, 100, TILE_FILL_ALPHA);
const tileLine = (n: number) => hsbToHsla(polygonHue(n), 55, 62, 1);

interface Api {
	ctx: CanvasRenderingContext2D;
	/** world units → CSS px, for line widths that stay constant on screen */
	s: number;
	/** Queue a label at a world point. `size` multiplies the panel's base font. */
	text: (x: number, y: number, str: string, o?: { colour?: string; size?: number; weight?: number }) => void;
}

/** Half-edge width, in world units: the tile block on each side. Two fit side by side with a gap. */
const HE_W = 0.42;
const HE_H = 1.1;

/** A half-edge: the segment, and the tile lying on each side of it, each named in place. */
function halfEdge(api: Api, x: number, y: number, left: number, right: number) {
	const { ctx, s, text } = api;
	for (const [n, side] of [[left, -1], [right, 1]] as const) {
		ctx.fillStyle = tileFill(n);
		ctx.strokeStyle = tileLine(n);
		ctx.lineWidth = 1.2 / s;
		ctx.beginPath();
		ctx.rect(side < 0 ? x - HE_W : x, y - HE_H / 2, HE_W, HE_H);
		ctx.fill();
		ctx.stroke();
		text(x + (side * HE_W) / 2, y, String(n), { colour: "rgba(20,20,20,0.7)", size: 0.9, weight: 700 });
	}
	ctx.strokeStyle = INK;
	ctx.lineWidth = 3.2 / s;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(x, y - HE_H / 2);
	ctx.lineTo(x, y + HE_H / 2);
	ctx.stroke();
}

/** n-gon centred at (cx, cy), first vertex pointing up. */
const ngon = (n: number, r: number, cx: number, cy: number): [number, number][] =>
	Array.from({ length: n }, (_, i) => {
		const a = Math.PI / 2 + (2 * Math.PI * i) / n;
		return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number];
	});

const RULES: { title: string; note: string; draw: (api: Api) => void }[] = [
	{
		title: "Mismatch",
		note: "triangle | square glued to triangle | square: the gluing lays a triangle against a square",
		draw: (api) => {
			const { ctx, s, text } = api;
			halfEdge(api, -0.72, 0.16, 3, 4);
			halfEdge(api, 0.72, 0.16, 3, 4);
			// the gluing, which brings them together and lays 3 against 3
			ctx.strokeStyle = REJECT;
			ctx.setLineDash([5 / s, 4 / s]);
			ctx.lineWidth = 2 / s;
			ctx.beginPath();
			ctx.moveTo(-0.72 + HE_W, 0.16);
			ctx.lineTo(0.72 - HE_W, 0.16);
			ctx.stroke();
			ctx.setLineDash([]);
			text(0, 0.18, "✗", { colour: REJECT, size: 1.2, weight: 700 });
			text(0, -0.72, "the second must read 4 | 3", { colour: REJECT, size: 0.72, weight: 600 });
		},
	},
	{
		title: "Mirror break",
		note: "one half-edge is fixed by the mirror, the other is not, so the two cannot be joined",
		draw: (api) => {
			const { ctx, s, text } = api;
			const vertex = (cx: number, onAxis: boolean) => {
				// Mirrors along the edges put one of them on the axis; mirrors between the edges put none
				// there. The highlighted half-edge is always one of the vertex's own, never an extra ray.
				const phase = onAxis ? 0 : Math.PI / 4;
				ctx.strokeStyle = SOFT;
				ctx.lineWidth = 1.6 / s;
				for (let i = 0; i < 4; i++) {
					const a = (Math.PI / 2) * i + phase;
					ctx.beginPath();
					ctx.moveTo(cx, 0.15);
					ctx.lineTo(cx + Math.cos(a) * 0.62, 0.15 + Math.sin(a) * 0.62);
					ctx.stroke();
				}
				ctx.setLineDash([5 / s, 4 / s]);
				ctx.strokeStyle = "rgba(20,20,20,0.55)";
				ctx.lineWidth = 1.6 / s;
				ctx.beginPath();
				ctx.moveTo(cx - 0.72, 0.15);
				ctx.lineTo(cx + 0.72, 0.15);
				ctx.stroke();
				ctx.setLineDash([]);
				// the half-edge in question: the one lying along the axis, or the nearest one off it
				const a = phase;
				ctx.strokeStyle = INK;
				ctx.lineWidth = 3.6 / s;
				ctx.lineCap = "round";
				ctx.beginPath();
				ctx.moveTo(cx, 0.15);
				ctx.lineTo(cx + Math.cos(a) * 0.62, 0.15 + Math.sin(a) * 0.62);
				ctx.stroke();
				ctx.fillStyle = INK;
				ctx.beginPath();
				ctx.arc(cx, 0.15, 4 / s, 0, 2 * Math.PI);
				ctx.fill();
			};
			vertex(-0.8, true);
			vertex(0.8, false);
			text(0, 0.17, "✗", { colour: REJECT, size: 1.15, weight: 700 });
			text(-0.8, -0.85, "on the axis", { colour: SOFT, size: 0.74 });
			text(-0.8, -1.14, "0 = ∗0", { colour: INK, size: 0.78, weight: 600 });
			text(0.8, -0.85, "off it", { colour: SOFT, size: 0.74 });
			text(0.8, -1.14, "0 ≠ ∗0", { colour: INK, size: 0.78, weight: 600 });
		},
	},
	{
		title: "Lost trail",
		note: "a seventh edge on a hexagon: the walk has used more than the polygon has",
		draw: (api) => {
			const { ctx, s, text } = api;
			const v = ngon(6, 0.68, 0, 0.1);
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.strokeStyle = INK;
			ctx.lineWidth = 2.8 / s;
			for (let i = 0; i < 6; i++) {
				ctx.beginPath();
				ctx.moveTo(v[i][0], v[i][1]);
				ctx.lineTo(v[(i + 1) % 6][0], v[(i + 1) % 6][1]);
				ctx.stroke();
				const mx = (v[i][0] + v[(i + 1) % 6][0]) / 2, my = (v[i][1] + v[(i + 1) % 6][1]) / 2;
				// inside the hexagon: the seventh edge is drawn outside, and a numeral there would collide
				text(mx * 0.62, 0.1 + (my - 0.1) * 0.62, String(i + 1), { colour: SOFT, size: 0.62 });
			}
			// The seventh. A seventh unit step at the exterior angle lands exactly on the first, where it
			// would be invisible, so it is drawn just outside the side it duplicates.
			const a = v[0], b = v[1];
			const nx = (a[0] + b[0]) / 2, ny = (a[1] + b[1]) / 2;
			const len = Math.hypot(nx, ny - 0.1) || 1;
			const ox = (nx / len) * 0.19, oy = ((ny - 0.1) / len) * 0.19;
			ctx.strokeStyle = REJECT;
			ctx.lineWidth = 3.6 / s;
			ctx.beginPath();
			ctx.moveTo(a[0] + ox, a[1] + oy);
			ctx.lineTo(b[0] + ox, b[1] + oy);
			ctx.stroke();
			text(nx + ox * 2.6, ny + oy * 2.6, "7th", { colour: REJECT, size: 0.78, weight: 600 });
			text(0, -0.78, "a hexagon has six", { colour: SOFT, size: 0.72 });
		},
	},
	{
		title: "False closure",
		note: "a hexagon may close on 3 full edges; on 4 two of the joins fall mid-side",
		draw: (api) => {
			const { ctx, s, text } = api;
			// k marks cut the closed boundary into equal arcs. They land on corners exactly when k
			// divides the size — which is the rule, drawn.
			const one = (cx: number, k: number, ok: boolean) => {
				const v = ngon(6, 0.6, cx, 0.24);
				ctx.strokeStyle = SOFT;
				ctx.lineWidth = 1.8 / s;
				ctx.beginPath();
				ctx.moveTo(v[0][0], v[0][1]);
				for (let i = 1; i < 6; i++) ctx.lineTo(v[i][0], v[i][1]);
				ctx.closePath();
				ctx.stroke();
				for (let i = 0; i < k; i++) {
					const t = (6 * i) / k;
					const j = Math.floor(t) % 6, f = t - Math.floor(t);
					const px = v[j][0] + (v[(j + 1) % 6][0] - v[j][0]) * f;
					const py = v[j][1] + (v[(j + 1) % 6][1] - v[j][1]) * f;
					const corner = f < 1e-9;
					ctx.fillStyle = corner ? (ok ? ACCEPT : INK) : REJECT;
					ctx.beginPath();
					ctx.arc(px, py, (corner ? 5 : 6.5) / s, 0, 2 * Math.PI);
					ctx.fill();
				}
				text(cx, -0.75, ok ? "3 divides 6" : "4 does not", { colour: ok ? ACCEPT : REJECT, size: 0.76, weight: 600 });
			};
			one(-0.82, 3, true);
			one(0.82, 4, false);
		},
	},
];

/** Half-width of the world box every panel is drawn in. Panels share it so nothing looks rescaled. */
const BOX = 1.65;

function RulePanel({ rule }: { rule: (typeof RULES)[number] }) {
	const host = useRef<HTMLDivElement | null>(null);
	const canvas = useRef<HTMLCanvasElement | null>(null);

	const paint = useCallback(() => {
		const h = host.current, c = canvas.current;
		if (!h || !c) return;
		const p = prepare(h, c, { minX: -BOX, maxX: BOX, minY: -BOX * 0.75, maxY: BOX * 0.75 }, 0.98);
		if (!p) return;
		const { ctx, s, dpr } = p;
		const base = Math.max(11, Math.min(20, h.clientWidth * 0.09));

		const queued: { x: number; y: number; str: string; colour: string; size: number; weight: number }[] = [];
		rule.draw({
			ctx,
			s,
			text: (x, y, str, o) =>
				queued.push({ x, y, str, colour: o?.colour ?? INK, size: o?.size ?? 1, weight: o?.weight ?? 400 }),
		});

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
