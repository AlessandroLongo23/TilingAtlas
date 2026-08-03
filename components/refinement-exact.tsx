"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import {
	ACCEPT, arc, arrowHead, DART, dot, GHOST, halo, INK, rad, REJECT, segment, SOFT,
	type Api, type Pt,
} from "@/lib/render/figureGlyphs";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// Obligation 4 is the authors' one theorem, and the only one this project restates and reproves. The
// two panels are the reason why.
//
// Left, the anxiety, drawn as ONE structure and not as two. The first version drew a 3-cycle beside a
// 6-cycle and called them indistinguishable, which is the thesis's own phrasing and is a hostage:
// 1-WL as an isomorphism test compares colour MULTISETS, and {A×3} against {A×6} separates them at
// once. Verified by construction rather than argued.
//
// The disjoint union is the honest witness. Refinement puts all nine nodes in one class — every node
// has one successor, forever — while Aut = Z3 × Z6 has two orbits, so refinement identifies nodes no
// symmetry relates. That is a counterexample to the obligation exactly as stated, and cardinality
// cannot rescue it because there is only one object. (Checked: 1 class, |Aut| = 18, 2 orbits.)
//
// What excludes it is the hypothesis the published statement leaves out: the test only ever runs on
// CORES, and this is not one — refinement collapsing it to a single class is precisely what being a
// non-core means, so `simplify` rejects it before `comparesolutions` sees it (R1(iii), P1, R2).
//
// Right, why it is true here anyway, and the reason is geometric. A flag (vertex, edge, face) is a
// frame of the plane: an isometry fixing one fixes both ends of the edge, so it fixes that whole line
// pointwise, and the only isometry other than the identity that does is the reflection in it — which
// swaps the two faces at the edge and so does not fix the flag. So a symmetry fixing a flag is the
// identity (lemma B0), there is at most ONE isometry between any two flags, and the only question
// left is whether that one is a symmetry. That is the hypothesis the published proof uses without
// naming, and it is not available to the abstract quotient the algorithm manipulates.

/** The face fill, at whatever value the panel wants: the two faces differ by value, not by hue. */
const face = (alpha: number) => hsbToHsla(polygonHue(6), 40, 100, alpha);
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
	const { ctx, s, text } = api;
	// one object, two rings: the box is what says they are one structure and not two
	ctx.strokeStyle = GHOST;
	ctx.lineWidth = 1.4 / s;
	ctx.setLineDash([6 / s, 5 / s]);
	ctx.beginPath();
	ctx.roundRect(-1.0, -0.28, 2.0, 0.94, 0.08);
	ctx.stroke();
	ctx.setLineDash([]);

	cycle(api, [-0.5, 0.2], 0.24, 3, 90);
	cycle(api, [0.5, 0.2], 0.31, 6, 90);
	text(0, 0.78, "one structure, nine nodes", { colour: SOFT, size: 0.62 });

	// the two verdicts side by side: the algorithm's, then the truth. The clash is the panel.
	text(-0.34, -0.62, "✓", { colour: ACCEPT, size: 0.9, weight: 700 });
	text(0.06, -0.62, "refinement: one class", { colour: INK, size: 0.62, align: "left" });
	text(-0.34, -0.92, "✗", { colour: REJECT, size: 0.9, weight: 700 });
	text(0.06, -0.92, "symmetry: two orbits", { colour: INK, size: 0.62, align: "left" });
}

// ---------------------------------------------------------------------------------------------

function drawFrame(api: Api) {
	const { ctx, s, text } = api;
	const a: Pt = [-0.42, 0.02], b: Pt = [0.42, 0.02];

	// The two faces in ONE hue at two values. A hexagon against a square invites the conclusion that
	// the reflection fails because the tiles DIFFER, and B0 excludes it because it moves f, congruent
	// or not; but one flat colour for both made them read as a single tile with a line through it,
	// which is worse. Same hue, different value: two faces, and nothing about their shapes is claimed.
	for (const [top, alpha] of [[true, 0.9], [false, 0.42]] as const) {
		ctx.fillStyle = face(alpha);
		ctx.strokeStyle = edge(6);
		ctx.lineWidth = 1.4 / s;
		ctx.beginPath();
		ctx.rect(a[0], top ? b[1] : b[1] - 0.44, b[0] - a[0], 0.44);
		ctx.fill();
		ctx.stroke();
	}
	text(0, 0.26, "f", { colour: INK, size: 0.8, weight: 700 });
	text(-0.16, -0.28, "the other face", { colour: SOFT, size: 0.54 });

	// the line of the edge, which any symmetry fixing the flag fixes pointwise
	segment(api, [-0.86, 0.02], [0.86, 0.02], SOFT, 1.6, [6, 5]);
	segment(api, a, b, INK, 3.6);
	dot(api, b[0], b[1], 5, INK);
	halo(api, b[0] - 0.02, b[1] - 0.13, 8);
	text(b[0] - 0.02, b[1] - 0.13, "w", { colour: SOFT, size: 0.64, weight: 600 });
	dot(api, a[0], a[1], 6.6, DART);
	halo(api, a[0] - 0.15, a[1] - 0.11, 8);
	text(a[0] - 0.15, a[1] - 0.11, "v", { colour: DART, size: 0.78, weight: 700 });
	// Beside the edge, not on it: the edge is three pixels thick and the letter is ten.
	text(-0.16, -0.09, "e", { colour: "rgba(20,20,20,0.75)", size: 0.72, weight: 700 });

	// The frame the flag carries: along the edge, and into the face. Lifted off the edge and off the
	// face's own border — drawn ON them, the first vector repainted the edge's left third orange and
	// the second hid inside the rectangle's outline.
	const fy = a[1] + 0.06, fx = a[0] + 0.05;
	segment(api, [fx, fy], [fx + 0.22, fy], DART, 2.6);
	arrowHead(api, [fx + 0.28, fy], 0, DART, 10);
	segment(api, [fx, fy], [fx, fy + 0.2], DART, 2.6);
	arrowHead(api, [fx, fy + 0.26], Math.PI / 2, DART, 10);

	// The one other isometry that fixes the line, and what it does: exchange the two faces. Drawn
	// ACROSS the faces rather than beside them, so the arrow visibly starts in one and ends in the other.
	arc(api, [0.3, 0.3], [0.3, -0.26], 0.13, REJECT, 2, [5, 4]);
	arrowHead(api, [0.3, -0.26], -Math.PI / 2, REJECT, 9);
	arrowHead(api, [0.3, 0.3], Math.PI / 2, REJECT, 9);
	halo(api, 0.56, 0.02, 11);
	text(0.56, 0.02, "✗", { colour: REJECT, size: 0.82, weight: 700 });

	text(0, -0.66, "fixing v and e fixes the whole line,", { colour: INK, size: 0.64 });
	text(0, -0.88, "and the only other isometry that does", { colour: INK, size: 0.64 });
	text(0, -1.1, "swaps the two faces", { colour: INK, size: 0.64 });
}

// ---------------------------------------------------------------------------------------------

const BOX: Box = { minX: -1.15, maxX: 1.15, minY: -1.24, maxY: 0.78 };

const PANELS: PanelSpec[] = [
	{
		title: "why it should not work",
		note: "refinement puts all nine nodes in one class, and no symmetry crosses between the rings; neither is this a core, which is the missing hypothesis",
		box: BOX,
		draw: drawCounterexample,
	},
	{
		title: "why it does",
		note: "a flag is a frame of the plane, so a symmetry fixing one is the identity, and at most one isometry joins any two",
		box: BOX,
		draw: drawFrame,
	},
];

export function RefinementExact() {
	return (
		<div className="not-prose mx-auto flex w-full max-w-[52rem] flex-wrap items-start justify-center gap-6">
			{PANELS.map((p) => (
				<FigurePanel key={p.title} panel={p} aspect="4/3" />
			))}
		</div>
	);
}
