import { describe, it, expect } from "vitest";
import {
	inRingStarVariants,
	dentRegularFillableVariants,
	enumerateStarVCs,
	canonicalVCName,
	buildStarVCSeed,
	tokenStr,
	regInteriorU,
	type CornerTok,
} from "@/classes/algorithm/StarVC";
import { CyclotomicRing, Cyclotomic } from "@/classes/Cyclotomic";
import {
	r2AllVariants,
	r2DentRegVariants,
	r2Dmax,
	R2_STAR_NS,
} from "@/classes/algorithm/StarDmaxRoute2";

const ring = CyclotomicRing.create(24);
const isPt = (t: CornerTok) => t.kind === "pt";
const isDent = (t: CornerTok) => t.kind === "dent";

describe("StarVC — admissible variants + dent-fillability filter (C4)", () => {
	it("registers exactly 32 admissible in-ring variants ([3,5,7,8,9] per n)", () => {
		const v = inRingStarVariants();
		expect(v.length).toBe(32);
		const counts = [3, 4, 6, 8, 12].map((n) => v.filter((x) => x.n === n).length);
		expect(counts).toEqual([3, 5, 7, 8, 9]);
	});

	it("dent-regular-fillable filter is a SOUND SUPERSET of the TA oracle (equals it for n=3,4,6)", () => {
		const keep = dentRegularFillableVariants();
		const byN = (n: number) => keep.filter((x) => x.n === n).map((x) => x.alphaU).sort((a, b) => a - b);
		// equals the oracle for the constrained n
		expect(byN(3)).toEqual([1, 2]); //         oracle 3*@{1,2}
		expect(byN(4)).toEqual([2, 3, 4]); //      oracle 4*@{2,3,4}
		expect(byN(6)).toEqual([2, 4, 5, 6]); //   oracle 6*@{2,4,5,6}
		// SUPERSET for n=8,12 (the solver rejects the extras; never drops the oracle variant)
		expect(byN(8)).toContain(1); //            oracle 8*@{1} ⊆
		expect(byN(12)).toContain(2); //           oracle 12*@{2} ⊆
		expect(keep.length).toBe(19);
	});
});

describe("StarVC — VC enumeration + Myers prunes (C4)", () => {
	const variants = dentRegularFillableVariants();
	const fig4 = enumerateStarVCs({ variants });

	it("recovers the 4(j) and 4(p) vertex figures", () => {
		const j = canonicalVCName(["8", "4*p@3", "8", "4*p@3"]); // 8.4*_{π/4}.8.4*_{π/4}
		const p = canonicalVCName(["4", "6", "4*p@2", "6"]); //      4.6.4*_{π/6}.6
		expect(fig4.some((v) => v.name === j)).toBe(true);
		expect(fig4.some((v) => v.name === p)).toBe(true);
	});

	it("every VC satisfies Myers's prunes: ≥1 point, no two adjacent points, t≥3, sum=2π, no dents (Fig-4)", () => {
		for (const v of fig4) {
			expect(v.tokens.length).toBeGreaterThanOrEqual(3); //                     t ≥ 3
			expect(v.tokens.some(isPt)).toBe(true); //                                ≥ 1 point
			expect(v.tokens.some(isDent)).toBe(false); //                             Fig-4 ⇒ no dents
			const sum = v.tokens.reduce((s, t) => s + t.u, 0);
			expect(sum).toBe(24); //                                                  sum = 2π
			for (let i = 0; i < v.tokens.length; i++) {
				// cyclic: no two adjacent points (incl. wrap-around)
				const a = v.tokens[i];
				const b = v.tokens[(i + 1) % v.tokens.length];
				expect(isPt(a) && isPt(b)).toBe(false);
			}
		}
	});

	it("Fig-3 (includeDents) admits dent-bearing VCs with ≤1 dent each", () => {
		const withDents = enumerateStarVCs({ variants, includeDents: true });
		const dentVCs = withDents.filter((v) => v.tokens.some(isDent));
		expect(dentVCs.length).toBeGreaterThan(0);
		for (const v of dentVCs) expect(v.tokens.filter(isDent).length).toBeLessThanOrEqual(1);
	});

	it("names are canonical (rotation+reflection) and unique", () => {
		const names = fig4.map((v) => v.name);
		expect(new Set(names).size).toBe(names.length); // no dup canonical names
		for (const v of fig4) expect(v.name).toBe(canonicalVCName(v.tokens.map(tokenStr)));
	});
});

describe("StarVC — exact seed construction (C4)", () => {
	it("builds the 4(p) fan: 4 tiles around O, sum of corner angles = 2π, one star (4*@2)", () => {
		const p = canonicalVCName(["4", "6", "4*p@2", "6"]);
		const vc = enumerateStarVCs({ variants: dentRegularFillableVariants() }).find((v) => v.name === p)!;
		const seed = buildStarVCSeed(vc, ring);
		expect(seed.polygons.length).toBe(4);
		const stars = seed.polygons.filter((q) => q.isStar);
		expect(stars.length).toBe(1);
		expect(stars[0].n).toBe(4);
		// every tile seated with a corner at O
		const O = Cyclotomic.ZERO(ring);
		for (const q of seed.polygons) {
			expect(q.exactVertices!.some((vv) => vv.equals(O))).toBe(true);
		}
	});

	it("regInteriorU matches the regular interior angles (π/12 units)", () => {
		expect([3, 4, 6, 8, 12].map(regInteriorU)).toEqual([4, 6, 8, 9, 10]);
	});
});

describe("TH-4 — Route 2 alphabet derivation (independent of StarVC; drift sentinel)", () => {
	const key = (v: { n: number; alphaU: number }) => `${v.n}*@${v.alphaU}`;
	it("derives the same 32-variant set as inRingStarVariants from the P3 formulas", () => {
		expect(r2AllVariants().map(key).sort()).toEqual(inRingStarVariants().map(key).sort());
	});
	it("derives the same dent-reg-19 subset as dentRegularFillableVariants", () => {
		expect(r2DentRegVariants().map(key).sort()).toEqual(dentRegularFillableVariants().map(key).sort());
	});
});
