"use client";

import { useCallback, useEffect, useRef } from "react";
import { prepare, type Box } from "@/lib/render/figureCanvas";
import {
	arrowHead, DART, dot, drawWithText, halo, INK, SOFT, T1_COLOUR, T2_COLOUR, type Api, type Pt,
} from "@/lib/render/figureGlyphs";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// What a Delaney–Dress symbol is, in two panels: the chamber system on the left, the quotient on the
// right, with the same three colours naming the same three involutions in both.
//
// The subject is 3.6.3.6, and it is not a stand-in. Running the repo's own generator,
// `generateCandidateSymbols(1, [3,4,6,12], 12)` returns it with
//
//     n = 2   s0 = [0,1]   s1 = [0,1]   s2 = [1,0]   m01 = (3, 6)   m12 = 4
//
// so both involutions that stay inside a tile fix each chamber, the one that crosses an edge swaps
// the two, and the whole tiling is two chambers and three numbers. That is exactly what the right
// panel draws, and every claim the left panel makes about which neighbour is which colour is
// forced by it.
//
// The definitions are lib/classes/algorithm/delaney/DSymbol.ts: corner 0 = vertex, 1 = edge-midpoint,
// 2 = tile-centre, and σᵢ is the reflection across the side OPPOSITE corner i —
//
//     σ0  keeps the edge and the tile, moves to the other end of the edge   (same tile)
//     σ1  keeps the vertex and the tile, moves to the tile's other edge there (same tile)
//     σ2  keeps the vertex and the edge, moves to the tile across it        (other tile)
//
// — so σ0 and σ1 cannot leave the tile, which is why they are self-loops here and why the two panels
// agree without being made to.
//
// Why 3.6.3.6 and not the square tiling: 4.4.4.4 comes back as n = 1, a single chamber with three
// fixed points. True, and a better punchline, but a right panel with one node and three loops on it
// reads as a degenerate case rather than as a quotient. Two nodes show the collapse without hiding it.

type Poly = { pts: Pt[]; n: number; centre: Pt };

/** Hexagon centres of 3.6.3.6 at unit edge: a triangular lattice of spacing 2. */
const H1: Pt = [Math.sqrt(3), 1];
const H2: Pt = [0, 2];
const HEX_R = 1;
/** Height of an equilateral triangle of unit side, for the outward apex on each hexagon edge. */
const TRI_H = Math.sqrt(3) / 2;

/**
 * Round to a key, with negative zero folded onto zero. `(-0).toFixed(3)` is "-0.000" and
 * `(0).toFixed(3)` is "0.000", so without this the triangle-dedup below misses every triangle whose
 * centroid sits on an axis, and those get built — and drawn — twice.
 */
const r3 = (x: number) => {
	const v = Math.round(x * 1000) / 1000;
	return v === 0 ? 0 : v;
};
const key = (p: Pt) => `${r3(p[0])},${r3(p[1])}`;
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** The trihexagonal tiling out to `reach` lattice steps: hexagons, plus the triangle on every edge. */
function trihexagonal(reach: number): Poly[] {
	const out: Poly[] = [];
	const seenTri = new Set<string>();
	for (let i = -reach; i <= reach; i++) {
		for (let j = -reach; j <= reach; j++) {
			const c: Pt = [i * H1[0] + j * H2[0], i * H1[1] + j * H2[1]];
			const v: Pt[] = Array.from({ length: 6 }, (_, k) => {
				const a = (Math.PI / 180) * (30 + 60 * k);
				return [c[0] + Math.cos(a) * HEX_R, c[1] + Math.sin(a) * HEX_R] as Pt;
			});
			out.push({ pts: v, n: 6, centre: c });
			// one outward equilateral triangle per hexagon edge; each is shared by three hexagons
			for (let k = 0; k < 6; k++) {
				const a = v[k], b = v[(k + 1) % 6];
				const m = mid(a, b);
				const d = Math.hypot(m[0] - c[0], m[1] - c[1]);
				const apex: Pt = [m[0] + ((m[0] - c[0]) / d) * TRI_H, m[1] + ((m[1] - c[1]) / d) * TRI_H];
				const centre: Pt = [(a[0] + b[0] + apex[0]) / 3, (a[1] + b[1] + apex[1]) / 3];
				if (seenTri.has(key(centre))) continue;
				seenTri.add(key(centre));
				out.push({ pts: [a, b, apex], n: 3, centre });
			}
		}
	}
	return out;
}

/**
 * A chamber: the triangle (tile centre, edge midpoint, vertex). Its three sides are its three
 * neighbours — across [c,m] lies σ0, across [c,v] lies σ1, across [m,v] lies σ2.
 */
interface Chamber { c: Pt; m: Pt; v: Pt; n: number }

function chambersOf(tile: Poly): Chamber[] {
	const out: Chamber[] = [];
	for (let i = 0; i < tile.pts.length; i++) {
		const a = tile.pts[i], b = tile.pts[(i + 1) % tile.pts.length];
		const m = mid(a, b);
		out.push({ c: tile.centre, m, v: a, n: tile.n });
		out.push({ c: tile.centre, m, v: b, n: tile.n });
	}
	return out;
}

const tri = (ch: Chamber): Pt[] => [ch.c, ch.m, ch.v];
const centroid = (p: Pt[]): Pt => [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3];

const S0 = T1_COLOUR, S1 = T2_COLOUR, S2 = DART;

const chamberFill = (n: number, a: number) => hsbToHsla(polygonHue(n), 40, 100, a);
const chamberLine = (n: number) => hsbToHsla(polygonHue(n), 55, 62, 1);

function path({ ctx }: Api, p: Pt[]) {
	ctx.beginPath();
	ctx.moveTo(p[0][0], p[0][1]);
	for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
	ctx.closePath();
}

// ---------------------------------------------------------------------------------------------
// left — the chamber system
// ---------------------------------------------------------------------------------------------

/** The hexagon at the origin, and inside it the chamber the panel singles out. */
const PICK = { edge: 0, second: false };

function drawChambers(api: Api) {
	const { ctx, s, text } = api;
	const tiles = trihexagonal(1);

	// the chamber, and its three neighbours across its three sides
	const hex = tiles.find((t) => t.n === 6 && Math.hypot(t.centre[0], t.centre[1]) < 1e-9)!;
	const chs = chambersOf(hex);
	const pickIdx = PICK.edge * 2 + (PICK.second ? 1 : 0);
	const ch = chs[pickIdx];
	// σ0: the same edge of the same tile, its other end. σ1: the tile's other edge at the same vertex.
	const sig0 = chs[pickIdx ^ 1];
	const sig1 = chs.find((o) => o !== ch && key(o.v) === key(ch.v))!;
	// σ2: the same vertex and edge, in the tile on the other side of that edge
	const other = tiles.find((t) => t !== hex && t.pts.some((p, i) => {
		const q = t.pts[(i + 1) % t.pts.length];
		return key(mid(p, q)) === key(ch.m);
	}))!;
	const sig2 = chambersOf(other).find((o) => key(o.v) === key(ch.v) && key(o.m) === key(ch.m))!;

	// Every tile, flat. The subdivision goes only on the two tiles in play: drawn over the whole
	// patch it is 12 lines per hexagon and 6 per triangle, and at slide size that is a grey texture
	// in which the hexagons stop being visible at all (measured — the first cut of this panel).
	for (const t of tiles) {
		ctx.fillStyle = chamberFill(t.n, t === hex || t === other ? 0.5 : 0.28);
		path(api, t.pts);
		ctx.fill();
	}
	for (const t of [hex, other]) {
		for (const cc of chambersOf(t)) {
			ctx.strokeStyle = "rgba(20,20,20,0.3)";
			ctx.lineWidth = 1.2 / s;
			path(api, tri(cc));
			ctx.stroke();
		}
	}
	for (const t of tiles) {
		ctx.strokeStyle = chamberLine(t.n);
		ctx.lineWidth = 2.8 / s;
		path(api, t.pts);
		ctx.stroke();
	}

	// Each neighbour is lit, and the SIDE it lies across is stroked in that involution's colour —
	// σᵢ is the reflection across the side opposite corner i, so the picture states the definition
	// instead of asserting it: σ0 across [2,1], σ1 across [2,0], σ2 across [1,0].
	const shared: [Chamber, string, Pt, Pt][] = [
		[sig0, S0, ch.c, ch.m],
		[sig1, S1, ch.c, ch.v],
		[sig2, S2, ch.m, ch.v],
	];
	for (const [nb, colour] of shared) {
		ctx.fillStyle = chamberFill(nb.n, 0.78);
		path(api, tri(nb));
		ctx.fill();
		void colour;
	}
	ctx.fillStyle = "rgba(20,20,20,0.78)";
	path(api, tri(ch));
	ctx.fill();
	for (const [, colour, a, b] of shared) {
		ctx.strokeStyle = colour;
		ctx.lineWidth = 4.4 / s;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(a[0], a[1]);
		ctx.lineTo(b[0], b[1]);
		ctx.stroke();
	}

	// the three corners of the chosen chamber, named as DSymbol.ts names them
	const labels: [Pt, string, number][] = [[ch.v, "0", 0], [ch.m, "1", 1], [ch.c, "2", 2]];
	for (const [p] of labels) dot(api, p[0], p[1], 4.6, "#fff");
	const away = (p: Pt, by: number): Pt => {
		const g = centroid(tri(ch));
		const d = Math.hypot(p[0] - g[0], p[1] - g[1]) || 1;
		return [p[0] + ((p[0] - g[0]) / d) * by, p[1] + ((p[1] - g[1]) / d) * by];
	};
	for (const [p, name] of labels) {
		const at = away(p, 0.3);
		halo(api, at[0], at[1], 11);
		text(at[0], at[1], name, { colour: INK, size: 0.78, weight: 700, mono: true });
	}

	for (const [nb, colour, name] of [[sig0, S0, "σ₀"], [sig1, S1, "σ₁"], [sig2, S2, "σ₂"]] as const) {
		const g = centroid(tri(nb));
		halo(api, g[0], g[1], 13);
		text(g[0], g[1], name, { colour, size: 0.82, weight: 700 });
	}
}

// ---------------------------------------------------------------------------------------------
// right — the symbol
// ---------------------------------------------------------------------------------------------

const NODE_R = 0.17;

/** A self-loop leaving a node at `ang` and coming back, the way σ0 and σ1 do on a fixed chamber. */
function loop(api: Api, at: Pt, ang: number, colour: string, reach: number) {
	const { ctx, s } = api;
	const spread = 0.5;
	const p0: Pt = [at[0] + Math.cos(ang - spread) * NODE_R, at[1] + Math.sin(ang - spread) * NODE_R];
	const p1: Pt = [at[0] + Math.cos(ang + spread) * NODE_R, at[1] + Math.sin(ang + spread) * NODE_R];
	const c0: Pt = [at[0] + Math.cos(ang - spread * 0.8) * reach, at[1] + Math.sin(ang - spread * 0.8) * reach];
	const c1: Pt = [at[0] + Math.cos(ang + spread * 0.8) * reach, at[1] + Math.sin(ang + spread * 0.8) * reach];
	ctx.strokeStyle = colour;
	ctx.lineWidth = 2.8 / s;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(p0[0], p0[1]);
	ctx.bezierCurveTo(c0[0], c0[1], c1[0], c1[1], p1[0], p1[1]);
	ctx.stroke();
	// a head on the way back in, so the loop reads as a move and not as decoration
	arrowHead(api, p1, Math.atan2(p1[1] - c1[1], p1[0] - c1[0]), colour, 10);
}

const NODES: { at: Pt; n: number; m01: number }[] = [
	{ at: [-0.62, 0.06], n: 3, m01: 3 },
	{ at: [0.62, 0.06], n: 6, m01: 6 },
];

function drawSymbol(api: Api) {
	const { ctx, s, text } = api;

	// σ2 joins them: the only move that leaves the tile, so the only edge between the two chambers
	ctx.strokeStyle = S2;
	ctx.lineWidth = 3 / s;
	ctx.beginPath();
	ctx.moveTo(NODES[0].at[0] + NODE_R, NODES[0].at[1]);
	ctx.lineTo(NODES[1].at[0] - NODE_R, NODES[1].at[1]);
	ctx.stroke();

	// σ0 and σ1 fix both chambers, so both are self-loops. They splay outward, away from the σ2 edge
	// and away from the labels that sit directly above and below each node.
	for (const nd of NODES) {
		const outward = nd.at[0] < 0 ? 1 : -1;
		loop(api, nd.at, Math.PI / 2 + outward * (Math.PI / 4), S0, 0.5);
		loop(api, nd.at, -Math.PI / 2 - outward * (Math.PI / 4), S1, 0.5);
		ctx.fillStyle = chamberFill(nd.n, 0.95);
		ctx.strokeStyle = chamberLine(nd.n);
		ctx.lineWidth = 2.2 / s;
		ctx.beginPath();
		ctx.arc(nd.at[0], nd.at[1], NODE_R, 0, 2 * Math.PI);
		ctx.fill();
		ctx.stroke();
		text(nd.at[0], nd.at[1], String(nd.m01), { colour: "rgba(20,20,20,0.85)", size: 0.86, weight: 700 });
	}

	for (const [x, side] of [[-1.02, 1], [1.02, 1]] as const) {
		void side;
		text(x, 0.68, "σ₀", { colour: S0, size: 0.78, weight: 700 });
		text(x, -0.56, "σ₁", { colour: S1, size: 0.78, weight: 700 });
	}
	halo(api, 0, 0.24, 13);
	text(0, 0.24, "σ₂", { colour: S2, size: 0.78, weight: 700 });

	// the two integers, under the orbits they belong to, named as DSymbol.ts names them
	text(-0.62, -0.44, "m₀₁ = 3", { colour: INK, size: 0.6, weight: 600, mono: true });
	text(0.62, -0.44, "m₀₁ = 6", { colour: INK, size: 0.6, weight: 600, mono: true });
	text(-0.62, -0.66, "a triangle", { colour: SOFT, size: 0.56 });
	text(0.62, -0.66, "a hexagon", { colour: SOFT, size: 0.56 });
	text(0, -0.44, "m₁₂ = 4", { colour: INK, size: 0.6, weight: 600, mono: true });
	text(0, -0.66, "4 tiles", { colour: SOFT, size: 0.56 });
	text(0, -0.84, "at a vertex", { colour: SOFT, size: 0.56 });
}

// ---------------------------------------------------------------------------------------------

const SYMBOL_BOX: Box = { minX: -1.2, maxX: 1.2, minY: -1.05, maxY: 1.05 };
const CHAMBER_BOX: Box = { minX: -1.62, maxX: 1.62, minY: -1.62, maxY: 1.62 };

function Panel({ box, draw, caption, aspect }: { box: Box; draw: (api: Api) => void; caption: string; aspect: string }) {
	const host = useRef<HTMLDivElement | null>(null);
	const canvas = useRef<HTMLCanvasElement | null>(null);

	const paint = useCallback(() => {
		const h = host.current, c = canvas.current;
		if (!h || !c) return;
		const p = prepare(h, c, box, 0.98);
		if (!p) return;
		drawWithText(p.ctx, p.s, p.dpr, Math.max(12, Math.min(22, h.clientWidth * 0.05)), draw);
	}, [box, draw]);

	useEffect(() => {
		paint();
		const h = host.current;
		if (!h) return;
		const ro = new ResizeObserver(paint);
		ro.observe(h);
		return () => ro.disconnect();
	}, [paint]);

	return (
		<figure className="m-0 flex min-w-[14rem] flex-1 flex-col items-center gap-1">
			<div
				ref={host}
				className="relative w-full overflow-hidden rounded-2xl border border-line bg-surface-base"
				style={{ aspectRatio: aspect }}
			>
				<canvas ref={canvas} className="absolute inset-0 h-full w-full" />
			</div>
			<figcaption className="max-w-[26rem] text-center text-[clamp(0.6rem,0.85vh+0.2vw,0.86rem)] leading-snug text-fg-muted">
				{caption}
			</figcaption>
		</figure>
	);
}

export function DelaneySymbol() {
	return (
		<div className="not-prose mx-auto flex w-full max-w-[47rem] flex-wrap items-start justify-center gap-5">
			<Panel
				box={CHAMBER_BOX}
				draw={drawChambers}
				aspect="5/4"
				caption="every chamber of 3.6.3.6, tinted by the tile it sits in; one of them, and the three it turns into across its three sides"
			/>
			<Panel
				box={SYMBOL_BOX}
				draw={drawSymbol}
				aspect="5/4"
				caption="the same tiling divided by its own symmetries: two chambers, three involutions, two integers"
			/>
		</div>
	);
}
