"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import {
	arrowHead, DART, dot, GHOST, halo, INK, rad, REJECT, segment, SOFT, T1_COLOUR, T2_COLOUR,
	type Api, type Pt,
} from "@/lib/render/figureGlyphs";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// Obligation 5: a finished gluing is abstract, and turning it into a picture is where the two failures
// live that no local rule can see. Four frames, risk then remedy then conclusion.
//
// 1. Holonomy. Developing means walking the assembly laying down coordinates. Come back round a
//    vertex and the accumulated rotation might not be a full turn — then the object has curvature at
//    that point and is not a plane figure at all.
// 2. Why it cannot happen. Angles live in twelfths of a turn: the interior angle of a regular n-gon is
//    a(n) = 6 − 12/n of them, an integer, and lemma C1(i) says the corner-step cycle through any dart
//    carries total weight exactly 12. Twelve twelfths is 2π, so every vertex of the glued object has a
//    flat disk around it. 3.4.6.4 is drawn: 2 + 3 + 4 + 3.
// 3. So the glued object is compact, connected, flat, and — after passing to the direction bundle,
//    which unfolds every site symmetry — oriented. Killing–Hopf leaves exactly one such surface: the
//    torus ℂ/Λ.
// 4. And the plane is its universal cover. The development is a covering map of the plane by the
//    plane, which is a homeomorphism, and that is what rules out tiles overlapping after wrapping
//    round — the failure that convexity, the original paper's one-sentence argument, does not touch.

const D = 12;
const units = (n: number) => D / 2 - D / n;
const WORD = [3, 4, 6, 4];

const wedgeFill = (n: number) => hsbToHsla(polygonHue(n), 40, 100, 0.85);
const wedgeLine = (n: number) => hsbToHsla(polygonHue(n), 55, 62, 1);

/** One tile's corner at the shared vertex, spanning its true angle. */
function wedge({ ctx, s }: Api, at: Pt, from: number, span: number, n: number, r: number) {
	ctx.fillStyle = wedgeFill(n);
	ctx.strokeStyle = wedgeLine(n);
	ctx.lineWidth = 1.4 / s;
	ctx.beginPath();
	ctx.moveTo(at[0], at[1]);
	ctx.arc(at[0], at[1], r, rad(from), rad(from + span));
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
}

// ---------------------------------------------------------------------------------------------

const C: Pt = [0, -0.04];
const R = 0.62;

function drawHolonomy(api: Api) {
	const { ctx, s, text } = api;
	// three of the four corners: 2 + 3 + 4 units, so the walk comes back a quarter turn short
	// Five triangles: 5 x 2 = 10 twelfths, so the link CANNOT close however it is continued. Chosen so
	// the panel is not a truncated 3.4.6.4 with one wedge missing, which read as "a tile is absent"
	// and made panel 2 look like the answer to a different question.
	let a = 66;
	for (const n of [3, 3, 3, 3, 3]) {
		const span = (360 * units(n)) / D;
		wedge(api, C, a, span, n, R);
		a += span;
	}
	// The first and last edges of the walk are the SAME edge of the gluing, and they have come back
	// short of each other. No fill in the gap: a filled sector reads as a hole in a tiling.
	segment(api, C, [C[0] + Math.cos(rad(66)) * R * 1.16, C[1] + Math.sin(rad(66)) * R * 1.16], DART, 3);
	segment(api, C, [C[0] + Math.cos(rad(a)) * R * 1.16, C[1] + Math.sin(rad(a)) * R * 1.16], DART, 3);
	ctx.strokeStyle = REJECT;
	ctx.lineWidth = 2 / s;
	ctx.setLineDash([5 / s, 4 / s]);
	ctx.beginPath();
	ctx.arc(C[0], C[1], R * 1.16, rad(a), rad(66 + 360));
	ctx.stroke();
	ctx.setLineDash([]);
	const mid = rad(a + (360 + 66 - a) / 2);
	halo(api, C[0] + Math.cos(mid) * R * 1.16, C[1] + Math.sin(mid) * R * 1.16, 10);
	text(C[0] + Math.cos(mid) * R * 1.16, C[1] + Math.sin(mid) * R * 1.16, "?", {
		colour: REJECT, size: 0.95, weight: 700,
	});
	dot(api, C[0], C[1], 5.5);
	text(0, -0.88, "the same edge, come back turned", { colour: REJECT, size: 0.62, weight: 600 });
}

function drawFlat(api: Api) {
	const { text } = api;
	let a = 66;
	for (const n of WORD) {
		const span = (360 * units(n)) / D;
		wedge(api, C, a, span, n, R);
		const mid = rad(a + span / 2);
		text(C[0] + Math.cos(mid) * R * 0.66, C[1] + Math.sin(mid) * R * 0.66, String(units(n)), {
			colour: "rgba(20,20,20,0.85)", size: 0.76, weight: 700,
		});
		a += span;
	}
	dot(api, C[0], C[1], 5.5);
	text(0, -0.86, "2 + 3 + 4 + 3 = 12", { colour: INK, size: 0.72, weight: 600 });
}

// ---------------------------------------------------------------------------------------------

/** The cell, with the two edge identifications that make it a torus. */
function drawTorus(api: Api) {
	const { ctx, s, text } = api;
	const h = 0.5;
	ctx.fillStyle = "rgba(20,20,20,0.035)";
	ctx.strokeStyle = SOFT;
	ctx.lineWidth = 1.6 / s;
	ctx.beginPath();
	ctx.rect(-h, -h - 0.06, 2 * h, 2 * h);
	ctx.fill();
	ctx.stroke();

	// A tile STRADDLING the seam, drawn once on each side and CLIPPED to the cell, so the panel shows
	// what "closed" means instead of asserting it: what leaves the right edge arrives on the left.
	// Unclipped the two halves hang off the outside and read as two extra tiles.
	ctx.save();
	ctx.beginPath();
	ctx.rect(-h, -h - 0.06, 2 * h, 2 * h);
	ctx.clip();
	for (const [cx, cy, n] of [[-0.2, 0.16, 6], [0.22, -0.24, 4], [h, 0.2, 4], [-h, 0.2, 4]] as const) {
		const rr = n === 6 ? 0.19 : 0.15;
		ctx.fillStyle = wedgeFill(n);
		ctx.strokeStyle = wedgeLine(n);
		ctx.lineWidth = 1.2 / s;
		ctx.beginPath();
		for (let i = 0; i < n; i++) {
			const t = rad(90 + (360 * i) / n);
			const x = cx + Math.cos(t) * rr, y = cy - 0.06 + Math.sin(t) * rr;
			if (i) ctx.lineTo(x, y);
			else ctx.moveTo(x, y);
		}
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}
	ctx.restore();

	// The identification, in slide 19's convention and no other: the edges RUNNING along T1 are the
	// ones T2 carries across, so they wear T2's two chevrons, and the edges along T2 wear T1's one.
	// The first version had both the colour and the count on the wrong pair, which put this panel at
	// odds with slide 19 and with panel 4 of its own figure, where T1 is the horizontal generator.
	const chevrons = (at: Pt, ang: number, count: number, colour: string) => {
		for (let i = 0; i < count; i++) {
			const off = (i - (count - 1) / 2) * 0.1;
			const base: Pt = [at[0] + Math.cos(ang) * off, at[1] + Math.sin(ang) * off];
			arrowHead(api, base, ang, colour, 11);
		}
	};
	for (const y of [-h - 0.06, h - 0.06]) chevrons([0, y], 0, 2, T2_COLOUR);
	for (const x of [-h, h]) chevrons([x, -0.06], Math.PI / 2, 1, T1_COLOUR);
	text(0, -0.88, "closed, flat, oriented", { colour: INK, size: 0.66, weight: 600 });
	text(0, -1.06, "once the bundle unfolds the mirrors", { colour: SOFT, size: 0.58 });
}

/** The lattice of lifts, with one cell picked out: the plane covering the torus. */
function drawCover(api: Api) {
	const { ctx, s, text } = api;
	const w = 0.36;
	ctx.lineWidth = 1.3 / s;
	for (let i = -2; i <= 1; i++) {
		for (let j = -2; j <= 1; j++) {
			const x = i * w + w / 2, y = j * w + w / 2 - 0.06;
			const home = i === -1 && j === -1;
			ctx.fillStyle = home ? "rgba(20,20,20,0.07)" : "transparent";
			ctx.strokeStyle = home ? INK : GHOST;
			ctx.beginPath();
			ctx.rect(x - w / 2, y - w / 2, w, w);
			if (home) ctx.fill();
			ctx.stroke();
		}
	}
	for (const [dx, dy, colour] of [[w, 0, T1_COLOUR], [0, w, T2_COLOUR]] as const) {
		segment(api, [0, -0.06], [dx, dy - 0.06], colour, 2.6);
		arrowHead(api, [dx, dy - 0.06], Math.atan2(dy, dx), colour, 11);
	}
	dot(api, 0, -0.06, 5);
	halo(api, 0, 0.52, 30);
	text(0, 0.52, "ℂ → ℂ/Λ", { colour: INK, size: 0.68, weight: 600 });
	text(0, -0.88, "the tiles are lifts, so nothing folds", { colour: INK, size: 0.62, weight: 600 });
}

// ---------------------------------------------------------------------------------------------

const BOX: Box = { minX: -0.92, maxX: 0.92, minY: -1.16, maxY: 0.8 };

const PANELS: PanelSpec[] = [
	{
		title: "the risk",
		note: "walking the assembly to lay down coordinates, the tour of a vertex might come back to its own first edge turned",
		box: BOX,
		draw: drawHolonomy,
	},
	{
		title: "why it cannot happen",
		note: "angles are whole twelfths of a turn and every vertex link carries exactly twelve, so every vertex has a flat disk",
		box: BOX,
		draw: drawFlat,
	},
	{
		title: "so it is a torus",
		note: "the bundle surface is compact and flat, and oriented because the bundle unfolds every mirror; Killing–Hopf then leaves ℂ/Λ and nothing else",
		box: BOX,
		draw: drawTorus,
	},
	{
		title: "the plane covers it",
		note: "the plane is the cover of the glued surface and the tiles are its lifts, so there is no immersion that could fold and no overlap",
		box: BOX,
		draw: drawCover,
	},
];

export function FlatTorus() {
	return (
		<div className="not-prose mx-auto flex w-full max-w-[62rem] flex-wrap items-start justify-center gap-5">
			{PANELS.map((p) => (
				<FigurePanel key={p.title} panel={p} aspect="1/1" />
			))}
		</div>
	);
}
