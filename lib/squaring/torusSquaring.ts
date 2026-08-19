// Squared tori: the Brooks–Smith–Stone–Tutte construction one genus up.
//
// On a sphere you must pick a battery edge, because a harmonic function on a finite graph with no
// boundary is constant and the battery is what breaks that. On a torus the potential can instead be
// QUASI-periodic — rising by a fixed amount each time you cross the cell — so nothing has to be
// removed, and what you choose instead is a class in H¹(T;ℝ) ≅ ℝ². That space is 2-dimensional, and
// scaling a class only scales the tiling, so every periodic tiling carries a whole circle of squared
// tori where a polyhedron carries one rectangle per edge orbit. The integral classes (m, n) are the
// ones with integer sides, and this module builds those.
//
// Everything else transfers unchanged. The potential V is the y-coordinate, the stream function ψ on
// faces is the x-coordinate, and each edge becomes a square because its current equals both the drop
// in V and the jump in ψ. The output is a square tiling of a flat torus, equivalently a doubly
// periodic square tiling of the plane.
//
// Genus 1 is the last genus where this stays a flat picture, and the reason is Gauss–Bonnet: cone
// angles in such a tiling are forced to be 2πk for integer k ≥ 1, and Σ(2π − angle) = 2πχ. At χ = 0
// every k must be 1, so there are no cone points. At genus ≥ 2, χ < 0 forces Σ(kᵢ − 1) = 2g − 2 > 0
// cone points and the result is a translation surface, not a plane tiling. See Chien, "Square tilings
// of surfaces from discrete harmonic 1-chains" (Rutgers PhD, 2015), Theorem 3.3.1, and Kenyon,
// "Tilings and discrete Dirichlet problems", Israel J. Math. 105 (1998) 61–84.
//
// Exactness. Sides here are decimal STRINGS for the same reason as the spherical shelf: they are
// exact integers that a double cannot always tell apart, and "all sides distinct" is the property the
// whole subject turns on. The solve is integer throughout — Bareiss for the reduced Laplacian, then a
// 2×2 Cramer for the two stream periods — with a single gcd at the end.

import { bareissSolve, gcdAll } from "./linalg";
import type { TorusMap } from "./torusMap";

export interface TorusSquare {
	/** Bottom-left corner and side, exact decimal integer strings. */
	x: string;
	y: string;
	side: string;
	/** Which edge of the quotient produced this tile. */
	edge: number;
}

export interface TorusSquaring {
	/** The homology class (m, n): the potential rises by m across a₁ and by n across a₂. */
	cls: [number, number];
	squares: TorusSquare[];
	/** The image lattice, as the two plane translations the tiling repeats by. */
	lattice: [[string, string], [string, string]];
	/** |det| of that lattice. Equals Σ side², which is the discrete Riemann bilinear relation. */
	covolume: string;
	order: number;
	distinct: number;
	perfect: boolean;
	/** Edges whose current came out zero; they contribute no tile. */
	degenerate: number;
	/** Potential per vertex and stream function per face, in the tiling's own units. For the diagram. */
	potential: string[];
	psi: string[];
	/**
	 * Set when the class is not integral, so these numbers came out of a float blend of two exact solves
	 * and not out of a solve of their own. The tiling is a real squared torus either way; what is gone is
	 * the ability to say two sides are equal, so `distinct` and `perfect` are not claims here.
	 */
	approx?: boolean;
}

export interface TorusSquaringFailure {
	reason: "singular" | "inconsistent" | "degenerate-lattice" | "area";
	detail: string;
}

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

export interface TorusCurrents {
	/** det of the reduced Laplacian. The units everything below is expressed in; never zero. */
	D: bigint;
	/** D·V at each vertex, so an integer. */
	P: bigint[];
	/** D·current on each edge, signed. Its absolute value is the side of that edge's square. */
	omega: bigint[];
}

/**
 * The harmonic current on every edge at the class (m, n), exactly, in units of 1/D.
 *
 * Split out of `squareTorus` because it is the half that is LINEAR in (m, n): D is the determinant of
 * the reduced Laplacian, which is built from the darts alone and so does not see the class at all, and
 * the class enters only through the right-hand side. So omega(m, n) = m·omega(1,0) + n·omega(0,1), and
 * two calls to this function give the exact coefficients every square's side is a linear form in. That
 * is what lib/squaring/torusSqDomains.ts is built on.
 */
export function torusCurrents(
	map: TorusMap,
	m: number,
	n: number,
): { ok: true; currents: TorusCurrents } | { ok: false; detail: string } {
	const A: [bigint, bigint] = [BigInt(m), BigInt(n)];
	const { V, darts, edges } = map;

	// Unknowns are V(1)…V(V-1) with V(0) pinned at zero. Kirchhoff's current law at vertex u says the
	// currents on the darts leaving u sum to zero, and a current is the potential drop, so this is the
	// reduced Laplacian with the lattice shifts moved to the right-hand side.
	let D: bigint;
	const P: bigint[] = new Array<bigint>(V).fill(0n);
	if (V === 1) {
		D = 1n;
	} else {
		const M: bigint[][] = Array.from({ length: V - 1 }, () => new Array<bigint>(V - 1).fill(0n));
		const rhs: bigint[] = new Array<bigint>(V - 1).fill(0n);
		for (const d of darts) {
			const u = d.tail;
			if (u === 0) continue;
			M[u - 1][u - 1] -= 1n;
			if (d.head !== 0) M[u - 1][d.head - 1] += 1n;
			rhs[u - 1] -= BigInt(d.vshift[0]) * A[0] + BigInt(d.vshift[1]) * A[1];
		}
		let sol;
		try {
			sol = bareissSolve(M, rhs);
		} catch (e) {
			return { ok: false, detail: String(e) };
		}
		D = sol.det;
		for (let i = 0; i < V - 1; i++) P[i + 1] = sol.numer[i];
	}

	const omega: bigint[] = edges.map(
		(e) => P[e.head] + D * (BigInt(e.vshift[0]) * A[0] + BigInt(e.vshift[1]) * A[1]) - P[e.tail],
	);
	return { ok: true, currents: { D, P, omega } };
}

/**
 * The exact solve at one integral class, before any normalisation, in common units of 1/(D·delta).
 *
 * Split out because every field of it is LINEAR in (m, n) — `delta` comes from the lattice shifts alone
 * and never sees the class — so two of these, at (1,0) and (0,1), span the whole family and a class off
 * the integer lattice is a float blend of them. See lib/squaring/torusSqDomains.ts.
 */
export interface TorusRaw {
	/** Signed side per edge. Its sign decides which corner of the square the anchor is. */
	side: bigint[];
	/** Anchor per edge, before that sign adjustment. */
	x0: bigint[];
	y0: bigint[];
	/** delta·V per vertex, and the stream function per face. */
	potential: bigint[];
	psi: bigint[];
	lattice: [[bigint, bigint], [bigint, bigint]];
	covolume: bigint;
}

/**
 * The exact solve at the class (m, n), stopping short of the gcd and the string assembly.
 *
 * Returns null-ish failures instead of throwing so a build script can tally them. `inconsistent` is
 * the interesting one: it means the stream function did not close up, which IS Kirchhoff's current
 * law failing, so it can only fire if the quotient map is wrong.
 */
export function torusRaw(
	map: TorusMap,
	m: number,
	n: number,
): { ok: true; raw: TorusRaw } | { ok: false; error: TorusSquaringFailure } {
	const A: [bigint, bigint] = [BigInt(m), BigInt(n)];
	const { V, F, darts, faces, edges, edgeOf, signOf, twin } = map;

	// ---- the potential: harmonic at every vertex, rising by (m, n) across the cell ----------------
	const flow = torusCurrents(map, m, n);
	if (flow.ok === false) return { ok: false, error: { reason: "singular", detail: flow.detail } };
	const { D, P, omega } = flow.currents;
	const omegaDart = (i: number): bigint => BigInt(signOf[i]) * omega[edgeOf[i]];

	// ---- the stream function: a potential on FACES, quasi-periodic with its own two periods --------
	// ψ is carried across the dual by BFS. Its periods B₁, B₂ are unknown at the start, so each face
	// holds ψ as an affine expression a + b·B₁ + c·B₂ and the loops that close give linear equations
	// in the two unknowns. Two independent ones fix B; every remaining equation is a check.
	const st: { a: bigint; b: bigint; c: bigint }[] = Array.from({ length: F }, () => ({ a: 0n, b: 0n, c: 0n }));
	const seen = new Array<boolean>(F).fill(false);
	const eqs: { r: bigint; p: bigint; q: bigint }[] = [];
	seen[0] = true;
	const queue = [0];
	while (queue.length > 0) {
		const f = queue.shift() as number;
		for (const i of faces[f]) {
			const j = twin[i];
			const g = darts[j].face;
			const lam0 = BigInt(darts[i].ms[0] - darts[j].ms[0]);
			const lam1 = BigInt(darts[i].ms[1] - darts[j].ms[1]);
			const a = st[f].a + omegaDart(i);
			const b = st[f].b - lam0;
			const c = st[f].c - lam1;
			if (!seen[g]) {
				seen[g] = true;
				st[g] = { a, b, c };
				queue.push(g);
			} else {
				eqs.push({ r: a - st[g].a, p: b - st[g].b, q: c - st[g].c });
			}
		}
	}

	let delta = 0n;
	let X1 = 0n;
	let X2 = 0n;
	outer: for (let i = 0; i < eqs.length; i++) {
		for (let j = i + 1; j < eqs.length; j++) {
			const d = eqs[i].p * eqs[j].q - eqs[j].p * eqs[i].q;
			if (d === 0n) continue;
			delta = d;
			X1 = -eqs[i].r * eqs[j].q + eqs[j].r * eqs[i].q;
			X2 = -eqs[j].r * eqs[i].p + eqs[i].r * eqs[j].p;
			break outer;
		}
	}
	if (delta === 0n) {
		return { ok: false, error: { reason: "degenerate-lattice", detail: "the two stream periods are dependent" } };
	}
	if (delta < 0n) {
		// A point reflection of the whole picture; harmless, and it keeps the scale positive.
		delta = -delta;
		X1 = -X1;
		X2 = -X2;
	}
	for (const e of eqs) {
		if (delta * e.r + e.p * X1 + e.q * X2 !== 0n) {
			return { ok: false, error: { reason: "inconsistent", detail: "stream function does not close (KCL fails)" } };
		}
	}

	// ---- assemble, in common units of 1/(D·delta) --------------------------------------------------
	const psi: bigint[] = st.map((s) => delta * s.a + s.b * X1 + s.c * X2);
	const side: bigint[] = omega.map((w) => delta * w);
	const yAt = (v: number, shift: readonly [number, number]): bigint =>
		delta * (P[v] + D * (BigInt(shift[0]) * A[0] + BigInt(shift[1]) * A[1]));

	const L: [[bigint, bigint], [bigint, bigint]] = [
		[X1, delta * D * A[0]],
		[X2, delta * D * A[1]],
	];
	const covol = abs(L[0][0] * L[1][1] - L[0][1] * L[1][0]);
	if (covol === 0n) {
		return { ok: false, error: { reason: "degenerate-lattice", detail: "image lattice has rank < 2" } };
	}

	// The Riemann bilinear relation, Σ side² = covolume, is the certificate that this really tiles the
	// torus. It is not a sanity check bolted on afterwards: it is the identity ‖ω‖² = ∫ ω ∧ ⋆ω, and it
	// fails the moment the potential or the stream function is wrong.
	const areaSum = side.reduce((acc, s) => acc + s * s, 0n);
	if (areaSum !== covol) {
		return { ok: false, error: { reason: "area", detail: `Σ side² = ${areaSum}, covolume = ${covol}` } };
	}

	return {
		ok: true,
		raw: {
			side,
			x0: edges.map((e) => psi[darts[e.dart].face]),
			y0: edges.map((e) => yAt(e.tail, darts[e.dart].tshift)),
			potential: P.map((p) => delta * p).slice(0, V),
			psi,
			lattice: L,
			covolume: covol,
		},
	};
}

/**
 * The square tiling of the flat torus determined by the homology class (m, n), exactly.
 *
 * Sides come back as decimal strings because they are integers a double cannot always tell apart, and
 * "all sides distinct" is the property this whole subject turns on.
 */
export function squareTorus(
	map: TorusMap,
	m: number,
	n: number,
): { ok: true; squaring: TorusSquaring } | { ok: false; error: TorusSquaringFailure } {
	const solved = torusRaw(map, m, n);
	if (solved.ok === false) return solved;
	const { side, x0, y0, potential, psi, lattice: L, covolume: covol } = solved.raw;

	const raw = side.map((s, i) => ({
		x: s < 0n ? x0[i] + s : x0[i],
		y: s < 0n ? y0[i] + s : y0[i],
		side: abs(s),
		edge: i,
	}));

	const g =
		gcdAll([
			...raw.flatMap((r) => [r.x, r.y, r.side]),
			...psi,
			L[0][0],
			L[0][1],
			L[1][0],
			L[1][1],
		]) || 1n;
	const squares = raw
		.filter((r) => r.side !== 0n)
		.map((r) => ({ x: (r.x / g).toString(), y: (r.y / g).toString(), side: (r.side / g).toString(), edge: r.edge }));
	const sides = squares.map((s) => s.side);
	const distinct = new Set(sides).size;

	return {
		ok: true,
		squaring: {
			cls: [m, n],
			squares,
			lattice: [
				[(L[0][0] / g).toString(), (L[0][1] / g).toString()],
				[(L[1][0] / g).toString(), (L[1][1] / g).toString()],
			],
			covolume: (covol / (g * g)).toString(),
			order: squares.length,
			distinct,
			perfect: distinct === squares.length && squares.length >= 2,
			degenerate: raw.length - squares.length,
			potential: potential.map((p) => (p / g).toString()),
			psi: psi.map((p) => (p / g).toString()),
		},
	};
}

/** Coprime classes (m, n), one per direction, which is one per distinct squared torus. */
export function torusClasses(limit: number): [number, number][] {
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
