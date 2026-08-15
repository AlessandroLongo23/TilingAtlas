"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import {
	arc, arrowHead, DART, dot, GHOST, halo, INK, REJECT, segment, SOFT,
	type Api, type Pt,
} from "@/lib/render/figureGlyphs";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// Obligation 4 is the authors' one theorem, and the only one this project restates and reproves.
//
// Left, WHAT THE TEST ACTUALLY DOES, because that is what the room needs and nothing else on the slide
// was giving it. Two assemblies are the same when their half-edges can be matched up so that partners
// go to partners, neighbours round a vertex to neighbours, and mirrors to mirrors. `comparesolutions`
// (eu_pruner.cpp:186) looks for that matching by ELIMINATION, not by building any canonical name: a
// table of which half-edge may still stand in for which, everything allowed at the start, a pairing
// crossed off the moment it forces one that has already gone, swept to a fixpoint. The panel draws that
// table at the end of the sweep, so the surviving cells ARE the matching and the crossed ones show what
// the sweep removed. The matching drawn is deliberately not the diagonal: the identity would read as
// "the two arrays were already in the same order", which is the one case that needs no test.
//
// ⚑ This panel replaced a 3-cycle-beside-a-6-cycle counterexample, 2026-08-09, on AL's second and then
// third complaint about it. It was the honest witness that the published statement is false as written
// (elimination separates nothing there, while no matching exists), and it stays in the prose as one
// clause and in the presenter comment in full. As a FIGURE it cost nine abstract dots, a paragraph of
// setup the slide has no room for, and minutes of talk time, to make a negative point — while the thing
// the audience actually did not understand, the algorithm itself, had no picture at all.
//
// Right, why elimination is enough here, and the reason is geometric. A vertex, one edge out of it and
// one side of that edge form a frame of the plane: a symmetry fixing one fixes both ends of the edge,
// so it fixes that whole line pointwise, and the only other symmetry that does is the reflection in it,
// which swaps the two faces and so moves the frame. So a symmetry fixing a frame is the identity
// (lemma B0), there is at most one rigid motion between any two frames, and a pairing that survives the
// sweep is a real symmetry. That is the hypothesis the published proof uses without naming, and it is
// not available to the abstract assembly the algorithm manipulates.

/** The face fill, at whatever value the panel wants: the two faces differ by value, not by hue. */
const face = (alpha: number) => hsbToHsla(polygonHue(6), 40, 100, alpha);
const edge = (n: number) => hsbToHsla(polygonHue(n), 55, 62, 1);

// ---------------------------------------------------------------------------------------------

/**
 * Row i of the table is a half-edge of one assembly, column j a half-edge of the other, and the cell
 * says whether i may still stand in for j. Not the identity permutation on purpose: see the header.
 */
const MATCH = [2, 0, 3, 1];

function drawElimination(api: Api) {
	const { text } = api;
	const x0 = -0.45, y0 = 0.44, step = 0.3;
	const cx = (j: number) => x0 + j * step;
	const cy = (i: number) => y0 - i * step;

	for (let j = 0; j < 4; j++) text(cx(j), y0 + 0.26, String(j + 1), { colour: SOFT, size: 0.54 });
	for (let i = 0; i < 4; i++) text(x0 - 0.3, cy(i), String(i + 1), { colour: SOFT, size: 0.54 });

	for (let i = 0; i < 4; i++) {
		for (let j = 0; j < 4; j++) {
			const p: Pt = [cx(j), cy(i)];
			if (MATCH[i] === j) {
				dot(api, p[0], p[1], 7, INK);
				continue;
			}
			// Crossed off, and drawn as a cross over a faint ring rather than as an empty cell: the cell
			// was ALLOWED when the sweep started, and an empty grid position says nothing was ever there.
			const r = 0.052;
			segment(api, [p[0] - r, p[1] - r], [p[0] + r, p[1] + r], GHOST, 1.6);
			segment(api, [p[0] - r, p[1] + r], [p[0] + r, p[1] - r], GHOST, 1.6);
		}
	}

	// The axes have to be named somewhere, and there is no room above the column numbers: the header row
	// already sits at the top of the box. So they are named in the first caption line instead.
	text(0, -0.7, "rows: one assembly's half-edges. columns: the other's", { colour: SOFT, size: 0.52 });
	text(0, -0.9, "every pairing allowed, then the impossible ones crossed off", { colour: SOFT, size: 0.52 });
	text(0, -1.12, "what is left is the matching", { colour: INK, size: 0.64, weight: 600 });
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

	// "symmetry", not "isometry": the deck has said symmetry on every slide since the wallpaper groups,
	// and this panel is not the place to introduce a second word for the same thing.
	text(0, -0.66, "fixing v and e fixes the whole line,", { colour: INK, size: 0.64 });
	text(0, -0.88, "and the only other symmetry that does", { colour: INK, size: 0.64 });
	text(0, -1.1, "swaps the two faces", { colour: INK, size: 0.64 });
}

// ---------------------------------------------------------------------------------------------

const BOX: Box = { minX: -1.15, maxX: 1.15, minY: -1.24, maxY: 0.78 };

const PANELS: PanelSpec[] = [
	{
		title: "how it decides two are the same",
		note: "a table of which half-edge may stand in for which; everything allowed, then crossed off until it settles",
		box: BOX,
		draw: drawElimination,
	},
	{
		title: "why a survivor is a real symmetry",
		note: "a vertex, an edge and a side of it form a frame of the plane, and at most one rigid motion joins two frames",
		box: BOX,
		draw: drawFrame,
	},
];

export function RefinementExact() {
	return (
		// 46rem, not 52: this slide carries more prose than any other in part four (the elimination sweep
		// and the propagation argument both have to be written out), and a 4:3 panel spends its width on
		// height. Both panels still measure well above the width where FigurePanel's text stops scaling,
		// so nothing in them got smaller.
		<div className="not-prose mx-auto flex w-full max-w-[46rem] flex-wrap items-start justify-center gap-6">
			{PANELS.map((p) => (
				<FigurePanel key={p.title} panel={p} aspect="4/3" />
			))}
		</div>
	);
}
