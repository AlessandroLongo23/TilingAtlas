// The parameter plane of a squared torus: where its combinatorics changes, and where perfection dies.
//
// A squared torus is chosen by a class (m, n) in H¹(T;ℝ) ≅ ℝ², and moving that class does not deform
// the tiling smoothly forever. Each square's side is a LINEAR form in (m, n), as `torusCurrents`
// records, because the reduced Laplacian's determinant does not depend on the class. So each edge e
// defines a line L(e) = {(m, n) : a_e·m + b_e·n = 0} through the origin where that square
// shrinks to nothing. The lines cut the plane into angular sectors, on each of which the arrangement is
// combinatorially constant; crossing one makes a square vanish and reappear somewhere else.
//
// That is Dutour Sikirić's Sq-domain decomposition, "Torus square tilings", Applicable Algebra in
// Engineering, Communication and Computing 23 (2012) 251–261 (arXiv:1101.0223), Section 4. His
// Theorem 3(ii) is the statement that the space of periodic harmonic vectors is 2-dimensional and
// isomorphic to H₁ of the torus, which is why the parameter space is a plane in the first place.
//
// Two extras this module computes that his section does not need:
//
//   - TIE lines. Two squares come out the SAME size where |a_e·m + b_e·n| = |a_f·m + b_f·n|, which is
//     again a pair of lines through the origin. A squaring is perfect exactly when its class misses
//     every one of them, so perfection is a "miss every line" condition, not a lucky accident.
//   - LOCKED pairs. If (a_e, b_e) = ±(a_f, b_f) the two sides agree at EVERY class and no line can
//     separate them, so the tiling is imperfect everywhere. That is the half-turn rule made mechanical:
//     a half-turn acts as −1 on H¹ for every class at once, so it locks every orbit it moves.
//
// Only the DIRECTION of (m, n) matters, since scaling a class scales the whole tiling and nothing else,
// so the parameter space is really the circle of directions, in which (m, n) and (−m, −n) give the same
// tiling reflected.
// Angles here are therefore reduced mod π and live in [0, π).

import { gcdAll, gcdBig } from "./linalg";
import { torusCurrents, torusRaw, type TorusRaw, type TorusSquaring } from "./torusSquaring";
import type { TorusMap } from "./torusMap";

/** side(e) at class (m, n) is |a·m + b·n|, times a positive scale shared by every edge. */
export interface SqCoeff {
	a: bigint;
	b: bigint;
}

/** A line through the origin in the (m, n) plane, as its reduced integer normal. */
export interface SqLine {
	/** The line is {(m, n) : a·m + b·n = 0}. Reduced, with a canonical sign. */
	a: bigint;
	b: bigint;
	/** Direction of the line itself, in [0, π). */
	angle: number;
}

export interface SqWall extends SqLine {
	/** Quotient edges whose square shrinks to nothing on this line. */
	edges: number[];
}

export interface SqTie extends SqLine {
	/** Pairs of edges whose squares come out equal on this line. */
	pairs: [number, number][];
}

export interface SqDomains {
	coeff: SqCoeff[];
	/** Sector walls, sorted by angle. A square vanishes on each. */
	walls: SqWall[];
	/** Where two squares tie, sorted by angle. Perfection means missing all of these. */
	ties: SqTie[];
	/** Edges carrying no current at any class at all; they never become a tile. */
	silent: number[];
	/** Pairs forced to the same size at every class. Non-empty means no perfect squaring exists. */
	locked: [number, number][];
}

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

/**
 * Reduce an integer normal to lowest terms with a canonical sign, so that two lines that are the same
 * line get the same key. Returns null for the zero vector, which is not a line.
 */
function reduce(a: bigint, b: bigint): SqCoeff | null {
	if (a === 0n && b === 0n) return null;
	const g = gcdBig(a, b);
	let p = a / g;
	let q = b / g;
	if (p < 0n || (p === 0n && q < 0n)) {
		p = -p;
		q = -q;
	}
	return { a: p, b: q };
}

/** A float ratio from two BigInts, scaled first so a large pair cannot round to Infinity. */
function ratio(a: bigint, b: bigint): [number, number] {
	const big = abs(a) > abs(b) ? abs(a) : abs(b);
	const LIMIT = 1n << 40n;
	if (big <= LIMIT) return [Number(a), Number(b)];
	const s = big / LIMIT;
	return [Number(a / s), Number(b / s)];
}

/**
 * The direction of the line {a·m + b·n = 0}, in [0, π).
 *
 * The line's own direction vector is (−b, a), perpendicular to its normal.
 */
export function lineAngle(a: bigint, b: bigint): number {
	const [x, y] = ratio(a, b);
	const t = Math.atan2(x, -y);
	return ((t % Math.PI) + Math.PI) % Math.PI;
}

/** The direction of the class (m, n) itself, in [0, π). Antipodal classes land on the same value. */
export function classAngle(m: number, n: number): number {
	const t = Math.atan2(n, m);
	return ((t % Math.PI) + Math.PI) % Math.PI;
}

const key = (c: SqCoeff): string => `${c.a}/${c.b}`;

/**
 * Every wall and every tie of one periodic tiling, exactly.
 *
 * Costs two solves plus O(E²) BigInt arithmetic. Returns null only if the reduced Laplacian is
 * singular, which means the quotient map is broken and nothing downstream would work either.
 */
export function torusSqDomains(map: TorusMap): SqDomains | null {
	const one = torusCurrents(map, 1, 0);
	const two = torusCurrents(map, 0, 1);
	if (one.ok === false || two.ok === false) return null;

	// Both solves share the same reduced Laplacian, so the same determinant; cross-multiplying anyway
	// costs nothing and keeps the two columns in common units whatever the elimination decides to do.
	const raw: SqCoeff[] = map.edges.map((_, i) => ({
		a: one.currents.omega[i] * two.currents.D,
		b: two.currents.omega[i] * one.currents.D,
	}));
	const g = gcdAll(raw.flatMap((c) => [c.a, c.b])) || 1n;
	const coeff: SqCoeff[] = raw.map((c) => ({ a: c.a / g, b: c.b / g }));

	const silent: number[] = [];
	const live: number[] = [];
	for (let e = 0; e < coeff.length; e++) {
		if (coeff[e].a === 0n && coeff[e].b === 0n) silent.push(e);
		else live.push(e);
	}

	// ---- walls: one per distinct direction in which some square vanishes -----------------------------
	const wallOf = new Map<string, SqWall>();
	for (const e of live) {
		const r = reduce(coeff[e].a, coeff[e].b) as SqCoeff;
		const k = key(r);
		const hit = wallOf.get(k);
		if (hit) hit.edges.push(e);
		else wallOf.set(k, { a: r.a, b: r.b, angle: lineAngle(r.a, r.b), edges: [e] });
	}

	// ---- locked pairs, and the candidate tie lines ---------------------------------------------------
	// |a_e·m + b_e·n| = |a_f·m + b_f·n| splits into two lines, one from the difference of the coefficient
	// vectors and one from their sum. A zero vector means the two sides agree identically: that is a
	// locked pair, and no line separates them.
	const locked: [number, number][] = [];
	const candidates = new Map<string, SqCoeff>();
	for (let i = 0; i < live.length; i++) {
		for (let j = i + 1; j < live.length; j++) {
			const e = live[i];
			const f = live[j];
			const diff = reduce(coeff[e].a - coeff[f].a, coeff[e].b - coeff[f].b);
			const sum = reduce(coeff[e].a + coeff[f].a, coeff[e].b + coeff[f].b);
			if (diff === null || sum === null) {
				locked.push([e, f]);
				continue;
			}
			candidates.set(key(diff), diff);
			candidates.set(key(sum), sum);
		}
	}

	// ---- confirm each candidate by evaluating the sides exactly on it --------------------------------
	// A candidate is a tie only if two squares that BOTH survive there come out equal. Where a pair ties
	// at zero, both squares have vanished and there is no repeated tile to see, so that line is a wall
	// and not a tie. Evaluating settles it without a case analysis.
	const ties: SqTie[] = [];
	for (const t of candidates.values()) {
		const m = -t.b;
		const n = t.a;
		const side = new Map<string, number[]>();
		for (const e of live) {
			const s = abs(coeff[e].a * m + coeff[e].b * n);
			if (s === 0n) continue;
			const k = s.toString();
			const hit = side.get(k);
			if (hit) hit.push(e);
			else side.set(k, [e]);
		}
		const pairs: [number, number][] = [];
		for (const group of side.values()) {
			for (let i = 0; i < group.length; i++) {
				for (let j = i + 1; j < group.length; j++) pairs.push([group[i], group[j]]);
			}
		}
		if (pairs.length > 0) ties.push({ a: t.a, b: t.b, angle: lineAngle(t.a, t.b), pairs });
	}

	const byAngle = <T extends SqLine>(xs: T[]): T[] => [...xs].sort((p, q) => p.angle - q.angle);
	return { coeff, walls: byAngle([...wallOf.values()]), ties: byAngle(ties), silent, locked };
}

/** One open sector, as the angular interval between two consecutive walls. Angles in [0, π). */
export interface SqSector {
	from: number;
	to: number;
	/** Midpoint direction, the honest place to sample the sector. `to` may have wrapped past π. */
	mid: number;
}

/**
 * The sectors the walls cut the direction circle into.
 *
 * The circle here is the space of DIRECTIONS, of length π, because a class and its negative give the
 * same tiling. k walls therefore give k sectors, and the last one wraps past π back to the first wall.
 */
export function sqSectors(walls: SqLine[]): SqSector[] {
	if (walls.length === 0) return [{ from: 0, to: Math.PI, mid: Math.PI / 2 }];
	const a = walls.map((w) => w.angle).sort((p, q) => p - q);
	return a.map((from, i) => {
		const to = i + 1 < a.length ? a[i + 1] : a[0] + Math.PI;
		return { from, to, mid: (from + to) / 2 };
	});
}

/** Which sector a direction falls in, or −1 when it lands exactly on a wall. */
export function sqSectorAt(sectors: SqSector[], angle: number): number {
	const EPS = 1e-9;
	for (let i = 0; i < sectors.length; i++) {
		const s = sectors[i];
		for (const a of [angle, angle + Math.PI]) {
			if (a > s.from + EPS && a < s.to - EPS) return i;
		}
	}
	return -1;
}

/**
 * A coprime class inside a sector, or null when the stepper's range cannot reach one.
 *
 * The steppers only offer |m| ≤ limit and 0 ≤ n ≤ limit, so a narrow sector may hold no reachable
 * class at all. Saying so is better than silently landing on a wall.
 */
export function sqClassInSector(sector: SqSector, limit: number): [number, number] | null {
	const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
	const EPS = 1e-9;
	let best: [number, number] | null = null;
	let bestGap = Infinity;
	for (let n = 0; n <= limit; n++) {
		for (let m = -limit; m <= limit; m++) {
			if (m === 0 && n === 0) continue;
			if (n === 0 && m < 0) continue;
			if (gcd(Math.abs(m), Math.abs(n)) !== 1) continue;
			const t = classAngle(m, n);
			for (const a of [t, t + Math.PI]) {
				if (a <= sector.from + EPS || a >= sector.to - EPS) continue;
				const gap = Math.abs(a - sector.mid);
				if (gap < bestGap) {
					bestGap = gap;
					best = [m, n];
				}
			}
		}
	}
	return best;
}

// ---- the family as one object, so a class can move continuously -------------------------------------
//
// Nothing forces (m, n) to be integers. The class lives in H¹(T;ℝ) ≅ ℝ², so every REAL direction gives a
// genuine squared torus, and the certificate Σ side² = covolume is the Riemann bilinear relation, which
// holds over ℝ. Integrality buys exactness, not existence: at an integer class the sides are integers a
// BigInt solve can compare, and off it they are reals in the ℚ-span of {m, n} and "all distinct" stops
// being decidable by the machinery here.
//
// Every field of the exact solve is linear in (m, n), so two solves span the family and any real class is
// a blend of them. That is what makes a continuous control affordable: dragging costs a dot product, not
// a solve.

export interface TorusFrame {
	at10: TorusRaw;
	at01: TorusRaw;
}

/** The two exact solves that span the family, or null if the quotient map is broken. */
export function torusFrame(map: TorusMap): TorusFrame | null {
	const a = torusRaw(map, 1, 0);
	const b = torusRaw(map, 0, 1);
	if (a.ok === false || b.ok === false) return null;
	return { at10: a.raw, at01: b.raw };
}

/**
 * The squared torus at any real class, by blending the frame.
 *
 * Scale is not a degree of freedom here — scaling a class scales the tiling and nothing else — so the
 * result is normalised to put the largest side at 1000, which keeps the drawing well conditioned as the
 * class sweeps. The numbers are therefore ratios and not the exact integers the shelf ships, and the
 * squaring is marked `approx` so the page can say so instead of printing them as if they were.
 */
export function squareTorusAt(frame: TorusFrame, m: number, n: number): TorusSquaring | null {
	// Number() on these is lossy past 2^53 and lossless below it; on this corpus they are far below,
	// and six significant figures is all a 1000-unit canvas can show either way.
	const mix = (a: bigint[], b: bigint[]): number[] => a.map((v, i) => m * Number(v) + n * Number(b[i]));
	const one = (a: bigint, b: bigint): number => m * Number(a) + n * Number(b);

	const side = mix(frame.at10.side, frame.at01.side);
	const x0 = mix(frame.at10.x0, frame.at01.x0);
	const y0 = mix(frame.at10.y0, frame.at01.y0);
	const psi = mix(frame.at10.psi, frame.at01.psi);
	const potential = mix(frame.at10.potential, frame.at01.potential);
	const L: [[number, number], [number, number]] = [
		[one(frame.at10.lattice[0][0], frame.at01.lattice[0][0]), one(frame.at10.lattice[0][1], frame.at01.lattice[0][1])],
		[one(frame.at10.lattice[1][0], frame.at01.lattice[1][0]), one(frame.at10.lattice[1][1], frame.at01.lattice[1][1])],
	];

	let big = 0;
	for (const s of side) big = Math.max(big, Math.abs(s));
	if (big === 0) return null;
	const k = 1000 / big;

	// Four decimals on a largest side of 1000, so two tiles that are equal by construction round to the
	// same string and the size-ranked palette still groups them.
	const q = (v: number): string => (v * k).toFixed(4);
	const squares = side
		.map((s, i) => ({ s, x: s < 0 ? x0[i] + s : x0[i], y: s < 0 ? y0[i] + s : y0[i], edge: i }))
		.filter((r) => Math.abs(r.s) * k > 1e-3)
		.map((r) => ({ x: q(r.x), y: q(r.y), side: q(Math.abs(r.s)), edge: r.edge }));

	const distinct = new Set(squares.map((s) => s.side)).size;
	return {
		cls: [m, n],
		squares,
		lattice: [
			[q(L[0][0]), q(L[0][1])],
			[q(L[1][0]), q(L[1][1])],
		],
		covolume: (Math.abs(L[0][0] * L[1][1] - L[0][1] * L[1][0]) * k * k).toFixed(2),
		order: squares.length,
		distinct,
		perfect: false,
		degenerate: side.length - squares.length,
		potential: potential.map(q),
		psi: psi.map(q),
		approx: true,
	};
}

/** Coprime classes the steppers can reach, one per direction. */
function reachable(limit: number): [number, number][] {
	const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
	const out: [number, number][] = [];
	for (let n = 0; n <= limit; n++) {
		for (let m = -limit; m <= limit; m++) {
			if (m === 0 && n === 0) continue;
			if (n === 0 && m < 0) continue;
			if (gcd(Math.abs(m), Math.abs(n)) !== 1) continue;
			out.push([m, n]);
		}
	}
	return out;
}

const cache = new Map<number, [number, number][]>();
const classes = (limit: number): [number, number][] => {
	const hit = cache.get(limit);
	if (hit) return hit;
	const out = reachable(limit);
	cache.set(limit, out);
	return out;
};

/** Angular distance between two directions, both taken mod π. */
const gap = (a: number, b: number): number => {
	const d = Math.abs(((a - b) % Math.PI) + Math.PI) % Math.PI;
	return Math.min(d, Math.PI - d);
};

export interface SnapResult {
	cls: [number, number];
	/** True when the result is an integral class, so the page can print exact sides. */
	snapped: boolean;
}

/**
 * The class a drag at this angle should select: an exact integral one when the pointer is near enough,
 * and the bare direction otherwise.
 *
 * The tolerance shrinks as the class gets complicated, `SNAP / (|m| + n)`. A fixed radius would not work:
 * at limit 6 there are about sixty reachable directions across the half-circle, so a radius wide enough
 * to catch (1,0) comfortably would leave almost nothing free. Weighting it makes the simple classes
 * sticky and the elaborate ones barely there, which is also the order in which they are worth landing on.
 * About a third of the circle snaps at these settings.
 */
const SNAP = 0.05;
const TAU = 2 * Math.PI;

/**
 * Put an integral class on the same side of the circle as `angle`, negating it if need be.
 *
 * `classes()` lists one representative per DIRECTION, all with n ≥ 0, because (m, n) and (−m, −n) are
 * the same squared torus. They are not the same PICTURE though: negating the class negates the harmonic
 * form, which point-reflects the tiling. So handing back the canonical representative for a drag in the
 * lower half teleports the marker to the antipode and flips all four stages at once, which is exactly
 * the discontinuity the continuous control exists to avoid. Orienting to the pointer keeps the whole
 * circle continuous, at the cost of letting n go negative, which nothing downstream minds.
 */
function orient(cls: [number, number], angle: number): [number, number] {
	const d = (((angle - Math.atan2(cls[1], cls[0])) % TAU) + TAU + Math.PI) % TAU;
	return Math.abs(d - Math.PI) <= Math.PI / 2 ? cls : [-cls[0], -cls[1]];
}

/** Exported for the wedge click, which knows which of a sector's two halves was hit. */
export const orientClass = orient;

export function snapClass(angle: number, limit: number): SnapResult {
	let best: [number, number] | null = null;
	let bestGap = Infinity;
	for (const [m, n] of classes(limit)) {
		const d = gap(angle, classAngle(m, n));
		if (d > SNAP / (Math.abs(m) + n) || d >= bestGap) continue;
		bestGap = d;
		best = [m, n];
	}
	if (best) return { cls: orient(best, angle), snapped: true };
	return { cls: [Math.cos(angle), Math.sin(angle)], snapped: false };
}

/** The integral class nearest this direction, whatever the distance. What the steppers step from. */
export function nearestClass(angle: number, limit: number): [number, number] {
	let best: [number, number] = [1, 0];
	let bestGap = Infinity;
	for (const [m, n] of classes(limit)) {
		const d = gap(angle, classAngle(m, n));
		if (d >= bestGap) continue;
		bestGap = d;
		best = [m, n];
	}
	return orient(best, angle);
}
