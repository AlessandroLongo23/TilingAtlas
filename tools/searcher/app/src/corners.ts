// What a board's corners are as geometry: the angle of each, in the plane, the hyperbolic plane or on the
// sphere. Drawing a tiling (develop.ts) and generating a board's vertices (the editor's Quick setup) both
// read the board through this, so the two cannot disagree about a corner.
//
// A face is taken as a regular polygon. Pi corners inside a face are points on its sides: `M3 Pi M3 Pi
// M3 Pi` is a triangle whose sides are cut in two, so an M3 corner has the angle of a triangle with sides
// of two edges. Marek's hyperbolic boards are built this way: 1247_1_0612 has faces whose sides are cut
// into 1, 2, 4 and 7 edges, and edge length 1.0612751; its 121 vertices are exactly the multisets of at
// most 12 corners that close at that length (checked, with 123_1_4657 and hybrid_2_9830 likewise).
import type { BubbleGrid } from "@/lib/bubble/pattern";
import { interiorAngle } from "@/lib/render/hyperbolicDevelopClient";
import { starDent } from "@/lib/render/hypStarFamily";
import {
	angleDegrees,
	coloredCorner,
	coloredName,
	cyclicKey,
	flatOf,
	typedCorner,
	typedName,
	type Board,
	type Face,
} from "./board";

export type Shape =
	| { kind: "pi" }
	| { kind: "digon" }
	| { kind: "set"; rad: number }
	/** A corner of a regular n-gon (n null: an apeirogon) whose sides are cut into `seg` edges. */
	| { kind: "polygon"; n: number | null; seg: number }
	/** A corner of an isotoxal face (a star, or convex) of 2n sides of `seg` edges: its point keeps `point`
	 *  (radians) in every geometry, the other corner (`dent`) follows the edge length. */
	| { kind: "iso"; n: number; seg: number; point: number; dent: boolean }
	| { kind: "unknown"; why: string };

export type Geometry = "plane" | "hyperbolic" | "sphere";

const TWO_PI = 2 * Math.PI;

const isPi = (c: string) => c === "Pi";

/** A face's polygon: its corners other than Pi (or another `flat` corner: an edge line's midpoint), and the
 *  edges per side, when the flat corners are evenly spaced. */
export function polygonOf(f: Face, flat: (c: string) => boolean = isPi): { n: number | null; seg: number } | null {
	const full = f.repeat === "inf" ? f.word : Array.from({ length: f.repeat }, () => f.word).flat();
	const at = full.flatMap((c, i) => (flat(c) ? [] : [i]));
	if (!at.length || full.length % at.length) return null;
	const seg = full.length / at.length;
	if (at.some((i, j) => i - at[0] !== j * seg)) return null; // the sides must be cut alike
	return { n: f.repeat === "inf" ? null : at.length, seg };
}

/** A face of 2n corners alternating two symbols (Pi aside), with its sides' edges; null for any other. */
function alternating(f: Face, flat: (c: string) => boolean): { n: number; real: string[]; cut: { seg: number } } | null {
	const cut = polygonOf(f, flat);
	if (!cut || cut.n === null || cut.n % 2) return null;
	const real = Array.from({ length: f.repeat as number }, () => f.word)
		.flat()
		.filter((c) => !flat(c));
	if (real[0] === real[1] || real.some((c, i) => c !== real[i % 2])) return null;
	return { n: cut.n / 2, real, cut };
}

/**
 * An isotoxal face: two corners alternating round it, with the angle of at least one set. The point is the
 * corner set under 180° (the first, when both are); null when the face is not one, or its angles are not an
 * isotoxal face's.
 */
export function isoOf(b: Board, f: Face): { n: number; seg: number; point: number; p: string; d: string } | null {
	const alt = alternating(f, flatOf(b));
	if (!alt) return null;
	const { n, real, cut } = alt;
	const deg = (s: string) => angleDegrees(b.angles.find((a) => a.sym === s)?.value);
	const [x, y] = [deg(real[0]), deg(real[1])];
	// the point is a corner set under 180°; with only a dent set, the corner across from it
	const [p, d, point] =
		x !== null && x < 180
			? [real[0], real[1], x]
			: y !== null && y < 180
				? [real[1], real[0], y]
				: x !== null
					? [real[1], real[0], dentOf(n, x)]
					: y !== null
						? [real[0], real[1], dentOf(n, y)]
						: [];
	if (point === undefined || !isotoxal(n, point)) return null;
	const own = deg(p!);
	const other = deg(d!);
	if ((own !== null && Math.abs(own - point) > 1e-6) || (other !== null && Math.abs(other - dentOf(n, point)) > 1e-6))
		return null;
	return { n, seg: cut.seg, point, p: p!, d: d! };
}

// a board is never changed in place (the editor makes a new one per edit), so its shapes are kept with it:
// every face and vertex card asks, and each answer reads every face
const shapesOf = new WeakMap<Board, Map<string, Shape>>();

/** Where each declared corner's angle comes from. Read-only: the map is shared by every caller. */
export function cornerShapes(board: Board): Map<string, Shape> {
	let out = shapesOf.get(board);
	if (!out) shapesOf.set(board, (out = shapesFrom(board)));
	return out;
}

function shapesFrom(board: Board): Map<string, Shape> {
	// a typed corner (A4.Ed.Eu) or a coloured one (A4@B) is its base corner's shape: judge the faces with
	// the types and colours read away
	if (board.angles.some((a) => typedCorner(board, a.sym) || coloredCorner(a.sym))) {
		const base = baseOf(board);
		const plain = cornerShapes(baseView(board));
		return new Map(board.angles.map((a) => [a.sym, plain.get(base(a.sym))!]));
	}
	const out = new Map<string, Shape>();
	const isos = board.faces.map((f) => isoOf(board, f));
	const along = flatOf(board);
	// a face whose corners differ (other than Pi) is no regular polygon, whatever its corners are called
	const mixed = (f: Face) => new Set(f.word.filter((c) => !along(c))).size > 1;
	for (const a of board.angles) {
		const deg = angleDegrees(a.value);
		const faces = board.faces.filter((f) => f.word.includes(a.sym));
		const polys = faces.map((f) => polygonOf(f, along));
		const kinds = new Set(polys.map((p) => (p ? `${p.n}/${p.seg}` : "irregular")));
		const roles = new Set(
			isos.flatMap((q) =>
				q && (q.p === a.sym || q.d === a.sym) ? [`${q.n}/${q.seg}/${q.point}/${q.d === a.sym}`] : [],
			),
		);
		const iso = isos.find((q) => q && (q.p === a.sym || q.d === a.sym));
		// one regular polygon all round: its corner, whose angle follows the geometry
		const regular = !kinds.has("irregular") && kinds.size === 1 && !faces.some(mixed) ? polys[0] : null;
		// an angle set to that polygon's plane angle (A4 at 90°) says only what the plane says
		const flat = regular && deg !== null && Math.abs(deg - (regular.n === null ? 180 : 180 - 360 / regular.n)) < 1e-6;
		let shape: Shape;
		if (along(a.sym)) shape = { kind: "pi" };
		else if (faces.length && faces.every((f) => f.repeat !== "inf" && f.word.length * f.repeat === 2))
			shape = { kind: "digon" };
		else if (iso && roles.size === 1 && faces.length === faces.filter((f) => isoOf(board, f)).length)
			shape = { kind: "iso", n: iso.n, seg: iso.seg, point: (iso.point * Math.PI) / 180, dent: iso.d === a.sym };
		else if (flat) shape = { kind: "polygon", ...regular };
		else if (deg !== null) shape = { kind: "set", rad: (deg * Math.PI) / 180 };
		else if (a.value === "free") shape = { kind: "unknown", why: "has a free angle" };
		else if (!faces.length) shape = { kind: "unknown", why: "is in no face" };
		else if (kinds.has("irregular"))
			shape = { kind: "unknown", why: "is in a face whose Pi corners do not cut its sides alike" };
		else if (kinds.size > 1) shape = { kind: "unknown", why: "occurs in faces of different shapes" };
		else if (faces.some(mixed))
			shape = { kind: "unknown", why: "is in a face whose corners differ: set the angle of its points" };
		else shape = { kind: "polygon", ...polys[0]! };
		out.set(a.sym, shape);
	}
	return out;
}

/** A corner's angle in radians, or null where it has none (an apeirogon on the sphere, an unknown corner). */
export function cornerAngle(s: Shape | undefined, g: Geometry, edge: number): number | null {
	if (!s || s.kind === "unknown") return null;
	if (s.kind === "pi") return Math.PI;
	if (s.kind === "digon") return 0;
	if (s.kind === "set") return s.rad;
	if (s.kind === "iso") {
		if (!s.dent) return s.point;
		const d = g === "plane" ? TWO_PI - TWO_PI / s.n - s.point : starDent(s.n, s.point, s.seg * edge, g === "sphere");
		return d > 0 ? d : null;
	}
	if (g === "plane") return s.n === null ? Math.PI : Math.PI - TWO_PI / s.n;
	if (g === "hyperbolic") return interiorAngle(s.n ?? 0, s.seg * edge);
	if (s.n === null) return null;
	const c = Math.cos(Math.PI / s.n) / Math.cos((s.seg * edge) / 2); // the sphere: sin(α/2) = cos(π/n) / cos(s/2)
	return c > 0 && c <= 1 ? 2 * Math.asin(c) : null;
}

/** The edge length at which `word` closes to 360° in `g`, or null if it closes at none. */
export function solveEdge(word: string[], shapes: Map<string, Shape>, g: Geometry): number | null {
	if (g === "plane" || !word.length) return null;
	const sum = (l: number) => word.reduce((t, c) => t + (cornerAngle(shapes.get(c), g, l) ?? NaN), 0);
	const flat = word.reduce((t, c) => t + (cornerAngle(shapes.get(c), "plane", 0) ?? NaN), 0);
	if (!Number.isFinite(flat)) return null;
	// the hyperbolic sum falls from the flat sum as the edge grows, the spherical one rises
	if (g === "hyperbolic" ? flat <= TWO_PI + 1e-9 : flat >= TWO_PI - 1e-9) return null; // 1e-9: a word exactly flat
	let lo = 0;
	let hi = g === "hyperbolic" ? 1 : 1e-3;
	const past = (l: number) => (g === "hyperbolic" ? sum(l) < TWO_PI : !(sum(l) < TWO_PI)); // NaN: past the sphere's limit
	while (!past(hi) && hi < 64) hi *= 2;
	for (let i = 0; i < 200; i++) {
		const mid = (lo + hi) / 2;
		if (past(mid)) hi = mid;
		else lo = mid;
	}
	const l = (lo + hi) / 2;
	return Math.abs(sum(l) - TWO_PI) < 1e-9 ? l : null;
}

/**
 * The multisets of 3 to `max` of the board's corners that close in `g` at some edge length, each with that
 * length, fewest corners first and at most `limit`: what an edge can be solved from when no board vertex
 * closes there. On the sphere each closes at its own length (A3 ×5 is the icosahedron's, A4 ×3 the cube's).
 */
export function seedWords(board: Board, g: Geometry, max: number, limit = 200): { word: string[]; l: number }[] {
	if (g === "plane") return [];
	const shapes = cornerShapes(board);
	const syms = board.angles.map((a) => a.sym).filter((s) => (cornerAngle(shapes.get(s), "plane", 0) ?? 0) > 1e-9);
	const out: { word: string[]; l: number }[] = [];
	const cur: string[] = [];
	const rec = (i: number, size: number, flat: number) => {
		if (out.length >= limit || (g === "sphere" && flat >= TWO_PI - 1e-9)) return; // the sphere's sums only grow
		if (cur.length === size) {
			const l = solveEdge(cur, shapes, g);
			if (l !== null) out.push({ word: [...cur], l });
			return;
		}
		for (let j = i; j < syms.length; j++) {
			cur.push(syms[j]);
			rec(j, size, flat + cornerAngle(shapes.get(syms[j]), "plane", 0)!);
			cur.pop();
		}
	};
	for (let size = 3; size <= max; size++) rec(0, size, 0);
	return out;
}

/**
 * Every vertex that closes: each multiset of 2 to `max` corners whose angles add up to 360° in `g` at
 * `edge`. Digons are left out (any number of them closes nothing), and so is a corner with no angle; both
 * come back in `skipped` with the reason.
 */
export function closingVertices(
	board: Board,
	g: Geometry,
	edge: number,
	max: number,
	tol = 1e-6,
	list = true,
): { words: string[][]; skipped: { sym: string; why: string }[] } {
	const shapes = cornerShapes(board);
	const skipped: { sym: string; why: string }[] = [];
	const corners: { sym: string; a: number }[] = [];
	for (const { sym, edge: side } of board.angles) {
		const s = shapes.get(sym)!;
		const a = cornerAngle(s, g, edge);
		if (s.kind === "digon") skipped.push({ sym, why: "a digon marks an edge; it adds no angle" });
		else if (side) skipped.push({ sym, why: "is the middle of a side, and meets only the edge corners it glues to" });
		else if (a === null || !(a > 1e-9))
			skipped.push({
				sym,
				why: s.kind === "unknown" ? s.why : `has no angle ${g === "sphere" ? "on the sphere" : "here"}`,
			});
		else corners.push({ sym, a });
	}
	const words: string[][] = [];
	const cur: string[] = [];
	const rec = (i: number, left: number) => {
		if (Math.abs(left) < tol) {
			if (cur.length >= 2) words.push([...cur]);
			return; // every angle is positive: a closed vertex can take no more
		}
		if (left < -tol || i === corners.length || cur.length >= max) return;
		const { sym, a } = corners[i];
		const room = max - cur.length;
		let m = 0;
		for (; m < room && (m + 1) * a <= left + tol; m++) cur.push(sym);
		for (; m >= 1; m--) {
			rec(i + 1, left - m * a); // with m copies of corner i, then fewer
			cur.pop();
		}
		rec(i + 1, left);
	};
	if (list) rec(0, TWO_PI); // without `list`, only what is left out (the plane's vertices come from fittingVertices)
	const order = new Map(board.angles.map((a, i) => [a.sym, i]));
	const key = (w: string[]) => w.map((s) => String(order.get(s)).padStart(4, "0")).join(" ");
	for (const w of words) w.sort((x, y) => order.get(x)! - order.get(y)!);
	words.sort((x, y) => x.length - y.length || key(x).localeCompare(key(y)));
	return { words, skipped };
}

/**
 * Whether two star points sit side by side in the vertex `word` (cyclic). They never can when the stars'
 * sides are single edges: every side of a star runs from a point to a dent, so two points side by side
 * share a side whose far end holds both stars' dents, each over 180°, and no vertex adds up to more than
 * 360°. That holds in every geometry, and needs no angle: it prunes where the overlap test cannot (the
 * hyperbolic plane, free points). None of 6,865 star tilings of the 15° palette has it.
 */
export function pointsTouch(shapes: Map<string, Shape>, word: string[]): boolean {
	const point = (c: string) => starCorner(shapes.get(c)) === "point";
	return word.length > 1 && word.some((c, i) => point(c) && point(word[(i + 1) % word.length]));
}
/**
 * A star's point or dent, or null for any other corner. Only a star counts, whose dent is over 180°: a convex
 * isotoxal face (a hexagon of 150° and 90° corners) has corners called point and dent too, but two of its
 * points can sit side by side, and its "dents" can share a vertex. A point counts only when the star's sides
 * are single edges, as pointsTouch needs; a dent counts whatever its sides, as two reflex angles pass 360°.
 */
export function starCorner(s: Shape | undefined): "point" | "dent" | null {
	if (s?.kind !== "iso" || dentOf(s.n, (s.point * 180) / Math.PI) <= 180) return null;
	return s.dent ? "dent" : s.seg === 1 ? "point" : null;
}
export function pointsCanPart(shapes: Map<string, Shape>, word: string[]): boolean {
	const points = word.filter((c) => starCorner(shapes.get(c)) === "point").length;
	return points <= word.length - points;
}

/**
 * Every cyclic order of the multiset `word`, one per order up to rotation and reflection. With `digons`, each
 * order also comes once for every way to put at most one digon in each gap between its corners: the vertices
 * of an edge system, where a digon in a gap marks the edge there. A vertex with exactly one marked edge is a
 * loose end, kept only with `loose` (Marek's edge systems have none). Fewest marked edges first; null when
 * the orders to try pass `budget`.
 */
export function arrangements(word: string[], digons: string[] = [], loose = false, budget = 2e6): string[][] | null {
	const count = new Map<string, number>();
	for (const s of word) count.set(s, (count.get(s) ?? 0) + 1);
	const syms = [...count.keys()].sort();
	const out = new Map<string, string[]>();
	const cur: string[] = [];
	let steps = 0;
	const marks = (order: string[]) => {
		// each gap, after corner i, holds nothing (-1) or one of the digons
		const gap = order.map(() => -1);
		const rec = (i: number, marked: number) => {
			if (++steps > budget) return;
			if (i === order.length) {
				if (marked === 1 && !loose) return;
				const w = order.flatMap((c, j) => (gap[j] < 0 ? [c] : [c, digons[gap[j]]]));
				const k = cyclicKey(w);
				if (!out.has(k)) out.set(k, w);
				return;
			}
			for (let d = -1; d < digons.length; d++) {
				gap[i] = d;
				rec(i + 1, marked + (d < 0 ? 0 : 1));
			}
		};
		rec(0, 0);
	};
	// every order starts with the first symbol, which loses no order up to rotation
	const build = () => {
		if (steps > budget) return;
		if (cur.length === word.length) return marks(cur);
		for (const s of syms)
			if (count.get(s)! > 0 && (cur.length || s === syms[0])) {
				count.set(s, count.get(s)! - 1);
				cur.push(s);
				build();
				cur.pop();
				count.set(s, count.get(s)! + 1);
			}
	};
	if (word.length) build();
	if (steps > budget) return null;
	const digonCount = (w: string[]) => w.length - word.length;
	return [...out.values()].sort((x, y) => digonCount(x) - digonCount(y));
}

// ── star points solved with the edge ──
//
// A star's point is free in the hyperbolic plane: only the plane pins it. Marking it Free makes it an unknown
// beside the edge length, and each chosen vertex that must close is one equation, as in the atlas's star
// families (lib/render/hypStarFamily.ts). The other corner of the face is left unset and follows the point.

export type FreePoint = { n: number; seg: number; p: string; d: string };

/** The isotoxal faces whose point is Free (the other corner Free or unset), one entry per point corner. */
export function freePoints(b: Board): FreePoint[] {
	const out: FreePoint[] = [];
	const val = (s: string) => b.angles.find((a) => a.sym === s)?.value;
	for (const f of b.faces) {
		const alt = alternating(f, flatOf(b));
		if (!alt) continue;
		const [x, y] = alt.real.slice(0, 2);
		const [p, d] =
			val(x) === "free" && (val(y) ?? "free") === "free"
				? [x, y]
				: val(y) === "free" && val(x) === undefined
					? [y, x]
					: [];
		if (p && !out.some((o) => o.p === p)) out.push({ n: alt.n, seg: alt.cut.seg, p, d: d! });
	}
	return out;
}

/** The board with each free point set to its angle (degrees) and its other corner left to follow it. */
export function withPoints(b: Board, free: FreePoint[], deg: number[]): Board {
	return {
		...b,
		angles: b.angles.map((a) => {
			const i = free.findIndex((f) => f.p === a.sym);
			if (i >= 0) return { ...a, value: String(+deg[i].toFixed(9)) };
			return free.some((f) => f.d === a.sym) ? { ...a, value: undefined } : a;
		}),
	};
}

export type PointSolution = { edge: number; points: number[] };

/**
 * Every edge length and set of free points (degrees) at which all of `seeds` close in `g`, found by
 * Gauss–Newton from a grid of starts and kept when each point still makes an isotoxal face. In the plane the
 * edge is no unknown (reported as 0). Solutions come back by edge length.
 */
export function solvePoints(b: Board, seeds: string[][], g: Geometry): PointSolution[] {
	const free = freePoints(b);
	const hasEdge = g !== "plane";
	const res = (x: number[]): number[] => {
		const pts = hasEdge ? x.slice(1) : x;
		if (pts.some((a, i) => !isotoxal(free[i].n, a)) || (hasEdge && !(x[0] > 0))) return [NaN];
		const shapes = cornerShapes(withPoints(b, free, pts));
		return seeds.map(
			(w) => w.reduce((t, c) => t + (cornerAngle(shapes.get(c), g, hasEdge ? x[0] : 0) ?? NaN), 0) - TWO_PI,
		);
	};
	const unknowns = free.length + (hasEdge ? 1 : 0);
	if (!free.length || seeds.length < unknowns || free.length > 3) return [];
	const step = free.length === 1 ? 5 : free.length === 2 ? 15 : 30;
	const grid = (i: number): number[][] =>
		i === free.length
			? [[]]
			: grid(i + 1).flatMap((rest) =>
					Array.from({ length: Math.floor(179 / step) }, (_, k) => (k + 1) * step)
						.filter((a) => isotoxal(free[i].n, a))
						.map((a) => [a, ...rest]),
				);
	const out: PointSolution[] = [];
	for (const pts of grid(0))
		for (const l of hasEdge ? [0.3, 1, 2.5] : [0]) {
			let x = hasEdge ? [l, ...pts] : pts;
			let r = res(x);
			for (let it = 0; it < 60 && r.every(Number.isFinite) && Math.max(...r.map(Math.abs)) > 1e-12; it++) {
				const J = x.map((_, k) => {
					const h = 1e-7;
					const rp = res(x.map((v, i) => (i === k ? v + h : v)));
					const rm = res(x.map((v, i) => (i === k ? v - h : v)));
					return rp.map((v, i) => (v - rm[i]) / (2 * h));
				});
				const JtJ = J.map((a) => J.map((c) => a.reduce((s, v, i) => s + v * c[i], 0)));
				const dx = gauss(
					JtJ,
					J.map((a) => a.reduce((s, v, i) => s + v * r[i], 0)),
				);
				if (!dx.every(Number.isFinite)) break;
				// halve the step until the residual falls: the grid starts far from a root
				let t = 1;
				const norm = (v: number[]) => (v.every(Number.isFinite) ? Math.hypot(...v) : Infinity);
				let nx = x.map((v, k) => v - dx[k]);
				while (t > 1e-6 && !(norm(res(nx)) < norm(r))) nx = x.map((v, k) => v - (t /= 2) * dx[k]);
				if (t <= 1e-6) break;
				x = nx;
				r = res(x);
			}
			if (!r.every(Number.isFinite) || Math.max(...r.map(Math.abs)) > 1e-9) continue;
			const sol = { edge: hasEdge ? x[0] : 0, points: hasEdge ? x.slice(1) : x };
			const same = (o: PointSolution) =>
				Math.abs(o.edge - sol.edge) < 1e-6 && o.points.every((a, i) => Math.abs(a - sol.points[i]) < 1e-6);
			if (!out.some(same)) out.push(sol);
		}
	return out.sort((p, q) => p.edge - q.edge || p.points[0] - q.points[0]);
}

/** Solve the small square system A·x = y (Gaussian elimination, partial pivoting). */
function gauss(A: number[][], y: number[]): number[] {
	const n = y.length;
	const M = A.map((row, i) => [...row, y[i]]);
	for (let c = 0; c < n; c++) {
		let p = c;
		for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
		[M[c], M[p]] = [M[p], M[c]];
		for (let r = c + 1; r < n; r++) {
			const k = M[r][c] / M[c][c];
			for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
		}
	}
	const x = new Array<number>(n).fill(0);
	for (let r = n - 1; r >= 0; r--)
		x[r] = (M[r][n] - M[r].slice(r + 1, n).reduce((s, v, j) => s + v * x[r + 1 + j], 0)) / M[r][r];
	return x;
}

// ── Marek's names for faces ──
//
// Marek writes a corner as a letter for its face's side length, A, B, C… for sides of 1, 2, 3… edges (S, M,
// L in his older boards), then the face's corner count, oo for an apeirogon: A3 is a triangle's corner, C6
// a hexagon's with sides of three edges. The engine reads neither: a side of three edges is written with
// two Pi corners along it, `C6 Pi Pi` six times. The same names, typed, are the quickest way to add a face.
// An isotoxal face is a 2n-gon of equal sides whose corners alternate two angles adding up to 360 − 360/n:
// `A6*60` is a star of six 60° points (its dents: 360 − 60 − 60 = 240°), `A3*100` a convex hexagon of 100°
// and 140° corners, `A2*60` a rhombus.

const LETTERS = "ABCDEFGHIJ";

/** A face as its shape: n corners (null: an apeirogon), sides of `seg` edges, and for an isotoxal face (a
 *  star, or convex) the angle of its first corners, `n` then counting those. */
export type FaceSpec = { n: number | null; seg: number; point?: number; free?: boolean };

/** An isotoxal face's other angle: its 2n corners add up to (2n − 2)·180°. Over 180° it is a star's dent. */
export const dentOf = (n: number, point: number) => 360 - 360 / n - point;

/** Whether n corners of `point` degrees make an isotoxal face: a star from 3 points, convex from 2 (a rhombus). */
export function isotoxal(n: number, point: number): boolean {
	const d = dentOf(n, point);
	return (
		point > 0 &&
		point < 180 &&
		d > 0 &&
		Math.abs(d - point) > 1e-9 &&
		Math.abs(d - 180) > 1e-9 &&
		n >= (d > 180 ? 3 : 2)
	);
}

/** `C6`, `Aoo`, `A6*60` or `A6*` (the point Free, for Quick setup to solve) as a FaceSpec, or null. */
export function readShorthand(text: string): FaceSpec | null {
	const m = /^([A-J])(\d+|oo)(?:\*(\d+(?:\.\d+)?)?)?$/.exec(text.trim());
	if (!m) return null;
	const seg = LETTERS.indexOf(m[1]) + 1;
	const n = m[2] === "oo" ? null : Number(m[2]);
	if (n !== null && (n < 2 || n > 360 || (n === 2 && seg > 1))) return null;
	if (!text.includes("*")) return { n, seg };
	if (m[3] === undefined) return n !== null && n >= 2 ? { n, seg, free: true } : null;
	const point = Number(m[3]);
	return n !== null && isotoxal(n, point) ? { n, seg, point } : null;
}

/** An angle in the board's format: whole degrees, or a fraction of them. */
const degrees = (num: number, den: number) =>
	Number.isInteger(num / den) ? String(num / den) : `${+num.toFixed(6)}/${den}`;

/**
 * The board with face `at` (a new one when absent) set to `spec`, its corners named as Marek names them and
 * declared, a star's with their angles; corners the old face used that nothing uses any more are dropped.
 */
export function withFace(b: Board, spec: FaceSpec, at = b.faces.length): Board {
	const base = `${LETTERS[spec.seg - 1]}${spec.n ?? "oo"}`;
	const pis = Array.from({ length: spec.seg - 1 }, () => "Pi");
	const declare: { sym: string; value?: string }[] = spec.seg > 1 ? [{ sym: "Pi" }] : [];
	let word: string[];
	if (spec.free && spec.n !== null) {
		// a point for Quick setup to solve; the other corner follows it
		declare.push({ sym: `${base}p`, value: "free" }, { sym: `${base}d` });
		word = [`${base}p`, ...pis, `${base}d`, ...pis];
	} else if (spec.point !== undefined && spec.n !== null) {
		// a star's point and dent; a convex face's two corners
		const star = dentOf(spec.n, spec.point) > 180;
		const p = `${base}${star ? "p" : "a"}${spec.point}`;
		const d = `${base}${star ? "d" : "b"}${spec.point}`;
		declare.push(
			{ sym: p, value: String(spec.point) },
			{ sym: d, value: degrees(360 * spec.n - 360 - spec.point * spec.n, spec.n) },
		);
		word = [p, ...pis, d, ...pis];
	} else {
		declare.push({ sym: base });
		word = [base, ...pis];
	}
	const face: Face = { word, repeat: spec.n ?? "inf" };
	const faces = at < b.faces.length ? b.faces.map((f, i) => (i === at ? { ...f, ...face } : f)) : [...b.faces, face];
	let angles = b.angles.map((a) => {
		const d = declare.find((x) => x.sym === a.sym && x.value !== undefined);
		return d ? { ...a, value: d.value } : a;
	});
	for (const d of declare) if (!angles.some((a) => a.sym === d.sym)) angles.push(d);
	const old = at < b.faces.length ? b.faces[at].word : [];
	const used = new Set([...faces, ...b.vertices].flatMap((x) => x.word));
	angles = angles.filter((a) => !old.includes(a.sym) || used.has(a.sym));
	return { ...b, angles, faces };
}

/** A face read back as a FaceSpec: one corner all round, or an isotoxal face's two; null for any other. */
export function specOf(b: Board, f: Face): FaceSpec | null {
	const flat = flatOf(b);
	const cut = polygonOf(f, flat);
	if (!cut) return null;
	const full = f.repeat === "inf" ? f.word : Array.from({ length: f.repeat }, () => f.word).flat();
	const real = full.filter((c) => !flat(c));
	if (real.every((c) => c === real[0])) return { n: cut.n, seg: cut.seg };
	const iso = isoOf(b, f);
	if (iso) return { n: iso.n, seg: iso.seg, point: iso.point };
	const free = freePoints({ ...b, faces: [f] })[0];
	return free ? { n: free.n, seg: free.seg, free: true } : null;
}

// ── edge types (board-format.md `edge`) ──

/** The edge types Quick setup can write: drawn and hidden sides glued like to like (edge patterns), or
 *  bumps glued to bites (bubble tiles). */
export const EDGE_PRESETS = {
	drawn: { edges: [{ sym: "Ed", style: "drawn" }, { sym: "Eu", style: "hidden" }], glue: [["Ed", "Ed"], ["Eu", "Eu"]] },
	bubble: { edges: [{ sym: "EB", style: "bump" }, { sym: "EI", style: "bite" }], glue: [["EB", "EI"]] },
} as const;
export type EdgePreset = keyof typeof EDGE_PRESETS;

/** How deep a board's bumps and bites are drawn: the depth is budgeted by its sharpest corner
 *  (lib/bubble/edges.ts boardCornerAngle), so a bump never crosses a neighbouring side. */
export function bubbleGrid(board: Board): BubbleGrid {
	const sharpest = Math.min(
		...[...cornerShapes(board).values()]
			.map((x) => (cornerAngle(x, "plane", 0) ?? Math.PI) * (180 / Math.PI))
			.filter((a) => a > 1e-6),
	);
	return sharpest < 89 ? "triangle" : sharpest < 119 ? "square" : "hex";
}

/** The board with each typed corner read as its base corner (A4.Ed.Eu as A4), for judging shapes. */
const baseOf = (b: Board) => (c: string) => coloredCorner(c)?.base ?? typedCorner(b, c)?.base ?? c;
function baseView(b: Board): Board {
	const base = baseOf(b);
	const angles = new Map<string, Board["angles"][number]>();
	for (const a of b.angles) if (!angles.has(base(a.sym))) angles.set(base(a.sym), { ...a, sym: base(a.sym) });
	return {
		...b,
		angles: [...angles.values()],
		faces: b.faces.map((f) => ({ ...f, word: f.word.map(base) })),
		vertices: b.vertices.map((v) => ({ ...v, word: v.word.map(base) })),
	};
}

/**
 * The board with its edge types taken off: edge lines, the edge corners in its faces, its gluing lines, and
 * each typed corner back to its base, faces and vertices that become the same kept once. Quick setup types a
 * board from this, so running it twice gives the same board.
 */
export function plainOf(b: Board): Board {
	const v = baseView(b);
	const edges = new Set(b.angles.flatMap((a) => (a.edge ? [a.sym] : [])));
	const once = <T extends { word: string[] }>(xs: T[]) => {
		const seen = new Set<string>();
		return xs.filter((x) => !seen.has(cyclicKey(x.word)) && seen.add(cyclicKey(x.word)));
	};
	const faces = v.faces.map((f) => {
		if (f.repeat === "inf") return { ...f, word: f.word.filter((c) => !edges.has(c)) };
		const full = Array.from({ length: f.repeat }, () => f.word)
			.flat()
			.filter((c) => !edges.has(c));
		const p = Array.from({ length: full.length }, (_, i) => i + 1).find(
			(q) => full.length % q === 0 && full.every((c, i) => c === full[i % q]),
		)!;
		return { ...f, word: full.slice(0, p), repeat: full.length / p };
	});
	return {
		...v,
		angles: v.angles.filter((a) => !a.edge),
		faces: once(faces.map((f) => ({ ...f, word: f.repeat === "inf" ? f.word : [...f.word] }))).filter((f) => f.word.length),
		vertices: once(v.vertices.filter((x) => !x.word.every((c) => edges.has(c)))),
		initial: [],
		require: [],
	};
}

/**
 * The board with edge types on its sides, the vertex lines that glue them, and a way to type vertices.
 *
 * With a preset, the board is first made plain (plainOf), then every face becomes one face per way of
 * typing its sides (up to the face's own turns and mirrors: a square with drawn and hidden sides is six),
 * each corner named with the types of the sides beside it (typedName). `vertices` turns a plain vertex
 * (corners in cyclic order) into every edge pattern round it, as typed corners: the side between corners i
 * and i+1 has a type on i's face and the type it glues to on i+1's. Without `loose`, a drawn and hidden
 * board leaves out the vertices with exactly one drawn side (loose ends). Faces whose sides are cut by Pi
 * are kept as they are.
 *
 * Without a preset the board's own edge lines are used, the faces kept as written (lengths are geometry,
 * so the user types those sides), and an edge with no gluing line glues to itself.
 */
export function decorate(
	b: Board,
	preset: EdgePreset | null,
	loose = true,
): { board: Board; glue: string[][]; vertices: (plain: string[][]) => string[][]; plain: Board } {
	if (!preset) {
		const types = b.angles.filter((a) => a.edge).map((a) => a.sym);
		const lines = b.vertices.filter((v) => v.word.length === 2 && v.word.every((c) => types.includes(c)));
		const glue = [
			...lines.map((v) => v.word),
			...types.filter((t) => !lines.some((v) => v.word.includes(t))).map((t) => [t, t]),
		];
		return { board: b, glue, vertices: (ws) => ws, plain: b };
	}
	const p = EDGE_PRESETS[preset];
	const plain = plainOf(b);
	const ts = p.edges.map((e) => e.sym);
	const partner = new Map<string, string>(p.glue.flatMap(([x, y]) => [[x, y], [y, x]] as [string, string][]));
	const drawn = new Set<string>(p.edges.flatMap((e) => (e.style === "drawn" ? [e.sym] : [])));
	const value = new Map(plain.angles.map((a) => [a.sym, a.value]));
	// each typed corner made, to its base corner
	const typed = new Map<string, string>();
	const name = (c: string, t1: string, t2: string) => {
		const n = typedName(c, t1, t2);
		typed.set(n, c);
		return n;
	};
	/** Every way to give the n slots a type, as arrays. */
	const assignments = function* (n: number) {
		for (let m = 0; m < ts.length ** n; m++) {
			let r = m;
			yield Array.from({ length: n }, () => {
				const t = ts[r % ts.length];
				r = Math.floor(r / ts.length);
				return t;
			});
		}
	};
	const faces = plain.faces.flatMap((f) => {
		if (f.repeat === "inf" || f.word.includes("Pi")) return [f];
		const full = Array.from({ length: f.repeat }, () => f.word).flat();
		const out = new Map<string, Face>();
		for (const s of assignments(full.length)) {
			// side i runs from corner i to corner i+1
			const word = full.flatMap((c, i) => [name(c, s[(i + full.length - 1) % full.length], s[i]), s[i]]);
			const k = cyclicKey(word);
			if (!out.has(k)) out.set(k, { word, repeat: 1 });
		}
		return [...out.values()];
	});
	const board: Board = {
		...plain,
		angles: [
			...plain.angles.filter((a) => faces.some((f) => f.word.includes(a.sym))),
			...p.edges.map((e) => ({ sym: e.sym, value: "180", edge: { style: e.style } as const })),
			// typed corners after the edge lines they name, each with its base corner's angle
			...[...typed].map(([sym, base]) => (value.get(base) === undefined ? { sym } : { sym, value: value.get(base) })),
		],
		faces,
		vertices: [],
	};
	const declared = new Set(typed.keys());
	const vertices = (ws: string[][]) => {
		const out = new Map<string, string[]>();
		for (const w of ws)
			for (const s of assignments(w.length)) {
				if (!loose && drawn.size && s.filter((t) => drawn.has(t)).length === 1) continue;
				// side i leaves corner i with type s[i] and reaches corner i+1 as the type it glues to
				const word = w.map((c, i) => typedName(c, partner.get(s[(i + w.length - 1) % w.length])!, s[i]));
				const k = cyclicKey(word);
				if (!out.has(k) && word.every((c) => declared.has(c))) out.set(k, word);
			}
		return [...out.values()];
	};
	return { board, glue: p.glue.map((g) => [...g]), vertices, plain };
}

// ── colourings ──

/**
 * The board with its faces coloured: every plain face becomes one face per colour, its corners named with
 * the colour (A4@A, A4@B), as the atlas's colourings letter their tiles. `vertices` turns a plain vertex
 * (corners in cyclic order) into every colouring of it; with `proper`, two corners side by side at a
 * vertex, whose faces share the edge between them, never take one colour, so no two neighbouring faces
 * do. `uses(words)` is one required vertex set per colour, the vertices with a corner of that colour: a
 * tiling uses every colour exactly when it holds a vertex from each, and the search prunes on them.
 */
export function colorize(
	b: Board,
	n: number,
	proper = false,
): { board: Board; vertices: (plain: string[][]) => string[][]; uses: (words: string[][]) => number[][]; plain: Board } {
	const plain = plainOf(b);
	const flat = flatOf(plain);
	const value = new Map(plain.angles.map((a) => [a.sym, a.value]));
	const made = new Map<string, string>();
	const name = (c: string, k: number) => {
		if (flat(c)) return c;
		const s = coloredName(c, k);
		made.set(s, c);
		return s;
	};
	const faces = Array.from({ length: n }, (_, k) => plain.faces.map((f) => ({ ...f, word: f.word.map((c) => name(c, k)) }))).flat();
	const board: Board = {
		...plain,
		angles: [
			...plain.angles.filter((a) => faces.some((f) => f.word.includes(a.sym))),
			...[...made].map(([sym, base]) => (value.get(base) === undefined ? { sym } : { sym, value: value.get(base) })),
		],
		faces,
		vertices: [],
	};
	const vertices = (ws: string[][]) => {
		const out = new Map<string, string[]>();
		for (const w of ws)
			for (let m = 0; m < n ** w.length; m++) {
				let r = m;
				const k = w.map(() => {
					const x = r % n;
					r = Math.floor(r / n);
					return x;
				});
				if (proper && k.some((x, i) => !flat(w[i]) && x === k[(i + 1) % k.length])) continue;
				const word = w.map((c, i) => name(c, k[i]));
				const key = cyclicKey(word);
				if (!out.has(key) && word.every((c) => flat(c) || made.has(c))) out.set(key, word);
			}
		return [...out.values()];
	};
	const uses = (words: string[][]) =>
		Array.from({ length: n }, (_, k) => words.flatMap((w, i) => (w.some((c) => coloredCorner(c)?.color === k) ? [i] : [])));
	return { board, vertices, uses, plain };
}
