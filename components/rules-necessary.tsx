"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import {
	arrowHead, classMark, dot, GHOST, halo, INK, rad, REJECT, segment, SOFT,
	type Api, type Pt,
} from "@/lib/render/figureGlyphs";

// Obligation 2 is not about what the four rules SAY — that slide is back in part three. It is about
// why they cannot cost a tiling, and the argument has two halves, one per panel.
//
// Left, necessity (lemma L1(i)). The engine's unit of work is a quotient, so a face of the tiling is
// not visited once per corner: the walk closes as soon as it comes back modulo the symmetry that
// stabilises the face. That stabiliser's rotation part is a cyclic group of some order r, so the walk
// closes at l = n/r — and n/r is a whole number because r is the order of a group acting freely on
// the n corners. The divisor test is therefore not a filter someone chose; it is a fact about
// quotients, which is exactly why applying it can never reject something real.
//
// Right, heredity (lemma L1(ii)) with the search's monotonicity. Gluings are only ever added along a
// DFS branch and never removed, so a walk only ever extends: an assembly that has broken a rule
// carries that break into every descendant. Rejecting at the first violation therefore discards a
// subtree that contained no finished gluing to begin with.
//
// The three corner marks are the three orbits of the hexagon's corners under its half-turn, told apart
// by SHAPE. Hue would have been easier and wrong: green means "legal" on the four-rules slide seven
// slides back, where it sits on a hexagon's corners exactly like this, and orange means "the half-edge
// being worked on" everywhere in the deck.

/** The crystallographic 2-fold mark, over a cleared disc so it reads on top of the tile. */
function halfTurn({ ctx }: Api, at: Pt, r = 0.09) {
	ctx.fillStyle = "#fff";
	ctx.beginPath();
	ctx.arc(at[0], at[1], r * 1.5, 0, 2 * Math.PI);
	ctx.fill();
	ctx.fillStyle = INK;
	ctx.beginPath();
	ctx.moveTo(at[0] - r * 1.5, at[1]);
	ctx.quadraticCurveTo(at[0], at[1] + r * 0.78, at[0] + r * 1.5, at[1]);
	ctx.quadraticCurveTo(at[0], at[1] - r * 0.78, at[0] - r * 1.5, at[1]);
	ctx.fill();
}

// ---------------------------------------------------------------------------------------------

function drawDivisor(api: Api) {
	const { ctx, s, text } = api;

	// the face, with its six corners in three orbits under the half-turn that stabilises it
	const c: Pt = [-0.62, 0.14], R = 0.4;
	const corner = (i: number): Pt => {
		const a = rad(90 + 60 * i);
		return [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R];
	};
	ctx.strokeStyle = SOFT;
	ctx.lineWidth = 2 / s;
	ctx.lineJoin = "round";
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const p = corner(i);
		if (i) ctx.lineTo(p[0], p[1]);
		else ctx.moveTo(p[0], p[1]);
	}
	ctx.closePath();
	ctx.stroke();
	// the six steps of the walk in the plane, so the fold maps a walk to a walk and not a dot pattern
	for (let i = 0; i < 6; i++) {
		const a = corner(i), b = corner((i + 1) % 6);
		const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
		arrowHead(api, [a[0] + Math.cos(ang) * R * 0.62, a[1] + Math.sin(ang) * R * 0.62], ang, GHOST, 8);
	}
	for (let i = 0; i < 6; i++) {
		const p = corner(i);
		halo(api, p[0], p[1], 8);
		classMark(api, p[0], p[1], (i % 3) as 0 | 1 | 2, 5.6);
	}
	halfTurn(api, c);
	// The mirror the face may also carry, struck out: L1(i) counts the ROTATIONS in the stabiliser and
	// nothing else, and a reflection does not shorten the walk. Reading "orbits of the corners" instead
	// of "orbits of the rotations" is exactly the plausible strengthening that would be unsound — on
	// this very hexagon, a 2mm stabiliser has two corner orbits while the walk still closes at three.
	// Vertical, through the top and bottom corners. Drawn horizontally it lay on the fold arrow's own
	// line and the two dashed strokes read as one object.
	segment(api, [c[0], c[1] - 0.58], [c[0], c[1] + 0.58], GHOST, 1.6, [5, 4]);
	segment(api, [c[0] - 0.13, c[1] + 0.3], [c[0] + 0.13, c[1] + 0.44], REJECT, 2.2);
	text(c[0], c[1] - 0.5, "a mirror does not shorten it", { colour: SOFT, size: 0.54 });
	text(c[0], c[1] - 0.72, "n = 6 corners, r = 2 rotations", { colour: SOFT, size: 0.6 });

	// the fold
	segment(api, [-0.09, 0.14], [0.11, 0.14], SOFT, 2, [5, 4]);
	arrowHead(api, [0.16, 0.14], 0, SOFT, 10);
	text(0.035, 0.32, "fold", { colour: SOFT, size: 0.56 });

	// the quotient walk: three corners, and it closes
	const q: Pt = [0.66, 0.14], qR = 0.27;
	const qc = (i: number): Pt => {
		const a = rad(90 + 120 * i);
		return [q[0] + Math.cos(a) * qR, q[1] + Math.sin(a) * qR];
	};
	for (let i = 0; i < 3; i++) {
		const a = qc(i), b = qc((i + 1) % 3);
		const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
		const shrink = 0.075;
		const from: Pt = [a[0] + Math.cos(ang) * shrink, a[1] + Math.sin(ang) * shrink];
		const to: Pt = [b[0] - Math.cos(ang) * shrink, b[1] - Math.sin(ang) * shrink];
		segment(api, from, to, INK, 2.2);
		arrowHead(api, to, ang, INK, 9);
	}
	for (let i = 0; i < 3; i++) {
		const p = qc(i);
		halo(api, p[0], p[1], 8);
		classMark(api, p[0], p[1], i as 0 | 1 | 2, 5.6);
	}
	text(q[0], q[1] - 0.5, "ℓ = 3", { colour: INK, size: 0.66, weight: 600 });
	text(q[0], q[1] - 0.72, "one step per orbit", { colour: SOFT, size: 0.6 });

	text(0, -0.94, "the rotations act freely, so r divides n", { colour: INK, size: 0.7, weight: 600 });
}

// ---------------------------------------------------------------------------------------------

/**
 * A DFS tree, four levels of it. Each node carries its parent's gluings and one more, so a rule that
 * fails at a node fails at everything under it: the greyed half was never reachable.
 */
const LEVEL = [0.76, 0.28, -0.2, -0.68];
const TREE: { at: Pt; parent: number | null }[] = [
	{ at: [0, LEVEL[0]], parent: null },
	{ at: [-0.62, LEVEL[1]], parent: 0 },
	{ at: [0.62, LEVEL[1]], parent: 0 },
	{ at: [-0.94, LEVEL[2]], parent: 1 },
	{ at: [-0.3, LEVEL[2]], parent: 1 },
	{ at: [0.3, LEVEL[2]], parent: 2 },
	{ at: [0.94, LEVEL[2]], parent: 2 },
	{ at: [-1.1, LEVEL[3]], parent: 3 },
	{ at: [-0.78, LEVEL[3]], parent: 3 },
	{ at: [-0.46, LEVEL[3]], parent: 4 },
	{ at: [-0.14, LEVEL[3]], parent: 4 },
	{ at: [0.14, LEVEL[3]], parent: 5 },
	{ at: [0.46, LEVEL[3]], parent: 5 },
	{ at: [0.78, LEVEL[3]], parent: 6 },
	{ at: [1.1, LEVEL[3]], parent: 6 },
];
/** The node the rules kill, and everything the search would have reached through it. */
const CUT = 2;
const BELOW = new Set([2, 5, 6, 11, 12, 13, 14]);

function drawHeredity(api: Api) {
	const { text } = api;

	for (const [i, n] of TREE.entries()) {
		if (n.parent === null) continue;
		// The edge INTO the cut node stays solid: the search DID reach it, test it and reject it. Greying
		// it says the branch was never taken, which is the opposite of the panel's claim.
		const dead = BELOW.has(i) && i !== CUT;
		segment(api, TREE[n.parent].at, n.at, dead ? GHOST : INK, dead ? 1.5 : 2.2, dead ? [5, 4] : undefined);
	}
	for (const [i, n] of TREE.entries()) {
		if (i === CUT) {
			halo(api, n.at[0], n.at[1], 11);
			dot(api, n.at[0], n.at[1], 6.6, REJECT);
		} else {
			dot(api, n.at[0], n.at[1], BELOW.has(i) ? 4.2 : 5.4, BELOW.has(i) ? GHOST : INK);
		}
	}

	const { ctx, s: sc } = api;
	ctx.strokeStyle = "hsl(2 70% 46% / 0.35)";
	ctx.lineWidth = 1.6 / sc;
	ctx.setLineDash([6 / sc, 5 / sc]);
	ctx.beginPath();
	ctx.roundRect(0.04, -0.88, 1.2, 1.36, 0.06);
	ctx.stroke();
	ctx.setLineDash([]);

	text(TREE[CUT].at[0] + 0.26, TREE[CUT].at[1] + 0.02, "✗", { colour: REJECT, size: 0.95, weight: 700 });
	text(TREE[CUT].at[0] + 0.3, TREE[CUT].at[1] - 0.2, "4 ∤ 6", { colour: REJECT, size: 0.58, weight: 600 });
	text(-0.36, 0.54, "+1 gluing", { colour: SOFT, size: 0.54 });
	text(0.62, -1.02, "nothing below here", { colour: REJECT, size: 0.66, weight: 600 });
	text(0, -1.26, "because every descendant keeps its ancestor's gluings", { colour: SOFT, size: 0.6 });
}

// ---------------------------------------------------------------------------------------------

const BOX: Box = { minX: -1.3, maxX: 1.3, minY: -1.32, maxY: 1.0 };

const PANELS: PanelSpec[] = [
	{
		title: "why the divisor rule is forced",
		note: "the walk visits one corner per orbit of the ROTATIONS fixing the face, so it closes at n/r, and those rotations act freely",
		box: { minX: -1.3, maxX: 1.3, minY: -1.16, maxY: 0.8 },
		draw: drawDivisor,
	},
	{
		title: "why rejecting early costs nothing",
		note: "along one branch gluings are only added, so a broken rule stays broken below and the cut subtree held no tiling",
		box: BOX,
		draw: drawHeredity,
	},
];

export function RulesNecessary() {
	return (
		<div className="not-prose mx-auto flex w-full max-w-[52rem] flex-wrap items-start justify-center gap-6">
			{PANELS.map((p) => (
				<FigurePanel key={p.title} panel={p} aspect="4/3" />
			))}
		</div>
	);
}
