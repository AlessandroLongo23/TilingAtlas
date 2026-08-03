"use client";

import { useCallback, useEffect, useRef } from "react";
import { prepare } from "@/lib/render/figureCanvas";
import { drawWithText, INK, SOFT, T1_COLOUR, DART, type Api, type Pt } from "@/lib/render/figureGlyphs";

// How many Delaney–Dress symbols there are at each size, and where that stops being enumerable.
//
// The data is Table 1 of Zeller, Delgado-Friedrichs & Huson, "Tegula — exploring a galaxy of
// two-dimensional periodic tilings", arXiv:2007.10625 (July 2020): the number of geometry-minimal
// periodic tilings of the sphere, euclidean and hyperbolic plane at each Dress complexity δ = 1..24,
// δ being the size of the Delaney–Dress symbol. Their totals sum to 2,395,220,319, which is the
// largest such enumeration published, and it ends at δ = 24.
//
// Two series, because the gap between them is half the argument: EVERYTHING is what a sweep over
// symbols has to generate, EUCLIDEAN is what can possibly survive. At δ = 24 that is 805,130 out of
// 1,616,414,549 — one in two thousand — so the cost is dominated by symbols in the wrong geometry.
//
// The three rules are ours, not theirs: a k-uniform tiling has at most 12k chambers (a vertex has
// degree at most 6, so carries at most 12 chambers, and there are k vertex orbits), so k = 1, 2, 3
// need δ ≤ 12, 24, 36. The published enumeration reaches exactly the k = 2 ceiling. k = 3 is off the
// right-hand end of the largest table anyone has computed, which is the whole point of the slide.
//
// Log y, so a line and not bars: bar LENGTH on a log axis encodes nothing a reader can compare, and
// the counts run over nine orders of magnitude. Colours are the deck's own blue and orange, which
// pass the categorical checks against this surface (worst adjacent ΔE 26.6 protan, 33.2 normal).

/** Table 1, δ = 1..24. `all` is the Total column; `euc` the # Euclidean column. */
const ALL = [
	12, 50, 36, 138, 82, 426, 369, 1265, 1339, 4198, 5270, 17574,
	26101, 84925, 151179, 502626, 1014453, 3404473, 7511829, 25248330, 59077506, 198103996, 483649593, 1616414549,
];
const EUC = [
	3, 15, 8, 37, 15, 86, 64, 217, 185, 527, 506, 1573,
	1575, 4227, 4528, 12078, 13105, 34242, 38470, 98076, 111145, 280574, 322102, 805130,
];

/** Where the published table ends, and how far the plot runs so k = 3 has somewhere to be. */
const LAST = 24;
const X_MAX = 38;
const Y_MAX = 10; // decades, 10^0 … 10^10

const SERIES = [
	{ key: "all", label: "every geometry", data: ALL, colour: T1_COLOUR },
	{ key: "euc", label: "euclidean only", data: EUC, colour: DART },
] as const;

const GRID = "rgba(20,20,20,0.09)";
const AXIS = "rgba(20,20,20,0.35)";

/** δ, count → plot coordinates. y is decades, so the axis is log by construction. */
const at = (d: number, n: number): Pt => [d, Math.log10(n)];

function line({ ctx, s }: Api, pts: Pt[], colour: string) {
	ctx.strokeStyle = colour;
	ctx.lineWidth = 2 / s;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(pts[0][0], pts[0][1]);
	for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
	ctx.stroke();
}

/** A marker with a surface ring, so a point sitting on the other series still reads. */
function marker({ ctx, s }: Api, p: Pt, colour: string, r = 4.2) {
	ctx.fillStyle = "#fff";
	ctx.beginPath();
	ctx.arc(p[0], p[1], (r + 2) / s, 0, 2 * Math.PI);
	ctx.fill();
	ctx.fillStyle = colour;
	ctx.beginPath();
	ctx.arc(p[0], p[1], r / s, 0, 2 * Math.PI);
	ctx.fill();
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const pow10 = (e: number) => `10${String(e).split("").map((c) => SUP[+c]).join("")}`;

function draw(api: Api) {
	const { ctx, s, text } = api;

	// the decade grid, recessive
	ctx.lineWidth = 1 / s;
	for (let e = 0; e <= Y_MAX; e += 2) {
		ctx.strokeStyle = GRID;
		ctx.beginPath();
		ctx.moveTo(0, e);
		ctx.lineTo(X_MAX, e);
		ctx.stroke();
		text(-0.5, e, pow10(e), { colour: SOFT, size: 0.6, align: "right" });
	}
	ctx.strokeStyle = AXIS;
	ctx.lineWidth = 1.4 / s;
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(X_MAX, 0);
	ctx.stroke();
	for (const d of [1, 12, 24, 36]) {
		ctx.beginPath();
		ctx.moveTo(d, 0);
		ctx.lineTo(d, -0.22);
		ctx.stroke();
		text(d, -0.62, String(d), { colour: SOFT, size: 0.6 });
	}
	text(X_MAX / 2, -1.5, "δ, the size of the symbol", { colour: SOFT, size: 0.62 });

	// The budget: 12k chambers at k uniform. Drawn before the data so the lines sit over it.
	for (const [k, d] of [[1, 12], [2, 24], [3, 36]] as const) {
		const reached = d <= LAST;
		ctx.strokeStyle = reached ? "rgba(20,20,20,0.34)" : "hsl(2 70% 46% / 0.55)";
		ctx.lineWidth = 1.6 / s;
		ctx.setLineDash([6 / s, 5 / s]);
		ctx.beginPath();
		ctx.moveTo(d, 0);
		ctx.lineTo(d, Y_MAX - 0.55);
		ctx.stroke();
		ctx.setLineDash([]);
		text(d, Y_MAX - 0.3, `k = ${k}`, {
			colour: reached ? INK : "hsl(2 70% 46%)", size: 0.68, weight: 700,
		});
	}

	// everything past the published table
	ctx.fillStyle = "hsl(2 70% 46% / 0.05)";
	ctx.fillRect(LAST, 0, X_MAX - LAST, Y_MAX - 0.55);

	for (const sr of SERIES) {
		const pts = sr.data.map((n, i) => at(i + 1, n));
		line(api, pts, sr.colour);
		marker(api, pts[pts.length - 1], sr.colour);
	}

	// Direct-labelled at the line ends rather than given a legend box: two series, and the label sits
	// where the eye already is. Identity is never colour alone, and the numbers wear ink, not the hue.
	for (const sr of SERIES) {
		const y = Math.log10(sr.data[LAST - 1]);
		text(LAST + 0.9, y + 0.05, sr.data[LAST - 1].toLocaleString("en-US"), { colour: INK, size: 0.62, weight: 600, align: "left" });
		text(LAST + 0.9, y - 0.75, sr.label, { colour: SOFT, size: 0.58, align: "left" });
	}
	text(31, 1.1, "never enumerated", { colour: "hsl(2 70% 46%)", size: 0.62, weight: 600 });
}

export function DsymGrowth() {
	const host = useRef<HTMLDivElement | null>(null);
	const canvas = useRef<HTMLCanvasElement | null>(null);

	const paint = useCallback(() => {
		const h = host.current, c = canvas.current;
		if (!h || !c) return;
		// A little air on every side for the axis labels, which live outside the data box.
		const p = prepare(h, c, { minX: -3.4, maxX: X_MAX + 2, minY: -2.2, maxY: Y_MAX + 0.8 }, 0.99);
		if (!p) return;
		drawWithText(p.ctx, p.s, p.dpr, Math.max(10, Math.min(16, h.clientWidth * 0.017)), draw);
	}, []);

	useEffect(() => {
		paint();
		const h = host.current;
		if (!h) return;
		const ro = new ResizeObserver(paint);
		ro.observe(h);
		return () => ro.disconnect();
	}, [paint]);

	return (
		<figure className="not-prose mx-auto m-0 flex w-full max-w-[54rem] flex-col items-center gap-1.5">
			<div ref={host} className="relative aspect-[10/3] w-full rounded-xl border border-line bg-surface-base">
				<canvas ref={canvas} className="absolute inset-0 h-full w-full" />
			</div>
			<figcaption className="text-center text-[clamp(0.56rem,0.78vh+0.15vw,0.78rem)] leading-snug text-fg-muted">
				every periodic tiling of Dress complexity δ ≤ 24, counted by Zeller, Delgado-Friedrichs and Huson (2020) —
				2,395,220,319 of them, 322 GB. Their table ends exactly at the <em>k</em> = 2 ceiling.
			</figcaption>
		</figure>
	);
}
