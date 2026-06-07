import { describe, it, expect } from "vitest";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import {
	incidenceDisplacements,
	incidenceAnchorSet,
	enumerateNormalizedBranches,
} from "@/classes/algorithm/OrbifoldNormalized";

const R12 = CyclotomicRing.create(12);
const R24 = CyclotomicRing.create(24);
const z = (ring: CyclotomicRing, k: number) => Cyclotomic.zeta(ring, k);

// ----------------------------------------------------------------------------
// Independent oracle: is z a real-scalar multiple of some GRID direction ζ_N^j?
// (z·ζ^{-j} real ⟺ equals its own conjugate). A half-grid direction ζ_{2N}^odd
// is real for NO integer j — that is exactly why a `σ·ζ_N^j` encoding of D drops
// the octagon/square centroid→vertex offsets (the FATAL draft bug).
// ----------------------------------------------------------------------------
function isGridAligned(zz: Cyclotomic, ring: CyclotomicRing): boolean {
	if (zz.isZero()) return true;
	for (let j = 0; j < ring.N; j++) {
		const r = zz.mulZeta((ring.N - j) % ring.N); // z·ζ^{-j}
		if (r.equals(r.conj())) return true; // real ⇒ z = (real)·ζ^j
	}
	return false;
}

function dContains(D: Cyclotomic[], target: Cyclotomic): boolean {
	const k = target.key();
	return D.some((d) => d.key() === k);
}

// ----------------------------------------------------------------------------
// incidenceDisplacements — the DISCRIMINATING regression (Fix A, SYNC 903):
// geometry recovers every 4.8.8@24 / 4.4.4.4@12 vertex; those offsets are
// half-grid (so a ζ_N^j-only D would MISS them). NOT a brittle den===2 assert.
// ----------------------------------------------------------------------------

describe("incidenceDisplacements — half-grid bug regression (4.8.8@24, 4.4.4.4@12)", () => {
	const bugCases: [CyclotomicRing, number, string][] = [
		[R24, 8, "octagon @ N=24 (N/n=3, odd)"],
		[R12, 4, "square @ N=12 (N/n=3, odd)"],
	];
	for (const [ring, n, label] of bugCases) {
		it(`${label}: geometry D recovers every centroid→vertex; the offsets are HALF-grid`, () => {
			const D = incidenceDisplacements(ring, [n]);
			let anyHalfGrid = false;
			for (let dir = 0; dir < ring.N; dir++) {
				const p = RegularPolygon.fromAnchorAndDirExact(n, Cyclotomic.ZERO(ring), dir);
				const c = p.exactCentroid!;
				for (const v of p.exactVertices!) {
					const offset = v.sub(c); // centroid → vertex
					// (i) geometry D contains it ⇒ centroid + offset = v is reached
					expect(dContains(D, offset), `${label} dir=${dir}: offset missing from geometry D`).toBe(true);
					// (ii) it is NOT grid-aligned ⇒ a `σ·ζ_N^j` D provably cannot contain it
					expect(isGridAligned(offset, ring), `${label}: centroid→vertex should be half-grid`).toBe(false);
					anyHalfGrid = true;
				}
			}
			expect(anyHalfGrid).toBe(true);
		});
	}

	it("POSITIVE control: hexagon @ N=24 (N/n=4, even) centroid→vertex IS grid-aligned", () => {
		const p = RegularPolygon.fromAnchorAndDirExact(6, Cyclotomic.ZERO(R24), 0);
		const c = p.exactCentroid!;
		for (const v of p.exactVertices!) {
			if (v.sub(c).isZero()) continue;
			expect(isGridAligned(v.sub(c), R24)).toBe(true);
		}
	});
});

describe("incidenceDisplacements — recovery for every family size + guards", () => {
	it("recovers every vertex of every polygon (centroid + d = v) for {3,4,6,12}@24 and {4,8,12}@24", () => {
		const families: [CyclotomicRing, number[]][] = [
			[R24, [3, 4, 6, 12]],
			[R24, [4, 8, 12]],
			[R12, [3, 4, 6]],
		];
		for (const [ring, sizes] of families) {
			const D = incidenceDisplacements(ring, sizes);
			for (const n of sizes) {
				const p = RegularPolygon.fromAnchorAndDirExact(n, Cyclotomic.ZERO(ring), 1);
				const c = p.exactCentroid!;
				for (const v of p.exactVertices!) {
					expect(dContains(D, v.sub(c)), `n=${n}@${ring.N}: vertex not recoverable`).toBe(true);
				}
			}
			expect(D.length).toBeLessThanOrEqual((2 + sizes.length) * ring.N); // |D| ≤ (2+|sizes|)·N
			expect(dContains(D, Cyclotomic.ZERO(ring))).toBe(true); // the vertex case (0)
		}
	});

	it("guards N % n !== 0 (skips a tile that cannot sit on the grid; no throw)", () => {
		// octagon at N=12: 12 % 8 ≠ 0 ⇒ skipped, not a crash
		expect(() => incidenceDisplacements(R12, [4, 8])).not.toThrow();
		const withOct = incidenceDisplacements(R12, [4, 8]);
		const noOct = incidenceDisplacements(R12, [4]);
		expect(withOct.map((d) => d.key()).sort()).toEqual(noOct.map((d) => d.key()).sort()); // n=8 contributed nothing
	});

	it("memoized by (N, sizes) — identical reference on repeat", () => {
		expect(incidenceDisplacements(R24, [3, 4, 6, 12])).toBe(incidenceDisplacements(R24, [4, 3, 12, 6]));
	});
});

// ----------------------------------------------------------------------------
// incidenceAnchorSet — c=(1−L)⁻¹w centre, ∩ℤ[ζ_N], reduce mod Λ, sorted; the
// (1−L)c==w tripwire; p1→{0}; cyclic-refl→𝒳 fallback.
// ----------------------------------------------------------------------------

describe("incidenceAnchorSet", () => {
	// The orbifold enumeration forces the N=24 ring (holohedry → reSurd). Square lattice at N=24:
	// u=1, v=ζ₂₄⁶ = i ⇒ holohedry D4, sizes {3,4,6,12}, k=2.
	const u = Cyclotomic.ONE(R24);
	const v = z(R24, 6); // ζ₂₄⁶ = i
	const { branches } = enumerateNormalizedBranches(u, v, R24, [3, 4, 6, 12], 2);
	const D = incidenceDisplacements(R24, [3, 4, 6, 12]);

	it("p1 branch seeds at {0}", () => {
		const p1 = branches.find((b) => b.type.kind === "p1")!;
		const A = incidenceAnchorSet(p1, u, v, R24, D);
		expect(A.length).toBe(1);
		expect(A[0].isZero()).toBe(true);
	});

	it("cyclic-refl falls back to the cocycle 𝒳 (B.reAnchorSet)", () => {
		const refl = branches.find((b) => b.type.kind === "cyclic-refl");
		if (refl) expect(incidenceAnchorSet(refl, u, v, R24, D)).toBe(refl.reAnchorSet);
	});

	it("rotation-bearing branches: 𝒜 ⊆ ℤ[ζ_N], deduped, sorted, ≤|D|; centre tripwire passes", () => {
		const rots = branches.filter((b) => b.type.kind === "cyclic-rot" || b.type.kind === "dihedral");
		expect(rots.length).toBeGreaterThan(0);
		for (const B of rots) {
			const A = incidenceAnchorSet(B, u, v, R24, D); // throws if (1−L)c ≠ w
			for (const x of A) expect(x.den).toBe(1n); // ∩ ℤ[ζ_N]
			const keys = A.map((x) => x.key());
			expect(new Set(keys).size).toBe(keys.length); // deduped
			expect([...keys].sort()).toEqual(keys); // sorted by key
			expect(A.length).toBeLessThanOrEqual(D.length);
		}
	});

	it("skipRotationReAnchor: cyclic-rot/dihedral 𝒳 omitted, cyclic-refl 𝒳 kept, incidence still works", () => {
		const full = enumerateNormalizedBranches(u, v, R24, [3, 4, 6, 12], 2);
		const skip = enumerateNormalizedBranches(u, v, R24, [3, 4, 6, 12], 2, { skipRotationReAnchor: true });
		// same branch set (ops/keys unchanged) — only reAnchorSet building differs
		expect(skip.branches.map((b) => b.key).sort()).toEqual(full.branches.map((b) => b.key).sort());
		for (const B of skip.branches) {
			if (B.type.kind === "cyclic-rot" || B.type.kind === "dihedral") expect(B.reAnchorSet.length).toBe(0);
			if (B.type.kind === "cyclic-refl") {
				const f = full.branches.find((b) => b.key === B.key)!;
				expect(B.reAnchorSet.length).toBe(f.reAnchorSet.length); // refl 𝒳 still built (the fallback)
			}
		}
		// no false conservation violation from the skipped (sum=0) rotation types
		expect(skip.diag.rotationConserved).toBe(true);
		expect(skip.diag.reflectionConserved).toBe(true);
		// incidence anchoring still produces seeds from the (skipped-𝒳) rotation branches via the centre
		const Dloc = incidenceDisplacements(R24, [3, 4, 6, 12]);
		let total = 0;
		for (const B of skip.branches) if (B.type.kind === "cyclic-rot" || B.type.kind === "dihedral") total += incidenceAnchorSet(B, u, v, R24, Dloc).length;
		expect(total).toBeGreaterThan(0);
	});

	it("centre tripwire holds on every rotation branch; incidence is non-vacuous overall", () => {
		// incidenceAnchorSet THROWS if (1−L)c ≠ w, so a clean pass over all rotation branches is the
		// per-branch centre check. An INDIVIDUAL branch may have 𝒜 = ∅ (a junk branch no tiling
		// realizes ⇒ no integral incidence point ⇒ the fill correctly seeds nothing). But across all
		// rotation branches the total seed count must be positive (incidence does produce seeds).
		const rots = branches.filter((b) => b.type.kind === "cyclic-rot" || b.type.kind === "dihedral");
		let total = 0;
		for (const B of rots) total += incidenceAnchorSet(B, u, v, R24, D).length;
		expect(total).toBeGreaterThan(0);
	});
});
