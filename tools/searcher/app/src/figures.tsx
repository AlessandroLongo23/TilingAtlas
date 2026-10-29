// Drawings of a board's faces and vertices, in the site's tile palette. The vertex figure is the site's
// own (components/about/figures/geometry/vertex.ts): regular faces round a point, solved in the plane,
// the sphere or the hyperbolic disk, whichever the corners close in.
import { useRef, useState, type PointerEvent } from "react";
import { turned, vertexFigure, type Turn } from "@/components/about/figures/geometry/vertex";
import { GEOMETRIES } from "@/lib/vocabulary";
import { tileFill } from "@/lib/render/tilePalette";
import { polygonFillHue, polygonHue, starHue } from "@/lib/utils/renderTiling";
import { cn } from "@/lib/utils/cn";
import { paletteFor } from "@/lib/colors/render";
import { coloredCorner, cyclicKey, edgeTypes, faceSize, flatOf, type Board, type Face } from "./board";
import { DEFAULT_BUBBLE_EDGE_STYLE, pushEdge } from "@/lib/bubble/edges";
import {
	bubbleGrid,
	cornerAngle,
	cornerShapes,
	dentOf,
	freePoints,
	polygonOf,
	specOf,
	starCorner,
	withPoints,
	type Geometry,
	type Shape,
} from "./corners";
import { EPS, onSegment, orient } from "./freeface";

/** One colour per declared corner, spread round the wheel by the golden angle. */
export const cornerHue = (b: Board, sym: string) => {
	const i = b.angles.findIndex((a) => a.sym === sym);
	return i < 0 ? null : (i * 137.508 + 20) % 360;
};
export const cornerFill = (b: Board, sym: string) => {
	const h = cornerHue(b, sym);
	return h === null ? "var(--color-surface-sunken)" : tileFill(h);
};
const faceFill = (n: number | null) => tileFill(polygonHue(n === null ? 30 : Math.max(3, n)), 0.85);
/** A face's fill: a star's from the atlas's star ramp (its points and point angle), any other by its corners. */
/** A colouring's face colour, as the plane renderer fills it (develop.ts): its colour letter's palette entry,
 *  cream a warm hue and dark near-black. Null for a corner with no colour letter. */
const colorFill = (sym: string) => {
	const letter = coloredCorner(sym)?.color;
	if (letter === undefined) return null;
	const c = paletteFor(letter + 1)[letter];
	return typeof c === "number" ? tileFill(c, 0.85) : c === "dark" ? "rgb(40 40 44)" : tileFill(42, 0.85);
};

const fillOf = (b: Board, f: Face) => {
	const colored = f.word.map(colorFill).find(Boolean);
	if (colored) return colored;
	const spec = specOf(b, f);
	if (spec?.point !== undefined && spec.n !== null && dentOf(spec.n, spec.point) > 180)
		return tileFill(starHue(spec.n, spec.point), 0.85);
	// any other face drawn from its own angles takes the plane renderer's hue for its outline
	const walked = walkFace(b, f);
	if (walked) return tileFill(polygonFillHue(walked), 0.85);
	const cut = polygonOf(f, flatOf(b));
	return faceFill(cut ? cut.n : faceSize(f));
};

type Pt = { x: number; y: number };
// per board, its corner shapes and walked faces: a vertex is laid out from them thousands of times over
type Walks = {
	shapes: Map<string, Shape>;
	faces: [Map<Face, Pt[] | null>, Map<Face, Pt[] | null>];
	/** per corner: its face and every way it can sit at a vertex (cornerAt) */
	corners: Map<string, { face: Face; polys: Pt[][]; js: number[] } | null>;
	/** whether two corners' faces overlap, by the corners and the turn between them */
	pairs: Map<string, boolean>;
};
const walks = new WeakMap<Board, Walks>();
const walksOf = (b: Board) => {
	let w = walks.get(b);
	if (!w)
		walks.set(
			b,
			(w = { shapes: cornerShapes(b), faces: [new Map(), new Map()], corners: new Map(), pairs: new Map() }),
		);
	return w;
};
/**
 * A face walked with unit edges, turning at each corner by its own angle, corner by corner (y up). Null
 * when the walk does not close, or, unless `regular` allows them, when a corner takes its angle from the
 * face (a regular polygon's corner: the face drawing keeps its own upright regular polygon for those).
 */
function walkFace(b: Board, f: Face, regular = false): Pt[] | null {
	const done = walksOf(b).faces[regular ? 1 : 0];
	if (!done.has(f)) done.set(f, walkOnce(b, f, regular));
	return done.get(f)!;
}
function walkOnce(b: Board, f: Face, regular: boolean): Pt[] | null {
	if (f.repeat === "inf") return null;
	const shapes = walksOf(b).shapes;
	const full = Array.from({ length: f.repeat }, () => f.word).flat();
	const ang = full.map((c) => {
		const s = shapes.get(c);
		if (s?.kind === "set" || s?.kind === "iso" || s?.kind === "pi") return cornerAngle(s, "plane", 0)!;
		return regular && s?.kind === "polygon" && s.n !== null ? Math.PI - (2 * Math.PI) / s.n : NaN;
	});
	if (ang.some(Number.isNaN)) return null;
	const pts: Pt[] = [];
	const step = halfEdge(b);
	let [x, y, dir] = [0, 0, 0];
	for (let i = 0; i < full.length; i++) {
		pts.push({ x, y });
		const len = step(full[i], full[(i + 1) % full.length]);
		x += len * Math.cos(dir);
		y += len * Math.sin(dir);
		dir += Math.PI - ang[(i + 1) % full.length];
	}
	return Math.hypot(x, y) < 1e-6 ? pts : null;
}

/** The length of the step between two neighbouring corners of a face: half an edge's length beside an edge
 *  line's midpoint corner, 1 anywhere else (a side cut by Pi corners is that many unit steps). */
export function halfEdge(b: Board): (c: string, d: string) => number {
	const edges = edgeTypes(b);
	return (c, d) => (edges.get(c) ?? edges.get(d) ?? { length: 2 }).length / 2;
}

/**
 * A vertex in the plane with a corner no regular polygon has (a star's point or dent): each corner's face
 * walked out from the vertex, the corner at the centre, one after another round it. Null unless such a
 * corner is there, every corner sits in a face that walks, and the angles close to 360° in the plane.
 */
function layVertex(b: Board, word: string[]): { poly: Pt[]; face: Face }[] | null {
	const theta = turns(b, word);
	if (!theta || word.some((c) => !cornerAt(b, c))) return null;
	const at = fit(b, word, theta) ?? word.map((c) => ({ c, j: cornerAt(b, c)!.js[0] }));
	return at.map((p, k) => ({ poly: placed(b, p, theta[k]), face: cornerAt(b, p.c)!.face }));
}
/** Where each corner's first side points, going round; null unless some corner has no regular polygon's
 *  angle and the angles close to 360° in the plane. */
function turns(b: Board, word: string[]): number[] | null {
	const shapes = walksOf(b).shapes;
	// a gluing line (two edge corners) is laid out too: the two faces either side of a side's middle
	const glued = word.length === 2 && word.every((c) => b.angles.some((a) => a.sym === c && a.edge));
	if (!glued && !word.some((c) => !known(shapes.get(c)))) return null;
	const rad = word.map((c) => cornerAngle(shapes.get(c), "plane", 0) ?? NaN);
	if (!word.length || rad.some(Number.isNaN) || Math.abs(rad.reduce((t, r) => t + r, 0) - 2 * Math.PI) > 1e-6)
		return null;
	let t = 0;
	return rad.map((r) => ((t += r), t - r));
}
/**
 * Corner `c`'s face and every way it can sit at a vertex: the face walked out from each place the corner has
 * in it, in both hands (a face and its mirror image are the same face, so a tooth can lie either way round),
 * each with the corner at the origin and its first side along +x. Null when the face does not walk. Shapes
 * that repeat (a mirror-symmetric face, a star's mirror-image corners) are kept once.
 */
function cornerAt(b: Board, c: string) {
	const corners = walksOf(b).corners;
	if (!corners.has(c)) {
		const face = b.faces.find((f) => f.repeat !== "inf" && f.word.includes(c));
		const walked = face && walkFace(b, face, true);
		if (!face || !walked) corners.set(c, null);
		else {
			const n = walked.length;
			const mirrored = walked.map((p) => ({ x: p.x, y: -p.y })).reverse();
			const places = new Map<string, Pt[]>();
			face.word.forEach((d, j) => {
				if (d !== c) return;
				for (const [poly, i] of [[walked, j], [mirrored, n - 1 - j]] as const) {
					const [a, e] = [poly[i], poly[(i + 1) % n]];
					const rot = -Math.atan2(e.y - a.y, e.x - a.x);
					const [cs, sn] = [Math.cos(rot), Math.sin(rot)];
					const out = [...poly.slice(i), ...poly.slice(0, i)].map((p) => ({
						x: (p.x - a.x) * cs - (p.y - a.y) * sn,
						y: (p.x - a.x) * sn + (p.y - a.y) * cs,
					}));
					places.set(out.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join(" "), out);
				}
			});
			const polys = [...places.values()];
			corners.set(c, { face, polys, js: polys.map((_, j) => j) });
		}
	}
	return corners.get(c)!;
}
/** A corner and which of its places (cornerAt's `polys`) it takes. */
type At = { c: string; j: number };
/** Corner `p`'s face laid out with the corner at the origin and its first side along `theta`. */
function placed(b: Board, { c, j }: At, theta: number): Pt[] {
	const [cs, sn] = [Math.cos(theta), Math.sin(theta)];
	return cornerAt(b, c)!.polys[j].map((p) => ({ x: p.x * cs - p.y * sn, y: p.x * sn + p.y * cs }));
}
const walkVertex = (b: Board, word: string[]) =>
	layVertex(b, word)?.map(({ poly, face }) => ({ poly, fill: fillOf(b, face), dashed: false })) ?? null;

/**
 * Whether the faces round a vertex overlap when laid out in the plane, so this order of its corners can never
 * occur in a tiling; null when it cannot be laid out (regular faces alone, which are convex and never
 * overlap, or angles that do not close). Digons mark edges and take no room, so they are left out. Faces
 * share the centre and their sides out of it, so only interiors count: two overlap when their sides cross,
 * or when a stretch of one's side, between the points where the other touches it, runs inside the other.
 * Neither can hold the other whole, as each has a corner at the centre in a wedge of its own.
 */
export function overlapping(b: Board, word: string[]): boolean | null {
	const { shapes, pairs } = walksOf(b);
	const w = word.filter((c) => shapes.get(c)?.kind !== "digon");
	const theta = turns(b, w);
	if (!theta || w.some((c) => !cornerAt(b, c))) return null;
	return !fit(b, w, theta);
}

/** A place for each corner of `w`, turned by `theta`, with no two faces overlapping; null when none works. */
function fit(b: Board, w: string[], theta: number[], at: At[] = []): At[] | null {
	const k = at.length;
	if (k === w.length) return at;
	for (const j of cornerAt(b, w[k])!.js) {
		const p = { c: w[k], j };
		if (at.some((q, i) => clash(b, q, p, theta[k] - theta[i]))) continue;
		const done = fit(b, w, theta, [...at, p]);
		if (done) return done;
	}
	return null;
}

/** Whether the faces of placed corners `p` and `q` overlap with q's turned `turn` from p's: two faces overlap
 *  or not by these alone, and few such triples recur over a board's vertices, so each is tested once. */
function clash(b: Board, p: At, q: At, turn: number) {
	const { pairs } = walksOf(b);
	const key = `${p.c}@${p.j} ${q.c}@${q.j} ${Math.round(turn * 1e9)}`;
	if (!pairs.has(key)) pairs.set(key, overlap(placed(b, p, 0), placed(b, q, turn)));
	return pairs.get(key)!;
}

/**
 * Every vertex of the board's corners whose faces fit round a point in the plane: each cyclic order (up to
 * rotation and reflection) of 2 to `max` corners whose angles add up to 360° and whose faces do not overlap.
 * Built face by face, each checked against those placed before it, so the orders that clash early are never
 * listed: a palette of 15° stars has 247 million corner sets that close, nearly all of them overlapping.
 * Corners that cannot be laid out (a free angle, an apeirogon, a digon) are left out. Null past `budget` steps.
 */
/** Whether every corner with an angle in the plane can be laid out (none free, none an apeirogon's): only
 *  then does `fittingVertices` see all of the board's vertices. Digons take no room and do not count. */
export const layable = (b: Board) =>
	b.angles.every(({ sym, edge }) => {
		const s = walksOf(b).shapes.get(sym);
		return edge || s?.kind === "digon" || !(((s && cornerAngle(s, "plane", 0)) ?? 0) > 1e-9) || !!cornerAt(b, sym);
	}) && !sharedAcrossShapes(b);

/** Whether some corner sits in faces of different shapes (a 90° corner of a triangle and of a square): the
 *  overlap test lays a corner out in its first face only, so it cannot judge such a board. A shape is the
 *  face's word with each edge corner read as its length, so the decorations of one square are one shape. */
function sharedAcrossShapes(b: Board): boolean {
	const edges = edgeTypes(b);
	const shapeOf = new Map<string, string>();
	for (const f of b.faces) {
		if (f.repeat === "inf") continue;
		const full = Array.from({ length: f.repeat }, () => f.word).flat();
		const key = cyclicKey(full.map((c) => (edges.has(c) ? `~${edges.get(c)!.length}` : c)));
		for (const c of new Set(full)) {
			if (edges.has(c)) continue;
			if ((shapeOf.get(c) ?? key) !== key) return true;
			shapeOf.set(c, key);
		}
	}
	return false;
}

export function fittingVertices(b: Board, max: number, budget = 5e7): string[][] | null {
	const { shapes } = walksOf(b);
	const edges = edgeTypes(b);
	const syms = b.angles
		.map((a) => a.sym)
		.filter((c) => shapes.get(c)?.kind !== "digon" && !edges.has(c) && cornerAt(b, c))
		.map((c) => {
			const s = shapes.get(c);
			// a star's point (sides of one edge) and dent: two points never sit side by side, nor two dents
			// at one vertex (pointsTouch in corners.ts), which settles those without laying anything out
			const star = starCorner(s);
			return { c, a: cornerAngle(s, "plane", 0)!, point: star === "point", dent: star === "dent" };
		})
		.filter(({ a }) => a > 1e-9);
	const out = new Map<string, string[]>();
	const cur: At[] = [];
	const curI: number[] = [];
	const at: number[] = [];
	let steps = 0;
	let dents = 0;
	// corner i at `theta`, in each place it has in its face that clashes with none placed before it
	const put = (i: number, theta: number, first: number) => {
		const { c, a, dent } = syms[i];
		for (const j of cornerAt(b, c)!.js) {
			const p = { c, j };
			if (cur.some((q, k) => clash(b, q, p, theta - at[k]))) continue;
			(cur.push(p), curI.push(i), at.push(theta), (dents += dent ? 1 : 0));
			grow(first, theta + a);
			(cur.pop(), curI.pop(), at.pop(), (dents -= dent ? 1 : 0));
		}
	};
	// the first corner is the word's first symbol in board order, so each rotation class starts once or more
	const grow = (first: number, theta: number) => {
		if (++steps > budget) return;
		if (Math.abs(theta - 2 * Math.PI) < 1e-9) {
			if (cur.length >= 2 && !(syms[curI[0]].point && syms[curI[curI.length - 1]].point)) {
				const word = cur.map((p) => p.c);
				const k = cyclicKey(word);
				if (!out.has(k)) out.set(k, word);
			}
			return;
		}
		if (cur.length === max) return;
		for (let i = first; i < syms.length; i++) {
			const { a, point, dent } = syms[i];
			if (theta + a > 2 * Math.PI + 1e-9) continue;
			if ((point && syms[curI[curI.length - 1]].point) || (dent && dents)) continue;
			put(i, theta, first);
		}
	};
	for (let i = 0; i < syms.length && steps <= budget; i++) put(i, 0, i);
	return steps > budget ? null : [...out.values()];
}

/**
 * An order of the corners `word` (a set, as a board with Permutations reads it) whose faces do not overlap:
 * the word itself when it fits or cannot be laid out, null when every order overlaps. Corners are placed
 * one by one, each checked against those before it, so a set that never fits is settled long before its
 * orders could all be listed.
 */
export function fittingOrder(b: Board, word: string[]): string[] | null {
	const fits = overlapping(b, word);
	if (fits !== true || word.some((c) => walksOf(b).shapes.get(c)?.kind === "digon")) return word;
	const rad = new Map(word.map((c) => [c, cornerAngle(walksOf(b).shapes.get(c), "plane", 0)!]));
	const left = new Map<string, number>();
	for (const c of word) left.set(c, (left.get(c) ?? 0) + 1);
	const syms = [...left.keys()].sort();
	const cur: At[] = [];
	const at: number[] = [];
	const place = (theta: number): boolean => {
		if (cur.length === word.length) return true;
		for (const c of cur.length ? syms : syms.slice(0, 1)) {
			if (!left.get(c)) continue;
			for (const j of cornerAt(b, c)!.js) {
				const p = { c, j };
				if (cur.some((q, i) => clash(b, q, p, theta - at[i]))) continue;
				(left.set(c, left.get(c)! - 1), cur.push(p), at.push(theta));
				if (place(theta + rad.get(c)!)) return true;
				(left.set(c, left.get(c)! + 1), cur.pop(), at.pop());
			}
		}
		return false;
	};
	return place(0) ? cur.map((p) => p.c) : null;
}

function overlap(P: Pt[], Q: Pt[]) {
	const box = (R: Pt[]) => [
		Math.min(...R.map((p) => p.x)),
		Math.max(...R.map((p) => p.x)),
		Math.min(...R.map((p) => p.y)),
		Math.max(...R.map((p) => p.y)),
	];
	const [A, B] = [box(P), box(Q)];
	if (A[0] > B[1] - EPS || B[0] > A[1] - EPS || A[2] > B[3] - EPS || B[2] > A[3] - EPS) return false;
	return crosses(P, Q) || runsInside(P, Q) || runsInside(Q, P);
}

const strictly = (a: number, c: number) => (a > EPS && c < -EPS) || (a < -EPS && c > EPS);
function crosses(P: Pt[], Q: Pt[]) {
	for (let i = 0; i < P.length; i++) {
		const [a, c] = [P[i], P[(i + 1) % P.length]];
		for (let j = 0; j < Q.length; j++) {
			const [p, q] = [Q[j], Q[(j + 1) % Q.length]];
			if (strictly(orient(p, q, a), orient(p, q, c)) && strictly(orient(a, c, p), orient(a, c, q))) return true;
		}
	}
	return false;
}
/** Whether `m` is inside Q and on none of its sides. */
function inside(m: Pt, Q: Pt[]) {
	let odd = false;
	for (let j = 0; j < Q.length; j++) {
		const [p, q] = [Q[j], Q[(j + 1) % Q.length]];
		if (onSegment(p, q, m)) return false;
		if (p.y > m.y !== q.y > m.y && m.x < p.x + ((m.y - p.y) * (q.x - p.x)) / (q.y - p.y)) odd = !odd;
	}
	return odd;
}
function runsInside(P: Pt[], Q: Pt[]) {
	for (let i = 0; i < P.length; i++) {
		const [a, c] = [P[i], P[(i + 1) % P.length]];
		const len2 = (c.x - a.x) ** 2 + (c.y - a.y) ** 2;
		const ts = [0, 1];
		for (const q of Q) if (onSegment(a, c, q)) ts.push(((q.x - a.x) * (c.x - a.x) + (q.y - a.y) * (c.y - a.y)) / len2);
		ts.sort((x, y) => x - y);
		for (let k = 0; k + 1 < ts.length; k++) {
			const t = (ts[k] + ts[k + 1]) / 2;
			if (ts[k + 1] - ts[k] > EPS && inside({ x: a.x + t * (c.x - a.x), y: a.y + t * (c.y - a.y) }, Q)) return true;
		}
	}
	return false;
}

/** A walked outline centred and scaled into the face drawing's circle, y down as SVG draws. */
const fitted = (pts: Pt[]) => {
	const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length;
	const cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
	const r = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
	return pts.map((p) => ({ x: ((p.x - cx) * 0.62) / r, y: (-(p.y - cy) * 0.62) / r }));
};

/**
 * A bubble face's outline: each side between real corners curved out (a bump) or in (a bite) when its
 * edge corner says so, drawn as the tilings draw it (develop.ts). Each edge corner's dot moves onto the
 * curve, at its place along the side. Null for a face with no bumps or bites.
 */
function bubbleOutline(
	b: Board,
	word: string[],
	pts: Pt[],
): { outline: Pt[]; at: Pt[]; marker: boolean[] } | null {
	const types = edgeTypes(b);
	const styleOf = (c: string) => types.get(c)?.style;
	const curved = (c: string) => styleOf(c) === "bump" || styleOf(c) === "bite";
	if (!word.some(curved)) return null;
	const shapes = cornerShapes(b);
	const n = pts.length;
	// clockwise, so a bump bulges to the left of each side as pushEdge draws it
	const area = pts.reduce((t, p, i) => t + p.x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * p.y, 0);
	const order = Array.from({ length: n }, (_, i) => (area > 0 ? n - 1 - i : i));
	const real = order.flatMap((i, j) => (shapes.get(word[i])?.kind === "pi" ? [] : [j]));
	if (real.length < 2) return null;
	const grid = bubbleGrid(b);
	const outline: Pt[] = [];
	const at = [...pts];
	real.forEach((j, r) => {
		const next = real[(r + 1) % real.length];
		const count = (next - j + n) % n || n;
		const between = Array.from({ length: count }, (_, k) => order[(j + k) % n]);
		const mid = between.find((i) => curved(word[i]));
		if (mid === undefined) return void outline.push(...between.map((i) => pts[i]));
		const [a, c] = [pts[order[j]], pts[order[next]]];
		const start = outline.length;
		pushEdge(outline, [a.x, a.y], [c.x, c.y], styleOf(word[mid]) === "bump", DEFAULT_BUBBLE_EDGE_STYLE, grid);
		const [dx, dy] = [c.x - a.x, c.y - a.y];
		const along = (p: Pt) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
		between.slice(1).forEach((i, k) => {
			const t = (k + 1) / count;
			at[i] = outline.slice(start).reduce((best, p) => (Math.abs(along(p) - t) < Math.abs(along(best) - t) ? p : best));
		});
	});
	return { outline, at, marker: word.map(curved) };
}

/** The outline of faces and corner dots: dark ink in both themes, as the tilings themselves are drawn. */
export const INK = "rgb(0 0 0 / 0.72)";

/** A corner as a dot with its symbol, the same everywhere it appears. */
function Slot(props: {
	b: Board;
	sym: string;
	x: number;
	y: number;
	lx: number;
	ly: number;
	r: number;
	selected?: boolean;
	onClick?: () => void;
	label?: boolean;
	/** The label sits on a face (a vertex figure's), so it is drawn in INK, not the theme's text colour. */
	onFace?: boolean;
}) {
	const { b, sym, x, y, lx, ly, r, selected, onClick, label = true, onFace } = props;
	return (
		<g onClick={onClick} className={onClick ? "cursor-pointer" : undefined}>
			<circle cx={x} cy={y} r={r * 2.4} fill="transparent" />
			<circle
				cx={x}
				cy={y}
				r={selected ? r * 1.5 : r}
				fill={sym ? cornerFill(b, sym) : "var(--color-surface-raised)"}
				stroke={selected ? "var(--color-accent)" : INK}
				strokeWidth={selected ? r * 0.5 : r * 0.25}
				strokeDasharray={sym ? undefined : `${r * 0.6} ${r * 0.4}`}
			/>
			{label ? (
				<text
					x={lx}
					y={ly}
					fontSize={r * 2.6}
					textAnchor="middle"
					dominantBaseline="central"
					className={cn("font-mono", selected ? "fill-accent font-semibold" : !onFace && "fill-fg")}
					fill={onFace && !selected ? INK : undefined}
				>
					{sym || "?"}
				</text>
			) : null}
		</g>
	);
}

/**
 * A face drawn as a regular polygon, a lens for a digon, or a strip for an apeirogon, with its corners
 * labelled in order. A face whose Pi corners cut its sides alike is drawn as the polygon it is, the Pi
 * points along its sides: `M3 Pi M3 Pi M3 Pi` is a triangle with sides of two edges. `selected` and
 * `onSlot` make the corners clickable (the face editor).
 */
export function FaceFigure({
	b,
	face,
	size = 120,
	selected,
	onSlot,
	labelsUpTo = Infinity,
}: {
	b: Board;
	face: Face;
	size?: number;
	selected?: number | null;
	onSlot?: (i: number) => void;
	/** Label corners only up to this many (a card's small drawing shows dots past it). */
	labelsUpTo?: number;
}) {
	const n = faceSize(face);
	const label = (n ?? face.word.length * 3) <= labelsUpTo;
	const r = n !== null && n > 16 ? 0.035 : 0.05;
	if (n === null) {
		// an apeirogon: three repeats of its word along a line, fading out at both ends
		const L = Math.max(1, face.word.length);
		const count = L * 3;
		const xs = Array.from({ length: count }, (_, i) => -1 + (2 * (i + 0.5)) / count);
		return (
			<svg viewBox="-1.1 -0.6 2.2 1.2" width={size} height={size * 0.55} className="text-fg-secondary">
				<defs>
					<linearGradient id="fade" x1="0" x2="1">
						<stop offset="0" stopColor="white" stopOpacity="0" />
						<stop offset="0.15" stopColor="white" stopOpacity="1" />
						<stop offset="0.85" stopColor="white" stopOpacity="1" />
						<stop offset="1" stopColor="white" stopOpacity="0" />
					</linearGradient>
					<mask id="fade-mask">
						<rect x="-1.1" y="-0.6" width="2.2" height="1.2" fill="url(#fade)" />
					</mask>
				</defs>
				<g mask="url(#fade-mask)">
					<rect x="-1.1" y="-0.05" width="2.2" height="0.5" fill={faceFill(null)} />
					<line x1="-1.1" x2="1.1" y1="-0.05" y2="-0.05" stroke={INK} strokeWidth="0.012" />
				</g>
				{xs.map((x, i) => (
					<Slot
						key={i}
						b={b}
						sym={face.word[i % L] ?? ""}
						x={x}
						y={-0.05}
						lx={x}
						ly={-0.3}
						r={r}
						selected={selected != null && i % L === selected}
						onClick={onSlot && (() => onSlot(i % L))}
						label={label}
					/>
				))}
			</svg>
		);
	}
	// a star whose point Quick setup solves is drawn at a stand-in point, halfway to turning convex
	const loose = freePoints({ ...b, faces: [face] })[0];
	const shown = loose ? withPoints(b, [loose], [loose.n >= 3 ? (180 - 360 / loose.n) / 2 : 60]) : b;
	// a face whose corners all have angles of their own is drawn from them (a star, a cut polygon)
	const walked = walkFace(shown, face);
	// the polygon itself: its real corners, and how many edges each side is cut into
	const flat = flatOf(b);
	const cut = polygonOf(face, flat);
	const m = cut && cut.n !== null && cut.n >= 3 && cut.seg > 1 ? cut.n : n;
	const seg = m === n ? 1 : cut!.seg;
	const at0 = m === n ? 0 : face.word.findIndex((c) => !flat(c));
	const vs = Array.from({ length: m }, (_, k) => {
		const a = -Math.PI / 2 + (2 * Math.PI * k) / m;
		return { x: 0.62 * Math.cos(a), y: 0.62 * Math.sin(a) };
	});
	// corner i of the written-out face: a vertex of the polygon, or a Pi point that far along its side
	const pts = walked
		? fitted(walked)
		: Array.from({ length: n }, (_, i) => {
				const j = (((i - at0) % n) + n) % n;
				const k = Math.floor(j / seg);
				const t = (j % seg) / seg;
				const [a, c] = [vs[k], vs[(k + 1) % m]];
				return { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t };
			});
	const outward = (p: { x: number; y: number }) => (Math.hypot(p.x, p.y) + 0.24) / Math.hypot(p.x, p.y);
	const L = Math.max(1, face.word.length);
	const bubble = bubbleOutline(
		b,
		pts.map((_, i) => face.word[i % L]),
		pts,
	);
	const dots = bubble?.at ?? pts;
	// on a card the curve says bump or bite, so its edge corner's dot would only hide it; the face editor,
	// where the dots are clicked, keeps them
	const bare = bubble && !onSlot ? bubble.marker : null;
	const labelled = bare ? bare.filter((m) => !m).length <= labelsUpTo : label;
	const outline = bubble
		? `M ${bubble.outline.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`
		: walked
		? `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`
		: m === 2
			? `M ${vs[0].x} ${vs[0].y} Q 0.5 0 ${vs[1].x} ${vs[1].y} Q -0.5 0 ${vs[0].x} ${vs[0].y} Z`
			: `M ${vs.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
	return (
		<svg viewBox="-1 -1 2 2" width={size} height={size} className="text-fg-secondary">
			<path d={outline} fill={fillOf(shown, face)} stroke={INK} strokeWidth="0.012" strokeLinejoin="round" />
			{dots.map((p, i) =>
				bare?.[i] ? null : (
				<Slot
					key={i}
					b={b}
					sym={face.word[i % L] ?? ""}
					x={p.x}
					y={p.y}
					lx={p.x * outward(p)}
					ly={p.y * outward(p)}
					r={r}
					selected={selected != null && i % L === selected}
					onClick={onSlot && (() => onSlot(i % L))}
					label={labelled}
				/>
				),
			)}
		</svg>
	);
}

// An apeirogon corner is drawn as a polygon with this many sides: straight enough to read as a line.
const APEIROGON_SIDES = 400;

// Each corner as the regular polygon corners.ts says it is: an M3 of `M3 Pi M3 Pi M3 Pi` is a triangle's
// corner (its sides cut in two), a Pi a straight angle (drawn as an apeirogon's), a digon a marked edge.
// A set angle is drawn as the regular polygon with that corner in the plane (60° a triangle, 90° a square).
const regularOf = (rad: number) => {
	const n = (2 * Math.PI) / (Math.PI - rad);
	return Math.abs(n - Math.round(n)) < 1e-9 && Math.round(n) >= 3 ? Math.round(n) : null;
};
const known = (s: Shape | undefined) =>
	s?.kind === "polygon" || s?.kind === "pi" || s?.kind === "digon" || (s?.kind === "set" && regularOf(s.rad) !== null);
/**
 * Where the corners close, from their exact angles, when every one is a regular polygon's (or Pi, or a
 * digon): sidesOf can only stand Pi in as a 400-gon's corner, a hair under 180°, which would put a flat
 * `A3 A3 A3 Pi` on the sphere. Undefined otherwise, and the figure decides from its sides.
 */
const exactGeometry = (shapes: Map<string, Shape>, word: string[]): Geometry | undefined => {
	if (!word.every((c) => known(shapes.get(c)))) return undefined;
	const sum = word.reduce((t, c) => t + (cornerAngle(shapes.get(c), "plane", 0) ?? NaN), 0);
	if (!Number.isFinite(sum)) return undefined;
	return Math.abs(sum - 2 * Math.PI) < 1e-9 ? "plane" : sum < 2 * Math.PI ? "sphere" : "hyperbolic";
};
// vertexFigure speaks the site's geometry names; TileSearch's are "plane" and "sphere"
const SITE = { plane: GEOMETRIES.EUCLIDEAN, sphere: GEOMETRIES.SPHERICAL, hyperbolic: GEOMETRIES.HYPERBOLIC } as const;
const exactSite = (shapes: Map<string, Shape>, word: string[]) => {
	const g = exactGeometry(shapes, word);
	return g && SITE[g];
};
const sidesOf = (shapes: Map<string, Shape>, word: string[]) => {
	return word.map((sym) => {
		const s = shapes.get(sym);
		if (s?.kind === "digon") return 2;
		if (s?.kind === "pi") return APEIROGON_SIDES;
		if (s?.kind === "polygon") return s.n === null ? APEIROGON_SIDES : Math.max(3, s.n);
		if (s?.kind === "set") return regularOf(s.rad) ?? 4;
		return 4; // an unknown angle, or a set one no regular polygon has: a square corner, drawn dashed
	});
};

// A spherical vertex is drawn on a ball, tilted at rest so it reads as one, and turned by dragging.
const about = (axis: 0 | 1, t: number): Turn => {
	const [c, s] = [Math.cos(t), Math.sin(t)];
	return axis === 0 ? [1, 0, 0, 0, c, -s, 0, s, c] : [c, 0, s, 0, 1, 0, -s, 0, c];
};
const times = (a: Turn, b: Turn): Turn =>
	a.map((_, k) => [0, 1, 2].reduce((t, j) => t + a[3 * Math.floor(k / 3) + j] * b[3 * j + (k % 3)], 0));
const TILT = times(about(1, -0.35), about(0, -0.45));

/** The turn of a ball dragged with the pointer, and the click a drag must not become. */
function useBallTurn(size: number) {
	const [turn, setTurn] = useState<Turn>(TILT);
	const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
	const dragged = useRef(false);
	return {
		turn,
		handlers: {
			onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
				drag.current = { x: e.clientX, y: e.clientY, moved: false };
				e.currentTarget.setPointerCapture(e.pointerId);
			},
			onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
				const d = drag.current;
				if (!d) return;
				const [dx, dy] = [e.clientX - d.x, e.clientY - d.y];
				if (!d.moved && Math.hypot(dx, dy) < 3) return;
				drag.current = { x: e.clientX, y: e.clientY, moved: true };
				const k = (1.6 * Math.PI) / size; // a drag across the figure turns the ball most of the way round
				setTurn((t) => times(times(about(1, dx * k), about(0, dy * k)), t));
			},
			onPointerUp: () => ((dragged.current = !!drag.current?.moved), (drag.current = null)),
			onClickCapture: (e: { stopPropagation: () => void; preventDefault: () => void }) => {
				if (dragged.current) (e.stopPropagation(), e.preventDefault(), (dragged.current = false));
			},
		},
	};
}

/** A vertex: its corners round a point, each drawn as a regular face of the size the board gives it. */
export function VertexFigure({
	b,
	word,
	size = 140,
	selected,
	onSlot,
	labelsUpTo = Infinity,
}: {
	b: Board;
	word: string[];
	size?: number;
	selected?: number | null;
	onSlot?: (i: number) => void;
	labelsUpTo?: number;
}) {
	const label = word.length <= labelsUpTo;
	const ball = useBallTurn(size);
	if (!word.length)
		return (
			<svg viewBox="-1 -1 2 2" width={size} height={size}>
				<circle r="0.04" className="fill-fg-muted" />
			</svg>
		);
	const shapes = cornerShapes(b);
	const ns = sidesOf(shapes, word);
	// corners with angles of their own (a star's point or dent) are drawn as their faces, walked out
	const walked = walkVertex(b, word);
	const fig = vertexFigure(ns, ball.turn, exactSite(shapes, word));
	const polys = walked ? walked.map((w) => w.poly) : fig.polygons;
	const disk = !walked && fig.geometry !== GEOMETRIES.EUCLIDEAN && fig.edge !== null;
	const sphere = disk && fig.geometry === GEOMETRIES.SPHERICAL;
	// on the ball a point at disk distance `d` from the vertex along corner i's bisector, turned with it
	const onBall = (i: number, d: number) => {
		const t = Math.asin(Math.min(1, d / 0.92));
		const [x, y, z] = turned(ball.turn, [
			Math.sin(t) * Math.cos(fig.mids[i]),
			Math.sin(t) * Math.sin(fig.mids[i]),
			Math.cos(t),
		]);
		return { x: x * 0.92, y: -y * 0.92, front: z >= 0 };
	};
	const centre = sphere ? onBall(0, 0) : { x: 0, y: 0, front: true };
	// a face wholly behind the ball has no front part: no path
	const pathOf = (poly: { x: number; y: number }[]) =>
		poly.length ? `M ${poly.map((p) => `${p.x * scale} ${-p.y * scale}`).join(" L ")} Z` : undefined;
	const scale = disk ? 0.92 : 0.92 / 1.5; // the plane shows 1.5 edges round the vertex
	const r = word.length > 8 ? 0.032 : 0.042;
	const clip = `clip-${word.join("-")}-${size}`;
	return (
		<svg
			viewBox="-1 -1 2 2"
			width={size}
			height={size}
			className={cn("text-fg-secondary", sphere && "cursor-grab touch-none active:cursor-grabbing")}
			{...(sphere ? ball.handlers : {})}
		>
			<defs>
				<clipPath id={clip}>
					<circle r="0.94" />
				</clipPath>
				{sphere ? (
					<radialGradient id={`${clip}-shade`} cx="0.36" cy="0.32" r="0.75">
						<stop offset="0" stopColor="#fff" stopOpacity="0.28" />
						<stop offset="0.45" stopColor="#fff" stopOpacity="0" />
						<stop offset="0.8" stopColor="#000" stopOpacity="0.08" />
						<stop offset="1" stopColor="#000" stopOpacity="0.3" />
					</radialGradient>
				) : null}
			</defs>
			{sphere ? <circle r="0.92" fill="var(--color-surface-raised)" /> : null}
			{sphere ? (
				// the far side, seen through the ball
				<g opacity={0.3}>
					{fig.back.map((poly, i) => (
						<path
							key={i}
							d={pathOf(poly)}
							fill={ns[i] === 2 ? "none" : faceFill(ns[i] === APEIROGON_SIDES ? null : ns[i])}
							stroke="currentColor"
							strokeWidth={0.008}
							strokeDasharray="0.03 0.025"
						/>
					))}
				</g>
			) : null}
			{disk && !sphere ? <circle r="0.92" fill="none" stroke="var(--color-border-default)" strokeWidth="0.01" /> : null}
			<g clipPath={`url(#${clip})`}>
				{polys.map((poly, i) => (
					<path
						key={i}
						d={pathOf(poly)}
						fill={
							colorFill(word[i]) ??
							(walked ? walked[i].fill : ns[i] === 2 ? "none" : faceFill(ns[i] === APEIROGON_SIDES ? null : ns[i]))
						}
						stroke={!walked && ns[i] === 2 ? cornerFill(b, word[i]) : INK}
						strokeWidth={!walked && ns[i] === 2 ? 0.05 : 0.01}
						strokeDasharray={walked || known(shapes.get(word[i])) ? undefined : "0.04 0.03"}
						strokeLinejoin="round"
					/>
				))}
			</g>
			{sphere ? (
				<>
					<circle r="0.92" fill={`url(#${clip}-shade)`} pointerEvents="none" />
					<circle r="0.92" fill="none" stroke="var(--color-border-default)" strokeWidth="0.012" />
				</>
			) : null}
			{word.map((s, i) => {
				const d = 0.3 + (word.length > 8 ? 0.12 : 0);
				if (sphere) {
					// on the ball the label follows its corner round, faint once it is behind
					const [dot, text] = [onBall(i, d - 0.13), onBall(i, d + 0.1)];
					return (
						<g key={i} opacity={dot.front ? 1 : 0.3}>
							<Slot
								b={b}
								sym={s}
								x={dot.x}
								y={dot.y}
								lx={text.x}
								ly={text.y}
								r={r}
								selected={selected === i}
								onClick={onSlot && (() => onSlot(i))}
								label={label}
								onFace
							/>
						</g>
					);
				}
				// each corner's label sits on the bisector of its wedge, close to the vertex
				const poly = polys[i];
				const c = poly.reduce((t, p) => ({ x: t.x + p.x, y: t.y + p.y }), { x: 0, y: 0 });
				const ang = Math.atan2(-c.y, c.x);
				return (
					<Slot
						key={i}
						b={b}
						sym={s}
						x={Math.cos(ang) * (d - 0.13)}
						y={Math.sin(ang) * (d - 0.13)}
						lx={Math.cos(ang) * (d + 0.1)}
						ly={Math.sin(ang) * (d + 0.1)}
						r={r}
						selected={selected === i}
						onClick={onSlot && (() => onSlot(i))}
						label={label}
						onFace
					/>
				);
			})}
			<circle cx={centre.x} cy={centre.y} r="0.018" fill={INK} opacity={centre.front ? 1 : 0.3} />
		</svg>
	);
}

/** "plane", "sphere" or "hyperbolic": where the vertex's faces close, drawn as regular. */
export function vertexGeometry(b: Board, word: string[]) {
	if (word.length < 2) return null;
	if (walkVertex(b, word)) return "plane";
	if (word.length < 3) return null;
	const shapes = cornerShapes(b);
	const ns = sidesOf(shapes, word);
	const g = vertexFigure(ns, undefined, exactSite(shapes, word)).geometry;
	return (Object.keys(SITE) as Geometry[]).find((k) => SITE[k] === g)!;
}
