"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import {
	ACCEPT, arc, arrowHead, classMark, DART, dot, freeEnd, GHOST, gluedEdge, halo, INK, rad, REJECT,
	segment, SOFT, type Api, type Pt,
} from "@/lib/render/figureGlyphs";

// Obligation 3, in the two places it can go wrong.
//
// Left: the induction of lemma S1. Take any finished gluing M and suppose the search has reached a
// partial P that FOLLOWS it — an injection carrying P's half-edges and gluings into M's. M is closed,
// so whichever free half-edge the rule picks, its partner in M exists; and that partner either sits on
// a vertex the search has already placed, which is the pair-with-an-existing-stub branch, or on one it
// has not, which is the fresh-vertex branch. Both are enumerated, so the descent never runs out of
// moves and reaches a closed configuration isomorphic to M. Which free half-edge gets picked is
// therefore a choice of ORDER, not of branch, and the most-constrained-first heuristic is free.
//
// Right: the one step that is not free. Attaching a fresh vertex, the search tries only one dart per
// automorphism orbit of that letter — sound only if the representative list meets every orbit, which
// is certificate A5. (4,4,4,4)A2 is the letter that proves the certificate earns its keep: its fold
// has four darts, its ferkval is 2, so its automorphism group has order 2 and the darts fall into two
// orbits of two. A representative list of length one meets one of them. Čtrnáct's Python solver
// computed that length from a hand-kept divisor list and got 1; exactly one k=8 tiling — species
// 3+3+1+1, square lattice, p4m — is reachable only by attaching its A2 vertex at a starred dart, and
// it was dropped in silence: 2849 instead of 2850. His C++ tables carry ferkval 2 and are right.
// (Root-caused in the deliverable-B audit; docs/DEVELOPMENT_NOTES.md.)

/**
 * The target: four vertices, three half-edges each, twelve half-edges paired into six gluings — so it
 * is CLOSED, which is the panel's whole hypothesis. The first version drew two of them hanging free
 * while the caption said "M is closed", and slide 31 has already taught the room that closed means
 * "0 free half-edges", so the picture refuted its own claim.
 *
 * The two vertices along the top are the ones the search has placed. That leaves the partial with two
 * free half-edges whose partners in M sit in different places, which is exactly S1's case split: one
 * on a vertex already placed, one on a vertex not yet placed.
 */
const TOP: Pt[] = [[-0.52, 0.34], [0.52, 0.34]];
const LOW: Pt[] = [[-0.52, -0.52], [0.52, -0.52]];
const STUB = 0.24;

const up = (h: Pt): Pt => [h[0], h[1] + STUB];
const down = (h: Pt): Pt => [h[0], h[1] - STUB];
const side = (h: Pt, dir: number): Pt => [h[0] + dir * STUB, h[1]];

function drawDescent(api: Api) {
	const { text } = api;

	// M's other four gluings, dashed because the partial has not made them yet: the right side, the
	// bottom, and the one carried under the bottom. Six gluings over twelve half-edges, so M is closed.
	segment(api, down(TOP[1]), up(LOW[1]), GHOST, 1.6, [5, 4]);
	segment(api, side(LOW[0], 1), side(LOW[1], -1), GHOST, 1.6, [5, 4]);
	arc(api, down(LOW[0]), down(LOW[1]), -0.2, GHOST, 1.6, [5, 4]);
	for (const h of LOW) {
		for (const e of [up(h), side(h, h === LOW[0] ? 1 : -1), down(h)]) segment(api, h, e, GHOST, 1.8);
		dot(api, h[0], h[1], 4.6, GHOST);
	}
	text(-0.92, LOW[0][1] + 0.02, "M", { colour: GHOST, size: 0.72, weight: 700 });

	// the partial: two vertices and the one gluing between them
	gluedEdge(api, TOP[0], side(TOP[0], 1), TOP[1], side(TOP[1], -1));

	// case (a): the partner of the up half-edge is on the OTHER placed vertex, so the search pairs
	// two half-edges it already has. Case (b): the partner of the down one is on a vertex it has not.
	const A = arc(api, up(TOP[0]), up(TOP[1]), 0.24, ACCEPT, 2.2, [6, 5]);
	text(A[0], A[1] + 0.13, "(a) both already placed", { colour: ACCEPT, size: 0.56, weight: 600 });
	segment(api, down(TOP[0]), up(LOW[0]), DART, 2.2, [6, 5]);
	text(-0.36, -0.12, "(b) fresh vertex", { colour: DART, size: 0.56, weight: 600, align: "left" });

	for (const h of TOP) {
		for (const [e, hot] of [[up(h), false], [down(h), h === TOP[0]]] as const) {
			segment(api, h, e, hot ? DART : INK, hot ? 3.6 : 3.2);
			freeEnd(api, e[0], e[1], hot ? DART : INK);
		}
		dot(api, h[0], h[1], 18, "rgba(20,20,20,0.05)");
		dot(api, h[0], h[1], 6);
	}
	freeEnd(api, up(LOW[0])[0], up(LOW[0])[1], DART, 4.4);

	text(0, 0.94, "the partial follows the target", { colour: SOFT, size: 0.6 });
	text(0, -0.96, "M is closed, so the partner is there", { colour: INK, size: 0.66, weight: 600 });
}

// ---------------------------------------------------------------------------------------------

/** The fold of (4,4,4,4)A2, in the table's own order: rneig runs 0 → *0 → 2 → *2 → 0. */
const FOLD = ["0", "*0", "2", "*2"];
/**
 * Its automorphism group has order 2 (ferkval), acting as the half-turn: 0↔2 and *0↔*2.
 *
 * Both operations have to be DRAWN. With only rneig on the page a reader computes the centralizer of
 * a 4-cycle, gets order 4 acting transitively, and concludes one orbit of four — the opposite of the
 * caption. What cuts the group down is mirro, which pairs 0↔*0 and 2↔*2, and it was invisible.
 */
const ORBIT = [0, 1, 0, 1];

function drawTransversal(api: Api) {
	const { ctx, s, text } = api;
	const c: Pt = [0, 0.16], R = 0.44;
	const at = (i: number): Pt => {
		const a = rad(135 - 90 * i);
		return [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R];
	};

	// rneig, round the ring
	for (let i = 0; i < 4; i++) {
		const a = at(i), b = at((i + 1) % 4);
		const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
		const from: Pt = [a[0] + Math.cos(ang) * 0.1, a[1] + Math.sin(ang) * 0.1];
		const to: Pt = [b[0] - Math.cos(ang) * 0.11, b[1] - Math.sin(ang) * 0.11];
		segment(api, from, to, GHOST, 2);
		arrowHead(api, to, ang, GHOST, 9);
	}
	// mirro, pairing the two half-edges of each sheet. Bowed OUTSIDE the ring: mu's two pairs are the
	// ring's own top and bottom sides, so drawn straight they lie underneath the rho arrows and the
	// panel shows one line carrying two different operations.
	arc(api, at(0), at(1), 0.16, SOFT, 1.8);
	arc(api, at(3), at(2), -0.16, SOFT, 1.8);
	text(0, 0.78, "μ", { colour: SOFT, size: 0.66, weight: 700 });
	text(0, -0.5, "μ", { colour: SOFT, size: 0.66, weight: 700 });
	text(0.66, 0.16, "ρ", { colour: SOFT, size: 0.66, weight: 700 });

	// The one nontrivial automorphism, and it is rho squared: the only power of rho that also commutes
	// with mu. In INK, not in REJECT — nothing here is rejected, and red is a verdict everywhere else.
	for (const [i, j] of [[0, 2], [1, 3]] as const) {
		segment(api, at(i), at(j), INK, 1.6, [5, 4]);
	}
	halo(api, 0.18, 0.16, 11);
	text(0.18, 0.16, "ρ²", { colour: INK, size: 0.62, weight: 700 });

	for (let i = 0; i < 4; i++) {
		const p = at(i);
		halo(api, p[0], p[1], 11);
		classMark(api, p[0], p[1], ORBIT[i] as 0 | 1, 6);
		const out = rad(135 - 90 * i);
		text(p[0] + Math.cos(out) * 0.19, p[1] + Math.sin(out) * 0.19, FOLD[i], {
			colour: INK, size: 0.6, weight: 600, mono: true,
		});
	}

	// what the two versions of the search tried
	// Each box carries the MARKS of the orbits it stands for, so it points back at the ring above it
	// instead of asserting a bare number.
	const box = (x: number, w: number, colour: string, label: string, sub: string, kinds: (0 | 1)[]) => {
		ctx.strokeStyle = colour;
		ctx.lineWidth = 2 / s;
		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.roundRect(x - w / 2, -1.0, w, 0.32, 0.06);
		ctx.stroke();
		kinds.forEach((k, i) => classMark(api, x - w / 2 + 0.12 + i * 0.14, -0.84, k, 5.2));
		text(x - w / 2 + 0.12 + kinds.length * 0.14 + 0.02, -0.84, label, {
			colour, size: 0.6, weight: 700, align: "left",
		});
		text(x, -1.16, sub, { colour: SOFT, size: 0.56 });
	};
	box(-0.62, 0.86, REJECT, "tried 1", "an orbit never reached", [0]);
	box(0.62, 0.98, ACCEPT, "needs 2", "one from each orbit", [0, 1]);
	arrowHead(api, [-0.04, -0.84], 0, SOFT, 10);

	text(0, 0.9, "|Aut| = 2, so two orbits of two half-edges", { colour: SOFT, size: 0.6 });
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
		note: "attaching a fresh vertex tries one half-edge per automorphism orbit; (4,4,4,4)A2 has two orbits, and the Python solver tried one",
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
