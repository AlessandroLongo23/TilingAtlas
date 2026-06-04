import { describe, it, expect } from "vitest";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import { Surd, surdToCyclotomic, detSurd } from "@/classes/algorithm/exact/Surd";
import { LatticeEnumerator, gridDirOf, sameLattice, shortVectorPool, vcAreaSet, holohedry, vcAreaMinVerts, areaKey } from "@/classes/algorithm/LatticeEnumerator";

const ring = CyclotomicRing.create(24);
const ONE = Cyclotomic.ONE(ring);
const realCyc = (s: Surd) => surdToCyclotomic(s, ring);
/** ζ^dir · (real surd value) — a grid-aligned vector at 15°·dir of the given exact length. */
const atDir = (s: Surd, dir: number) => realCyc(s).mulZeta(dir);

// The 5 currently-missing 2-uniform tilings, as exact primitive bases (from the oracle, this session).
// cmm (index 2) cells: (edge, ½(edge + ζ⁶·h_conv)); rect (index 1): (edge, ζ⁶·h).
const i90 = 6; // ζ⁶ = i (90°)
const cmm = (hConv: Surd) => ONE.add(atDir(hConv, i90)).scaleRational(1n, 2n);
const oracle: Record<string, [Cyclotomic, Cyclotomic]> = {
	// [3⁶;3³.4²] A — conventional 1 × (6+√3), centered
	t2003: [ONE, cmm(new Surd(6n, 0n, 1n, 0n, 1n))],
	// [3⁶;3³.4²] B — conventional 1 × (4+√3), centered
	t2004: [ONE, cmm(new Surd(4n, 0n, 1n, 0n, 1n))],
	// [3⁶;3⁴.6] 2nd — conventional 1 × (2+3√3), centered
	t2015: [ONE, cmm(new Surd(2n, 0n, 3n, 0n, 1n))],
	// [4⁴;3³.4²] 2nd — rectangle 1 × (1+√3)
	t2014: [ONE, atDir(new Surd(1n, 0n, 1n, 0n, 1n), i90)],
	// [3.4.6.4;3.4².6] — rectangle √(2+√3) × 2√(2+√3) at 105°/195°
	t2017: [atDir(new Surd(0n, 1n, 0n, 1n, 2n), 7), atDir(new Surd(0n, 1n, 0n, 1n, 1n), 7 + i90)],
};

describe("gridDirOf", () => {
	it("identifies grid directions and exact lengths", () => {
		expect(gridDirOf(ONE, ring)).toMatchObject({ m: 0 });
		const v = atDir(new Surd(0n, 1n, 0n, 1n, 2n), 7); // (√6+√2)/2 at 105°
		const gd = gridDirOf(v, ring)!;
		expect(gd.m).toBe(7);
		expect(gd.len.equals(new Surd(0n, 1n, 0n, 1n, 2n))).toBe(true);
	});
	it("rejects off-grid (snub) vectors", () => {
		// 2 + ζ₆ = (2.5, √3/2): a √7 vector at 19.1°, not a multiple of 15°
		const snub = ONE.scaleRational(2n, 1n).add(Cyclotomic.zeta(ring, 4));
		expect(gridDirOf(snub, ring)).toBeNull();
	});
});

describe("LatticeEnumerator.gridAlignedCells: recovers the 5 missing cmm/rect cells", () => {
	// difference pool a shallow patch would surface: the unit edge + t2017's short axis.
	const pool = [ONE, oracle.t2017[0]];
	const cells = new LatticeEnumerator(2).gridAlignedCells(pool, [3, 4, 6], ring);

	for (const [name, [a, b]] of Object.entries(oracle)) {
		it(`contains ${name}`, () => {
			const found = cells.some(([c, d]) => sameLattice(a, b, c, d));
			expect(found).toBe(true);
		});
	}

	it("each emitted lattice is non-degenerate", () => {
		for (const [a, b] of cells) expect(detSurd(a, b).isZero()).toBe(false);
	});
});

describe("shortVectorPool", () => {
	it("is deterministic and contains the t2020 snub short vector 3+ω", () => {
		const a = shortVectorPool(ring, 6, 5.6);
		const b = shortVectorPool(ring, 6, 5.6);
		expect(a.length).toBe(b.length);
		expect(a.length).toBeGreaterThan(100000); // ~145k for the regular core
		const snub = ONE.scaleRational(3n, 1n).add(Cyclotomic.zeta(ring, 4)); // 3 + ω, |·|²=13 (off-grid)
		expect(a.some((v) => v.sub(snub).isZero())).toBe(true);
	});
});

describe("LatticeEnumerator.roundCells: recovers the hexagonal & square 2-uniform cells", () => {
	const OMEGA = Cyclotomic.zeta(ring, 4); // e^{iπ/3}
	const IMAG = Cyclotomic.zeta(ring, 6); // i
	const pool = shortVectorPool(ring, 6, 5.6);
	const round = new LatticeEnumerator(2).roundCells(pool, [3, 4, 6, 12], ring, 26);

	// Representative oracle cells, built from their verified algebraic form (Bravais class of Λ,
	// cross-checked numerically against chequesoto.info/JSON_Galebach.json this session):
	const hex = (c: Cyclotomic): [Cyclotomic, Cyclotomic] => [c, c.mul(OMEGA)];
	const sq = (c: Cyclotomic): [Cyclotomic, Cyclotomic] => [c, c.mul(IMAG)];
	const oracleRound: Record<string, [Cyclotomic, Cyclotomic]> = {
		// t2018 hexagonal — c = 1+√3, |c|² = 4+2√3 ∈ ℚ(√3) (NOT an Eisenstein-integer norm)
		t2018: hex(realCyc(new Surd(1n, 0n, 1n, 0n, 1n))),
		// t2020 snub-hexagonal — c = 3+ω, |c|² = 13, OFF the 15° grid (the completeness pin)
		t2020: hex(ONE.scaleRational(3n, 1n).add(OMEGA)),
		// t2002 square — c = 2+√3, |c|² = 7+4√3
		t2002: sq(realCyc(new Surd(2n, 0n, 1n, 0n, 1n))),
	};

	for (const [name, [a, b]] of Object.entries(oracleRound)) {
		it(`contains ${name}`, () => {
			expect(round.some(([c, d]) => sameLattice(a, b, c, d))).toBe(true);
		});
	}

	it("every emitted round cell is non-degenerate and area-bounded", () => {
		for (const [a, b] of round) {
			expect(detSurd(a, b).isZero()).toBe(false);
			expect(detSurd(a, b).abs().toFloat()).toBeLessThanOrEqual(26 + 1e-9);
		}
	});
});

describe("vcAreaSet: the cell area is forced by the seed's vertex configurations", () => {
	// seed [3⁶; 3⁴.6] (snub-hexagonal 2-uniform): VCs 3⁶ (six triangles) and 3⁴.6 (four triangles, one hexagon).
	const vc36 = new Map<number, number>([[3, 6]]);
	const vc346 = new Map<number, number>([[3, 4], [6, 1]]);
	const areas = vcAreaSet([vc36, vc346], 16);

	it("contains the real snub-hex cell area 6.5√3 (= 20 triangles + 1 hexagon, from 6×3⁶ + 6×3⁴.6)", () => {
		const target = new Surd(0n, 0n, 13n, 0n, 2n); // 13√3/2 = 6.5√3
		expect(areas.some((a) => a.equals(target))).toBe(true);
	});

	it("excludes VC-impossible areas (a lone square, and a 2-triangle cell below the VC minimum)", () => {
		const oneSquare = Surd.ONE; // area 1 — these VCs contain NO squares
		const twoTriangles = new Surd(0n, 0n, 1n, 0n, 2n); // √3/2 — on the generic ladder, below this seed's minimum
		expect(areas.some((a) => a.equals(oneSquare))).toBe(false);
		expect(areas.some((a) => a.equals(twoTriangles))).toBe(false);
	});

	it("every area is realizable by the VCs (#hexagons divisible by 6 ⇒ no area below 4√3)", () => {
		const min = Math.min(...areas.map((a) => a.toFloat()));
		expect(min).toBeGreaterThan(4 * Math.sqrt(3) - 1e-6); // smallest cell: 1×3⁶ + 6×3⁴.6 → 4√3
	});
});

describe("holohedry: exact Bravais-class classification (P0/P1 orbit-floor divisor)", () => {
	const OMEGA = Cyclotomic.zeta(ring, 4); // e^{iπ/3}, 60° — hexagonal multiplier
	const IMAG = Cyclotomic.zeta(ring, 6); // i, 90° — square multiplier
	const realCyc = (s: Surd) => surdToCyclotomic(s, ring);

	it("square lattice (1, i) → 8", () => {
		expect(holohedry(ONE, IMAG)).toBe(8);
	});
	it("hexagonal lattice (1, ω) → 12", () => {
		expect(holohedry(ONE, OMEGA)).toBe(12);
	});
	it("rectangular lattice (1, 2i) → 4", () => {
		expect(holohedry(ONE, IMAG.scaleRational(2n, 1n))).toBe(4);
	});
	it("centered-rectangular (cmm) oracle cell t2003 → 4", () => {
		const cmm = (hConv: Surd) => ONE.add(realCyc(hConv).mulZeta(6)).scaleRational(1n, 2n);
		expect(holohedry(ONE, cmm(new Surd(6n, 0n, 1n, 0n, 1n)))).toBe(4); // 1 × (6+√3) centered
	});
	it("rectangular oracle cell t2014 (1, (1+√3)i) → 4", () => {
		expect(holohedry(ONE, realCyc(new Surd(1n, 0n, 1n, 0n, 1n)).mulZeta(6))).toBe(4);
	});
	it("hexagonal oracle cell t2018 (c = 1+√3) → 12", () => {
		const c = realCyc(new Surd(1n, 0n, 1n, 0n, 1n));
		expect(holohedry(c, c.mul(OMEGA))).toBe(12);
	});
	it("OFF-GRID snub-hexagonal t2020 (c = 3+ω) → 12 (Bravais class is hexagonal, not oblique)", () => {
		const c = ONE.scaleRational(3n, 1n).add(OMEGA); // |c|² = 13, off the 15° grid
		expect(holohedry(c, c.mul(OMEGA))).toBe(12);
	});
	it("genuinely oblique lattice (1, ζ²+ζ⁴) → 2", () => {
		// reduced basis (1, ζ²+ζ⁴−1): Gram (|u|²,|v|²,u·v) = (1, 2, (√3−1)/2) — all three symmetry
		// conditions (perp, equal-length, 2|u·v|=|u|²) fail ⇒ no mirror/rotation ⇒ oblique.
		const v = Cyclotomic.zeta(ring, 2).add(Cyclotomic.zeta(ring, 4));
		expect(holohedry(ONE, v)).toBe(2);
	});
	it("is basis-independent: a unimodular change of basis preserves the class", () => {
		expect(holohedry(ONE, IMAG)).toBe(holohedry(ONE, IMAG.add(ONE))); // square, sheared basis
		expect(holohedry(ONE, OMEGA)).toBe(holohedry(ONE, OMEGA.add(ONE.scaleRational(2n, 1n)))); // hex
	});
	it("never UNDER-estimates: every classification is ≥ the true holohedry (soundness invariant)", () => {
		// Underestimating hol would make P0/P1 prune valid tilings. A correct classifier returns the
		// exact value; this guards the contract that the function is an upper bound on |point group|.
		expect(holohedry(ONE, IMAG)).toBeGreaterThanOrEqual(8);
		expect(holohedry(ONE, OMEGA)).toBeGreaterThanOrEqual(12);
	});
});

describe("vcAreaMinVerts: min vertex-class count per realizable cell area (P0 lattice pre-filter)", () => {
	const vc36 = new Map<number, number>([[3, 6]]);
	const vc346 = new Map<number, number>([[3, 4], [6, 1]]);

	it("the smallest cell area 4√3 needs 7 vertex classes (1×3⁶ + 6×3⁴.6)", () => {
		const minV = vcAreaMinVerts([vc36, vc346], 16);
		expect(minV.get(areaKey(new Surd(0n, 0n, 4n, 0n, 1n)))).toBe(7);
	});
	it("has an entry for every area vcAreaSet produces, each ≥ 1", () => {
		const minV = vcAreaMinVerts([vc36, vc346], 16);
		const areas = vcAreaSet([vc36, vc346], 16);
		for (const a of areas) {
			const m = minV.get(areaKey(a));
			expect(m).toBeDefined();
			expect(m!).toBeGreaterThanOrEqual(1);
		}
	});
});
