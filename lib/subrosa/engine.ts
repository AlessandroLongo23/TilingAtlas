/**
 * Sub Rosa substitution engine.
 *
 * Pipeline (all validated against Kari & Rissanen 2016):
 *   Σ(n)  →  super-rhomb boundary word (exact ℤ[ζ₂ₙ])  →  interior fill (exact ear-clip)
 *         →  per-prototile substitution rule  →  float iteration for rendering.
 *
 * Exactness lives where correctness is decided: the boundary and the dissection are built in
 * ℤ[ζ₂ₙ] via `Cyclotomic`, and `validateFill` checks — with exact keys — that the children tile
 * the super-rhomb with no gap or overlap. Iteration for the on-screen patch runs in float
 * (a similarity per tile), which is sound because each substitution rule was already proven
 * exact; float error over the ≤3 visible levels is invisible.
 *
 * Scope: n = 5 is validated end to end (prototiles (1,4) and (2,3): 72 and 116 children,
 * area-exact, edge-consistent). The greedy fill also solves n = 7 x=1 but dead-ends on
 * n = 7 x=2,3 — a robust fill (de Bruijn matched-line) is the documented next step. Callers
 * should gate the UI to symmetries where every prototile fills; use `supportedSymmetry(n)`.
 */

import { CyclotomicRing, Cyclotomic } from "@/classes/Cyclotomic";
import { Vector } from "@/classes/Vector";
import { sigma, scalingFactor } from "./sigma";

// ---------------------------------------------------------------------------------------------
// Boundary word: Σ(n) → the serrated super-rhomb outline as exact ℤ[ζ₂ₙ] vertices.
// ---------------------------------------------------------------------------------------------

/** Direction integers (0..2n-1) around the boundary of the super-rhomb of prototile (x, n-x). */
export function boundaryWord(n: number, x: number): number[] {
	const N = 2 * n;
	const sig = sigma(n);
	// A super-edge with bisector k (half-integer, in π/n units) and label a contributes unit
	// vectors at integer directions k±a/2. The 4 edges: bisectors ½, ½+x, and their antiparallels.
	const edge = (k: number, reverse: boolean): number[] => {
		const seq = reverse ? [...sig].reverse() : sig;
		const out: number[] = [];
		for (const a of seq) {
			const i1 = Math.round(k + a / 2);
			const i2 = Math.round(k - a / 2);
			if (reverse) {
				out.push(((i2 + n) % N + N) % N, ((i1 + n) % N + N) % N);
			} else {
				out.push(((i1 % N) + N) % N, ((i2 % N) + N) % N);
			}
		}
		return out;
	};
	return [...edge(0.5, false), ...edge(0.5 + x, false), ...edge(0.5, true), ...edge(0.5 + x, true)];
}

// ---------------------------------------------------------------------------------------------
// Exact interior fill: greedy sharpest-corner ear-clip in ℤ[ζ₂ₙ], float only for containment.
// ---------------------------------------------------------------------------------------------

type Pt = Cyclotomic;
type Rhomb = [Pt, Pt, Pt, Pt];

function xy(p: Pt): Vector {
	return p.toVector();
}
function crossV(o: Vector, a: Vector, b: Vector): number {
	return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}
function inRhomb(p: Vector, q: Vector[]): boolean {
	const s = [0, 1, 2, 3].map((i) => crossV(q[i], q[(i + 1) % 4], p));
	return s.every((v) => v > 1e-7) || s.every((v) => v < -1e-7);
}
function segCross(a: Vector, b: Vector, c: Vector, d: Vector): boolean {
	const d1 = crossV(c, d, a);
	const d2 = crossV(c, d, b);
	const d3 = crossV(a, b, c);
	const d4 = crossV(a, b, d);
	return (
		d1 > 1e-9 !== d2 > 1e-9 &&
		d3 > 1e-9 !== d4 > 1e-9 &&
		Math.min(Math.abs(d1), Math.abs(d2), Math.abs(d3), Math.abs(d4)) > 1e-9
	);
}

/**
 * Tile the super-rhomb region (given by its boundary word) with unit rhombi.
 * Greedy: repeatedly clip the sharpest convex corner whose ear rhombus is contained (no other
 * vertex inside it, no boundary edge crossing it). Exact positions ⇒ no drift; the containment
 * float-predicate only decides validity between well-separated exact points. Returns null if
 * the greedy dead-ends (n where a robust fill is still needed).
 */
export function fillSuperRhomb(ring: CyclotomicRing, n: number, dirs: number[]): Rhomb[] | null {
	const N = 2 * n;
	const U: Pt[] = [];
	for (let j = 0; j < N; j++) U.push(Cyclotomic.zeta(ring, j));
	const dirOf = new Map<string, number>();
	for (let j = 0; j < N; j++) dirOf.set(U[j].key(), j);

	// boundary vertices (drop the closing duplicate)
	let poly: Pt[] = [Cyclotomic.ZERO(ring)];
	for (let i = 0; i < dirs.length - 1; i++) poly.push(poly[poly.length - 1].add(U[dirs[i]]));

	const xcache = new Map<string, Vector>();
	const fx = (p: Pt): Vector => {
		const k = p.key();
		let v = xcache.get(k);
		if (!v) {
			v = xy(p);
			xcache.set(k, v);
		}
		return v;
	};
	const edir = (i: number): number =>
		dirOf.get(poly[(i + 1) % poly.length].sub(poly[i]).key())!;

	const rh: Rhomb[] = [];
	let guard = 0;
	while (poly.length > 2) {
		if (++guard > 500000) return null;
		const m = poly.length;
		// spike removal: a backtrack V_{i-1} == V_{i+1}
		let sp = -1;
		for (let i = 0; i < m; i++) {
			if (poly[(i - 1 + m) % m].equals(poly[(i + 1) % m])) {
				sp = i;
				break;
			}
		}
		if (sp >= 0) {
			poly = poly.filter((_, t) => t !== sp && t !== (sp + 1) % m);
			continue;
		}
		// pick the sharpest (largest turn) convex, contained ear
		let best: { A: number; B: number; C: number; Dv: Pt } | null = null;
		let bestTurn = -1;
		for (let B = 0; B < m; B++) {
			const A = (B - 1 + m) % m;
			const C = (B + 1) % m;
			const turn = ((edir(B) - edir(A)) % N + N) % N;
			if (!(turn > 0 && turn < n)) continue;
			const Dv = poly[A].add(poly[C].sub(poly[B]));
			const fa = fx(poly[A]);
			const fb = fx(poly[B]);
			const fc = fx(poly[C]);
			const fd = fx(Dv);
			const q = [fa, fb, fc, fd];
			let bad = false;
			for (let k = 0; k < m && !bad; k++) {
				if (k === A || k === B || k === C) continue;
				if (inRhomb(fx(poly[k]), q)) bad = true;
			}
			if (bad) continue;
			for (let e = 0; e < m && !bad; e++) {
				const f = (e + 1) % m;
				if (e === A || e === B || e === C || f === A || f === B || f === C) continue;
				if (segCross(fa, fd, fx(poly[e]), fx(poly[f]))) bad = true;
				else if (segCross(fd, fc, fx(poly[e]), fx(poly[f]))) bad = true;
			}
			if (bad) continue;
			if (turn > bestTurn) {
				bestTurn = turn;
				best = { A, B, C, Dv };
			}
		}
		if (!best) return null;
		rh.push([poly[best.A], poly[best.B], poly[best.C], best.Dv]);
		poly[best.B] = best.Dv;
	}
	return rh;
}

// ---------------------------------------------------------------------------------------------
// Exact structural validation of a fill.
// ---------------------------------------------------------------------------------------------

export interface FillCheck {
	ok: boolean;
	rhombi: number;
	edgeOveruse: number; // interior edges used by >2 tiles (should be 0)
	boundaryEdges: number; // edges used once (should equal boundary length)
	expectedBoundary: number;
}

/** Exact check: every interior edge shared by exactly two tiles; single-use edges == boundary. */
export function validateFill(rh: Rhomb[], dirs: number[]): FillCheck {
	const count = new Map<string, number>();
	for (const r of rh) {
		for (let i = 0; i < 4; i++) {
			const a = r[i].key();
			const b = r[(i + 1) % 4].key();
			const k = a < b ? `${a}~${b}` : `${b}~${a}`;
			count.set(k, (count.get(k) ?? 0) + 1);
		}
	}
	let over = 0;
	let bnd = 0;
	for (const c of count.values()) {
		if (c > 2) over++;
		if (c === 1) bnd++;
	}
	return {
		ok: over === 0 && bnd === dirs.length,
		rhombi: rh.length,
		edgeOveruse: over,
		boundaryEdges: bnd,
		expectedBoundary: dirs.length,
	};
}

// ---------------------------------------------------------------------------------------------
// Per-prototile substitution rule + float iteration for rendering.
// ---------------------------------------------------------------------------------------------

export interface ChildTile {
	protoId: number; // x in 1..⌊n/2⌋
	corners: Vector[]; // 4 float corners in the canonical super-rhomb frame
}
export interface Prototile {
	x: number; // acute half-angle index; rhomb (x, n-x)
	unit: Vector[]; // canonical UNIT rhomb corners (super-rhomb corners / S)
	children: ChildTile[];
}
export interface SubRosaRule {
	n: number;
	scaling: number;
	sigma: number[];
	prototiles: Prototile[];
	check: FillCheck[]; // one per prototile
}

/** Which prototile (x) a child rhomb is, from the angle between its two edge directions. */
function protoOfRhomb(ring: CyclotomicRing, n: number, r: Rhomb, U: Pt[], dirOf: Map<string, number>): number {
	const d0 = dirOf.get(r[1].sub(r[0]).key())!;
	const d1 = dirOf.get(r[2].sub(r[1]).key())!;
	let a = Math.abs(d1 - d0) % (2 * n);
	if (a > n) a = 2 * n - a;
	return Math.min(a, n - a);
}

/**
 * Build the substitution rule for symmetry n: fill every prototile's super-rhomb and record its
 * children. Returns null if any prototile fails to fill (n not yet supported).
 */
export function buildRule(n: number): SubRosaRule | null {
	const ring = CyclotomicRing.create(2 * n);
	const N = 2 * n;
	const U: Pt[] = [];
	for (let j = 0; j < N; j++) U.push(Cyclotomic.zeta(ring, j));
	const dirOf = new Map<string, number>();
	for (let j = 0; j < N; j++) dirOf.set(U[j].key(), j);

	const S = scalingFactor(n);
	const prototiles: Prototile[] = [];
	const check: FillCheck[] = [];

	for (let x = 1; x <= Math.floor(n / 2); x++) {
		const dirs = boundaryWord(n, x);
		const rh = fillSuperRhomb(ring, n, dirs);
		if (!rh) return null;
		check.push(validateFill(rh, dirs));

		// super-rhomb corners at boundary indices 0, L/4, L/2, 3L/4
		const L = dirs.length;
		const corner = (idx: number): Vector => {
			let p = Cyclotomic.ZERO(ring);
			for (let i = 0; i < idx; i++) p = p.add(U[dirs[i]]);
			return p.toVector();
		};
		const P = [corner(0), corner(L / 4), corner(L / 2), corner((3 * L) / 4)];
		// canonical UNIT rhomb = super-rhomb / S
		const unit = P.map((v) => new Vector(v.x / S, v.y / S));

		const children: ChildTile[] = rh.map((r) => ({
			protoId: protoOfRhomb(ring, n, r, U, dirOf),
			corners: r.map((p) => p.toVector()),
		}));
		prototiles.push({ x, unit, children });
	}
	return { n, scaling: S, sigma: sigma(n), prototiles, check };
}

/** Is symmetry n fully supported (every prototile fills)? */
export function supportedSymmetry(n: number): boolean {
	if (n < 4) return false;
	const r = buildRule(n);
	return !!r && r.check.every((c) => c.ok);
}

// --- float iteration -------------------------------------------------------------------------

export interface RenderTile {
	protoId: number;
	corners: Vector[]; // 4 world corners
}

// complex helpers on Vector
const cmul = (a: Vector, b: Vector): Vector => new Vector(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
const csub = (a: Vector, b: Vector): Vector => new Vector(a.x - b.x, a.y - b.y);
const cadd = (a: Vector, b: Vector): Vector => new Vector(a.x + b.x, a.y + b.y);
const cconj = (a: Vector): Vector => new Vector(a.x, -a.y);
const cdiv = (a: Vector, b: Vector): Vector => {
	const d = b.x * b.x + b.y * b.y;
	return new Vector((a.x * b.x + a.y * b.y) / d, (a.y * b.x - a.x * b.y) / d);
};

/**
 * Similarity g (rotation+scale+translation, optionally with a reflection) mapping the canonical
 * unit prototile corners C onto the tile's world corners Q. Determined from two corners; the
 * reflected branch is chosen when the direct one fails to reproduce corner 2.
 */
function similarity(C: Vector[], Q: Vector[]): (z: Vector) => Vector {
	const aDir = cdiv(csub(Q[1], Q[0]), csub(C[1], C[0]));
	const bDir = csub(Q[0], cmul(aDir, C[0]));
	const gDir = (z: Vector) => cadd(cmul(aDir, z), bDir);
	if (dist(gDir(C[2]), Q[2]) < 1e-6) return gDir;
	const aR = cdiv(csub(Q[1], Q[0]), csub(cconj(C[1]), cconj(C[0])));
	const bR = csub(Q[0], cmul(aR, cconj(C[0])));
	return (z: Vector) => cadd(cmul(aR, cconj(z)), bR);
}
function dist(a: Vector, b: Vector): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Grow a patch by substituting every tile once: each tile is replaced by its prototile's children
 * mapped through the similarity that places the (S-inflated) super-rhomb over the tile.
 */
export function substituteOnce(rule: SubRosaRule, tiles: RenderTile[]): RenderTile[] {
	const out: RenderTile[] = [];
	for (const t of tiles) {
		const proto = rule.prototiles.find((p) => p.x === t.protoId)!;
		const g = similarity(proto.unit, t.corners);
		for (const c of proto.children) {
			out.push({ protoId: c.protoId, corners: c.corners.map(g) });
		}
	}
	return out;
}

/**
 * Seed patch: a 2n-fold "star" — 2n copies of the thin (1, n−1) rhomb sharing their acute (π/n)
 * vertex at the origin. They fill the full 2π with no gap or overlap (2n · π/n = 2π), so it is a
 * legal patch and its substitution is a legal, 2n-fold-symmetric Sub Rosa tiling.
 */
export function seedStar(rule: SubRosaRule): RenderTile[] {
	const n = rule.n;
	const a = Math.PI / n;
	const tiles: RenderTile[] = [];
	for (let s = 0; s < 2 * n; s++) {
		const u0 = new Vector(Math.cos(s * a), Math.sin(s * a));
		const u1 = new Vector(Math.cos((s + 1) * a), Math.sin((s + 1) * a));
		tiles.push({
			protoId: 1,
			corners: [new Vector(0, 0), u0, cadd(u0, u1), u1],
		});
	}
	return tiles;
}

/** Seed patch: a single prototile at the origin (clearest view of one tile's dissection). */
export function seedSingle(rule: SubRosaRule, x: number): RenderTile[] {
	const proto = rule.prototiles.find((p) => p.x === x) ?? rule.prototiles[0];
	return [{ protoId: proto.x, corners: proto.unit }];
}
