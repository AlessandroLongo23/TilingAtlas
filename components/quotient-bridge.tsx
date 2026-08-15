"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import {
	arc, arrowHead, DART, dot, halo, INK, rad, segment, SOFT, T1_COLOUR,
	type Api, type Pt,
} from "@/lib/render/figureGlyphs";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// Obligation 6 runs the other way round from the rest: not "what the engine builds is a tiling" but
// "every tiling is something the engine could have built". Three steps, one panel each.
//
// 1. Periodicity is a THEOREM here, not an assumption. Every point of the plane lies in some tile, so
//    within one dodecagon circumradius of a corner of that tile; with only k vertex orbits, the union
//    of k closed disks of that radius meets every orbit of points, so G(T) acts cocompactly. It is
//    also discrete (lemma B0), and a discrete cocompact planar isometry group is one of the 17
//    wallpaper groups by Bieberbach — so it contains a rank-2 lattice of translations.
// 2. The quotient is finite, and small. Every interior angle is at least 60°, so a vertex has degree
//    at most 6 and carries at most 12 flags; k vertex orbits give at most 12k flag orbits. That bound
//    is what makes T/G(T) a finite object at all — and it is the same 12k that walls the
//    Delaney–Dress sweep two acts earlier, used here for the opposite purpose.
// 3. So T/G(T) is a finite closed valid gluing over the alphabet with exactly k vertices, it is a
//    core (B2b), and develop takes it back to T. Fold and develop are mutually inverse, which is the
//    sentence that turns five obligations about what the engine builds into a completeness claim.
//    Panel three folds by the LATTICE, not by the whole group, which is what lets the drawing be exact:
//    the honeycomb modulo its translations is two vertices, three edges and one face.

const fill = (n: number) => hsbToHsla(polygonHue(n), 40, 100, 0.85);
const stroke = (n: number) => hsbToHsla(polygonHue(n), 55, 62, 1);

function polygon({ ctx, s }: Api, c: Pt, n: number, r: number, turn = 90, w = 1.4) {
	ctx.fillStyle = fill(n);
	ctx.strokeStyle = stroke(n);
	ctx.lineWidth = w / s;
	ctx.beginPath();
	for (let i = 0; i < n; i++) {
		const t = rad(turn + (360 * i) / n);
		const x = c[0] + Math.cos(t) * r, y = c[1] + Math.sin(t) * r;
		if (i) ctx.lineTo(x, y);
		else ctx.moveTo(x, y);
	}
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
}

// ---------------------------------------------------------------------------------------------

/** A dodecagon, its circumcircle, and a point in it: nothing is further from a vertex than R. */
function drawCocompact(api: Api) {
	const { ctx, s, text } = api;
	const c: Pt = [0, 0.06], R = 0.5;
	polygon(api, c, 12, R, 90);

	ctx.strokeStyle = "rgba(20,20,20,0.35)";
	ctx.lineWidth = 1.4 / s;
	ctx.setLineDash([5 / s, 4 / s]);
	ctx.beginPath();
	ctx.arc(c[0], c[1], R, 0, 2 * Math.PI);
	ctx.stroke();
	ctx.setLineDash([]);

	// an arbitrary point, and the corner it cannot be further than R from
	const p: Pt = [c[0] - 0.19, c[1] - 0.12];
	const near: Pt = [c[0] + Math.cos(rad(210)) * R, c[1] + Math.sin(rad(210)) * R];
	segment(api, p, near, DART, 2.2, [5, 4]);
	dot(api, p[0], p[1], 5.4, DART);
	for (let i = 0; i < 12; i++) {
		const t = rad(90 + 30 * i);
		dot(api, c[0] + Math.cos(t) * R, c[1] + Math.sin(t) * R, 3.6, "rgba(20,20,20,0.6)");
	}

	segment(api, c, [c[0] + Math.cos(rad(-30)) * R, c[1] + Math.sin(rad(-30)) * R], INK, 2.2);
	halo(api, c[0] + Math.cos(rad(-30)) * R * 0.55, c[1] + Math.sin(rad(-30)) * R * 0.55 + 0.06, 9);
	text(c[0] + Math.cos(rad(-30)) * R * 0.55, c[1] + Math.sin(rad(-30)) * R * 0.55 + 0.06, "R", { colour: INK, size: 0.66, weight: 700 });
	text(0, -0.62, "every point lies in a tile, so within R of a vertex", { colour: INK, size: 0.58 });
	text(0, -0.8, "and the vertices fall into k orbits", { colour: INK, size: 0.58 });
}

/** A vertex of the largest possible degree, and the two flags each of its corners carries. */
function drawFlagBound(api: Api) {
	const { ctx, s, text } = api;
	const c: Pt = [0, 0.02], R = 0.52;
	// Six unit triangles round the vertex — the densest a vertex can be, since every interior angle is
	// at least 60 degrees. Drawn as triangles and not as pie slices: the claim is about a tiling.
	for (let i = 0; i < 6; i++) {
		const a = rad(60 * i), b = rad(60 * (i + 1));
		ctx.fillStyle = fill(3);
		ctx.strokeStyle = stroke(3);
		ctx.lineWidth = 1.3 / s;
		ctx.beginPath();
		ctx.moveTo(c[0], c[1]);
		ctx.lineTo(c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R);
		ctx.lineTo(c[0] + Math.cos(b) * R, c[1] + Math.sin(b) * R);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}
	// each corner splits into two flags at its bisector: 6 corners, 12 flags
	for (let i = 0; i < 6; i++) {
		const t = rad(60 * i + 30);
		const reach = R * Math.cos(rad(30));
		segment(api, c, [c[0] + Math.cos(t) * reach, c[1] + Math.sin(t) * reach], "rgba(20,20,20,0.34)", 1.4, [4, 3]);
	}
	// Two per corner, CLUSTERED on their own bisector. Spread evenly they read as twelve dots on a
	// circle and the pairing — which is the whole "2 flags per corner" claim — is invisible.
	for (let i = 0; i < 6; i++) {
		for (const off of [-11, 11]) {
			const t = rad(60 * i + 30 + off);
			dot(api, c[0] + Math.cos(t) * R * 0.62, c[1] + Math.sin(t) * R * 0.62, 3.4, INK);
		}
	}
	// One of them named, and named "flag": slide 28 now introduces the word where the 12k count is
	// derived, and this slide's prose uses it. It went out as "frame" for one afternoon, while the term
	// was undefined anywhere in the deck; 28 fixed that, so the caption goes back to the standard name.
	ctx.fillStyle = "hsl(28 88% 44% / 0.22)";
	ctx.beginPath();
	ctx.moveTo(c[0], c[1]);
	ctx.lineTo(c[0] + Math.cos(rad(0)) * R, c[1] + Math.sin(rad(0)) * R);
	ctx.lineTo(c[0] + Math.cos(rad(30)) * R * Math.cos(rad(30)), c[1] + Math.sin(rad(30)) * R * Math.cos(rad(30)));
	ctx.closePath();
	ctx.fill();
	text(c[0] + 0.52, c[1] + 0.1, "one flag", { colour: DART, size: 0.5, weight: 600, align: "left" });
	dot(api, c[0], c[1], 5.4);
	text(0, -0.7, "at most 6 edges, so at most 12 flags", { colour: INK, size: 0.62 });
}

/** Fold a tiling by its own symmetries, develop the result, and you are back where you started. */
function drawRoundTrip(api: Api) {
	const { text } = api;

	// left: a patch, standing for the whole tiling. Honeycomb spacing, so it is a tiling and not four
	// hexagons with gaps between them: centres sit sqrt(3)R apart along a row, 1.5R between rows, with
	// every other row offset by half a step.
	const R = 0.16, dx = Math.sqrt(3) * R, dy = 1.5 * R;
	for (let j = -1; j <= 1; j++) {
		for (let i = -1; i <= 0; i++) {
			polygon(api, [-0.58 + (i + (j & 1 ? 0.5 : 0)) * dx + dx / 2, 0.3 + j * dy], 6, R, 90, 1.1);
		}
	}
	text(-0.52, -0.2, "the tiling", { colour: INK, size: 0.62, weight: 700 });

	// Right: the honeycomb folded by its TRANSLATION lattice, which is what makes this drawing exactly
	// true rather than schematic. Two vertices, three edges, one hexagonal face: V − E + F = 0, the
	// honeycomb on a torus. Folding by the full symmetry group instead would give a single vertex
	// carrying one half-edge glued to itself, which is correct and needs a paragraph to read; B3 covers
	// any subgroup with finitely many flag orbits, so develop still returns T either way.
	// The three edges are drawn as one bowed curve each, and the seam where their two half-edges meet
	// has to be SHORT: the three midpoints sit one above another, and at full length the ticks join up
	// into a single line through the middle that reads as a divider instead of three seams.
	const A: Pt = [0.42, 0.3], B: Pt = [0.86, 0.3];
	for (const [bow, t] of [[0.22, 0.36], [0, 0.5], [-0.22, 0.64]] as const) {
		arc(api, A, B, bow, INK, 3);
		// The seam at a different point along each curve. Put all three at the midpoint and they stack
		// into one vertical dashed line through the middle, which in this company reads as a mirror.
		const c: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + bow];
		const at: Pt = [
			(1 - t) ** 2 * A[0] + 2 * t * (1 - t) * c[0] + t ** 2 * B[0],
			(1 - t) ** 2 * A[1] + 2 * t * (1 - t) * c[1] + t ** 2 * B[1],
		];
		const d: Pt = [
			2 * (1 - t) * (c[0] - A[0]) + 2 * t * (B[0] - c[0]),
			2 * (1 - t) * (c[1] - A[1]) + 2 * t * (B[1] - c[1]),
		];
		const ang = Math.atan2(d[1], d[0]) + Math.PI / 2;
		segment(api, [at[0] - Math.cos(ang) * 0.035, at[1] - Math.sin(ang) * 0.035],
			[at[0] + Math.cos(ang) * 0.035, at[1] + Math.sin(ang) * 0.035], SOFT, 2);
	}
	for (const h of [A, B]) dot(api, h[0], h[1], 5.4);
	text(0.64, -0.2, "one cell", { colour: INK, size: 0.62, weight: 700 });

	// Both maps in the clear channel between the patch and the quotient. Drawn wider they ran their
	// heads into the hexagons and dropped "develop" on top of one.
	const up = arc(api, [-0.02, 0.56], [0.34, 0.5], 0.07, DART, 2.2);
	arrowHead(api, [0.34, 0.5], -0.2, DART, 10);
	text(up[0], up[1] + 0.13, "fold", { colour: DART, size: 0.58, weight: 600 });
	const down = arc(api, [0.34, 0.1], [-0.02, 0.04], 0.07, T1_COLOUR, 2.2);
	arrowHead(api, [-0.02, 0.04], Math.PI + 0.2, T1_COLOUR, 10);
	text(down[0], down[1] - 0.14, "develop", { colour: T1_COLOUR, size: 0.58, weight: 600 });

	text(0, -0.7, "and they are mutually inverse", { colour: INK, size: 0.62 });
}

// ---------------------------------------------------------------------------------------------

const BOX: Box = { minX: -0.9, maxX: 0.9, minY: -0.9, maxY: 0.78 };

const PANELS: PanelSpec[] = [
	{
		title: "k neighbourhoods cover the plane",
		note: "with a discrete group that gives a wallpaper group, a lattice of translations, and periodicity as a theorem",
		box: BOX,
		draw: drawCocompact,
	},
	{
		title: "so the folded object is finite",
		note: "every angle is at least 60°, so a vertex carries at most twelve flags and a k-uniform tiling at most 12k flag orbits",
		box: BOX,
		draw: drawFlagBound,
	},
	{
		title: "and every tiling is a gluing",
		note: "folding by the lattice gives a finite closed gluing over the alphabet, and developing it returns T; folding by the whole group gives the core the search enumerates, with exactly k vertices",
		box: BOX,
		draw: drawRoundTrip,
	},
];

export function QuotientBridge() {
	return (
		<div className="not-prose mx-auto flex w-full max-w-[66rem] flex-wrap items-start justify-center gap-5">
			{PANELS.map((p) => (
				<FigurePanel key={p.title} panel={p} aspect="1/1" />
			))}
		</div>
	);
}
