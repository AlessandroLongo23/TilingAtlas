import { describe, expect, it } from "vitest";
import { SPHERICAL_SOLIDS } from "./sphericalSolids";
import { flatSolidTriangles, solidFitScale, straightEdges } from "./sphericalGeometry";
import { SPH_NOT_INSCRIBED } from "@/lib/tilings/sph-inscribed";

// THE RENDERER MUST NOT RESHAPE THE SOLID.
//
// The polyhedron views used to push every vertex out to the sphere of `radius`. On a solid whose corners
// all sit at one radius that is a uniform scale and harmless, which is why it survived for as long as the
// shelf held only Platonic and Archimedean solids. Nineteen of the sixty-four have no circumsphere, and
// on those it bent every face out of shape: AL asked whether J31 really had regular faces (2026-08-21).
// It does — the data was never wrong. These tests measure what the RENDERER produces, so the next
// well-meaning normalise fails here instead of on screen.

type V3 = [number, number, number];
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Tolerance on SHAPE. Not machine epsilon: the Platonic and Archimedean vertex tables are hand-written
// decimals, so the icosahedron's edges already disagree at 2.1e-8 and the pentagonal prism's at 1.3e-9
// in the source data. 1e-6 is four orders tighter than the thing being guarded against — inflating J31
// onto a sphere it does not have moves its edges by a few percent — and still an order looser than the
// worst honest rounding on the shelf.
const SHAPE_TOL = 1e-6;

describe("solidFitScale", () => {
	// ⚑ Measured on pairwise DISTANCES, not on radii. A radius ratio divides by |v|, which is zero for a
	// vertex sitting at the origin — and develop_euclid's flood fill starts there, so its raw records
	// have one. Distances are the shape; they are what a uniform scale must multiply by one factor.
	it("is one factor for the whole solid, so shape is preserved", () => {
		for (const s of SPHERICAL_SOLIDS) {
			const V = s.vertices as V3[];
			const out = solidFitScale(s, 1);
			const ratios: number[] = [];
			for (let i = 0; i < V.length; i++) {
				for (let j = i + 1; j < V.length; j++) {
					const a = dist(V[i], V[j]);
					if (a < 1e-9) continue;
					ratios.push(dist(out[i] as V3, out[j] as V3) / a);
				}
			}
			const spread = Math.max(...ratios) - Math.min(...ratios);
			expect(spread, `${s.id} scaled by a varying factor`).toBeLessThan(1e-9);
		}
	});

	it("puts the farthest vertex at the requested radius", () => {
		for (const s of SPHERICAL_SOLIDS) {
			const far = Math.max(...solidFitScale(s, 2).map((v) => Math.hypot(...v)));
			expect(far, s.id).toBeCloseTo(2, 9);
		}
	});
});

describe("the drawn polyhedron", () => {
	it("keeps every edge the same length on all 64 solids", () => {
		for (const s of SPHERICAL_SOLIDS) {
			const segs = straightEdges(s, 1, 0);
			const lens = segs.map((f) => dist([f[0], f[1], f[2]], [f[3], f[4], f[5]]));
			const spread = (Math.max(...lens) - Math.min(...lens)) / Math.max(...lens);
			expect(spread, `${s.id} edge lengths differ by ${spread.toExponential(2)}`).toBeLessThan(SHAPE_TOL);
		}
	});

	it("keeps every drawn face planar and equilateral", () => {
		for (const s of SPHERICAL_SOLIDS) {
			const V = solidFitScale(s, 1);
			for (const f of s.faces) {
				const es = f.map((v, i) => dist(V[v], V[f[(i + 1) % f.length]]));
				const spread = (Math.max(...es) - Math.min(...es)) / Math.max(...es);
				expect(spread, `${s.id}: a drawn ${f.length}-gon is not equilateral`).toBeLessThan(SHAPE_TOL);
			}
		}
	});

	// The bug had a signature: a solid with no circumsphere came back with its corners on one. If the
	// facets ever land on a sphere again for these nineteen, that is the normalise coming back.
	it("does NOT put a non-inscribable solid's corners on a sphere", () => {
		for (const s of SPHERICAL_SOLIDS) {
			if (!SPH_NOT_INSCRIBED.has(s.id)) continue;
			const { positions } = flatSolidTriangles(s, 1);
			const radii: number[] = [];
			for (let i = 0; i < positions.length; i += 3) {
				radii.push(Math.hypot(positions[i], positions[i + 1], positions[i + 2]));
			}
			const spread = Math.max(...radii) - Math.min(...radii);
			expect(spread, `${s.id} was inflated onto a sphere it does not have`).toBeGreaterThan(1e-3);
		}
	});
});
