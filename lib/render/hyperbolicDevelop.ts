// Hyperbolic developer — geometric core. In the hyperbolic plane a regular polygon has no fixed size: its
// interior angle shrinks monotonically from the Euclidean value (edge → 0) to 0 (edge → ∞). So a vertex
// configuration (the multiset of polygon sizes meeting at a point) does not pick its edge length, the edge
// length is FORCED by the requirement that the angles sum to 2π. This module solves for that length. It is
// the positive-curvature twin of the spherical ρ-solve (tools/ctrnact-oracle/develop_spherical.py) and the
// TS port of Marek's `arcmedge` / the validated experiments/hyperbolic/hyp_realize.py. Pure functions, no
// WebGL and no store, so the maths is unit-testable in isolation (mirrors lib/render/hyperbolic.ts).
//
// A regular n-gon is written with n = Infinity for an apeirogon (cos(π/∞) = cos 0 = 1 falls out cleanly).

import {
	type Complex,
	type Su11,
	hypDist,
	hypMidpoint,
	geodesicMove,
	geodesicTangentAt,
	su11Translation,
	su11Rotation,
	su11Mul,
	su11Inverse,
	su11Apply,
} from "@/lib/render/hyperbolic";

const TWO_PI = 2 * Math.PI;

/** Euclidean interior angle of a regular n-gon (π(n−2)/n; π for an apeirogon). */
function euclideanAngle(sides: number): number {
	return sides === Infinity ? Math.PI : (Math.PI * (sides - 2)) / sides;
}

/** Sum of Euclidean interior angles of a vertex configuration. Its comparison with 2π is the geometry
 *  gate: < 2π spherical, = 2π Euclidean, > 2π hyperbolic. */
export function euclideanAngleSum(config: number[]): number {
	return config.reduce((s, n) => s + euclideanAngle(n), 0);
}

/**
 * Interior angle of a regular n-gon of edge length `edgeLen` in the hyperbolic plane (curvature −1):
 *   α(n, ℓ) = 2·asin( cos(π/n) / cosh(ℓ/2) ).
 * Strictly decreasing in ℓ; α(n, 0⁺) = π(n−2)/n; α(n, ∞) = 0. Validated against Hirsch–Li–Petty–Xue
 * (arXiv:1910.12966) and Coxeter (1997) in docs/hyperbolic-port-notes-2026-07-12.md.
 */
export function interiorAngle(sides: number, edgeLen: number): number {
	const r = Math.cos(Math.PI / sides) / Math.cosh(edgeLen / 2);
	return 2 * Math.asin(Math.min(1, Math.max(-1, r)));
}

/** Closed-form edge length of the regular {p,q} tiling: cosh(ℓ/2) = cos(π/p)/sin(π/q). Returns null when
 *  {p,q} is not hyperbolic (cos(π/p)/sin(π/q) ≤ 1, i.e. 1/p + 1/q ≥ 1/2). */
export function regularEdgeLength(p: number, q: number): number | null {
	const v = Math.cos(Math.PI / p) / Math.sin(Math.PI / q);
	return v > 1 + 1e-15 ? 2 * Math.acosh(v) : null;
}

/**
 * The forced edge length of a hyperbolic vertex configuration: the unique ℓ > 0 with Σ α(nᵢ, ℓ) = 2π.
 * Returns null when the configuration is not hyperbolic (Euclidean angle sum ≤ 2π), so there is no such ℓ.
 * Monotone bisection; the angle sum is strictly decreasing in ℓ, so the root is unique.
 *
 * Necessary, not sufficient: a valid edge length means the metric is consistent, not that a connected
 * edge-to-edge tiling assembles. That combinatorial question is the Čtrnáct search, not this check.
 */
export function solveEdgeLength(config: number[], tol = 1e-12): number | null {
	if (euclideanAngleSum(config) <= TWO_PI + 1e-12) return null;
	const f = (l: number) => config.reduce((s, n) => s + interiorAngle(n, l), 0) - TWO_PI;
	let lo = 0;
	let hi = 1;
	// f(lo→0) > 0 (Euclidean sum > 2π); grow hi until f(hi) < 0.
	while (f(hi) > 0) {
		hi *= 2;
		if (hi > 1e7) return null; // unreachable for a real hyperbolic config; guards a bad input
	}
	for (let i = 0; i < 200; i++) {
		const mid = 0.5 * (lo + hi);
		if (f(mid) > 0) lo = mid;
		else hi = mid;
		if (hi - lo < tol) break;
	}
	return 0.5 * (lo + hi);
}

/** Circumradius of a regular `sides`-gon with hyperbolic edge length `edgeLen`.
 *  cosh(ℓ) = cosh²R − sinh²R·cos(2π/m) ⇒ cosh²R = (cosh ℓ − c)/(1 − c), c = cos(2π/m). */
function circumradius(sides: number, edgeLen: number): number {
	const c = Math.cos(TWO_PI / sides);
	const C2 = (Math.cosh(edgeLen) - c) / (1 - c);
	return Math.acosh(Math.sqrt(Math.max(1, C2)));
}

/** SU(1,1) rotation by `theta` about a disk point (translate the centre to O, rotate, translate back). */
function rotationAbout(center: Complex, theta: number): Su11 {
	const T = su11Translation(center);
	return su11Mul(su11Mul(T, su11Rotation(theta)), su11Inverse(T));
}

/**
 * Place a regular `sides`-gon that has `a`→`b` as one edge, on the side of the edge AWAY from `avoid`.
 * The engine's general move: unlike a whole-tile reflection (which can only make another copy of the SAME
 * polygon), this builds a neighbour of ANY polygon size sharing a given edge, which is what develops a
 * tiling with mixed tile types. The centre sits on the edge's perpendicular bisector at the polygon's
 * apothem (sinh·apothem = tanh(ℓ/2)/tan(π/m)); the polygon is the orbit of `a` under the m-fold rotation
 * about that centre. Returns the `sides` vertices in order starting at `a`.
 */
export function placePolygonOnEdge(a: Complex, b: Complex, sides: number, avoid: Complex): Complex[] {
	const edgeLen = hypDist(a, b);
	const apothem = Math.asinh(Math.tanh(edgeLen / 2) / Math.tan(Math.PI / sides));
	const m = hypMidpoint(a, b);
	// Perpendicular to the edge at the midpoint (the disk is conformal, so a Euclidean 90° turn is a
	// hyperbolic 90° turn). Two candidate centres, one on each side; two rotation senses.
	const t = geodesicTangentAt(m, b);
	const perp: Complex = { x: -t.y, y: t.x };
	const towardPos: Complex = { x: m.x + perp.x * 0.1, y: m.y + perp.y * 0.1 };
	const towardNeg: Complex = { x: m.x - perp.x * 0.1, y: m.y - perp.y * 0.1 };
	const wedge = TWO_PI / sides;

	let best: { verts: Complex[]; d: number } | null = null;
	for (const toward of [towardPos, towardNeg]) {
		const center = geodesicMove(m, toward, apothem);
		for (const sign of [1, -1]) {
			const rot = rotationAbout(center, sign * wedge);
			const mapped = su11Apply(rot, a);
			const err = Math.hypot(mapped.x - b.x, mapped.y - b.y);
			if (err > 1e-6) continue; // this (side, sense) does not send a → b: not the polygon on this edge
			const verts: Complex[] = [a];
			let v = a;
			for (let i = 1; i < sides; i++) {
				v = su11Apply(rot, v);
				verts.push(v);
			}
			// centroid distance from `avoid`: pick the polygon on the far side of the edge.
			let cx = 0, cy = 0;
			for (const p of verts) {
				cx += p.x;
				cy += p.y;
			}
			cx /= sides;
			cy /= sides;
			const d = Math.hypot(cx - avoid.x, cy - avoid.y);
			if (!best || d > best.d) best = { verts, d };
		}
	}
	if (!best) throw new Error(`placePolygonOnEdge: no ${sides}-gon fits edge (${a.x},${a.y})-(${b.x},${b.y})`);
	return best.verts;
}
