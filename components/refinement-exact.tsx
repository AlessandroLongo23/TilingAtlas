"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import {
	arc, arrowHead, DART, dot, halo, INK, rad, REJECT, segment, SOFT, type Api, type Pt,
} from "@/lib/render/figureGlyphs";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// Obligation 4 is the authors' one theorem, and the only one this project restates and reproves. The
// two panels are the reason why.
//
// Left, the anxiety. The duplicate test is 1-dimensional Weisfeiler–Leman colour refinement, which is
// known NOT to decide isomorphism. The standard witness needs nothing more than a successor map: a
// 3-cycle and a 6-cycle. Every node has exactly one successor and one predecessor in both, so every
// round of refinement recolours every node identically and the procedure stabilises with one class
// everywhere — and yet no isomorphism carries a node of one to a node of the other. Read as a claim
// about structures of this shape, the theorem is false.
//
// Right, why it is true here anyway, and the reason is geometric. A flag (vertex, edge, face) is a
// frame of the plane: an isometry fixing one fixes both ends of the edge, so it fixes that whole line
// pointwise, and the only isometry other than the identity that does is the reflection in it — which
// swaps the two faces at the edge and so does not fix the flag. So a symmetry fixing a flag is the
// identity (lemma B0), there is at most ONE isometry between any two flags, and the only question
// left is whether that one is a symmetry. That is the hypothesis the published proof uses without
// naming, and it is not available to the abstract quotient the algorithm manipulates.

const fill = (n: number) => hsbToHsla(polygonHue(n), 40, 100, 0.85);
const edge = (n: number) => hsbToHsla(polygonHue(n), 55, 62, 1);

// ---------------------------------------------------------------------------------------------

/** One directed cycle: n nodes, one successor each, every node indistinguishable from every other. */
function cycle(api: Api, c: Pt, r: number, n: number, start: number) {
	const at = (i: number): Pt => {
		const a = rad(start + (360 * i) / n);
		return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
	};
	for (let i = 0; i < n; i++) {
		const a = at(i), b = at((i + 1) % n);
		const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
		const gap = Math.min(0.09, r * 0.34);
		const from: Pt = [a[0] + Math.cos(ang) * gap, a[1] + Math.sin(ang) * gap];
		const to: Pt = [b[0] - Math.cos(ang) * gap * 1.15, b[1] - Math.sin(ang) * gap * 1.15];
		segment(api, from, to, SOFT, 1.8);
		arrowHead(api, to, ang, SOFT, 8);
	}
	for (let i = 0; i < n; i++) {
		const p = at(i);
		dot(api, p[0], p[1], 6, INK);
	}
}

function drawCounterexample(api: Api) {
	const { text } = api;
	cycle(api, [-0.56, 0.16], 0.27, 3, 90);
	cycle(api, [0.56, 0.16], 0.36, 6, 90);
	text(-0.56, -0.36, "3 nodes", { colour: SOFT, size: 0.66 });
	text(0.56, -0.36, "6 nodes", { colour: SOFT, size: 0.66 });

	// A cross, not U+2247: the font fallback on this machine returns the congruence glyphs rotated a
	// quarter turn, and the deck has been bitten by that once already.
	halo(api, 0, 0.16, 13);
	text(0, 0.16, "✗", { colour: REJECT, size: 1.0, weight: 700 });

	text(0, -0.72, "refinement never splits either,", { colour: INK, size: 0.66 });
	text(0, -0.95, "and no isomorphism relates them", { colour: INK, size: 0.66 });
}

// ---------------------------------------------------------------------------------------------

function drawFrame(api: Api) {
	const { ctx, s, text } = api;
	const a: Pt = [-0.42, 0.02], b: Pt = [0.42, 0.02];

	// the two faces at the edge, one above and one below: what the reflection in the edge exchanges
	for (const [top, n] of [[true, 6], [false, 4]] as const) {
		ctx.fillStyle = fill(n);
		ctx.strokeStyle = edge(n);
		ctx.lineWidth = 1.4 / s;
		ctx.beginPath();
		ctx.rect(a[0], top ? b[1] : b[1] - 0.44, b[0] - a[0], 0.44);
		ctx.fill();
		ctx.stroke();
	}
	text(0, 0.26, "f", { colour: "rgba(20,20,20,0.7)", size: 0.8, weight: 700 });
	text(-0.16, -0.28, "the other face", { colour: SOFT, size: 0.56 });

	// the line of the edge, which any symmetry fixing the flag fixes pointwise
	segment(api, [-0.86, 0.02], [0.86, 0.02], "rgba(20,20,20,0.4)", 1.6, [6, 5]);
	segment(api, a, b, INK, 3.6);
	dot(api, b[0], b[1], 5, INK);
	dot(api, a[0], a[1], 6.6, DART);
	text(a[0] - 0.14, a[1] - 0.02, "v", { colour: DART, size: 0.78, weight: 700 });
	// Beside the edge, not on it: the edge is three pixels thick and the letter is ten.
	text(-0.16, -0.09, "e", { colour: "rgba(20,20,20,0.75)", size: 0.72, weight: 700 });

	// the frame the flag carries: along the edge, and into the face. Both need a shaft — an arrowhead
	// on its own reads as a stray mark, which is what the first version looked like.
	segment(api, [a[0] + 0.03, a[1]], [a[0] + 0.24, a[1]], DART, 2.6);
	arrowHead(api, [a[0] + 0.3, a[1]], 0, DART, 10);
	segment(api, [a[0], a[1] + 0.04], [a[0], a[1] + 0.24], DART, 2.6);
	arrowHead(api, [a[0], a[1] + 0.3], Math.PI / 2, DART, 10);

	// The one other isometry that fixes the line, and what it does: exchange the two faces. Drawn
	// ACROSS the faces rather than beside them, so the arrow visibly starts in one and ends in the other.
	arc(api, [0.16, 0.3], [0.16, -0.26], -0.14, REJECT, 2, [5, 4]);
	arrowHead(api, [0.16, -0.26], -Math.PI / 2, REJECT, 9);
	arrowHead(api, [0.16, 0.3], Math.PI / 2, REJECT, 9);
	halo(api, 0.6, 0.02, 11);
	text(0.6, 0.02, "✗", { colour: REJECT, size: 0.82, weight: 700 });

	text(0, -0.66, "fixing v and e fixes the whole line,", { colour: INK, size: 0.64 });
	text(0, -0.88, "and the only other isometry that does", { colour: INK, size: 0.64 });
	text(0, -1.1, "swaps the two faces", { colour: INK, size: 0.64 });
}

// ---------------------------------------------------------------------------------------------

const BOX: Box = { minX: -1.15, maxX: 1.15, minY: -1.24, maxY: 0.78 };

const PANELS: PanelSpec[] = [
	{
		title: "why it should not work",
		note: "colour refinement is 1-dimensional Weisfeiler–Leman, and a 3-cycle and a 6-cycle refine into the same classes",
		box: BOX,
		draw: drawCounterexample,
	},
	{
		title: "why it does",
		note: "a flag is a frame of the plane, so a symmetry fixing one is the identity — and at most one isometry joins any two",
		box: BOX,
		draw: drawFrame,
	},
];

export function RefinementExact() {
	return (
		<div className="not-prose mx-auto flex w-full max-w-[52rem] flex-wrap items-start justify-center gap-6">
			{PANELS.map((p) => (
				<FigurePanel key={p.title} panel={p} aspect="6/5" />
			))}
		</div>
	);
}
