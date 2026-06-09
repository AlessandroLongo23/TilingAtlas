import { describe, it, expect } from "vitest";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import { Surd, surdToCyclotomic, detSurd, tileAreaSurd } from "@/classes/algorithm/exact/Surd";
import { LatticeEnumerator, gridDirOf, sameLattice, shortVectorPool, vcAreaSet, holohedry, vcAreaMinVerts, areaKey, edgeStepDirs, joinLattice, isIntCombo, gaussReduceExact, latticeKey } from "@/classes/algorithm/LatticeEnumerator";

// vcAreaSet/vcAreaMinVerts are identity-keyed (C1, Increment 2). These adapters drive them with the old
// regular-only n-keyed incidences: token = String(n), tileArea = tileAreaSurd(n), tileCorners = n.
const regMaps = (incs: Map<number, number>[]) => {
	const strIncs = incs.map((m) => new Map<string, number>([...m].map(([n, c]) => [String(n), c])));
	const tileArea = new Map<string, Surd>();
	const tileCorners = new Map<string, number>();
	for (const m of incs) for (const n of m.keys()) { tileArea.set(String(n), tileAreaSurd(n)); tileCorners.set(String(n), n); }
	return { strIncs, tileArea, tileCorners };
};
const regAreaSet = (incs: Map<number, number>[], bound: number) => {
	const { strIncs, tileArea, tileCorners } = regMaps(incs);
	return vcAreaSet(strIncs, tileArea, tileCorners, bound);
};
const regMinVerts = (incs: Map<number, number>[], bound: number) => {
	const { strIncs, tileArea, tileCorners } = regMaps(incs);
	return vcAreaMinVerts(strIncs, tileArea, tileCorners, bound);
};

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
	const areas = regAreaSet([vc36, vc346], 16);

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
		const minV = regMinVerts([vc36, vc346], 16);
		expect(minV.get(areaKey(new Surd(0n, 0n, 4n, 0n, 1n)))).toBe(7);
	});
	it("has an entry for every area vcAreaSet produces, each ≥ 1", () => {
		const minV = regMinVerts([vc36, vc346], 16);
		const areas = regAreaSet([vc36, vc346], 16);
		for (const a of areas) {
			const m = minV.get(areaKey(a));
			expect(m).toBeDefined();
			expect(m!).toBeGreaterThanOrEqual(1);
		}
	});
});

describe("joinLattice: rational HNF join of a vector into a 2D lattice (cor:box step 2)", () => {
	const I = Cyclotomic.zeta(ring, 6); // i (90°), so (a=ONE, b=I) is the integer lattice ℤ²

	it("index-2 join halves the covolume and contains all three generators", () => {
		const w = ONE.add(I).scaleRational(1n, 2n); // (½, ½) in (1, i) coords — w ∉ ℤ²
		const j = joinLattice(ONE, I, w);
		expect(j).not.toBeNull();
		const [e1, e2] = j!;
		expect(detSurd(e1, e2).abs().equals(Surd.rational(1n, 2n))).toBe(true); // covolume 1 → ½
		// ⟨e1,e2⟩ contains a, b, and w (each an INTEGER combination of the new basis)
		expect(isIntCombo(ONE, e1, e2)).toBe(true);
		expect(isIntCombo(I, e1, e2)).toBe(true);
		expect(isIntCombo(w, e1, e2)).toBe(true);
		// and it is strictly FINER than ⟨a,b⟩ (e1 is not an integer combo of the original basis)
		expect(isIntCombo(e1, ONE, I)).toBe(false);
	});

	it("returns null when w already lies in the lattice (no progress)", () => {
		expect(joinLattice(ONE, I, ONE.add(I))).toBeNull(); // (1,1) ∈ ℤ²
		expect(joinLattice(ONE, I, I.scaleRational(3n, 1n))).toBeNull(); // (0,3) ∈ ℤ²
	});

	it("returns null when w has irrational coordinates (⟨a,b,w⟩ is not a rank-2 lattice)", () => {
		const offGrid = Cyclotomic.zeta(ring, 1); // ζ = (cos15°, sin15°): irrational coords in (1, i)
		expect(joinLattice(ONE, I, offGrid)).toBeNull();
	});
});

describe("LatticeEnumerator.obliqueCells: oblique candidates via pair-seed + join-closure", () => {
	// Decode the Soto-Sánchez oracle vectors (T = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³, ζ₁₂ = ζ₂₄²).
	const dec = ([a, b, c, d]: number[]) =>
		Cyclotomic.fromRational(ring, BigInt(a))
			.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
			.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
			.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));
	const t3046 = gaussReduceExact(dec([2, 0, -2, 0]), dec([2, 0, 1, 0])); // area 3√3, oblique
	const t3055 = gaussReduceExact(dec([1, 0, -1, -1]), dec([2, 1, 0, 0])); // area (6+3√3)/2, oblique
	const A_t3046 = new Surd(0n, 0n, 3n, 0n, 1n); // 3√3
	const A_t3055 = new Surd(6n, 0n, 3n, 0n, 2n); // (6+3√3)/2

	const dirs = edgeStepDirs(ring, [3, 4, 6, 12]);
	const poolLmax = Math.sqrt(22 * 3); // k=3 reach ≈ 8.124
	const pool = shortVectorPool(ring, 8, poolLmax, dirs, true);
	const areas = [A_t3046, A_t3055];
	const minVerts = new Map<string, number>([
		[areaKey(A_t3046), 5],
		[areaKey(A_t3055), 6],
	]);
	const lat = new LatticeEnumerator(3);
	const cells = lat.obliqueCells(pool, areas, ring, 24 * 3 * (6 + 3 * Math.sqrt(3)), poolLmax, minVerts);

	it("contains the oblique k=3 cell t3046 (area 3√3)", () => {
		expect(cells.some(([a, b]) => sameLattice(t3046[0], t3046[1], a, b))).toBe(true);
	});
	it("contains the oblique k=3 cell t3055 (area (6+3√3)/2)", () => {
		expect(cells.some(([a, b]) => sameLattice(t3055[0], t3055[1], a, b))).toBe(true);
	});
	it("contributes ONLY oblique lattices (holohedry == 2) — never round/grid (protects the k≤2 digest)", () => {
		for (const [a, b] of cells) expect(holohedry(a, b)).toBe(2);
	});
	it("contributes only area-admissible, non-degenerate cells", () => {
		for (const [a, b] of cells) {
			expect(detSurd(a, b).isZero()).toBe(false);
			expect(areas.some((A) => A.equals(detSurd(a, b).abs()))).toBe(true);
		}
	});
	it("returns [] when no area is admissible", () => {
		expect(lat.obliqueCells(pool, [], ring, 100, poolLmax, new Map())).toEqual([]);
	});
	it("fires onTruncate when the sub-pool reach exceeds poolLmax (loud INCOMPLETE log)", () => {
		const causes: string[] = [];
		lat.obliqueCells(pool, areas, ring, 1000, 1.0 /* tiny */, minVerts, (info) => causes.push(info.cause));
		expect(causes).toContain("subpool-clipped");
	});

	it("the JOIN reaches a ≥3-generator oblique lattice that pairs-only would MISS", () => {
		// t3046's reduced basis (u, v). Pool = {u, 2v, u+3v}: in (u,v) coords {(1,0),(0,2),(1,3)} —
		// pairwise indices 2,3,2, but jointly generate ⟨u,v⟩ = the oblique t3046 lattice (area 3√3).
		const [u, v] = t3046;
		const p3 = [u, v.scaleRational(2n, 1n), u.add(v.scaleRational(3n, 1n))];
		// no PAIR of the pool generates the target lattice (so pairs-only cannot find it):
		const pairFinds =
			sameLattice(u, v, p3[0], p3[1]) || sameLattice(u, v, p3[0], p3[2]) || sameLattice(u, v, p3[1], p3[2]);
		expect(pairFinds).toBe(false);
		// the join-closure DOES find it. Seed areas must admit the parent (6√3) and the join (3√3).
		const synthAreas = [A_t3046, new Surd(0n, 0n, 6n, 0n, 1n), new Surd(0n, 0n, 9n, 0n, 1n)];
		const synthMin = new Map<string, number>(synthAreas.map((A) => [areaKey(A), 6]));
		const got = lat.obliqueCells(p3, synthAreas, ring, 100, poolLmax, synthMin);
		expect(got.some(([a, b]) => sameLattice(u, v, a, b))).toBe(true);
	});
});
