"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import {
	arc, arrowHead, DART, dot, INK, rad, segment, SOFT, T1_COLOUR,
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
//    The pair in that panel is schematic on one point, deliberately: the fragment on the left stands
//    for a tiling rather than being one, so the two vertices on the right are not a claim about how
//    many orbits those particular hexagons have. Drawing the honeycomb's own quotient truthfully would
//    mean one vertex carrying one half-edge glued to itself, which needs a paragraph the panel has no
//    room for.

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

	text(0.42, -0.32, "R", { colour: SOFT, size: 0.72, weight: 600 });
	segment(api, c, [c[0] + Math.cos(rad(-30)) * R, c[1] + Math.sin(rad(-30)) * R], SOFT, 1.6);
	text(0, -0.78, "every point is within R of a vertex", { colour: INK, size: 0.64 });
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
	for (let i = 0; i < 12; i++) {
		const t = rad(30 * i + 15);
		dot(api, c[0] + Math.cos(t) * R * 0.58, c[1] + Math.sin(t) * R * 0.58, 3.4, INK);
	}
	dot(api, c[0], c[1], 5.4);
	text(0, -0.78, "degree ≤ 6, so ≤ 12 flags", { colour: INK, size: 0.64 });
}

/** Fold a tiling by its own symmetries, develop the result, and you are back where you started. */
function drawRoundTrip(api: Api) {
	const { text } = api;

	// left: a patch, standing for the whole tiling. Honeycomb spacing, so it is a tiling and not four
	// hexagons with gaps between them: centres sit sqrt(3)R apart along a row, 1.5R between rows, with
	// every other row offset by half a step.
	const R = 0.175, dx = Math.sqrt(3) * R, dy = 1.5 * R;
	for (let j = -1; j <= 1; j++) {
		for (let i = -1; i <= 0; i++) {
			polygon(api, [-0.5 + (i + (j & 1 ? 0.5 : 0)) * dx + dx / 2, 0.26 + j * dy], 6, R, 90, 1.1);
		}
	}
	text(-0.5, -0.3, "T", { colour: INK, size: 0.8, weight: 700 });

	// Right: its quotient. Drawn CLOSED — three edges between two vertices, no free ends anywhere —
	// because the quotient of a tiling by its own symmetries has every half-edge glued. Free ends here
	// would say the opposite of what the panel claims.
	// The three edges are drawn as one bowed curve each, and the seam where their two half-edges meet
	// has to be SHORT: the three midpoints sit one above another, and at full length the ticks join up
	// into a single line through the middle that reads as a divider instead of three seams.
	const A: Pt = [0.38, 0.28], B: Pt = [0.8, 0.28];
	for (const bow of [0.2, 0, -0.2]) {
		const m = arc(api, A, B, bow, INK, 3);
		const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) + Math.PI / 2;
		segment(api, [m[0] - Math.cos(ang) * 0.026, m[1] - Math.sin(ang) * 0.026],
			[m[0] + Math.cos(ang) * 0.026, m[1] + Math.sin(ang) * 0.026], SOFT, 2);
	}
	for (const h of [A, B]) dot(api, h[0], h[1], 5.4);
	text(0.59, -0.3, "T / G(T)", { colour: INK, size: 0.7, weight: 700, mono: true });

	// the two maps, and the claim that they are inverse
	const up = arc(api, [-0.16, 0.5], [0.2, 0.5], 0.13, DART, 2.2);
	arrowHead(api, [0.2, 0.5], -0.55, DART, 10);
	text(up[0], up[1] + 0.14, "fold", { colour: DART, size: 0.6, weight: 600 });
	const down = arc(api, [0.2, 0.1], [-0.16, 0.1], 0.13, T1_COLOUR, 2.2);
	arrowHead(api, [-0.16, 0.1], Math.PI + 0.55, T1_COLOUR, 10);
	text(down[0], down[1] - 0.15, "develop", { colour: T1_COLOUR, size: 0.6, weight: 600 });

	text(0, -0.78, "and they are mutually inverse", { colour: INK, size: 0.64 });
}

// ---------------------------------------------------------------------------------------------

const BOX: Box = { minX: -0.94, maxX: 0.94, minY: -0.94, maxY: 0.72 };

const PANELS: PanelSpec[] = [
	{
		title: "so the symmetries act cocompactly",
		note: "with a discrete group that gives a wallpaper group, a lattice of translations, and periodicity as a theorem",
		box: BOX,
		draw: drawCocompact,
	},
	{
		title: "and the quotient is finite",
		note: "every angle is at least 60°, so a vertex carries at most twelve flags and a k-uniform tiling at most 12k",
		box: BOX,
		draw: drawFlagBound,
	},
	{
		title: "so every tiling is a gluing",
		note: "T/G(T) is a finite closed gluing over the alphabet with exactly k vertices, and developing it returns T",
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
