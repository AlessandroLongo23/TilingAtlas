// A face drawn edge by edge: each turn a multiple of 180°/N, N from 2 to 36 (12 by default: turns of 15°), each
// edge a whole number of unit edges, or, with lengths as edge types, any length written with √2, √3, √5, √6
// and fractions.
//
// On the board such a face is ordinary text. Each corner is a symbol with its angle set, and an edge of
// length l is l unit edges with l − 1 Pi corners along it, as Marek writes sides of several edges. With
// lengths as edge types, as the atlas's edge-typed palettes have them (tri45, the planigons: only like types
// glue), every side is one edge whose type is its length: an edge corner at its middle (`edge Esqrt2 length
// sqrt2`) and a vertex line gluing that type to itself. A side of length 1 is the plain unit edge, with no
// type, so it glues to every face's plain sides (a square from Add family). Corners
// of one face with the same angle share a symbol: with unit edges they are the same corner, and distinct
// labels would break the face's symmetry and make the engine count colourings of it. The symbols carry the
// face's own prefix (`F1_90`, `F1_270`) so two drawn faces never share a corner by accident; an angle that is
// no whole number of degrees is written as a fraction (`F1_1080_7` for 1080/7°).
//
// Closing is decided exactly. Every direction is a power of ζ = e^(iπ/N), and a sum of them is zero only
// when its coordinates in ℤ[ζ] (basis 1, ζ, …, reduced by the cyclotomic polynomial Φ₂ₙ) all are. A length's
// square roots are sums of powers of ζ too (surdPowers), so typed lengths close exactly as well.
import {
	angleDegrees,
	flatOf,
	isUnitLength,
	lengthSymbol,
	printLength,
	readLength,
	removeVertices,
	unitTypes,
	type Angle,
	type Board,
	type Face,
} from "./board";
import { gauss } from "./corners";

/**
 * An edge: its direction in steps of 180°/N (0 east, N/2 north) and its length. A side of unit edges has a
 * whole `len`; a side whose length is its own edge type also has `text`, the length as written, `len` its value.
 */
export type Edge = { dir: number; len: number; text?: string };
export type Pt = { x: number; y: number };

export const MAX_LEN = 24;
export const MIN_N = 2;
export const MAX_N = 36;

/** The directions of one N: 2N of them, `step` degrees apart, and ζ^k in the basis of ℤ[ζ]. */
export type Grid = { n: number; dirs: number; step: number; zeta: number[][] };

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Φ_m's coefficients, constant first: x^m − 1 divided by Φ_d for every proper divisor d of m. */
export function cyclotomic(m: number): number[] {
	let p = [-1, ...Array<number>(m - 1).fill(0), 1];
	for (let d = 1; d < m; d++) {
		if (m % d) continue;
		const q = cyclotomic(d); // monic: long division stays in the integers
		const out = Array<number>(p.length - q.length + 1).fill(0);
		for (let i = out.length - 1; i >= 0; i--) {
			out[i] = p[i + q.length - 1];
			for (let j = 0; j < q.length; j++) p[i + j] -= out[i] * q[j];
		}
		p = out;
	}
	return p;
}

const GRIDS = new Map<number, Grid>();
export function grid(n: number): Grid {
	let g = GRIDS.get(n);
	if (!g) {
		const phi = cyclotomic(2 * n);
		const deg = phi.length - 1;
		const zeta: number[][] = [];
		// multiply by ζ, folding ζ^deg back through Φ
		for (let k = 0, v = [1, ...Array<number>(deg - 1).fill(0)]; k < 2 * n; k++) {
			zeta.push(v);
			const top = v[deg - 1];
			v = [0, ...v.slice(0, deg - 1)].map((c, i) => c - top * phi[i]);
		}
		GRIDS.set(n, (g = { n, dirs: 2 * n, step: 180 / n, zeta }));
	}
	return g;
}
export const G12 = grid(12);

/**
 * √r as a sum of powers of ζ, [coefficient, power] pairs, or null when √r is not in ℤ[ζ] at this N. One chord
 * does it all, ζ^j + ζ^−j = 2cos(2πj/2N): √2 = 2cos 45°, √3 = 2cos 30°, √5 = 2·2cos 36° − 1, √6 = √2·√3. Ported
 * from tools/ctrnact-oracle/develop_tri45.py (surd_offsets), which develops the atlas's edge-typed palettes.
 */
export function surdPowers(r: number, g: Grid): [number, number][] | null {
	const chord = (den: number) => (g.dirs % den ? null : g.dirs / den);
	const [a, b, p] = [chord(8), chord(12), chord(10)];
	if (r === 1) return [[1, 0]];
	if (r === 2 && a !== null) return [[1, a], [1, -a]];
	if (r === 3 && b !== null) return [[1, b], [1, -b]];
	if (r === 5 && p !== null) return [[2, p], [2, -p], [-1, 0]];
	if (r === 6 && a !== null && b !== null) return [[1, a + b], [1, a - b], [1, b - a], [1, -a - b]];
	return null;
}
/** The roots a length may use, and the N each needs. */
const ROOTS: [number, string][] = [
	[2, "a multiple of 4"],
	[3, "a multiple of 6"],
	[5, "a multiple of 5"],
	[6, "a multiple of 12"],
];
const termsOf = (e: Edge) => (e.text === undefined ? [{ num: e.len, den: 1, root: 1 }] : (readLength(e.text)?.terms ?? null));
const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);

/** The exact vector of a run of edges, times its lengths' denominators (closing is the same at any scale); null
 *  when a length is not exact at this N. */
export function exact(edges: Edge[], g = G12): number[] | null {
	const all = edges.map(termsOf);
	if (all.some((t) => !t)) return null;
	const scale = all.flat().reduce((m, t) => lcm(m, t!.den), 1);
	const out = g.zeta[0].map(() => 0);
	for (const [i, e] of edges.entries())
		for (const t of all[i]!) {
			const powers = surdPowers(t.root, g);
			if (!powers) return null;
			for (const [c, o] of powers)
				g.zeta[mod(e.dir + o, g.dirs)].forEach((z, j) => (out[j] += ((t.num * scale) / t.den) * c * z));
		}
	return out;
}

/** Why an edge's length cannot be drawn exactly at this N, or null. */
export function lengthProblem(e: Edge, g = G12): string | null {
	if (e.text === undefined) return null;
	const l = readLength(e.text);
	if (!l) return `“${e.text}” is no length.`;
	const r = l.terms.find((t) => !surdPowers(t.root, g))?.root;
	if (r === undefined) return null;
	const need = ROOTS.find(([x]) => x === r)?.[1];
	return need ? `√${r} needs the angle unit N to be ${need}.` : `√${r} is not exact here: a length may use √2, √3, √5 and √6.`;
}

export const unit = (dir: number, g = G12): Pt => ({ x: Math.cos((dir * Math.PI) / g.n), y: Math.sin((dir * Math.PI) / g.n) });

/** The corners of the path, from the start (0, 0) to its tip; y up. */
export function pointsOf(edges: Edge[], g = G12): Pt[] {
	const pts = [{ x: 0, y: 0 }];
	for (const e of edges) {
		const p = pts[pts.length - 1];
		const u = unit(e.dir, g);
		pts.push({ x: p.x + e.len * u.x, y: p.y + e.len * u.y });
	}
	return pts;
}

/** The turn from one edge to the next, in steps: positive left, N straight back. */
export const turnOf = (from: number, to: number, g = G12) => {
	const t = mod(to - from, g.dirs);
	return t > g.n ? t - g.dirs : t;
};

/** Whether the path returns exactly to its start. */
export const returns = (edges: Edge[], g = G12) => edges.length >= 3 && !!exact(edges, g)?.every((c) => c === 0);

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
 * end on the start only when that closes it; a closed path's first and last edges share the start. With
 * `cross`, a self-intersecting face, only an edge folding back on the one before is wrong.
 */
export function crossing(edges: Edge[], g = G12, cross = false): [number, number] | null {
	const pts = pointsOf(edges, g);
	const n = edges.length;
	const closed = returns(edges, g);
	for (let i = 1; i < n; i++) if (turnOf(edges[i - 1].dir, edges[i].dir, g) === g.n) return [i - 1, i];
	if (closed && turnOf(edges[n - 1].dir, edges[0].dir, g) === g.n) return [n - 1, 0];
	if (cross) return null;
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
export function sideOf(edges: Edge[], g = G12): 1 | -1 {
	if (returns(edges, g)) return area2(pointsOf(edges, g)) >= 0 ? 1 : -1;
	const t = edges.slice(1).reduce((s, e, i) => s + turnOf(edges[i].dir, e.dir, g), 0);
	return t >= 0 ? 1 : -1;
}

/** The inside angle where edge `from` meets edge `to`, inside on `side`, in steps of 180°/N. */
export const cornerSteps = (from: Edge, to: Edge, side: 1 | -1, g = G12) => g.n - side * turnOf(from.dir, to.dir, g);
/** The same in degrees. */
export const cornerDegrees = (from: Edge, to: Edge, side: 1 | -1, g = G12) => cornerSteps(from, to, side, g) * g.step;
/** Degrees as shown: whole, or to two places. */
export const showDegrees = (d: number) => String(+d.toFixed(2));

/** The polygon anticlockwise, straight joins merged into one edge, the start on a true corner. */
export function normalize(edges: Edge[], g = G12): Edge[] {
	const es = sideOf(edges, g) === 1 ? edges : [...edges].reverse().map((e) => ({ ...e, dir: e.dir + g.n }));
	// unit edges in a line are one side; a typed side stays whole, with a straight corner (Pi) after it
	const joins = (a: Edge | undefined, b: Edge) => !!a && a.dir === mod(b.dir, g.dirs) && a.text === undefined && b.text === undefined;
	const out: Edge[] = [];
	for (const e of es) {
		const last = out[out.length - 1];
		if (joins(last, e)) last.len += e.len;
		else out.push({ ...e, dir: mod(e.dir, g.dirs) });
	}
	if (out.length > 1 && joins(out[out.length - 1], out[0])) out[0].len += out.pop()!.len;
	return out;
}

/** What is wrong with a drawing as a face, in plain words, or null when it is one. */
export function problemOf(edges: Edge[], g = G12, cross = false): string | null {
	if (edges.length < 2) return "Draw at least three edges.";
	const bad = edges.map((e) => lengthProblem(e, g)).find(Boolean);
	if (bad) return bad;
	const hit = crossing(edges, g, cross);
	if (hit) {
		const back = (hit[1] === hit[0] + 1 || hit[1] === 0) && turnOf(edges[hit[0]].dir, edges[hit[1]].dir, g) === g.n;
		return `Edges ${hit[0] + 1} and ${hit[1] + 1} ${back ? "fold back on each other" : "cross"}.`;
	}
	if (!returns(edges, g)) return "The outline is still open.";
	return null;
}

/**
 * Edges along `dirs` that are exactly `rest` (an exact vector at `scale`, as `exact` gives it), or null: their
 * lengths solved over √1, √2, √3, √5, √6 (just √1 for unit edges) in floats, read back as small fractions and
 * kept only when they close exactly. Whole lengths stay unit edges; with `typed`, each is written out.
 */
function solve(rest: number[], scale: number, dirs: number[], g: Grid, typed: boolean): Edge[] | null {
	const roots = typed ? [1, 2, 3, 5, 6].filter((r) => surdPowers(r, g)) : [1];
	const cols = dirs.flatMap((d) =>
		roots.map((r) => {
			const v = rest.map(() => 0);
			for (const [c, o] of surdPowers(r, g)!) g.zeta[mod(d + o, g.dirs)].forEach((z, j) => (v[j] += c * z));
			return v;
		}),
	);
	// least squares: the system is consistent exactly when a closing exists, which the exact check then decides
	const ata = cols.map((a) => cols.map((b) => a.reduce((t, x, j) => t + x * b[j], 0)));
	const x = gauss(
		ata,
		cols.map((a) => a.reduce((t, v, j) => t + v * rest[j], 0)),
	).map((v) => v / scale);
	if (!x.every(Number.isFinite)) return null;
	const out: Edge[] = [];
	for (const [k, dir] of dirs.entries()) {
		const terms = roots.flatMap((root, j) => {
			const v = x[k * roots.length + j];
			const den = [1, 2, 3, 4, 6, 12].find((d) => Math.abs(v * d - Math.round(v * d)) < 1e-6);
			if (den === undefined) return [{ num: NaN, den: 1, root }];
			const num = Math.round(v * den);
			const div = Math.abs(gcd(num, den));
			return num ? [{ num: num / div, den: den / div, root }] : [];
		});
		const len = terms.reduce((t, c) => t + (c.num / c.den) * Math.sqrt(c.root), 0);
		if (!(len > 1e-9 && len <= MAX_LEN + 1e-9)) return null;
		if (!typed) out.push({ dir, len: terms[0].num });
		else out.push({ dir, len, text: printLength({ terms, value: len }) });
	}
	return out;
}

/** How hard a length is to read: its terms, and one more for a fraction. */
const plainness = (e: Edge) => (e.text === undefined ? 1 : (termsOf(e) ?? []).reduce((t, c) => t + 1 + (c.den > 1 ? 1 : 0), 0));

/**
 * Ways to close an open path with one edge or two, each a list of edges that ends exactly on the start without
 * crossing the outline: one edge first, then the plainest lengths, then the shortest. With typed lengths a
 * closing edge may take any length √2, √3, √5 and √6 write at this N; two of them only plain ones (at most two
 * terms, halves at most), as two directions nearly always close with some length.
 */
export function closers(edges: Edge[], g = G12, max = 3, cross = false): Edge[][] {
	const all = edges.map(termsOf);
	const rest = exact(edges, g)?.map((c) => -c);
	if (!edges.length || !rest) return [];
	const scale = all.flat().reduce((m, t) => lcm(m, t!.den), 1);
	const typed = edges.some((e) => e.text !== undefined);
	const ok = (add: Edge[] | null): add is Edge[] =>
		!!add && returns([...edges, ...add], g) && !crossing([...edges, ...add], g, cross);
	const one: Edge[][] = [];
	for (let d = 0; d < g.dirs; d++) {
		const add = solve(rest, scale, [d], g, typed);
		if (ok(add)) one.push(add);
	}
	const two: Edge[][] = [];
	for (let d = 0; d < g.dirs; d++)
		for (let e = 0; e < g.dirs; e++) {
			if (mod(e - d, g.n) === 0) continue; // parallel: no single way to split
			const add = solve(rest, scale, [d, e], g, typed);
			if (ok(add) && add.every((x) => plainness(x) <= 2 && (termsOf(x) ?? []).every((t) => t.den <= 2))) two.push(add);
		}
	const cost = (s: Edge[]) => s.reduce((t, e) => t + plainness(e), 0);
	two.sort((p, q) => cost(p) - cost(q) || p[0].len + p[1].len - q[0].len - q[1].len || p[0].dir - q[0].dir);
	return [...one, ...two].slice(0, max);
}

// ── faces on the board ──

const DRAWN = /^F(\d+)_(\d+)(?:_(\d+))?$/;

/** A drawn face's prefix, `F1`, when every corner of it is named as one (Pi and, by `flat`, the board's edge
 *  corners aside); null otherwise. */
export function prefixOf(f: Face, flat: (c: string) => boolean = (c) => c === "Pi"): string | null {
	const real = f.word.filter((c) => !flat(c));
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
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** A corner of `steps` steps of 180°/N: its angle written exactly, and the part of its symbol after the prefix. */
export function angleOf(num: number, den: number): { value: string; tag: string } {
	[num, den] = [num, den].map((x) => x / gcd(num, den));
	return den === 1 ? { value: `${num}`, tag: `${num}` } : { value: `${num}/${den}`, tag: `${num}_${den}` };
}

/** The face line of a drawing; a typed side's edge corner is `typeOf` its length (lengthSymbol unless the
 *  board already names that length). */
export function faceOf(
	edges: Edge[],
	prefix: string,
	g = G12,
	typeOf: (text: string) => string = lengthSymbol,
): { face: Face; angles: Angle[] } {
	// a side of length 1 is a plain unit edge: only other lengths need a type
	const es = normalize(
		edges.map((e) => (e.text !== undefined && isUnitLength(e.text) ? { dir: e.dir, len: 1 } : e)),
		g,
	);
	const corner = es.map((e, i) => angleOf(180 * cornerSteps(es[mod(i - 1, es.length)], e, 1, g), g.n));
	return faceOfCorners(corner, es.map((e) => (e.text === undefined ? e.len : typeOf(e.text))), prefix);
}

/**
 * A face from its corners, each followed by its side: a number for a side of that many unit edges (Pi corners
 * along it), a symbol for one edge of that type (its edge corner). Named with `prefix`; a straight corner,
 * between two typed sides in a line, is Pi.
 */
export function faceOfCorners(
	corner: { value: string; tag: string }[],
	sides: (number | string)[],
	prefix: string,
): { face: Face; angles: Angle[] } {
	const syms = corner.map((c) => (c.value === "180" ? "Pi" : `${prefix}_${c.tag}`));
	const full = sides.flatMap((side, i) => [
		syms[i],
		...(typeof side === "string" ? [side] : Array.from({ length: side - 1 }, () => "Pi")),
	]);
	// the shortest word that repeats round the face
	const p = Array.from({ length: full.length }, (_, i) => i + 1).find(
		(q) => full.length % q === 0 && full.every((c, i) => c === full[i % q]),
	)!;
	const angles = [...new Set(syms)].filter((sym) => sym !== "Pi").map((sym) => ({ sym, value: corner[syms.indexOf(sym)].value }));
	return { face: { word: full.slice(0, p), repeat: full.length / p }, angles };
}

/**
 * A face read back as a drawing, with its N: every corner other than Pi with an angle set to a multiple of
 * 180°/N, and the outline closing, crossing itself or not. A side with an edge corner is one edge of that
 * type's length; the others are unit edges, those in a line one side. N is 12 when that fits, else the smallest
 * that does. Null for any other face (a regular pentagon at no N up to 36, an apeirogon, a corner with no angle).
 */
export function edgesOf(b: Board, f: Face): { edges: Edge[]; g: Grid } | null {
	if (f.repeat === "inf") return null;
	const lengths = new Map(b.angles.flatMap((a) => (a.edge ? [[a.sym, a.edge.length ?? "1"] as const] : [])));
	const flat = flatOf(b);
	const full = Array.from({ length: f.repeat }, () => f.word).flat();
	const start = full.findIndex((c) => !flat(c));
	if (start < 0) return null;
	const word = [...full.slice(start), ...full.slice(0, start)];
	// the points round the outline (corners and Pi), each followed by its edge: typed, or one unit edge
	const at = word.flatMap((c, i) => (lengths.has(c) ? [] : [i]));
	const degs = at.map((i) => (word[i] === "Pi" ? 180 : angleDegrees(b.angles.find((a) => a.sym === word[i])?.value)));
	if (degs.some((d) => d === null || d <= 0 || d >= 360)) return null;
	const text = at.map((i, j) => {
		const mid = word.slice(i + 1, at[j + 1] ?? word.length).find((c) => lengths.has(c));
		return mid === undefined ? undefined : lengths.get(mid)!;
	});
	if (text.some((t) => t !== undefined && !readLength(t))) return null;
	const typed = text.some((t) => t !== undefined);
	for (const n of [12, ...Array.from({ length: MAX_N - MIN_N + 1 }, (_, i) => MIN_N + i)]) {
		const g = grid(n);
		const turns = degs.map((d) => (180 - d!) / g.step);
		if (turns.some((t) => Math.abs(t - Math.round(t)) > 1e-9)) continue;
		let dir = 0;
		const edges: Edge[] = [];
		at.forEach((_, j) => {
			if (j) dir = mod(dir + Math.round(turns[j]), g.dirs);
			const t = text[j];
			const last = edges[edges.length - 1];
			if (t !== undefined) edges.push({ dir, len: readLength(t)!.value, text: printLength(readLength(t)!) });
			// in a face with typed sides, a plain one is a side of length 1
			else if (typed) edges.push({ dir, len: 1, text: "1" });
			else if (last && last.text === undefined && last.dir === dir) last.len++;
			else edges.push({ dir, len: 1 });
		});
		if (problemOf(edges, g, true) === null) return { edges, g };
	}
	return null;
}

/** A drawing moved to another N: each direction scaled, or null when one falls between the new directions. */
export function regrid(edges: Edge[], from: Grid, to: Grid): Edge[] | null {
	const out = edges.map((e) => ({ ...e, dir: (e.dir * to.n) / from.n }));
	return out.every((e) => Number.isInteger(e.dir)) ? out : null;
}

/**
 * The board with face `at` (a new one when absent) set to the drawing, its corners declared with their
 * angles; corners the old face used that nothing uses any more are dropped.
 */
export const withDrawnFace = (board: Board, edges: Edge[], at = board.faces.length, g = G12): Board =>
	withMadeFace(board, (prefix, typeOf) => faceOf(edges, prefix, g, typeOf), at);

/**
 * The board with face `at` (a new one when absent) set to the face `make` builds from its corners' prefix and
 * the edge corner of each side length, the corners and edge lines declared and each new edge type glued to
 * itself. A new length's type is named `name` (lengthSymbol unless given).
 */
export function withMadeFace(
	board: Board,
	make: (prefix: string, typeOf: (text: string) => string) => { face: Face; angles: Angle[] },
	at = board.faces.length,
	name = lengthSymbol,
): Board {
	const b = withoutUnitType(board);
	const old = at < b.faces.length ? b.faces[at] : null;
	// a typed side's edge corner: the board's own edge line of that length, else a new one
	const typeOf = boardTypes(b, name);
	const { face, angles: declare } = make((old && prefixOf(old, flatOf(b))) ?? nextPrefix(b), typeOf.of);
	if (face.word.includes("Pi")) declare.push({ sym: "Pi" });
	const fresh = [...typeOf.made].filter(([sym]) => face.word.includes(sym));
	for (const [sym, length] of fresh) declare.push({ sym, value: "180", edge: { length } });
	const faces = old ? b.faces.map((f, i) => (i === at ? { ...f, ...face } : f)) : [...b.faces, face];
	let angles = b.angles.map((a) => {
		const d = declare.find((x) => x.sym === a.sym && x.value !== undefined);
		return d ? { ...a, value: d.value } : a;
	});
	for (const d of declare) if (!angles.some((a) => a.sym === d.sym)) angles.push(d);
	// a new edge type glues to itself (only like lengths glue), unless a vertex line already glues it
	const glued = (sym: string) => b.vertices.some((v) => v.word.length === 2 && v.word.includes(sym));
	const vertices = [...b.vertices, ...fresh.filter(([sym]) => !glued(sym)).map(([sym]) => ({ word: [sym, sym] }))];
	const used = new Set([...faces, ...vertices].flatMap((x) => x.word));
	angles = angles.filter((a) => !old?.word.includes(a.sym) || used.has(a.sym));
	return { ...b, angles, faces, vertices };
}

/** The edge type of each length on the board: its own unstyled edge line of that length, else a new one
 *  (`name`, lengthSymbol unless given), recorded in `made` with the length as written there. */
export function boardTypes(b: Board, name = lengthSymbol) {
	const named = new Map<string, string>();
	for (const a of b.angles) {
		const l = a.edge && !a.edge.style && readLength(a.edge.length ?? "1");
		if (l && !named.has(printLength(l))) named.set(printLength(l), a.sym);
	}
	const made = new Map<string, string>();
	const of = (text: string) => {
		const key = printLength(readLength(text)!);
		if (!named.has(key)) {
			let sym = name(key);
			while (b.angles.some((a) => a.sym === sym)) sym += "x";
			named.set(key, sym);
			made.set(sym, key);
		}
		return named.get(key)!;
	};
	return { of, made };
}

/** A side of length 1 is a plain unit edge, as every side with no type is: the board with its type of length 1
 *  (the `E1` an earlier drawing gave such a side) taken off its faces and required faces, with the lines gluing
 *  it to itself, so those faces glue to plain ones (a square from Add family). The same tilings, with fewer
 *  vertex types. Unchanged when it has none, or when a vertex line uses one other than to glue it. */
export function withoutUnitType(b: Board): Board {
	const unit = unitTypes(b);
	if (!unit.size) return b;
	const glue = b.vertices.flatMap((v, i) => (v.word.length === 2 && v.word.every((c) => unit.has(c)) ? [i] : []));
	if (b.vertices.some((v, i) => !glue.includes(i) && v.word.some((c) => unit.has(c)))) return b;
	const off = (w: string[]) => w.filter((c) => !unit.has(c));
	const r = removeVertices(b, glue);
	return {
		...r,
		angles: r.angles.filter((a) => !unit.has(a.sym)),
		faces: r.faces.map((f) => ({ ...f, word: off(f.word) })),
		require: r.require.map((q) => (q.faces ? { ...q, faces: q.faces.map(off) } : q)),
	};
}

/** Starting shapes, anticlockwise, at N = 12 (`regrid` moves them). */
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
	// with lengths as edge types
	{
		name: "Half square",
		edges: [
			{ dir: 0, len: 1, text: "1" },
			{ dir: 6, len: 1, text: "1" },
			{ dir: 15, len: Math.SQRT2, text: "sqrt2" },
		],
	},
	{
		// the Laves tile of 3.4.6.4: corners 60°, 90°, 120°, 90°
		name: "Kite",
		edges: [
			{ dir: 0, len: Math.sqrt(3), text: "sqrt3" },
			{ dir: 6, len: 1, text: "1" },
			{ dir: 10, len: 1, text: "1" },
			{ dir: 16, len: Math.sqrt(3), text: "sqrt3" },
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
