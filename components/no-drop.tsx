"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import {
	ACCEPT, arrowHead, classMark, DART, dot, INK, rad, REJECT, segment, SOFT, twoFold,
	type Api, type Pt,
} from "@/lib/render/figureGlyphs";

// Obligation 3, in the two places it can go wrong.
//
// Left: the induction of lemma S1. Take any finished gluing and suppose the search has reached a piece
// of it. Whichever free half-edge the rule picks, the target is closed, so that half-edge has a partner
// in the target — and the partner is either on a vertex the search has already placed or on one it has
// not. Both are branches the search enumerates, so the descent never runs out of moves.
//
// Right: the one step that is not free. Attaching a fresh vertex, the search tries one half-edge per
// symmetry class of that letter — sound only if its list of representatives meets every class, which is
// certificate A5. (4,4,4,4)A2 is the letter that proves the certificate earns its keep: four half-edges
// paired by the letter's own half-turn, so two classes, and Čtrnáct's Python solver kept a list of
// length one. Exactly one k=8 tiling (species 3+3+1+1, square lattice, p4m) can only be built by
// attaching its A2 vertex in the missed class, and it was dropped in silence: 2849 instead of 2850.
// His C++ tables are right. (Root-caused in the deliverable-B audit; docs/DEVELOPMENT_NOTES.md.)
//
// ⚑ BOTH PANELS WERE REDRAWN, 2026-08-09, because AL could not read either. The first drew the target
// as a ghost scaffold around the partial and asked the room to see an injection; the second drew the
// letter's automorphism group outright, with rho, rho-squared, mu and |Aut| on the page. Every one of
// those names had just been cut from the slide's prose for being undefined, and a figure may not carry
// vocabulary the words next to it refuse to use. What is left is the same two claims with no group
// theory on the surface: a case split that is visibly exhaustive, and a class that goes untried.

/** The seam where two half-edges meet, and the tick that says it is a seam and not a vertex. */
function pairedHalfEdges(api: Api, a: Pt, b: Pt, colourB = INK) {
	const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	// The picked half-edge keeps DART in both rows: it is the SAME half-edge, and the panel is about
	// where its partner turns out to live, not about which one got picked.
	segment(api, a, m, DART, 3.4);
	segment(api, m, b, colourB, 3.2);
	const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
	segment(api, [m[0] - Math.cos(ang) * 0.07, m[1] - Math.sin(ang) * 0.07],
		[m[0] + Math.cos(ang) * 0.07, m[1] + Math.sin(ang) * 0.07], SOFT, 2);
}

/** A vertex, with two more half-edges out of it so it reads as a vertex and not as a line end. */
function hub(api: Api, at: Pt, dir: number, colour = INK) {
	for (const deg of [128, 232]) {
		const a = rad(deg * dir < 0 ? 180 - deg : deg);
		segment(api, at, [at[0] + Math.cos(a) * 0.2, at[1] + Math.sin(a) * 0.2], colour, 2.6);
	}
	dot(api, at[0], at[1], 6, colour);
}

/** The ring that says this vertex was not there a moment ago. */
function fresh({ ctx, s }: Api, at: Pt) {
	ctx.strokeStyle = DART;
	ctx.lineWidth = 1.8 / s;
	ctx.setLineDash([4 / s, 3.5 / s]);
	ctx.beginPath();
	ctx.arc(at[0], at[1], 15 / s, 0, 2 * Math.PI);
	ctx.stroke();
	ctx.setLineDash([]);
}

function drawDescent(api: Api) {
	const { text } = api;

	// Two rows, one per branch, drawn the same way so the only difference the eye finds is the one the
	// argument is about: whether the vertex on the right was already there.
	const L = -0.44, R = 0.44;
	const row = (y: number, isFresh: boolean, label: string) => {
		hub(api, [L, y], 1);
		hub(api, [R, y], -1);
		pairedHalfEdges(api, [L, y], [R, y]);
		if (isFresh) fresh(api, [R, y]);
		text(0, y - 0.32, label, { colour: SOFT, size: 0.58 });
	};

	text(0, 0.94, "the target is closed, so the partner exists", { colour: SOFT, size: 0.58 });
	row(0.5, false, "(a) on a vertex already placed");
	row(-0.28, true, "(b) on a vertex the search adds");
	// Same y as panel two's closing line, so the pair reads as one figure and not as two drawings that
	// happen to sit next to each other.
	text(0, -1.06, "the search enumerates both", { colour: INK, size: 0.66, weight: 600 });
}

// ---------------------------------------------------------------------------------------------

/**
 * The four half-edges of one letter, paired by the letter's own half-turn into two classes.
 *
 * Marks are SHAPES, not hues (see classMark): every colour in the deck already means something, and
 * two of them — ACCEPT and REJECT — are spent on the verdict boxes directly below.
 */
const CLASS_OF: (0 | 1)[] = [0, 1, 0, 1];

function drawTransversal(api: Api) {
	const { text } = api;
	const c: Pt = [0, 0.42], R = 0.34;
	const at = (i: number): Pt => {
		const a = rad(135 - 90 * i);
		return [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R];
	};

	// The vertex and its four half-edges. The half-turn in the middle is the same glyph obligation 2
	// puts inside its hexagon, which is the whole reason it needs no label here: the room has met it.
	for (let i = 0; i < 4; i++) {
		const p = at(i);
		segment(api, c, p, INK, 2.8);
		classMark(api, p[0], p[1], CLASS_OF[i], 6.4);
	}
	twoFold(api, c);
	text(0, 0.94, "the vertex's own half-turn pairs them: two classes", { colour: SOFT, size: 0.56 });

	// What the two versions of the search try. Each box carries the MARKS of the classes it stands for,
	// so it points back at the vertex above instead of asserting a bare number.
	const box = (x: number, w: number, colour: string, label: string, sub: string, kinds: (0 | 1)[]) => {
		const { ctx, s } = api;
		ctx.strokeStyle = colour;
		ctx.lineWidth = 2 / s;
		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.roundRect(x - w / 2, -0.66, w, 0.32, 0.06);
		ctx.stroke();
		kinds.forEach((k, i) => classMark(api, x - w / 2 + 0.13 + i * 0.15, -0.5, k, 5.4));
		text(x - w / 2 + 0.13 + kinds.length * 0.15 + 0.02, -0.5, label, {
			colour, size: 0.58, weight: 700, align: "left",
		});
		text(x, -0.82, sub, { colour: SOFT, size: 0.54 });
	};
	box(-0.62, 0.9, REJECT, "tried one", "a class never reached", [0]);
	box(0.64, 1.0, ACCEPT, "one each", "every class reached", [0, 1]);
	arrowHead(api, [-0.05, -0.5], 0, SOFT, 10);

	text(0, -1.06, "the tilings that need the missed class are never built", { colour: INK, size: 0.6, weight: 600 });
}

// ---------------------------------------------------------------------------------------------

const BOX: Box = { minX: -1.22, maxX: 1.22, minY: -1.24, maxY: 1.08 };

const PANELS: PanelSpec[] = [
	{
		title: "the descent always has a move",
		note: "the partner sits on a vertex already placed, or on one the fresh-vertex branch brings in, and the search enumerates both",
		box: BOX,
		draw: drawDescent,
	},
	{
		title: "the one step that could lose a tiling",
		note: "attaching a fresh vertex tries one half-edge per symmetry class; this letter has two, and the Python solver tried one",
		box: BOX,
		draw: drawTransversal,
	},
];

export function NoDrop() {
	return (
		<div className="not-prose mx-auto flex w-full max-w-[52rem] flex-wrap items-start justify-center gap-6">
			{PANELS.map((p) => (
				<FigurePanel key={p.title} panel={p} aspect="4/3" />
			))}
		</div>
	);
}
