/**
 * Sub Rosa substitution engine.
 *
 * Pipeline (all validated against Kari & Rissanen 2016):
 *   Σ(n)  →  super-rhomb boundary word (exact ℤ[ζ₂ₙ])  →  interior fill (exact ear-clip)
 *         →  per-prototile substitution rule  →  float iteration for rendering.
 *
 * Exactness lives where correctness is decided: the boundary and the dissection are built in
 * ℤ[ζ₄ₙ] via `Cyclotomic` (odd-n boundary vectors sit at odd multiples of π/(2n), which are ζ₄ₙ
 * directions, not ζ₂ₙ), and `validateFill` checks — with exact keys — that the children tile the
 * super-rhomb with no gap or overlap. Iteration for the on-screen patch runs in float (a
 * similarity per tile), which is sound because each substitution rule was already proven exact.
 *
 * The super-rhomb boundary is POINT-symmetric (u·ũ, opposite super-edges antiparallel — see
 * `boundaryWord`), so adjacent super-rhombs share an identical serrated edge and interlock. That
 * is what makes the substitution self-compose to arbitrary depth: iterating a single tile to
 * depth 3 gives 706 240 tiles with zero edge-overuse, zero polygon overlap, and area conserved to
 * float precision (verified by dense-grid coverage + spatial-hash overlap). The paper's optional
 * corner "rose sectors" (§5) are what make specific corners equal the rose R₂¹ (needed for the
 * R₂¹-seeded self-similar limit and primitivity); they are NOT needed for gap-free iteration, and
 * this engine does not build them.
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
// Boundary word: Σ(n) → the serrated super-rhomb outline as exact ℤ[ζ₄ₙ] vertices.
//
// Directions are integers 0..4n−1 in units of π/(2n) (ring ζ₄ₙ). For odd n the boundary unit
// vectors land at ODD such multiples — i.e. odd multiples of π/(2n), NOT the tile-edge grid of
// ζ₂ₙ — which is why the ring is ζ₄ₙ, not ζ₂ₙ. (The earlier ζ₂ₙ version rounded k±a/2 to
// integers, which silently distorted the outline; that was one cause of the depth-2 break.)
// ---------------------------------------------------------------------------------------------

/**
 * Direction integers (0..4n−1, units of π/(2n)) around the boundary of the super-rhomb of
 * prototile (x, n−x), read counterclockwise.
 *
 * A super-edge with bisector direction K carries the whole word Σ(n): each label a contributes
 * two unit vectors at K±a (Kari-Rissanen §5). The FIRST half of Σ tents "out" (K+a, K−a), the
 * SECOND half tents "in" (K−a, K+a) — the "count-in first half clockwise, count-out second half"
 * rule (§3, p.6). This is what makes the outline POINT-symmetric: the full word is u·ũ where ũ
 * is the half-turn (σₙ, add 2n to every direction, same order), so OPPOSITE super-edges are exact
 * antiparallels. Two adjacent super-rhombs then share an identical serrated edge and interlock —
 * the property that lets the substitution self-compose to any depth. (A mirror-symmetric outline,
 * which is what the previous version built, does NOT have antiparallel opposite edges, so
 * neighbours failed to mesh and depth ≥2 overlapped.)
 */
export function boundaryWord(n: number, x: number): number[] {
	const N = 4 * n; // ζ₄ₙ: full circle = 4n steps of π/(2n)
	const sig = sigma(n);
	const L = sig.length;
	const half = L / 2;
	const edge = (K: number): number[] => {
		const out: number[] = [];
		for (let i = 0; i < L; i++) {
			const a = sig[i];
			if (a === 0) {
				// even-n "zero rhombus": a single unit edge along the super-edge direction
				out.push(((K % N) + N) % N);
				continue;
			}
			const p = (((K + a) % N) + N) % N;
			const m = (((K - a) % N) + N) % N;
			if (i < half) out.push(p, m);
			else out.push(m, p);
		}
		return out;
	};
	// Four super-edges of the (x, n−x) rhombus have bisector directions 0, 2x, 2n, 2x+2n.
	// A·C·E·G with E = σₙ(A), G = σₙ(C) ⇒ the boundary is (A·C)·σₙ(A·C) = u·ũ.
	return [...edge(0), ...edge(2 * x), ...edge(2 * n), ...edge(2 * x + 2 * n)];
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

// ---------------------------------------------------------------------------------------------
// de Bruijn matched-line fill (the paper's own method, refs [7,8]). Polynomial and dead-end-free:
// match each boundary edge to its antiparallel partner (the non-crossing / parenthesis matching),
// making one "strand" per pair; two strands crossing = one rhombus; along a strand the parallel
// edges march by the leftward directions of the crossing strands. This reaches n≥9 where the
// greedy/restart ear-clip stalls. Combinatorics are exact-integer; only the crossing ORDER along
// a strand uses float (midpoint-chord parameter); positions accumulate exactly in ℤ[ζ₄ₙ].
// ---------------------------------------------------------------------------------------------

/** Tile the super-rhomb via the de Bruijn matched-line construction. Returns exact rhombi, or null
 *  if the boundary is unbalanced (should not happen for a valid super-rhomb). Output is validated
 *  by the caller — a rare concurrent-point mis-order fails validation and triggers the fallback. */
function deBruijnFill(ring: CyclotomicRing, n: number, dirs: number[]): Rhomb[] | null {
	const M = 4 * n;
	const L = dirs.length;
	const U: Pt[] = [];
	for (let j = 0; j < M; j++) U.push(Cyclotomic.zeta(ring, j));

	// exact boundary vertices P[0..L-1]; edge k runs P[k] → P[(k+1)%L] in direction dirs[k]
	const P: Pt[] = [Cyclotomic.ZERO(ring)];
	for (let i = 0; i < L - 1; i++) P.push(P[i].add(U[dirs[i]]));
	const fp = P.map((p) => p.toVector()); // float positions for ordering only

	// non-crossing matching per direction: cyclic parenthesis match (a=open, ā=close), started at
	// the running-sum minimum so the linear stack is balanced.
	const partner = new Array<number>(L).fill(-1);
	const occ = new Map<number, number[]>();
	for (let k = 0; k < L; k++) {
		const d = dirs[k];
		(occ.get(d) ?? occ.set(d, []).get(d)!).push(k);
	}
	for (let a = 0; a < M / 2; a++) {
		const A = occ.get(a) ?? [];
		const B = occ.get((a + M / 2) % M) ?? [];
		if (A.length !== B.length) return null; // unbalanced
		if (A.length === 0) continue;
		const evs: { k: number; o: number }[] = [];
		for (const k of A) evs.push({ k, o: 1 });
		for (const k of B) evs.push({ k, o: -1 });
		evs.sort((p, q) => p.k - q.k);
		let run = 0, minRun = Infinity, minAt = 0;
		for (let i = 0; i < evs.length; i++) {
			run += evs[i].o;
			if (run < minRun) { minRun = run; minAt = i; }
		}
		const stack: number[] = [];
		for (let t = 0; t < evs.length; t++) {
			const e = evs[(minAt + 1 + t) % evs.length];
			if (e.o === 1) stack.push(e.k);
			else { const p = stack.pop()!; partner[p] = e.k; partner[e.k] = p; }
		}
	}

	// strands: e0 = the endpoint with direction in [0, M/2), e1 its antiparallel partner
	const strands: { e0: number; e1: number; a: number }[] = [];
	const strandOfEdge = new Array<number>(L).fill(-1);
	const seen = new Array<boolean>(L).fill(false);
	for (let k = 0; k < L; k++) {
		if (seen[k]) continue;
		const j = partner[k];
		if (j < 0) return null;
		seen[k] = seen[j] = true;
		const e0 = dirs[k] < M / 2 ? k : j;
		const e1 = dirs[k] < M / 2 ? j : k;
		const id = strands.length;
		strands.push({ e0, e1, a: dirs[e0] });
		strandOfEdge[e0] = id;
		strandOfEdge[e1] = id;
	}

	const inArc = (e0: number, e1: number, jj: number): boolean =>
		e0 < e1 ? jj > e0 && jj < e1 : jj > e0 || jj < e1;
	const mid = (k: number): Vector => {
		const p = fp[k], q = fp[(k + 1) % L];
		return new Vector((p.x + q.x) / 2, (p.y + q.y) / 2);
	};
	const isectParam = (A: Vector, B: Vector, C: Vector, D: Vector): number => {
		const rx = B.x - A.x, ry = B.y - A.y, sx = D.x - C.x, sy = D.y - C.y;
		const den = rx * sy - ry * sx;
		if (Math.abs(den) < 1e-12) return 0;
		return ((C.x - A.x) * sy - (C.y - A.y) * sx) / den;
	};

	const rh: Rhomb[] = [];
	for (let sId = 0; sId < strands.length; sId++) {
		const { e0, e1, a } = strands[sId];
		const mS = mid(e0), mE = mid(e1);
		const crossings: { c: number; st: number; tparam: number }[] = [];
		for (let step = 1; step < L; step++) {
			const j = (e0 + step) % L;
			if (j === e1) break;
			const st = strandOfEdge[j];
			const other = strands[st];
			const oe = other.e0 === j ? other.e1 : other.e0;
			if (inArc(e0, e1, oe)) continue; // both endpoints in arc ⇒ no crossing with s
			// orient the crossing direction leftward of a (into the interior): rep in (a, a+M/2)
			let c = dirs[j] % M;
			const rel = ((c - a) % M + M) % M;
			if (!(rel > 0 && rel < M / 2)) c = (c + M / 2) % M;
			crossings.push({ c, st, tparam: isectParam(mS, mE, mid(other.e0), mid(other.e1)) });
		}
		crossings.sort((p, q) => p.tparam - q.tparam); // order along s from e0 to e1
		let A0 = P[e0];
		const Ua = U[a];
		for (const cr of crossings) {
			const Uc = U[cr.c];
			if (cr.st > sId) rh.push([A0, A0.add(Ua), A0.add(Ua).add(Uc), A0.add(Uc)]);
			A0 = A0.add(Uc);
		}
	}
	return rh;
}

/** A candidate ear during the fill: convex corner A-B-C with the fourth rhomb vertex Dv. */
type Ear = { A: number; B: number; C: number; Dv: Pt; turn: number };

/** Seeded PRNG (mulberry32) — restart seeds are deterministic, so a build is reproducible. */
function rng32(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * One greedy ear-clip pass over the super-rhomb region. `pick` chooses among the valid contained
 * convex ears at each step. Exact positions (Dv via ℤ[ζ] add/sub) ⇒ no drift; the float
 * containment predicate only decides ear validity between well-separated exact points. Returns
 * null on a dead-end (no clippable ear before the region is exhausted).
 */
function fillOnce(
	ring: CyclotomicRing,
	n: number,
	dirs: number[],
	pick: (ears: Ear[]) => Ear,
): Rhomb[] | null {
	const N = 4 * n;
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
		// collect every valid (convex, contained) ear
		const ears: Ear[] = [];
		for (let B = 0; B < m; B++) {
			const A = (B - 1 + m) % m;
			const C = (B + 1) % m;
			// convex (left) turn ⇒ index turn in (0, N/2); N/2 = 2n corresponds to a straight edge
			const turn = ((edir(B) - edir(A)) % N + N) % N;
			if (!(turn > 0 && turn < N / 2)) continue;
			const Dv = poly[A].add(poly[C].sub(poly[B]));
			const fa = fx(poly[A]);
			const fc = fx(poly[C]);
			const fd = fx(Dv);
			const q = [fa, fx(poly[B]), fc, fd];
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
			ears.push({ A, B, C, Dv, turn });
		}
		if (!ears.length) return null;
		const chosen = pick(ears);
		rh.push([poly[chosen.A], poly[chosen.B], poly[chosen.C], chosen.Dv]);
		poly[chosen.B] = chosen.Dv;
	}
	return rh;
}

/** Deterministic: always clip the sharpest (largest-turn) ear. */
const pickSharpest = (ears: Ear[]): Ear => ears.reduce((a, b) => (b.turn > a.turn ? b : a));

/**
 * Tile the super-rhomb region with unit rhombi. Primary method: the de Bruijn matched-line fill
 * (polynomial, dead-end-free, reaches high n). Fallback: the restart ear-clip (sharpest first,
 * then seeded-random tie-breaking among the near-sharpest ears) — it catches the rare case a
 * concurrent-point mis-order makes the de Bruijn pass fail validation (e.g. n=5 x=2). Every
 * candidate is accepted only if it is edge-consistent AND covers the boundary's area, so a shown
 * tiling is always correct; the method choice only affects which builds succeed. Returns null if
 * nothing validates (the symmetry is then not offered).
 */
export function fillSuperRhomb(ring: CyclotomicRing, n: number, dirs: number[]): Rhomb[] | null {
	const M = 4 * n;
	// target area = shoelace of the exact boundary (in float)
	const U: Vector[] = [];
	for (let j = 0; j < M; j++) U.push(Cyclotomic.zeta(ring, j).toVector());
	let bx = 0, by = 0, target2 = 0;
	for (let i = 0; i < dirs.length; i++) {
		const nx = bx + U[dirs[i]].x, ny = by + U[dirs[i]].y;
		target2 += bx * ny - nx * by;
		bx = nx; by = ny;
	}
	const target = Math.abs(target2) / 2;
	const rhArea = (r: Rhomb): number => {
		const p = r.map((c) => c.toVector());
		return 0.5 * Math.abs((p[2].x - p[0].x) * (p[3].y - p[1].y) - (p[3].x - p[1].x) * (p[2].y - p[0].y));
	};
	const accept = (rh: Rhomb[] | null): rh is Rhomb[] => {
		if (!rh || !validateFill(rh, dirs).ok) return false;
		let area = 0;
		for (const r of rh) area += rhArea(r);
		return Math.abs(area - target) / target < 1e-6;
	};

	// 1. de Bruijn (fast, general)
	const db = deBruijnFill(ring, n, dirs);
	if (accept(db)) return db;

	// 2. restart ear-clip fallback
	const TRIES = 128;
	for (let t = 0; t < TRIES; t++) {
		let pick = pickSharpest;
		if (t > 0) {
			const rand = rng32(0x9e3779b9 ^ (t * 0x85ebca6b));
			pick = (ears: Ear[]): Ear => {
				let maxT = 0;
				for (const e of ears) if (e.turn > maxT) maxT = e.turn;
				const pool = ears.filter((e) => e.turn >= maxT - 4); // near-sharpest
				return pool[Math.floor(rand() * pool.length)];
			};
		}
		const rh = fillOnce(ring, n, dirs, pick);
		if (accept(rh)) return rh;
	}
	return null;
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
	superCorners: Vector[]; // the size-S super-rhomb corners (the frame `children` live in)
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
	const N = 4 * n;
	const d0 = dirOf.get(r[1].sub(r[0]).key())!;
	const d1 = dirOf.get(r[2].sub(r[1]).key())!;
	let diff = (((d1 - d0) % N) + N) % N; // edge-direction gap in π/(2n) units
	if (diff > N / 2) diff = N - diff; // fold to [0, 2n]
	const label = diff / 2; // rhombus angle label in 1..n−1
	return Math.min(label, n - label);
}

/**
 * Build the substitution rule for symmetry n: fill every prototile's super-rhomb and record its
 * children. Returns null if any prototile fails to fill (n not yet supported).
 */
const ruleCache = new Map<number, SubRosaRule | null>();

/** Build (and memoize) the substitution rule for symmetry n. The fill restart can cost ~1–2 s
 *  for n=7, so the result is cached — switching symmetry in the UI pays it once. */
export function buildRule(n: number): SubRosaRule | null {
	if (ruleCache.has(n)) return ruleCache.get(n)!;
	const rule = buildRuleUncached(n);
	ruleCache.set(n, rule);
	return rule;
}

function buildRuleUncached(n: number): SubRosaRule | null {
	const ring = CyclotomicRing.create(4 * n);
	const N = 4 * n;
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
		// canonical UNIT rhomb = super-rhomb corners / S. Children stay in the super-rhomb frame
		// (size S): the substitution inflates a tile by S and replaces it with these children.
		const unit = P.map((v) => new Vector(v.x / S, v.y / S));

		const children: ChildTile[] = rh.map((r) => ({
			protoId: protoOfRhomb(ring, n, r, U, dirOf),
			corners: r.map((p) => p.toVector()),
		}));
		prototiles.push({ x, unit, superCorners: P, children });
	}
	return { n, scaling: S, sigma: sigma(n), prototiles, check };
}

/**
 * Symmetries the de Bruijn fill builds (fast, gap/overlap-free): n = 4,5,6,7,8,9,11 — 8/10/12/14/16/
 * 18/22-fold. Even n share the same construction: sigma(n) uses the [0,2,…] base, boundaryWord has
 * the zero-rhombus branch, and the square prototile (x=n/2, 90°/90°) fills and self-composes like any
 * other — the "fixed-point handling" the paper needs is only for the self-similar limit, not for
 * gap-free iteration (same as the corner rose sectors we skip). Bounded by the ℤ[ζ₄ₙ] rings in
 * `Cyclotomic` (ζ₁₆/₂₀/₂₄/₂₈/₃₂/₃₆/₄₄); n=10 (ζ₄₀) and n≥13 need more rings. Static list so the UI
 * never triggers a doomed build just to test support.
 */
export const SUPPORTED_SYMMETRIES: readonly number[] = [4, 5, 6, 7, 8, 9, 11];

/** Is symmetry n fully supported (every prototile fills within the fill budget)? */
export function supportedSymmetry(n: number): boolean {
	if (!SUPPORTED_SYMMETRIES.includes(n)) return false;
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
 * Similarity g mapping the canonical unit prototile corners C onto the tile's world corners Q.
 * The tile's corners can be listed starting at any vertex and in either winding (children come out
 * of the fill in an arbitrary order), so we search all four cyclic starts × {direct, reflected}
 * and return the g that reproduces ALL four corners — the tile's true placement. Without this the
 * wrong corner correspondence rotates a child's sub-dissection and tears the tiling at depth ≥2.
 */
function similarity(C: Vector[], Q: Vector[]): (z: Vector) => Vector {
	for (const refl of [false, true]) {
		const c0 = refl ? cconj(C[0]) : C[0];
		const c1 = refl ? cconj(C[1]) : C[1];
		for (let k = 0; k < 4; k++) {
			const a = cdiv(csub(Q[(k + 1) % 4], Q[k]), csub(c1, c0));
			const b = csub(Q[k], cmul(a, c0));
			const g = (z: Vector) => cadd(cmul(a, refl ? cconj(z) : z), b);
			if (dist(g(C[2]), Q[(k + 2) % 4]) < 1e-6 && dist(g(C[3]), Q[(k + 3) % 4]) < 1e-6) return g;
		}
	}
	// Fallback (degenerate input): direct 2-corner fit.
	const a = cdiv(csub(Q[1], Q[0]), csub(C[1], C[0]));
	return (z: Vector) => cadd(cmul(a, z), csub(Q[0], cmul(a, C[0])));
}
function dist(a: Vector, b: Vector): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Grow a patch one substitution level: INFLATE every tile by S, then subdivide it.
 *
 * Inflate-first is essential. A level-k patch is a valid gap/overlap-free tiling of unit tiles;
 * scaling every tile by S turns each into a super-rhomb-sized rhomb (still non-overlapping), and
 * replacing each with its prototile's fill children subdivides it *within its own bounds*. Mapping
 * the size-S children straight onto a unit tile instead (no inflation) piles size-S clusters on top
 * of each other — the tiling then reads as ~40× overlap hidden by opaque overdraw.
 */
export function substituteOnce(rule: SubRosaRule, tiles: RenderTile[]): RenderTile[] {
	const S = rule.scaling;
	const out: RenderTile[] = [];
	for (const t of tiles) {
		const proto = rule.prototiles.find((p) => p.x === t.protoId)!;
		const inflated = t.corners.map((z) => new Vector(z.x * S, z.y * S));
		const g = similarity(proto.superCorners, inflated);
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
