"use client";

import { FigurePanel, type PanelSpec } from "@/components/figure-panel";
import { type Box } from "@/lib/render/figureCanvas";
import { dot, halo, rad, SOFT, type Api, type Pt } from "@/lib/render/figureGlyphs";
import { hsbToHsla, polygonHue } from "@/lib/utils/renderTiling";

// Why an octagon has no choices left to make, in three frames that are the same picture growing.
//
// The slide asserts that the corona "propagates deterministically", and that is the step a picture
// can carry and prose cannot: each frame adds only what the frame before it FORCED, so by the third
// there is nothing left to decide and the tiling is 4.8.8, whole.
//
// The arithmetic each frame rests on:
//
//   one vertex   an octagon's corner is 135°, leaving 225°. Two fills close it — 135 + 90 (4.8.8)
//                and 60 + 165 (3.8.24) — and the second never tiles, so 4.8.8 it is.
//   the corona   every vertex of the octagon is therefore 4.8.8, so each vertex spends exactly one
//                of its two edges on a square and one on an octagon. Each edge is shared by two
//                vertices, so the eight edges split 4/4 and ALTERNATE. Nothing was chosen.
//   the plane    every octagon the corona placed is in the same position, so the step repeats.
//
// Geometry is the truncated square tiling at unit edge: octagons on a square lattice of spacing
// 1 + √2, squares on the half-offsets, and the squares come out as diamonds because the octagons
// carry the axes.

const S = 1 + Math.SQRT2;
/** Circumradius of a unit-edge octagon: 1/(2 sin π/8). */
const OCT_R = 1 / (2 * Math.sin(Math.PI / 8));
/** …and of a unit-edge square. */
const SQ_R = Math.SQRT1_2;

const octagon = (c: Pt): Pt[] =>
	Array.from({ length: 8 }, (_, k) => {
		const a = rad(22.5 + 45 * k);
		return [c[0] + Math.cos(a) * OCT_R, c[1] + Math.sin(a) * OCT_R] as Pt;
	});

const square = (c: Pt): Pt[] =>
	Array.from({ length: 4 }, (_, k) => {
		const a = rad(90 * k);
		return [c[0] + Math.cos(a) * SQ_R, c[1] + Math.sin(a) * SQ_R] as Pt;
	});

interface Tile { pts: Pt[]; n: number }

/** Octagons at (i, j)·S and squares at the half-offsets between them, out to `reach` steps. */
function truncatedSquare(reach: number): Tile[] {
	const out: Tile[] = [];
	for (let i = -reach; i <= reach; i++) {
		for (let j = -reach; j <= reach; j++) {
			out.push({ pts: octagon([i * S, j * S]), n: 8 });
			out.push({ pts: square([(i + 0.5) * S, (j + 0.5) * S]), n: 4 });
		}
	}
	return out;
}

const fill = (n: number, a = 0.85) => hsbToHsla(polygonHue(n), 40, 100, a);
const line = (n: number) => hsbToHsla(polygonHue(n), 55, 62, 1);

function drawTile({ ctx, s }: Api, t: Tile, alpha = 0.85, w = 1.6) {
	ctx.fillStyle = fill(t.n, alpha);
	ctx.strokeStyle = line(t.n);
	ctx.lineWidth = w / s;
	ctx.beginPath();
	ctx.moveTo(t.pts[0][0], t.pts[0][1]);
	for (let i = 1; i < t.pts.length; i++) ctx.lineTo(t.pts[i][0], t.pts[i][1]);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
}

/** A wedge of `span` degrees from `from`, at `at`: one tile's corner, and nothing more of that tile. */
function wedge({ ctx, s }: Api, at: Pt, from: number, span: number, n: number, r: number) {
	ctx.fillStyle = fill(n, 0.9);
	ctx.strokeStyle = line(n);
	ctx.lineWidth = 1.4 / s;
	ctx.beginPath();
	ctx.moveTo(at[0], at[1]);
	ctx.arc(at[0], at[1], r, rad(from), rad(from + span));
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
}

// ---------------------------------------------------------------------------------------------

/**
 * The vertex the first frame resolves: the octagon's corner at 22.5°. Its two edges run to 270° and
 * 135°, so the octagon holds [135, 270]; the square that must sit above it holds [45, 135]; the
 * second octagon holds [270, 405]. 135 + 90 + 135 = 360, and the three sectors are the whole turn.
 */
const V: Pt = [OCT_R * Math.cos(rad(22.5)), OCT_R * Math.sin(rad(22.5))];
const WEDGES: [number, number, number][] = [
	[135, 135, 8],
	[270, 135, 8],
	[45, 90, 4],
];

function drawVertex(api: Api) {
	const { s, text } = api;
	drawTile(api, { pts: octagon([0, 0]), n: 8 });
	for (const p of octagon([0, 0])) dot(api, p[0], p[1], 4.4, "rgba(20,20,20,0.55)");

	// A white disc first: two of the three wedges are the octagon's own colour, and laid straight onto
	// the octagon's fill the corner it already owns would be invisible — which is the one that has to
	// read, since the other two are deduced from it.
	halo(api, V[0], V[1], 0.62 * s);
	for (const [from, span, n] of WEDGES) wedge(api, V, from, span, n, 0.58);
	dot(api, V[0], V[1], 5.4);

	// the angles, each at the middle of its own sector
	for (const [from, span] of WEDGES) {
		const a = rad(from + span / 2);
		text(V[0] + Math.cos(a) * 0.37, V[1] + Math.sin(a) * 0.37, String(span), {
			colour: "rgba(20,20,20,0.85)", size: 0.68, weight: 700,
		});
	}
	text(0, -1.62, "135 + 135 + 90 = 360", { colour: SOFT, size: 0.66 });
}

function drawCorona(api: Api) {
	// only what the vertex forced: an octagon across four of the eight edges, a square across the
	// other four. The octagons sit on the axes and the squares on the diagonals, which is the
	// alternation, drawn rather than asserted.
	for (const c of [[S, 0], [0, S], [-S, 0], [0, -S]] as Pt[]) drawTile(api, { pts: octagon(c), n: 8 }, 0.62);
	for (const c of [[S / 2, S / 2], [-S / 2, S / 2], [-S / 2, -S / 2], [S / 2, -S / 2]] as Pt[])
		drawTile(api, { pts: square(c), n: 4 }, 0.88);
	drawTile(api, { pts: octagon([0, 0]), n: 8 }, 0.95, 2.4);
}

function drawPlane(api: Api) {
	for (const t of truncatedSquare(3)) drawTile(api, t, 0.8, 1.2);
	drawTile(api, { pts: octagon([0, 0]), n: 8 }, 0.95, 2.6);
}

// ---------------------------------------------------------------------------------------------

const box = (half: number): Box => ({ minX: -half, maxX: half, minY: -half, maxY: half });

const FRAMES: PanelSpec[] = [
	{
		title: "one vertex",
		note: "an octagon's corner leaves 225°, and of the two fills that close it, 3.8.24 never tiles",
		box: box(1.85),
		draw: drawVertex,
	},
	{
		title: "the corona is forced",
		note: "so every vertex of the octagon is 4.8.8, and its eight edges alternate square and octagon",
		box: box(3.9),
		draw: drawCorona,
	},
	{
		title: "and so is the plane",
		note: "every octagon the corona placed sits the same way, so the step repeats and nothing is ever chosen",
		box: box(6.4),
		draw: drawPlane,
	},
];

export function OctagonForcing() {
	return (
		<div className="not-prose mx-auto flex w-full max-w-[52rem] flex-wrap items-start justify-center gap-4">
			{FRAMES.map((f) => (
				<FigurePanel key={f.title} panel={f} aspect="1/1" />
			))}
		</div>
	);
}
