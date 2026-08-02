"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import {
	arc, arrowHead, DART, dot, freeEnd, GHOST, gluedEdge, halo, INK, rad, REJECT, segment, SOFT,
	type Api, type Pt,
} from "@/lib/render/figureGlyphs";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// The solve loop as a filmstrip: the same assembly, four moments apart. Every frame is the state of
// `configuration` in tools/ctrnact-oracle/eu_solver.cpp — a list of vertex figures, each contributing
// darts, and a `glue` array in which -1 means "still free".
//
// What each frame is drawn from:
//
//   the piece    initex() seeds the search with ONE vertex figure and glue = {-1, -1, ...}. Same
//                object as <abstract-vertex> on the earlier slide, at frame scale: corner wedges at
//                their true angles (3.4.6.4 is 60/90/120/90) and half-edges that stop at mid-edge.
//   a move       extend() picks `firstfree` from writecycle()'s `mincycle` — the free half-edge on
//                the face that needs the FEWEST further corners — and pairs it. The second loop over
//                `gr` appends a fresh vertex figure and pairs against one of its `reps` darts, which
//                is the move drawn here.
//   a dead end   checkpart() fails, and the two lines after the recursive call put the -1s back:
//                `slist.glue[firstfree] = -1; slist.glue[i] = -1;`. Undo, next candidate.
//   closed       `std::find(glue.begin(), glue.end(), -1) == glue.end()` — nothing free left. That
//                is the emit condition, subject to simplify().
//
// The assembly is schematic in one respect and honest in every other: which particular pieces these
// are is not claimed, because naming them would need the symmetry-typed alphabet (44 symbols for 11
// vertex configurations) that the slide deliberately does not open up. The MECHANICS — half-edges
// pair, never faces; a fresh piece arrives whole; free ends run out only when every face closed — are
// exactly the solver's.

/** The angular unit of the regular palette: one unit is 2π/D. See alphabets/gen_alphabet.py. */
const D = 12;
const cornerUnits = (n: number) => D / 2 - D / n;
/** A vertex figure to open on. 3.4.6.4, the same word the previous slide's figure uses. */
const WORD = [3, 4, 6, 4];

/** Where a half-edge stops. Half of an edge is all one vertex owns. */
const STUB = 0.42;

/**
 * Half-edge directions of `WORD`, as cumulative true angles. The first sits at 12 o'clock only so the
 * picture has a top; nothing in the data says so.
 */
function wordDirs(start = 52): { dirs: number[]; units: number[] } {
	const units = WORD.map(cornerUnits);
	const dirs: number[] = [];
	let a = start;
	for (const u of units) {
		dirs.push(a);
		a += (360 * u) / D;
	}
	return { dirs, units };
}

// ---------------------------------------------------------------------------------------------
// frame 1 — the piece
// ---------------------------------------------------------------------------------------------

function drawPiece(api: Api) {
	const { ctx, s, text } = api;
	const { dirs, units } = wordDirs();
	const c: Pt = [0, 0.05];

	// The corners, one coloured arc each, spanning its true angle. Filled wedges would sum to a full
	// disc — the angles close, that is the point — and at frame scale a full disc is just a blob; the
	// arcs keep the four corners countable and leave the half-edges legible through them.
	const gap = rad(4);
	for (let i = 0; i < WORD.length; i++) {
		const from = rad(dirs[i]), to = from + (2 * Math.PI * units[i]) / D;
		ctx.strokeStyle = hsbToHsla(polygonHue(WORD[i]), 45, 88, 1);
		ctx.lineWidth = 6 / s;
		ctx.lineCap = "butt";
		ctx.beginPath();
		ctx.arc(c[0], c[1], STUB * 0.56, from + gap, to - gap);
		ctx.stroke();
	}
	for (const d of dirs) {
		const e: Pt = [c[0] + Math.cos(rad(d)) * STUB, c[1] + Math.sin(rad(d)) * STUB];
		segment(api, c, e, INK, 3.4);
		freeEnd(api, e[0], e[1]);
	}
	dot(api, c[0], c[1], 5.5);
	text(0, -0.72, "4 free half-edges", { colour: SOFT, size: 0.66 });
}

// ---------------------------------------------------------------------------------------------
// frames 2 and 3 — a move, and a move undone
// ---------------------------------------------------------------------------------------------

/**
 * The two hubs of the growing assembly. The joined pair's half-edges point AT each other — A@18 and
 * B@186 against a centre line of 11.6° — so the two of them plus the short join between read as the
 * single edge they are. A few degrees of kink keeps the drawing off a grid.
 */
const A = { at: [-0.46, 0.06] as Pt, dirs: [96, 168, 250, 18] };
const B = { at: [0.42, 0.24] as Pt, dirs: [72, 186, 264, 342] };
const A_JOIN = 3, B_JOIN = 1;
/** Where the third piece would go, in the frame that rejects it: below B, near B's free half-edge. */
const C = { at: [0.52, -0.62] as Pt, dirs: [20, 108, 200, 290] };
const C_JOIN = 1;
const C_LEN = STUB * 0.74;

const endOf = (h: { at: Pt; dirs: number[] }, i: number, len = STUB): Pt =>
	[h.at[0] + Math.cos(rad(h.dirs[i])) * len, h.at[1] + Math.sin(rad(h.dirs[i])) * len];

/** The two joined hubs both frames open with. `hot` names the half-edge the search works on next. */
function drawPair(api: Api, hot: [typeof A | typeof B, number] | null) {
	gluedEdge(api, A.at, endOf(A, A_JOIN), B.at, endOf(B, B_JOIN));
	for (const [h, join] of [[A, A_JOIN], [B, B_JOIN]] as const) {
		for (let i = 0; i < h.dirs.length; i++) {
			if (i === join) continue;
			const e = endOf(h, i);
			const isHot = hot !== null && hot[0] === h && hot[1] === i;
			segment(api, h.at, e, isHot ? DART : INK, isHot ? 3.8 : 3.2);
			freeEnd(api, e[0], e[1], isHot ? DART : INK);
		}
	}
	for (const h of [A, B]) {
		dot(api, h.at[0], h.at[1], 22, "rgba(20,20,20,0.055)");
		dot(api, h.at[0], h.at[1], 6);
	}
}

function drawMove(api: Api) {
	const { text } = api;
	drawPair(api, null);
	// the pairing that made this frame: an arrow onto the SEAM, because half-edges are what meet
	const ea = endOf(A, A_JOIN), eb = endOf(B, B_JOIN);
	const seam: Pt = [(ea[0] + eb[0]) / 2, (ea[1] + eb[1]) / 2];
	segment(api, [seam[0], seam[1] + 0.52], [seam[0], seam[1] + 0.16], DART, 2.4, [6, 5]);
	arrowHead(api, [seam[0], seam[1] + 0.11], -Math.PI / 2, DART, 11);
	text(seam[0], seam[1] + 0.67, "one edge", { colour: DART, size: 0.62, weight: 600 });
	text(0, -0.86, "6 free half-edges", { colour: SOFT, size: 0.66 });
}

function drawDeadEnd(api: Api) {
	const { text } = api;
	// the third piece, dashed: proposed, tested, and about to be taken back out again
	for (let i = 0; i < C.dirs.length; i++) {
		const e = endOf(C, i, C_LEN);
		segment(api, C.at, e, GHOST, 2, [4, 3]);
		if (i !== C_JOIN) freeEnd(api, e[0], e[1], GHOST);
	}
	dot(api, C.at[0], C.at[1], 4.5, GHOST);

	drawPair(api, [B, 2]);

	const at = arc(api, endOf(B, 2), endOf(C, C_JOIN, C_LEN), 0.06, DART, 2.4, [6, 5]);
	halo(api, at[0], at[1], 12);
	text(at[0], at[1], "✗", { colour: REJECT, size: 1.05, weight: 700 });
	text(-0.58, -0.66, "undo it,", { colour: REJECT, size: 0.66, weight: 600 });
	text(-0.58, -0.87, "try the next", { colour: REJECT, size: 0.66, weight: 600 });
}

// ---------------------------------------------------------------------------------------------
// frame 4 — closed
// ---------------------------------------------------------------------------------------------

/**
 * Two hubs with every half-edge paired: the two inward pairs join straight across, the two that point
 * away from each other are carried over the top and under the bottom. Symmetric on purpose — the
 * frame has one job, which is to look like nothing is left open.
 */
const L = { at: [-0.5, 0] as Pt, dirs: [30, 108, 252, 330] };
const R = { at: [0.5, 0] as Pt, dirs: [150, 72, 288, 210] };

function drawClosed(api: Api) {
	const { text } = api;
	// the two half-edges of each pair, then the join between them: the same shape as every other
	// completed edge in the deck, only here there are no free ends left over
	for (const [i, bow] of [[0, 0], [3, 0], [1, 0.34], [2, -0.34]] as const) {
		const ea = endOf(L, i), eb = endOf(R, i);
		segment(api, L.at, ea, INK, 3.2);
		segment(api, R.at, eb, INK, 3.2);
		const m = arc(api, ea, eb, bow, INK, 3.2);
		const ang = Math.atan2(eb[1] - ea[1], eb[0] - ea[0]) + Math.PI / 2;
		segment(api, [m[0] - Math.cos(ang) * 0.07, m[1] - Math.sin(ang) * 0.07],
			[m[0] + Math.cos(ang) * 0.07, m[1] + Math.sin(ang) * 0.07], SOFT, 2);
	}
	for (const h of [L, R]) {
		dot(api, h.at[0], h.at[1], 22, "rgba(20,20,20,0.055)");
		dot(api, h.at[0], h.at[1], 6);
	}
	text(0, -0.86, "0 free half-edges", { colour: SOFT, size: 0.66 });
}

// ---------------------------------------------------------------------------------------------

const BOX = 1.3;
const FRAME: Box = { minX: -BOX, maxX: BOX, minY: -BOX * 0.8, maxY: BOX * 0.8 };

const FRAMES: PanelSpec[] = [
	{
		title: "1 · a piece",
		note: "a ring of half-edges with the corner angles between them, and no position anywhere",
		box: FRAME,
		draw: drawPiece,
	},
	{
		title: "2 · a move",
		note: "pair the free half-edge whose tile is closest to closing, here with one on a fresh piece",
		box: FRAME,
		draw: drawMove,
	},
	{
		title: "3 · a dead end",
		note: "the pairing broke a rule, so it is taken back out and the next candidate is tried",
		box: FRAME,
		draw: drawDeadEnd,
	},
	{
		title: "4 · closed",
		note: "no half-edge is free, every tile has closed, and the assembly is a tiling",
		box: FRAME,
		draw: drawClosed,
	},
];

export function SolveLoop() {
	return (
		<div className="not-prose mx-auto flex w-full max-w-[68rem] flex-wrap items-start justify-center gap-4">
			{FRAMES.map((f) => (
				<FigurePanel key={f.title} panel={f} aspect="5/4" />
			))}
		</div>
	);
}
