// Certified Dirichlet fundamental domain of a developed hyperbolic tiling's deck group Γ, around the
// seed vertex (disk origin). This is the piece that makes the per-pixel renderer PROVABLY hole-free:
//
//   * Orbit: the seed-dart instance frames of a deep develop are exactly Γ (covering-space theory); their
//     images of 0 are the orbit Γ·0. Enumerated with the conformally-scaled dedup grid (deepDedup), which
//     stays sound at the depths the certificate needs.
//   * Domain: D = the Voronoi/Dirichlet cell of 0 in Γ·0. In the KLEIN model every perpendicular bisector
//     of (0, γ·0) is the straight chord x·u = tanh(d/2) — which equals the POINCARÉ Euclid radius of γ·0 —
//     so D is a convex Euclidean polygon computed by plain half-plane clipping.
//   * Certificate (Dirichlet cut-off lemma, cf. Voight 2009 Alg. 4.7 / SnapPea): if the orbit is complete
//     to radius R_complete and 2·R_D + δ ≤ R_complete, then every omitted orbit point's bisector lies at
//     distance ≥ R_complete/2 > R_D from 0 and cannot cut D — the computed D IS the true Dirichlet domain
//     and its supporting bisectors are the COMPLETE side-pairing set.
//   * Reduction guarantee (Voight 2009 Prop. 4.4): greedy "apply the generator that most reduces d(w,0)"
//     over that complete set terminates with w ∈ D̄ — a spurious local minimum outside D is impossible,
//     which is exactly the failure mode of the old heuristic generator set (the k=2 holes).
//
// Everything here is f64 CPU math; the shader consumes the result (lib/render/hyperbolicReduce.ts).

import {
	type Complex,
	type Su11,
	su11Apply,
	su11Identity,
	su11Inverse,
} from "@/lib/render/hyperbolic";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";

/** One supporting bisector of D as a Klein-model half-plane x·u ≤ c (u unit, c = Poincaré radius of γ·0). */
export interface HalfPlane {
	ux: number;
	uy: number;
	c: number;
}

export interface DirichletDomain {
	certified: true;
	/** Complete side-pairing set ∪ inverses (deduped) — the reduction generators. */
	gens: Su11[];
	/** The supporting half-planes (Klein model). D = their intersection; membership test = all slacks ≥ 0. */
	halfPlanes: HalfPlane[];
	/** D as a convex polygon in the Klein model (diagnostics/tests). */
	polyKlein: [number, number][];
	/** Hyperbolic circumradius of D (max distance 0 → vertex). */
	RD: number;
	/** Hyperbolic inradius of D (min distance 0 → side). */
	rInHyp: number;
	/** Poincaré Euclid circumradius = tanh(RD/2): the lookup field must cover this. */
	rPEu: number;
	/** Poincaré Euclid inradius = tanh(rInHyp/2): |w| below this ⇒ inside D (shader early exit). */
	rInEu: number;
	stats: { orbit: number; sides: number; instances: number; Rcomplete: number; ms: number };
}

export type DirichletResult = DirichletDomain | { certified: false; reason: string };

const DELTA = 0.1; // certificate slack
const SIDE_TOL = 1e-7; // Klein-units slack for "bisector supports the polygon" (overcapture is harmless)

type Pt = [number, number];

/** Clip a convex polygon by the half-plane n·x ≤ c. */
function clipPoly(poly: Pt[], ux: number, uy: number, c: number): Pt[] {
	const out: Pt[] = [];
	const n = poly.length;
	for (let i = 0; i < n; i++) {
		const a = poly[i];
		const b = poly[(i + 1) % n];
		const da = ux * a[0] + uy * a[1] - c;
		const db = ux * b[0] + uy * b[1] - c;
		if (da <= 0) out.push(a);
		if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
			const t = da / (da - db);
			out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
		}
	}
	return out;
}

/**
 * Greedy Dirichlet reduction: repeatedly apply the generator that most reduces |w| (monotone in the
 * hyperbolic distance to 0) until none improves — with a COMPLETE side-pairing set that stop condition
 * IS membership in D̄ (Voight 2009 Prop. 4.4). `rInEu` short-circuits the common case. The CPU twin of
 * the fragment-shader loop; used by the field baker, the view re-anchor, and the tests.
 */
export function foldIntoDomain(
	gens: Su11[],
	w0: Complex,
	rInEu: number,
	maxIter = 96,
): { w: Complex; iters: number } {
	let w = w0;
	let iters = 0;
	for (; iters < maxIter; iters++) {
		const r2 = w.x * w.x + w.y * w.y;
		if (r2 <= rInEu * rInEu) break;
		let bestR2 = r2 - 1e-12;
		let best: Complex | null = null;
		for (const g of gens) {
			const q = su11Apply(g, w);
			const qr2 = q.x * q.x + q.y * q.y;
			if (qr2 < bestR2) {
				bestR2 = qr2;
				best = q;
			}
		}
		if (!best) break; // no generator improves ⇒ w ∈ D̄ (complete side pairings)
		w = best;
	}
	return { w, iters };
}

/**
 * Build the certified Dirichlet domain for the deck group of the tiling given by its quotient darts and
 * forced edge length. Fails LOUDLY (reason string) rather than returning an uncertified guess.
 */
export function buildDirichletDomain(
	darts: Darts,
	edge: number,
	opts: { maxInstances?: number; maxRounds?: number } = {},
): DirichletResult {
	const t0 = Date.now();
	const maxInstances = opts.maxInstances ?? 1_500_000;
	const maxRounds = opts.maxRounds ?? 14;

	// flood-fill connectivity margin: any instance with vertex in B(R) is reachable through instances
	// with vertices in B(R + 2·rMaxTile) (walk the tiles crossed by the geodesic 0 → vertex).
	let rMaxTile = 0;
	for (const p of darts.lvert) {
		if (!(p >= 3)) return { certified: false, reason: `non-polygonal face size ${p} in lvert` };
		rMaxTile = Math.max(rMaxTile, Math.asinh(Math.sinh(edge / 2) / Math.sin(Math.PI / p)));
	}
	const M = 2 * rMaxTile + 0.15;

	const dev = new HyperbolicDeveloper(darts, edge, { deepDedup: true });
	const idView = su11Identity();

	let Rcomplete = 2.5;
	for (let round = 0; round < maxRounds; round++) {
		const Rdev = Rcomplete + M;
		const boundEu = Math.tanh(Rdev / 2);
		if (boundEu > 0.99995) {
			return { certified: false, reason: `develop bound ${boundEu.toFixed(6)} beyond the safe rim (Rdev=${Rdev.toFixed(2)})` };
		}
		if (!dev.extendTo(idView, boundEu, maxInstances)) {
			return { certified: false, reason: `develop capped at ${maxInstances} instances (Rdev=${Rdev.toFixed(2)})` };
		}

		// orbit Γ·0 within the completeness radius, deduped by position
		const frames = dev.deckFrames();
		const orbit: { q: Complex; r: number; frame: Su11 }[] = [];
		const seen = new Set<string>();
		for (const G of frames) {
			const q = su11Apply(G, { x: 0, y: 0 });
			const r = Math.hypot(q.x, q.y);
			if (r < 1e-9) continue; // stabilizer of 0 — no bisector
			if (2 * Math.atanh(Math.min(r, 1 - 1e-15)) > Rcomplete) continue;
			const key = `${Math.round(q.x * 1e6)},${Math.round(q.y * 1e6)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			orbit.push({ q, r, frame: G });
		}
		if (orbit.length >= 3) {
			// Dirichlet polygon: clip a big square by every bisector chord x·u = r (Klein model)
			let poly: Pt[] = [
				[-2, -2],
				[2, -2],
				[2, 2],
				[-2, 2],
			];
			for (const o of orbit) poly = clipPoly(poly, o.q.x / o.r, o.q.y / o.r, o.r);
			const bounded = poly.length >= 3 && poly.every(([x, y]) => x * x + y * y < 1 - 1e-9);
			if (bounded) {
				let RD = 0;
				for (const [x, y] of poly) RD = Math.max(RD, Math.atanh(Math.min(Math.hypot(x, y), 1 - 1e-12)));
				if (2 * RD + DELTA <= Rcomplete) {
					// CERTIFIED. Extract the supporting bisectors (sides).
					const sideFrames: Su11[] = [];
					const halfPlanes: HalfPlane[] = [];
					let rInHyp = Infinity;
					for (const o of orbit) {
						const ux = o.q.x / o.r;
						const uy = o.q.y / o.r;
						let minSlack = Infinity;
						for (const [x, y] of poly) minSlack = Math.min(minSlack, o.r - (x * ux + y * uy));
						if (minSlack < SIDE_TOL) {
							sideFrames.push(o.frame);
							halfPlanes.push({ ux, uy, c: o.r });
							rInHyp = Math.min(rInHyp, Math.atanh(o.r)); // distance 0 → chord
						}
					}
					// gens = sides ∪ inverses, deduped
					const gens: Su11[] = [];
					const gseen = new Set<string>();
					for (const f of sideFrames) {
						for (const g of [f, su11Inverse(f)]) {
							const key = `${Math.round(g.a.x * 1e9)},${Math.round(g.a.y * 1e9)},${Math.round(g.b.x * 1e9)},${Math.round(g.b.y * 1e9)}`;
							if (gseen.has(key)) continue;
							gseen.add(key);
							gens.push(g);
						}
					}
					return {
						certified: true,
						gens,
						halfPlanes,
						polyKlein: poly,
						RD,
						rInHyp,
						rPEu: Math.tanh(RD / 2),
						rInEu: Math.tanh(rInHyp / 2),
						stats: {
							orbit: orbit.length,
							sides: sideFrames.length,
							instances: dev.instanceCount(),
							Rcomplete,
							ms: Date.now() - t0,
						},
					};
				}
				// bounded but not yet certified: jump straight to the radius the certificate demands
				Rcomplete = Math.max(Rcomplete * 1.15, 2 * RD + DELTA + 0.1);
				continue;
			}
		}
		Rcomplete += 1.0; // unbounded/too-few-points: grow gradually (the polygon radius is meaningless here)
	}
	return { certified: false, reason: `no certificate after ${maxRounds} rounds (Rcomplete=${Rcomplete.toFixed(2)})` };
}
