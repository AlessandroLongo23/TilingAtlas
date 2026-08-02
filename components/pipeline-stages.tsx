"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prepare, screenMapper, type Box } from "@/lib/render/figureCanvas";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// One panel per pipeline stage, each drawn from what that stage's source actually does.
//
// SOLVE (eu_solver.cpp, extend()). The state is a set of vertex figures whose half-edges are either
// glued in pairs or still free (glue[i] == -1). One move: take `firstfree` and glue it either to
// another free half-edge already in the configuration — the first loop over i — or to a half-edge of
// a vertex type appended on the spot, the second loop over `gr`. checkpart() runs after every glue
// and a failure backtracks. Nothing in that state is a position, which is why the panel is a graph
// with no lattice under it: the hubs sit where they do for legibility and for no other reason.
//
// PRUNE (eu_pruner.cpp). Two configurations reached along different search paths are the same tiling
// when their gluing graphs are isomorphic, and comparesolutions decides exactly that — a WL colour
// refinement on the two graphs laid side by side, with a survivor kept per class. So the panel is one
// graph drawn twice: the two vertex figures with their rneig cycles, and the three gluings between
// them, first as the prism it is and then round a circle, which is what a different dart numbering
// looks like when you lay the nodes out by index.
//
// DEVELOP (eu_develop.cpp, develop()). BFS over the gluing, placing each dart at an exact point of
// ℤ[ζ₁₂]: crossing an edge adds ZK[d], a twelfth root of unity, and no float ever touches a position.
// The periods are not searched for — they FALL OUT. reg() keys a position by (dart, direction), and
// the first time a key comes back with a different position the difference is pushed onto `periods`:
//
//     if (it != placed.end()) { if (it->second != pos) periods.push_back(zsub(pos, it->second)); ... }
//
// The panel marks one dart at the three places the walk meets it; the two vectors between them are
// that subtraction, and lattice_basis + gauss_reduce turn a heap of them into T₁ and T₂.

type Pt = [number, number];

const INK = "rgba(20,20,20,0.88)";
const SOFT = "rgba(20,20,20,0.45)";
const GHOST = "rgba(20,20,20,0.26)";
const REJECT = "hsl(2 70% 46%)";
const ACCEPT = "hsl(150 55% 33%)";
/** A half-edge the stage is working on: the candidate in `solve`, the repeated dart in `develop`. */
const DART = "hsl(28 88% 44%)";
const T1_COLOUR = "hsl(212 78% 45%)";
const T2_COLOUR = "hsl(285 55% 47%)";

interface TextOpts {
	colour?: string;
	size?: number;
	weight?: number;
	align?: CanvasTextAlign;
	/** For the engine's own identifiers, which are set in mono everywhere else in the deck. */
	mono?: boolean;
}

interface Api {
	ctx: CanvasRenderingContext2D;
	/** world units → CSS px, so a width of n/s is n pixels at any panel size */
	s: number;
	text: (x: number, y: number, str: string, o?: TextOpts) => void;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function dot({ ctx, s }: Api, x: number, y: number, r = 5, colour = INK) {
	ctx.fillStyle = colour;
	ctx.beginPath();
	ctx.arc(x, y, r / s, 0, 2 * Math.PI);
	ctx.fill();
}

/** An open ring: a half-edge with nothing glued to it yet. Same glyph as <abstract-vertex>. */
function freeEnd({ ctx, s }: Api, x: number, y: number, colour = INK) {
	ctx.fillStyle = "#fff";
	ctx.beginPath();
	ctx.arc(x, y, 4 / s, 0, 2 * Math.PI);
	ctx.fill();
	ctx.strokeStyle = colour;
	ctx.lineWidth = 2.2 / s;
	ctx.stroke();
}

function segment({ ctx, s }: Api, a: Pt, b: Pt, colour: string, w: number, dash?: [number, number]) {
	ctx.strokeStyle = colour;
	ctx.lineWidth = w / s;
	ctx.lineCap = "round";
	if (dash) ctx.setLineDash([dash[0] / s, dash[1] / s]);
	ctx.beginPath();
	ctx.moveTo(a[0], a[1]);
	ctx.lineTo(b[0], b[1]);
	ctx.stroke();
	ctx.setLineDash([]);
}

/** A bowed connector, so a candidate gluing reads as a proposal and not as another edge. */
function arc({ ctx, s }: Api, a: Pt, b: Pt, bow: number, colour: string, w: number, dash?: [number, number]): Pt {
	const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
	const dx = b[0] - a[0], dy = b[1] - a[1];
	const len = Math.hypot(dx, dy) || 1;
	const c: Pt = [mx - (dy / len) * bow, my + (dx / len) * bow];
	ctx.strokeStyle = colour;
	ctx.lineWidth = w / s;
	ctx.lineCap = "round";
	if (dash) ctx.setLineDash([dash[0] / s, dash[1] / s]);
	ctx.beginPath();
	ctx.moveTo(a[0], a[1]);
	ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
	ctx.stroke();
	ctx.setLineDash([]);
	return [0.25 * a[0] + 0.5 * c[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * c[1] + 0.25 * b[1]];
}

function arrowHead({ ctx, s }: Api, at: Pt, ang: number, colour: string, size = 12) {
	const h = size / s;
	ctx.fillStyle = colour;
	ctx.beginPath();
	ctx.moveTo(at[0], at[1]);
	ctx.lineTo(at[0] - h * Math.cos(ang - 0.42), at[1] - h * Math.sin(ang - 0.42));
	ctx.lineTo(at[0] - h * Math.cos(ang + 0.42), at[1] - h * Math.sin(ang + 0.42));
	ctx.closePath();
	ctx.fill();
}

/** Clear a disc so a mark laid over a line still reads. */
function halo({ ctx, s }: Api, x: number, y: number, r: number) {
	ctx.fillStyle = "#fff";
	ctx.beginPath();
	ctx.arc(x, y, r / s, 0, 2 * Math.PI);
	ctx.fill();
}

// ---------------------------------------------------------------------------------------------
// solve
// ---------------------------------------------------------------------------------------------

/** Half of an edge: the piece one vertex figure owns. */
const STUB = 0.3;
/**
 * Three vertex figures, placed and angled irregularly on purpose — this stage has no geometry, and a
 * tidy grid of them would claim otherwise. Glued pairs sit about 2·STUB apart with a few degrees of
 * kink, so a completed edge reads as the two half-edges it is made of.
 */
const HUBS: { at: Pt; stubs: number[] }[] = [
	{ at: [-0.80, 0.34], stubs: [-52, 40, 150] },
	{ at: [-0.44, -0.24], stubs: [128, 12, 200, 285] },
	{ at: [0.20, -0.02], stubs: [205, 350, 95] },
];
/** [hub, stub, hub, stub] pairs already glued: two half-edges end to end make one edge. */
const GLUED: [number, number, number, number][] = [
	[0, 0, 1, 0],
	[1, 1, 2, 0],
];
const FIRST_FREE: [number, number] = [2, 1];
/** Where the arc for the first move lands: a free end already in the configuration. */
const EXISTING: [number, number] = [0, 1];
/** The vertex type the second move appends, drawn dashed because it is not part of anything yet. */
const FRESH = { at: [1.00, -0.07] as Pt, stubs: [20, 110, 200, 290], len: 0.2 };

const stubEnd = (h: number, si: number): Pt => {
	const { at, stubs } = HUBS[h];
	const a = rad(stubs[si]);
	return [at[0] + Math.cos(a) * STUB, at[1] + Math.sin(a) * STUB];
};

function drawSolve(api: Api) {
	const { text } = api;
	const glued = new Set(GLUED.flatMap(([h1, s1, h2, s2]) => [`${h1}:${s1}`, `${h2}:${s2}`]));
	const first = `${FIRST_FREE[0]}:${FIRST_FREE[1]}`;

	// the fresh vertex type, dashed: a candidate to append, with nothing glued to it yet
	for (const a of FRESH.stubs) {
		const e: Pt = [FRESH.at[0] + Math.cos(rad(a)) * FRESH.len, FRESH.at[1] + Math.sin(rad(a)) * FRESH.len];
		segment(api, FRESH.at, e, GHOST, 2, [4, 3]);
		freeEnd(api, e[0], e[1], GHOST);
	}
	dot(api, FRESH.at[0], FRESH.at[1], 4, GHOST);

	// completed edges: stub, stub, and the join between them marked at the seam
	for (const [h1, s1, h2, s2] of GLUED) {
		const e1 = stubEnd(h1, s1), e2 = stubEnd(h2, s2);
		segment(api, HUBS[h1].at, e1, INK, 3.2);
		segment(api, HUBS[h2].at, e2, INK, 3.2);
		segment(api, e1, e2, INK, 3.2);
		const m: Pt = [(e1[0] + e2[0]) / 2, (e1[1] + e2[1]) / 2];
		const ang = Math.atan2(e2[1] - e1[1], e2[0] - e1[0]) + Math.PI / 2;
		segment(api, [m[0] - Math.cos(ang) * 0.07, m[1] - Math.sin(ang) * 0.07],
			[m[0] + Math.cos(ang) * 0.07, m[1] + Math.sin(ang) * 0.07], SOFT, 2);
	}

	// everything still free, and the one the search is about to work on
	for (let h = 0; h < HUBS.length; h++) {
		for (let si = 0; si < HUBS[h].stubs.length; si++) {
			const k = `${h}:${si}`;
			if (glued.has(k)) continue;
			const e = stubEnd(h, si);
			const isFirst = k === first;
			segment(api, HUBS[h].at, e, isFirst ? DART : INK, isFirst ? 3.8 : 3.2);
			freeEnd(api, e[0], e[1], isFirst ? DART : INK);
		}
	}
	// a soft disc under each hub, so the picture reads as three vertex figures and not as loose sticks
	for (const h of HUBS) {
		dot(api, h.at[0], h.at[1], 20, "rgba(20,20,20,0.055)");
		dot(api, h.at[0], h.at[1], 6.5);
	}

	// the two moves extend() can make from firstfree: back into the configuration, or out to a new type
	const from = stubEnd(FIRST_FREE[0], FIRST_FREE[1]);
	const at = arc(api, from, stubEnd(EXISTING[0], EXISTING[1]), -0.3, DART, 2.2, [6, 5]);
	const toFresh: Pt = [
		FRESH.at[0] + Math.cos(rad(FRESH.stubs[2])) * FRESH.len,
		FRESH.at[1] + Math.sin(rad(FRESH.stubs[2])) * FRESH.len,
	];
	arc(api, from, toFresh, 0.06, DART, 2.2, [6, 5]);

	halo(api, at[0], at[1], 11);
	text(at[0], at[1], "✗", { colour: REJECT, size: 1.0, weight: 700 });
	text(at[0], at[1] + 0.26, "a free end already there", { colour: SOFT, size: 0.58 });
	text(0.52, -0.34, "firstfree", { colour: DART, size: 0.62, weight: 600, mono: true });
	text(1.00, -0.46, "or a fresh vertex", { colour: SOFT, size: 0.58 });
}

// ---------------------------------------------------------------------------------------------
// prune
// ---------------------------------------------------------------------------------------------

/** Six darts: 0,1,2 round one vertex figure and 3,4,5 round the other. */
const RNEIG: [number, number][] = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3]];
const GLUE: [number, number][] = [[0, 3], [1, 4], [2, 5]];

/** Laid out by vertex figure: two rneig cycles, three gluings across. */
function prismLayout(): Pt[] {
	const c: Pt = [-0.66, 0.14];
	const p: Pt[] = new Array(6);
	for (let i = 0; i < 3; i++) {
		const a = rad(90 + 120 * i);
		p[i] = [c[0] + Math.cos(a) * 0.46, c[1] + Math.sin(a) * 0.46];
		p[i + 3] = [c[0] + Math.cos(a) * 0.22, c[1] + Math.sin(a) * 0.22];
	}
	return p;
}

/** The same graph laid out by dart index round a circle — what a different numbering looks like. */
function circleLayout(): Pt[] {
	const c: Pt = [0.66, 0.14];
	const order = [0, 1, 4, 3, 5, 2];
	const p: Pt[] = new Array(6);
	order.forEach((d, k) => {
		const a = rad(90 - 60 * k);
		p[d] = [c[0] + Math.cos(a) * 0.42, c[1] + Math.sin(a) * 0.42];
	});
	return p;
}

function drawGraph(api: Api, p: Pt[], fade: number) {
	for (const [a, b] of RNEIG) segment(api, p[a], p[b], `rgba(20,20,20,${0.38 * fade})`, 2);
	for (const [a, b] of GLUE) segment(api, p[a], p[b], `rgba(20,20,20,${0.85 * fade})`, 3);
	for (const q of p) dot(api, q[0], q[1], 4.6, `rgba(20,20,20,${0.88 * fade})`);
}

/**
 * ≅, stroked rather than typed. The character U+2245 comes back from the font fallback rotated a
 * quarter turn on this machine, and a symbol that names the panel's whole claim cannot be left to
 * whichever font happens to own the codepoint.
 */
function congruent({ ctx, s }: Api, x: number, y: number, w = 0.17) {
	const h = w / 2;
	ctx.strokeStyle = SOFT;
	ctx.lineWidth = 2.4 / s;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(x - h, y + 0.085);
	ctx.bezierCurveTo(x - h * 0.35, y + 0.16, x + h * 0.35, y + 0.01, x + h, y + 0.085);
	ctx.stroke();
	for (const dy of [0.005, -0.06]) {
		ctx.beginPath();
		ctx.moveTo(x - h, y + dy);
		ctx.lineTo(x + h, y + dy);
		ctx.stroke();
	}
}

function drawPrune(api: Api) {
	const { text } = api;
	drawGraph(api, prismLayout(), 1);
	drawGraph(api, circleLayout(), 0.62);
	congruent(api, 0, 0.14);
	text(-0.66, -0.56, "✓", { colour: ACCEPT, size: 1.0, weight: 700 });
	text(-0.66, -0.82, "kept", { colour: SOFT, size: 0.66 });
	text(0.66, -0.56, "✗", { colour: REJECT, size: 1.0, weight: 700 });
	text(0.66, -0.82, "duplicate", { colour: SOFT, size: 0.66 });
	// which line is which, left-aligned off a swatch, well clear of the drawings
	segment(api, [-1.28, 0.83], [-1.16, 0.83], `rgba(20,20,20,0.85)`, 3);
	text(-1.10, 0.83, "glue", { colour: SOFT, size: 0.58, align: "left", mono: true });
	segment(api, [-1.28, 0.65], [-1.16, 0.65], `rgba(20,20,20,0.3)`, 1.8);
	text(-1.10, 0.65, "rneig", { colour: SOFT, size: 0.58, align: "left", mono: true });
}

// ---------------------------------------------------------------------------------------------
// develop
// ---------------------------------------------------------------------------------------------

interface FigureData {
	t1: { xy: Pt };
	t2: { xy: Pt };
	polys: { n: number; v: Pt[] }[];
}

interface Developed {
	box: Box;
	tiles: { pts: Pt[]; n: number }[];
	origin: Pt;
	/** Direction of one edge at `origin` — the same dart, wherever the walk meets it again. */
	dir: Pt;
	t1: Pt;
	t2: Pt;
}

const CULL = 3.2;

function buildDeveloped(d: FigureData): Developed {
	const t1 = d.t1.xy, t2 = d.t2.xy;
	const key = (p: Pt) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;

	// A real vertex of the tiling, taken as the one the most cell tiles meet, so the marked dart sits
	// somewhere visibly busy instead of on a lone corner.
	const seen = new Map<string, { p: Pt; n: number }>();
	for (const poly of d.polys) {
		for (const v of poly.v) {
			const k = key(v);
			const e = seen.get(k) ?? { p: v, n: 0 };
			e.n += 1;
			seen.set(k, e);
		}
	}
	let origin: Pt = d.polys[0].v[0], best = -1;
	for (const e of seen.values()) if (e.n > best) { best = e.n; origin = e.p; }

	// and one edge running out of it, which is what makes the three marks the same dart. Of the edges
	// there are, take the one that leans least along either period, so the dart glyphs stay clear of
	// the two arrows drawn from the same point.
	let dir: Pt = [1, 0], lean = Infinity;
	for (const poly of d.polys) {
		for (let i = 0; i < poly.v.length; i++) {
			const a = poly.v[i], b = poly.v[(i + 1) % poly.v.length];
			for (const [p, q] of [[a, b], [b, a]] as const) {
				if (key(p) !== key(origin)) continue;
				const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
				const u: Pt = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
				const along = (T: Pt) => Math.abs((u[0] * T[0] + u[1] * T[1]) / Math.hypot(T[0], T[1]));
				const score = Math.max(along(t1), along(t2));
				if (score < lean) { lean = score; dir = u; }
			}
		}
	}

	const marks: Pt[] = [origin, [origin[0] + t1[0], origin[1] + t1[1]], [origin[0] + t2[0], origin[1] + t2[1]]];
	const xs = marks.map((m) => m[0]), ys = marks.map((m) => m[1]);
	// enough that a dart glyph at a marked vertex stays clear of the frame, whichever way it points
	const pad = 1.15;
	const box: Box = {
		minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad,
		minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad,
	};

	const tiles: { pts: Pt[]; n: number }[] = [];
	for (let i = -3; i <= 3; i++) {
		for (let j = -3; j <= 3; j++) {
			const ox = i * t1[0] + j * t2[0], oy = i * t1[1] + j * t2[1];
			for (const poly of d.polys) {
				let cx = 0, cy = 0;
				for (const v of poly.v) { cx += v[0] + ox; cy += v[1] + oy; }
				cx /= poly.v.length; cy /= poly.v.length;
				if (cx < box.minX - CULL || cx > box.maxX + CULL) continue;
				if (cy < box.minY - CULL || cy > box.maxY + CULL) continue;
				tiles.push({ pts: poly.v.map(([x, y]): Pt => [x + ox, y + oy]), n: poly.n });
			}
		}
	}
	return { box, tiles, origin, dir, t1, t2 };
}

function drawDevelop(api: Api, dev: Developed) {
	const { ctx, s, text } = api;
	const { tiles, origin, dir, t1, t2 } = dev;

	for (const t of tiles) {
		ctx.fillStyle = hsbToHsla(polygonHue(t.n), 40, 100, 0.82);
		ctx.strokeStyle = hsbToHsla(polygonHue(t.n), 55, 62, 1);
		ctx.lineWidth = 1.1 / s;
		ctx.beginPath();
		ctx.moveTo(t.pts[0][0], t.pts[0][1]);
		for (let i = 1; i < t.pts.length; i++) ctx.lineTo(t.pts[i][0], t.pts[i][1]);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}

	// The two periods, each the difference between two places the walk met the same dart. Both stop a
	// little short of the far vertex so the arrowhead does not sit under the dart glyph there.
	for (const [T, colour, label, side] of [
		[t1, T1_COLOUR, "T₁", 1],
		[t2, T2_COLOUR, "T₂", -1],
	] as const) {
		const ang = Math.atan2(T[1], T[0]);
		const len = Math.hypot(T[0], T[1]) - 0.3;
		const to: Pt = [origin[0] + Math.cos(ang) * len, origin[1] + Math.sin(ang) * len];
		segment(api, origin, to, colour, 3.2);
		arrowHead(api, to, ang, colour, 15);
		const lx = origin[0] + T[0] / 2 - Math.sin(ang) * 0.46 * side;
		const ly = origin[1] + T[1] / 2 + Math.cos(ang) * 0.46 * side;
		halo(api, lx, ly, 15);
		text(lx, ly, label, { colour, size: 0.92, weight: 700 });
	}

	// the same dart, at the three points the walk placed it
	for (const m of [origin, [origin[0] + t1[0], origin[1] + t1[1]], [origin[0] + t2[0], origin[1] + t2[1]]] as Pt[]) {
		const to: Pt = [m[0] + dir[0] * 0.52, m[1] + dir[1] * 0.52];
		segment(api, m, to, "rgba(255,255,255,0.9)", 7.5);
		segment(api, m, to, DART, 4);
		arrowHead(api, to, Math.atan2(dir[1], dir[0]), DART, 12);
		dot(api, m[0], m[1], 5.6, DART);
	}
}

// ---------------------------------------------------------------------------------------------

interface Stage {
	title: string;
	note: string;
	box: Box;
	draw: (api: Api) => void;
}

/** Half-width of the world box the two combinatorial panels are drawn in; 4:3, like the frames. */
const BOX = 1.35;
const FLAT: Box = { minX: -BOX, maxX: BOX, minY: -BOX * 0.75, maxY: BOX * 0.75 };

function StagePanel({ stage }: { stage: Stage }) {
	const host = useRef<HTMLDivElement | null>(null);
	const canvas = useRef<HTMLCanvasElement | null>(null);

	const paint = useCallback(() => {
		const h = host.current, c = canvas.current;
		if (!h || !c) return;
		const p = prepare(h, c, stage.box, 0.97);
		if (!p) return;
		const { ctx, s, dpr } = p;
		const base = Math.max(10, Math.min(19, h.clientWidth * 0.075));

		const queued: ({ x: number; y: number; str: string } & Required<TextOpts>)[] = [];
		stage.draw({
			ctx,
			s,
			text: (x, y, str, o) =>
				queued.push({
					x, y, str,
					colour: o?.colour ?? INK,
					size: o?.size ?? 1,
					weight: o?.weight ?? 400,
					align: o?.align ?? "center",
					mono: o?.mono ?? false,
				}),
		});

		// Text last, in screen space: anything written through the world transform comes out mirrored.
		const toScreen = screenMapper(ctx, dpr);
		ctx.textBaseline = "middle";
		for (const q of queued) {
			const family = q.mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "ui-sans-serif, system-ui, sans-serif";
			ctx.font = `${q.weight} ${base * q.size}px ${family}`;
			ctx.textAlign = q.align;
			ctx.fillStyle = q.colour;
			const [sx, sy] = toScreen(q.x, q.y);
			ctx.fillText(q.str, sx, sy);
		}
	}, [stage]);

	useEffect(() => {
		paint();
		const h = host.current;
		if (!h) return;
		const ro = new ResizeObserver(paint);
		ro.observe(h);
		return () => ro.disconnect();
	}, [paint]);

	return (
		<figure className="m-0 flex min-w-[11rem] flex-1 flex-col gap-1.5">
			<figcaption className="text-center font-mono text-[clamp(0.7rem,1vh+0.24vw,1rem)] font-medium text-fg">
				{stage.title}
			</figcaption>
			<div ref={host} className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-surface-base">
				<canvas ref={canvas} className="absolute inset-0 h-full w-full" />
			</div>
			<div className="text-center text-[clamp(0.54rem,0.74vh+0.14vw,0.74rem)] leading-snug text-fg-muted">
				{stage.note}
			</div>
		</figure>
	);
}

export function PipelineStages() {
	const [data, setData] = useState<FigureData | null>(null);

	useEffect(() => {
		let alive = true;
		fetch("/defense/period-figure.json")
			.then((r) => r.json())
			.then((d: FigureData) => { if (alive) setData(d); })
			.catch(() => {});
		return () => { alive = false; };
	}, []);

	const stages = useMemo<Stage[]>(() => {
		const out: Stage[] = [
			{
				title: "solve",
				note: "glue the first free half-edge to a free end, or to a vertex added on the spot, and back out the moment a rule fails",
				box: FLAT,
				draw: drawSolve,
			},
			{
				title: "prune",
				note: "one gluing reached along two search paths, numbered two ways: an isomorphism test keeps a single copy",
				box: FLAT,
				draw: drawPrune,
			},
		];
		// The third panel keeps its slot while the tiling loads, so the row does not reflow under the
		// reader when it arrives.
		const dev = data ? buildDeveloped(data) : null;
		out.push({
			title: "develop",
			note: "every step an exact power of ζ₁₂; a dart met again elsewhere gives a period, and the periods generate the cell",
			box: dev ? dev.box : FLAT,
			draw: dev ? (api) => drawDevelop(api, dev) : () => {},
		});
		return out;
	}, [data]);

	return (
		<div className="not-prose mx-auto flex w-full max-w-[64rem] flex-wrap items-start justify-center gap-4">
			{stages.map((s) => (
				<StagePanel key={s.title} stage={s} />
			))}
		</div>
	);
}
