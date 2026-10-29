// A face drawn edge by edge: each edge a whole number of unit edges, each turn a multiple of 15°.
//
// On the board such a face is ordinary text. Each corner is a symbol with its angle set, and an edge of
// length l is l unit edges with l − 1 Pi corners along it, as Marek writes sides of several edges. Corners
// of one face with the same angle share a symbol: with unit edges they are the same corner, and distinct
// labels would break the face's symmetry and make the engine count colourings of it. The symbols carry the
// face's own prefix (`F1_90`, `F1_270`) so two drawn faces never share a corner by accident.
//
// Closing is decided exactly. Every direction is a power of ζ = e^(iπ/12), and a sum of them is zero only
// when its coordinates in ℤ[ζ] (basis 1, ζ, …, ζ⁷, reduced by Φ₂₄ = x⁸ − x⁴ + 1) all are.
import { angleDegrees, type Angle, type Board, type Face } from "./board";

/** An edge: its direction in steps of 15° (0 east, 6 north) and its length in unit edges. */
export type Edge = { dir: number; len: number };
export type Pt = { x: number; y: number };

export const STEP = 15;
export const DIRS = 24;
export const MAX_LEN = 24;

const mod = (a: number, n = DIRS) => ((a % n) + n) % n;

// ζ^k in the basis 1..ζ⁷: multiply by ζ, folding ζ⁸ = ζ⁴ − 1
const ZETA: number[][] = [];
for (let k = 0, v = [1, 0, 0, 0, 0, 0, 0, 0]; k < DIRS; k++) {
	ZETA.push(v);
	const top = v[7];
	v = [0, ...v.slice(0, 7)];
	v[4] += top;
	v[0] -= top;
}

/** The exact vector of a run of edges. */
export const exact = (edges: Edge[]) =>
	edges.reduce((t, e) => t.map((c, i) => c + e.len * ZETA[mod(e.dir)][i]), [0, 0, 0, 0, 0, 0, 0, 0]);

const unit = (dir: number): Pt => ({ x: Math.cos((dir * Math.PI) / 12), y: Math.sin((dir * Math.PI) / 12) });

/** The corners of the path, from the start (0, 0) to its tip; y up. */
export function pointsOf(edges: Edge[]): Pt[] {
	const pts = [{ x: 0, y: 0 }];
	for (const e of edges) {
		const p = pts[pts.length - 1];
		const u = unit(e.dir);
		pts.push({ x: p.x + e.len * u.x, y: p.y + e.len * u.y });
	}
	return pts;
}

/** The turn from one edge to the next, in steps: positive left, 12 straight back. */
export const turnOf = (from: number, to: number) => {
	const t = mod(to - from);
	return t > 12 ? t - DIRS : t;
};

/** Whether the path returns exactly to its start. */
export const returns = (edges: Edge[]) => edges.length >= 3 && exact(edges).every((c) => c === 0);

/** The single edge that is exactly `v` (an exact vector), or null when no edge of whole length is. */
export function edgeFor(v: number[]): Edge | null {
	// read the direction and length off the float vector, then confirm exactly
	const x = v.reduce((t, c, i) => t + c * Math.cos((i * Math.PI) / 12), 0);
	const y = v.reduce((t, c, i) => t + c * Math.sin((i * Math.PI) / 12), 0);
	const len = Math.round(Math.hypot(x, y));
	if (len < 1 || len > MAX_LEN) return null;
	const dir = mod(Math.round((Math.atan2(y, x) * 12) / Math.PI));
	return ZETA[dir].every((c, i) => len * c === v[i]) ? { dir, len } : null;
}

export const EPS = 1e-7;
export const orient = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export const onSegment = (a: Pt, b: Pt, c: Pt) =>
	Math.abs(orient(a, b, c)) <= EPS &&
	Math.min(a.x, b.x) - EPS <= c.x &&
	c.x <= Math.max(a.x, b.x) + EPS &&
	Math.min(a.y, b.y) - EPS <= c.y &&
	c.y <= Math.max(a.y, b.y) + EPS;
/** Whether two segments meet, touching included. */
function meet(p1: Pt, p2: Pt, q1: Pt, q2: Pt) {
	const [d1, d2, d3, d4] = [orient(q1, q2, p1), orient(q1, q2, p2), orient(p1, p2, q1), orient(p1, p2, q2)];
	const across = (a: number, b: number) => (a > EPS && b < -EPS) || (a < -EPS && b > EPS);
	if (across(d1, d2) && across(d3, d4)) return true;
	return onSegment(q1, q2, p1) || onSegment(q1, q2, p2) || onSegment(p1, p2, q1) || onSegment(p1, p2, q2);
}

/**
 * The first two edges (indices) that meet where they should not, or null. An open path's last edge may
 * end on the start only when that closes it; a closed path's first and last edges share the start.
 */
export function crossing(edges: Edge[]): [number, number] | null {
	const pts = pointsOf(edges);
	const n = edges.length;
	const closed = returns(edges);
	for (let i = 1; i < n; i++) if (turnOf(edges[i - 1].dir, edges[i].dir) === 12) return [i - 1, i];
	if (closed && turnOf(edges[n - 1].dir, edges[0].dir) === 12) return [n - 1, 0];
	for (let j = 2; j < n; j++)
		for (let i = 0; i < j - 1; i++) {
			if (closed && i === 0 && j === n - 1) continue; // neighbours across the start
			if (meet(pts[i], pts[i + 1], pts[j], pts[j + 1])) return [i, j];
		}
	return null;
}

/** Twice the signed area: positive when the path runs anticlockwise. */
const area2 = (pts: Pt[]) => pts.reduce((t, p, i) => t + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0);

/** Which side of the path is inside: 1 its left (anticlockwise), −1 its right. An open path goes by its turns so far. */
export function sideOf(edges: Edge[]): 1 | -1 {
	if (returns(edges)) return area2(pointsOf(edges)) >= 0 ? 1 : -1;
	const t = edges.slice(1).reduce((s, e, i) => s + turnOf(edges[i].dir, e.dir), 0);
	return t >= 0 ? 1 : -1;
}

/** The inside angle (degrees) where edge `from` meets edge `to`, inside on `side`. */
export const cornerDegrees = (from: Edge, to: Edge, side: 1 | -1) => 180 - side * STEP * turnOf(from.dir, to.dir);

/** The polygon anticlockwise, straight joins merged into one edge, the start on a true corner. */
export function normalize(edges: Edge[]): Edge[] {
	const es = sideOf(edges) === 1 ? edges : [...edges].reverse().map((e) => ({ dir: mod(e.dir + 12), len: e.len }));
	const out: Edge[] = [];
	for (const e of es) {
		const last = out[out.length - 1];
		if (last && last.dir === mod(e.dir)) last.len += e.len;
		else out.push({ dir: mod(e.dir), len: e.len });
	}
	if (out.length > 1 && out[0].dir === out[out.length - 1].dir) out[0].len += out.pop()!.len;
	return out;
}

/** What is wrong with a drawing as a face, in plain words, or null when it is one. */
export function problemOf(edges: Edge[]): string | null {
	if (edges.length < 2) return "Draw at least three edges.";
	const hit = crossing(edges);
	if (hit) {
		const back = (hit[1] === hit[0] + 1 || hit[1] === 0) && turnOf(edges[hit[0]].dir, edges[hit[1]].dir) === 12;
		return `Edges ${hit[0] + 1} and ${hit[1] + 1} ${back ? "fold back on each other" : "cross"}.`;
	}
	if (!returns(edges)) return "The outline is still open.";
	return null;
}

/**
 * Ways to close an open path with one edge or two, shortest first: each a list of edges that ends exactly
 * on the start without crossing the outline.
 */
export function closers(edges: Edge[], max = 3): Edge[][] {
	if (!edges.length) return [];
	const rest = exact(edges).map((c) => -c);
	const ok = (add: Edge[]) => returns([...edges, ...add]) && !crossing([...edges, ...add]);
	const out: Edge[][] = [];
	const one = edgeFor(rest);
	if (one && ok([one])) out.push([one]);
	const two: Edge[][] = [];
	for (let d = 0; d < DIRS; d++)
		for (let l = 1; l <= 12; l++) {
			const left = rest.map((c, i) => c - l * ZETA[d][i]);
			const e = edgeFor(left);
			if (!e || e.dir === d) continue;
			const add = [{ dir: d, len: l }, e];
			if (ok(add)) two.push(add);
		}
	two.sort((p, q) => p[0].len + p[1].len - q[0].len - q[1].len);
	return [...out, ...two].slice(0, max);
}

// ── faces on the board ──

const DRAWN = /^F(\d+)_(\d+)$/;

/** A drawn face's prefix, `F1`, when every corner of it is named as one; null otherwise. */
export function prefixOf(f: Face): string | null {
	const real = f.word.filter((c) => c !== "Pi");
	const ms = real.map((c) => DRAWN.exec(c));
	return real.length && ms.every((m) => m && m[1] === ms[0]![1]) ? `F${ms[0]![1]}` : null;
}

/** The first prefix no corner on the board uses. */
export function nextPrefix(b: Board): string {
	const used = new Set(b.angles.flatMap((a) => DRAWN.exec(a.sym)?.[1] ?? []));
	let k = 1;
	while (used.has(String(k))) k++;
	return `F${k}`;
}

/** A closed drawing as a face line and the corners it declares. */
export function faceOf(edges: Edge[], prefix: string): { face: Face; angles: Angle[] } {
	const es = normalize(edges);
	const syms = es.map((e, i) => `${prefix}_${cornerDegrees(es[mod(i - 1, es.length)], e, 1)}`);
	const full = es.flatMap((e, i) => [syms[i], ...Array.from({ length: e.len - 1 }, () => "Pi")]);
	// the shortest word that repeats round the face
	const p = Array.from({ length: full.length }, (_, i) => i + 1).find(
		(q) => full.length % q === 0 && full.every((c, i) => c === full[i % q]),
	)!;
	const angles = [...new Set(syms)].map((sym) => ({ sym, value: sym.split("_")[1] }));
	return { face: { word: full.slice(0, p), repeat: full.length / p }, angles };
}

/**
 * A face read back as a drawing: every corner other than Pi with an angle set to a multiple of 15°, and the
 * outline closing. Null for any other face (a regular pentagon, an apeirogon, a corner with no angle).
 */
export function edgesOf(b: Board, f: Face): Edge[] | null {
	if (f.repeat === "inf") return null;
	const full = Array.from({ length: f.repeat }, () => f.word).flat();
	const start = full.findIndex((c) => c !== "Pi");
	if (start < 0) return null;
	const word = [...full.slice(start), ...full.slice(0, start)];
	const at = word.flatMap((c, i) => (c === "Pi" ? [] : [i]));
	const turns: number[] = [];
	for (const i of at) {
		const deg = angleDegrees(b.angles.find((a) => a.sym === word[i])?.value);
		if (deg === null || deg <= 0 || deg >= 360 || Math.abs(deg / STEP - Math.round(deg / STEP)) > 1e-9) return null;
		turns.push((180 - deg) / STEP);
	}
	let dir = 0;
	const edges = at.map((i, j) => {
		if (j) dir = mod(dir + turns[j]);
		return { dir, len: (at[j + 1] ?? word.length) - i };
	});
	return problemOf(edges) === null ? edges : null;
}

/**
 * The board with face `at` (a new one when absent) set to the drawing, its corners declared with their
 * angles; corners the old face used that nothing uses any more are dropped.
 */
export function withDrawnFace(b: Board, edges: Edge[], at = b.faces.length): Board {
	const old = at < b.faces.length ? b.faces[at] : null;
	const { face, angles: declare } = faceOf(edges, (old && prefixOf(old)) ?? nextPrefix(b));
	if (face.word.includes("Pi")) declare.push({ sym: "Pi" });
	const faces = old ? b.faces.map((f, i) => (i === at ? { ...f, ...face } : f)) : [...b.faces, face];
	let angles = b.angles.map((a) => {
		const d = declare.find((x) => x.sym === a.sym && x.value !== undefined);
		return d ? { ...a, value: d.value } : a;
	});
	for (const d of declare) if (!angles.some((a) => a.sym === d.sym)) angles.push(d);
	const used = new Set([...faces, ...b.vertices].flatMap((x) => x.word));
	angles = angles.filter((a) => !old?.word.includes(a.sym) || used.has(a.sym));
	return { ...b, angles, faces };
}

/** Starting shapes, anticlockwise. */
export const PRESETS: { name: string; edges: Edge[] }[] = [
	{
		name: "L tromino",
		edges: [
			{ dir: 0, len: 2 },
			{ dir: 6, len: 1 },
			{ dir: 12, len: 1 },
			{ dir: 6, len: 1 },
			{ dir: 12, len: 1 },
			{ dir: 18, len: 2 },
		],
	},
	{
		name: "Trapezoid",
		edges: [
			{ dir: 0, len: 2 },
			{ dir: 8, len: 1 },
			{ dir: 12, len: 1 },
			{ dir: 16, len: 1 },
		],
	},
	{
		name: "Rhombus 30°",
		edges: [
			{ dir: 0, len: 1 },
			{ dir: 2, len: 1 },
			{ dir: 12, len: 1 },
			{ dir: 14, len: 1 },
		],
	},
	{
		name: "House",
		edges: [
			{ dir: 0, len: 1 },
			{ dir: 6, len: 1 },
			{ dir: 8, len: 1 },
			{ dir: 16, len: 1 },
			{ dir: 18, len: 1 },
		],
	},
];
