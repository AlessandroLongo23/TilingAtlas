"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import {
	ACCEPT, arrowHead, DART, dot, freeEnd, GHOST, gluedEdge, halo, INK, rad, REJECT, segment,
	SOFT, T1_COLOUR, type Api, type Pt,
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
 * The target: four vertices glued in a ring, every half-edge paired, so it is closed. The two at the
 * top are the ones the search has already placed; the ring is drawn plain below them because it is
 * the thing being FOLLOWED, not the thing being built.
 */
const TOP: Pt[] = [[-0.52, 0.40], [0.52, 0.40]];
const LOW: Pt[] = [[-0.52, -0.56], [0.52, -0.56]];
const STUB = 0.26;

/** The picked half-edge and the one M holds for it: the left side of the ring, not yet made. */
const S_END: Pt = [TOP[0][0], TOP[0][1] - STUB];
const Y_END: Pt = [LOW[0][0], LOW[0][1] + STUB];

function drawDescent(api: Api) {
	const { text } = api;

	// The rest of M: gluings the target has and the partial has not reached yet. Dashed, and stopping
	// short of the placed vertices, so they cannot be misread as edges the partial already owns.
	for (const [a, b] of [[LOW[0], LOW[1]], [LOW[1], [TOP[1][0], TOP[1][1] - STUB] as Pt]] as const) {
		segment(api, a, b, GHOST, 1.8, [5, 4]);
	}
	for (const h of LOW) dot(api, h[0], h[1], 5, GHOST);
	text(-0.98, LOW[0][1], "M", { colour: GHOST, size: 0.72, weight: 700 });

	// the partial: two vertices and the one gluing between them, in the engine's own idiom
	gluedEdge(api, TOP[0], [TOP[0][0] + STUB, TOP[0][1]], TOP[1], [TOP[1][0] - STUB, TOP[1][1]]);
	for (const [h, dirs] of [[TOP[0], [270, 128]], [TOP[1], [270, 52]]] as const) {
		for (const d of dirs) {
			const e: Pt = [h[0] + Math.cos(rad(d)) * STUB, h[1] + Math.sin(rad(d)) * STUB];
			const picked = h === TOP[0] && d === 270;
			segment(api, h, e, picked ? DART : INK, picked ? 3.8 : 3.2);
			freeEnd(api, e[0], e[1], picked ? DART : INK);
		}
		dot(api, h[0], h[1], 20, "rgba(20,20,20,0.05)");
		dot(api, h[0], h[1], 6);
	}

	// what the target already holds for the picked half-edge
	segment(api, S_END, Y_END, DART, 2.2, [6, 5]);
	halo(api, Y_END[0], Y_END[1], 9);
	freeEnd(api, Y_END[0], Y_END[1], DART, 4.6);
	text(S_END[0] - 0.19, S_END[1] + 0.02, "s", { colour: DART, size: 0.82, weight: 700 });
	text(Y_END[0] - 0.26, Y_END[1] - 0.02, "γ(s)", { colour: DART, size: 0.72, weight: 700 });
	text(0.02, Y_END[1] - 0.01, "not yet placed", { colour: SOFT, size: 0.58 });

	text(0, 0.84, "the partial follows the target", { colour: SOFT, size: 0.62 });
	text(0, -0.98, "M is closed, so the partner is there", { colour: INK, size: 0.68, weight: 600 });
}

// ---------------------------------------------------------------------------------------------

/** The fold of (4,4,4,4)A2, in the table's own order: rneig runs 0 → *0 → 2 → *2 → 0. */
const FOLD = ["0", "*0", "2", "*2"];
/** Its automorphism group has order 2 (ferkval), acting as the half-turn: 0↔2 and *0↔*2. */
const ORBIT = [0, 1, 0, 1];
const ORBIT_COLOUR = [T1_COLOUR, DART];

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
	// the automorphism, pairing each dart with the one across the ring
	for (const [i, j] of [[0, 2], [1, 3]] as const) {
		segment(api, at(i), at(j), ORBIT_COLOUR[ORBIT[i]], 1.8, [5, 4]);
	}
	for (let i = 0; i < 4; i++) {
		const p = at(i);
		halo(api, p[0], p[1], 12);
		dot(api, p[0], p[1], 7, ORBIT_COLOUR[ORBIT[i]]);
		const out = rad(135 - 90 * i);
		text(p[0] + Math.cos(out) * 0.19, p[1] + Math.sin(out) * 0.19, FOLD[i], {
			colour: INK, size: 0.62, weight: 600, mono: true,
		});
	}

	// what the two versions of the search tried
	const box = (x: number, w: number, colour: string, label: string, sub: string) => {
		ctx.strokeStyle = colour;
		ctx.lineWidth = 2 / s;
		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.roundRect(x - w / 2, -0.98, w, 0.3, 0.06);
		ctx.stroke();
		text(x, -0.83, label, { colour, size: 0.62, weight: 700 });
		text(x, -1.14, sub, { colour: SOFT, size: 0.58 });
	};
	box(-0.5, 0.62, REJECT, "1 dart", "an orbit never tried");
	box(0.5, 0.62, ACCEPT, "2 darts", "one from each");

	text(0, 0.86, "|Aut| = 2, so two orbits of two", { colour: SOFT, size: 0.62 });
}

// ---------------------------------------------------------------------------------------------

const BOX: Box = { minX: -1.22, maxX: 1.22, minY: -1.26, maxY: 0.98 };

const PANELS: PanelSpec[] = [
	{
		title: "the descent always has a move",
		note: "the partner is either on a vertex already placed, or on one the fresh-vertex branch brings in — and both are enumerated",
		box: BOX,
		draw: drawDescent,
	},
	{
		title: "and the one step that could lose a tiling",
		note: "attaching a fresh vertex tries one dart per automorphism orbit; (4,4,4,4)A2 has two, and the Python solver tried one",
		box: BOX,
		draw: drawTransversal,
	},
];

export function NoDrop() {
	return (
		<div className="not-prose mx-auto flex w-full max-w-[52rem] flex-wrap items-start justify-center gap-6">
			{PANELS.map((p) => (
				<FigurePanel key={p.title} panel={p} aspect="6/5" />
			))}
		</div>
	);
}
