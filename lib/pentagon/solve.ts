/**
 * Free parameters in, a concrete convex pentagon out. Pure and DOM-free, so it unit tests directly.
 *
 * The pipeline is the same two steps for all 15 types, which is what makes the catalogue tractable:
 *
 *   1. ANGLES. Each type's angle conditions are linear in A..E and, with the sum-to-540 identity, leave
 *      a handful free. Those are the sliders; `PentagonType.angles` substitutes for the rest.
 *
 *   2. SIDES. Once the angles are fixed so are the five edge directions, so closure (the walk returning
 *      to its start) is TWO LINEAR equations in (a, b, c, d, e). Every type's side conditions are linear
 *      too. Stack them, normalise a = 1, solve.
 *
 * Three cases fall out of the row count, and they reproduce the published DOF numbers exactly:
 *
 *   - 4 rows: unique solution (types 3, 4, 5, 10, 11, 12, 13, and 1 and 2 once their side sliders pin
 *     the leftover freedom).
 *   - 5 rows: over-determined. A nonzero solution exists only where the 5x5 determinant vanishes, a
 *     transcendental condition pinning one more angle (types 6, 7, 8, 9, 14). `solveAngle` names it and
 *     `findPinnedAngle` bisects for it.
 *   - 6 rows: type 15, whose angles are all constants, so the extra row is dependent by construction and
 *     there is nothing to root-find.
 *
 * NULLSPACE BY COFACTORS, NOT BY ELIMINATION. The obvious approach (row reduce, read off the kernel)
 * needs a pivot tolerance, and there is no good value for one here: at a determinant root the matrix is
 * singular only to the accuracy of the root find, so a strict tolerance rejects valid pentagons and a
 * loose one accepts garbage. The kernel of a rank-4 4x5 matrix is instead given exactly by the signed
 * 4x4 minors, n_j = (-1)^j · det(M with column j deleted), with no tolerance anywhere. For the
 * over-determined types we drop rows down to 4x5 and keep whichever choice gives the largest vector.
 */

import type { Angles, PentagonType, Sides } from "./types";

/** Re-exported so consumers get the pentagon vocabulary from one module. */
export type { Angles, Sides };

const DEG = Math.PI / 180;

/** Root find precision, in degrees. Tight because the nullspace is read at the root. */
const ROOT_TOL = 1e-13;
/** Step for the sign-change sweep that brackets the root, in degrees. */
const SCAN_STEP = 0.25;

export interface Point {
	x: number;
	y: number;
}

export type PentagonError =
	| "no-root"
	| "non-positive-side"
	| "non-convex"
	| "degenerate"
	| "angle-out-of-range";

export interface Pentagon {
	angles: Angles;
	/** Normalised so a = 1. */
	sides: Sides;
	/** A..E, counter-clockwise, with A at the origin and side b along +x. */
	corners: [Point, Point, Point, Point, Point];
	/** How far the walk missed its start. A sanity readout; the tests pin it under 1e-12. */
	closure: number;
}

/**
 * Both variants declare both fields (one of them as `undefined`) so that reading `.error` or
 * `.pentagon` off the union typechecks. This repo compiles with `strict: false`, which turns off
 * strictNullChecks, and without that a boolean discriminant does not narrow a union at all.
 */
export type SolveResult =
	| { ok: true; pentagon: Pentagon; error?: undefined }
	| { ok: false; pentagon?: undefined; error: PentagonError };

/**
 * Heading of each edge of the walk, in radians, from the angles alone.
 *
 * The walk visits A, B, C, D, E and returns to A, so step i traverses the side arriving at corner i+1:
 * step 0 is `b` (A to B), step 1 is `c`, step 2 is `d`, step 3 is `e`, step 4 is `a` (E back to A).
 * At each corner the heading turns by the exterior angle, 180 - interior.
 */
function headings(ang: Angles): number[] {
	const th: number[] = [];
	let t = 0;
	for (let i = 0; i < 5; i++) {
		th.push(t);
		t += Math.PI - ang[(i + 1) % 5] * DEG;
	}
	return th;
}

/** Which side index each walk step consumes: step i uses side (i+1) mod 5, i.e. b, c, d, e, a. */
const SIDE_OF_STEP = [1, 2, 3, 4, 0] as const;

/**
 * The two closure rows over (a, b, c, d, e): Σ sides[k] · cos θ = 0 and the same in sin.
 * Linear in the sides because the headings depend only on the angles.
 */
export function closureRows(ang: Angles): number[][] {
	const th = headings(ang);
	const rc = [0, 0, 0, 0, 0];
	const rs = [0, 0, 0, 0, 0];
	for (let i = 0; i < 5; i++) {
		rc[SIDE_OF_STEP[i]] += Math.cos(th[i]);
		rs[SIDE_OF_STEP[i]] += Math.sin(th[i]);
	}
	return [rc, rs];
}

/** Every row constraining the sides: closure, the type's conditions, and one row per side slider. */
export function sideRows(t: PentagonType, ang: Angles, sideValues: number[]): number[][] {
	const rows = [...closureRows(ang), ...t.sideRows.map((r) => [...r])];
	t.sideParams.forEach((p, i) => {
		// side[index] = value · a
		const row = [0, 0, 0, 0, 0];
		row[0] = -(sideValues[i] ?? p.def);
		row[p.index] += 1;
		rows.push(row);
	});
	return rows;
}

/** Determinant of a square matrix by Gaussian elimination with partial pivoting. */
export function det(M: number[][]): number {
	const n = M.length;
	const A = M.map((r) => r.slice());
	let d = 1;
	for (let c = 0; c < n; c++) {
		let p = c;
		for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
		if (A[p][c] === 0) return 0;
		if (p !== c) {
			[A[p], A[c]] = [A[c], A[p]];
			d = -d;
		}
		d *= A[c][c];
		for (let r = c + 1; r < n; r++) {
			const f = A[r][c] / A[c][c];
			for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
		}
	}
	return d;
}

/**
 * The kernel of a 4x5 matrix, exactly: n_j = (-1)^j · det of the 4x4 left by deleting column j.
 * Zero vector when the rows are rank deficient, which the caller reads as "no pentagon here".
 */
function kernel4x5(rows: number[][]): number[] {
	const n: number[] = [];
	for (let j = 0; j < 5; j++) {
		const minor = rows.map((r) => r.filter((_, k) => k !== j));
		n.push((j % 2 === 0 ? 1 : -1) * det(minor));
	}
	return n;
}

/**
 * Side lengths satisfying every row, normalised to a = 1.
 *
 * With more than four rows the system is over-determined and only consistent where a determinant
 * vanishes; we drop rows to 4x5 and keep the choice with the largest kernel, which is the best
 * conditioned one. Off the root this returns something, and the residual check in `solvePentagon`
 * is what rejects it.
 */
export function solveSides(rows: number[][]): Sides | null {
	let best: number[] | null = null;
	let bestNorm = 0;

	const consider = (four: number[][]) => {
		const k = kernel4x5(four);
		const norm = Math.hypot(...k);
		if (norm > bestNorm) {
			bestNorm = norm;
			best = k;
		}
	};

	if (rows.length < 4) return null;
	if (rows.length === 4) {
		consider(rows);
	} else {
		// Every way of keeping four rows. At most C(6,4) = 15 combinations, so exhaustive is fine.
		const idx = rows.map((_, i) => i);
		const pick = (start: number, acc: number[]) => {
			if (acc.length === 4) {
				consider(acc.map((i) => rows[i]));
				return;
			}
			for (let i = start; i < idx.length; i++) pick(i + 1, [...acc, i]);
		};
		pick(0, []);
	}

	if (!best || bestNorm === 0) return null;
	const k = best as number[];
	if (k[0] === 0) return null;
	const scale = 1 / k[0];
	const s = k.map((v) => v * scale) as Sides;
	return s;
}

/** How badly a side vector violates the rows it was meant to satisfy, relative to its own size. */
function rowResidual(rows: number[][], s: Sides): number {
	const mag = Math.hypot(...s) || 1;
	let worst = 0;
	for (const r of rows) {
		let v = 0;
		for (let j = 0; j < 5; j++) v += r[j] * s[j];
		const scale = Math.hypot(...r) || 1;
		worst = Math.max(worst, Math.abs(v) / (mag * scale));
	}
	return worst;
}

/** Corner positions from angles and sides: A at the origin, side b along +x, going counter-clockwise. */
export function corners(ang: Angles, s: Sides): { pts: Pentagon["corners"]; closure: number } {
	const th = headings(ang);
	const pts: Point[] = [];
	let x = 0;
	let y = 0;
	for (let i = 0; i < 5; i++) {
		pts.push({ x, y });
		const L = s[SIDE_OF_STEP[i]];
		x += L * Math.cos(th[i]);
		y += L * Math.sin(th[i]);
	}
	return { pts: pts as Pentagon["corners"], closure: Math.hypot(x, y) };
}

/**
 * Convex and counter-clockwise, allowing a STRAIGHT vertex.
 *
 * Weak, not strict, because a 180° vertex is a real point of the family and the sliders are meant to
 * reach it. At the end of Type 13's range D hits exactly 180°, the pentagon flattens into a rectangle,
 * and it still tiles perfectly well — the "pentagon" simply has a corner you cannot see. Rejecting that
 * would stop the slider short of its own limit for no reason the reader could observe, which is exactly
 * the truncation AL objected to.
 *
 * A reflex turn is still rejected, and `area` guards the other way: a shape whose vertices all go
 * collinear has zero area and is not a tile at all. The comparison is on the normalised cross product,
 * so the tolerance means "sine of the turn angle" and does not drift with the pentagon's size.
 */
export function isConvexCCW(pts: Point[], eps = 1e-9): boolean {
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i];
		const q = pts[(i + 1) % pts.length];
		const r = pts[(i + 2) % pts.length];
		const cross = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
		const scale = Math.hypot(q.x - p.x, q.y - p.y) * Math.hypot(r.x - q.x, r.y - q.y);
		if (scale < 1e-15) return false; // a side collapsed to nothing
		if (cross / scale < -eps) return false;
	}
	return true;
}

/** Signed area doubled; positive for a counter-clockwise ring. */
export function area(pts: Point[]): number {
	let s = 0;
	for (let i = 0; i < pts.length; i++) {
		const q = pts[(i + 1) % pts.length];
		s += pts[i].x * q.y - q.x * pts[i].y;
	}
	return Math.abs(s) / 2;
}

/**
 * The determinant whose root pins the extra angle on an over-determined type. Defined only where the
 * type stacks exactly five rows, which is types 6, 7, 8, 9 and 14.
 */
function pinDeterminant(t: PentagonType, free: number[], extra: number): number {
	const ang = t.angles(free, extra);
	const rows = sideRows(t, ang, []);
	if (rows.length !== 5) return 0;
	return det(rows);
}

/**
 * The angle the type's determinant condition pins, by sweeping its bracket for a sign change and then
 * bisecting. Every root is tried and the first that yields a positive, convex pentagon wins: types 6 and
 * 14 both have a second root that satisfies the determinant while sending a side or an angle negative.
 */
export function findPinnedAngle(t: PentagonType, free: number[]): number | null {
	if (!t.solveAngle) return null;
	const [lo, hi] = t.solveAngle.bracket;

	let prevX = lo;
	let prevF = pinDeterminant(t, free, lo);
	for (let x = lo + SCAN_STEP; x <= hi + 1e-12; x += SCAN_STEP) {
		const f = pinDeterminant(t, free, x);
		if (prevF === 0) {
			if (acceptable(t, free, prevX)) return prevX;
		} else if ((f < 0) !== (prevF < 0)) {
			let a = prevX;
			let b = x;
			let fa = prevF;
			while (b - a > ROOT_TOL) {
				const m = (a + b) / 2;
				const fm = pinDeterminant(t, free, m);
				if (fm === 0) {
					a = m;
					b = m;
					break;
				}
				if ((fm < 0) !== (fa < 0)) b = m;
				else {
					a = m;
					fa = fm;
				}
			}
			const root = (a + b) / 2;
			if (acceptable(t, free, root)) return root;
		}
		prevX = x;
		prevF = f;
	}
	return null;
}

/** Whether a candidate pinned angle actually produces a usable pentagon. */
function acceptable(t: PentagonType, free: number[], extra: number): boolean {
	const r = assemble(t, free, [], extra);
	return r.ok;
}

/** The solve, once the pinned angle (if any) is known. */
function assemble(t: PentagonType, free: number[], sideValues: number[], extra: number): SolveResult {
	const ang = t.angles(free, extra);
	for (const a of ang) {
		// (0°, 180°]: a straight vertex is the attainable end of several families and the sliders reach
		// it. Past 180° the vertex is reflex and the pentagon is no longer convex, which leaves the
		// classification entirely.
		if (!Number.isFinite(a) || a <= 0 || a > 180 + 1e-9) {
			return { ok: false, error: "angle-out-of-range" };
		}
	}
	// The identity is structural, so a violation means a type record is wrong, not that the user
	// dragged somewhere odd.
	const sum = ang.reduce((x, y) => x + y, 0);
	if (Math.abs(sum - 540) > 1e-6) return { ok: false, error: "degenerate" };

	const rows = sideRows(t, ang, sideValues);
	const s = solveSides(rows);
	if (!s) return { ok: false, error: "degenerate" };
	if (rowResidual(rows, s) > 1e-7) return { ok: false, error: "no-root" };
	for (const v of s) {
		if (!Number.isFinite(v) || v <= 1e-9) return { ok: false, error: "non-positive-side" };
	}

	const { pts, closure } = corners(ang, s);
	if (closure > 1e-7) return { ok: false, error: "degenerate" };
	if (!isConvexCCW(pts)) return { ok: false, error: "non-convex" };
	// Weak convexity admits an all-collinear "pentagon"; a tile needs actual area.
	if (area(pts) < 1e-9) return { ok: false, error: "degenerate" };

	return { ok: true, pentagon: { angles: ang, sides: s, corners: pts, closure } };
}

/**
 * The whole solve: slider values in, pentagon out.
 *
 * `free` are the type's angle sliders in `angleParams` order, `sideValues` its side sliders in
 * `sideParams` order. Both default to the type's own defaults when short.
 */
export function solvePentagon(t: PentagonType, free?: number[], sideValues?: number[]): SolveResult {
	const fa = t.angleParams.map((p, i) => free?.[i] ?? p.def);
	const fs = t.sideParams.map((p, i) => sideValues?.[i] ?? p.def);

	let extra = 0;
	if (t.solveAngle) {
		const pinned = findPinnedAngle(t, fa);
		if (pinned === null) return { ok: false, error: "no-root" };
		extra = pinned;
	}
	return assemble(t, fa, fs, extra);
}

/** Human-readable reason for the sidebar when a tuple has no pentagon. */
export const ERROR_TEXT: Record<PentagonError, string> = {
	"no-root": "no pentagon closes at these values",
	"non-positive-side": "a side length goes to zero",
	"non-convex": "the pentagon stops being convex",
	degenerate: "the constraints go degenerate here",
	"angle-out-of-range": "an angle leaves (0°, 180°)",
};
