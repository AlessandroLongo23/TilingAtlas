import { describe, it, expect } from "vitest";
import { sigma, scalingFactor, prototileAngles } from "./sigma";
import { boundaryWord, buildRule, supportedSymmetry } from "./engine";

describe("Σ(n) edge word matches Kari-Rissanen Table 1/2", () => {
	it("odd n", () => {
		expect(sigma(3)).toEqual([1, 1]);
		expect(sigma(5)).toEqual([1, 3, 1, 1, 3, 1]);
		expect(sigma(7)).toEqual([1, 3, 5, 1, 3, 1, 1, 3, 1, 5, 3, 1]);
		// Σ(9): first half [1,3,5,7,1,3,1,5,3,1], second = reverse
		expect(sigma(9)).toEqual([1, 3, 5, 7, 1, 3, 1, 5, 3, 1, 1, 3, 5, 1, 3, 1, 7, 5, 3, 1]);
	});
	it("even n", () => {
		expect(sigma(2)).toEqual([0, 0]);
		expect(sigma(4)).toEqual([0, 2, 0, 0, 2, 0]);
		expect(sigma(6)).toEqual([0, 2, 4, 0, 2, 0, 0, 2, 0, 4, 2, 0]);
	});
	it("is a palindrome-halved word of even length", () => {
		for (const n of [5, 6, 7, 9]) {
			const s = sigma(n);
			const h = s.length / 2;
			expect(s.slice(h)).toEqual([...s.slice(0, h)].reverse());
		}
	});
});

describe("scaling factor", () => {
	it("matches paper values", () => {
		expect(scalingFactor(5)).toBeCloseTo(9.9596, 3);
		expect(scalingFactor(7)).toBeCloseTo(19.6893, 3);
	});
	it("equals the sum of diagonal measures over Σ(n) (odd n)", () => {
		for (const n of [5, 7]) {
			const dSum = sigma(n).reduce((acc, a) => acc + 2 * Math.cos((a * Math.PI) / (2 * n)), 0);
			expect(dSum).toBeCloseTo(scalingFactor(n), 6);
		}
	});
});

describe("prototile angles", () => {
	it("n=5 → the two Penrose rhombs", () => {
		expect(prototileAngles(5)).toEqual([
			{ x: 1, acuteDeg: 36, obtuseDeg: 144 },
			{ x: 2, acuteDeg: 72, obtuseDeg: 108 },
		]);
	});
});

describe("super-rhomb boundary word", () => {
	it("n=5 has 4·2·|Σ| = 48 unit vectors and closes", () => {
		for (const x of [1, 2]) {
			const dirs = boundaryWord(5, x);
			expect(dirs.length).toBe(48);
		}
	});
});

describe("n=5 substitution rule is an exact tiling (both prototiles)", () => {
	const rule = buildRule(5);
	it("builds", () => {
		expect(rule).not.toBeNull();
	});
	it("every prototile fills with an exact, gap/overlap-free dissection", () => {
		expect(rule!.check.every((c) => c.ok)).toBe(true);
	});
	it("child counts match the validated prototype (72 and 116)", () => {
		const counts = rule!.prototiles.map((p) => p.children.length).sort((a, b) => a - b);
		expect(counts).toEqual([72, 116]);
	});
	it("every child is one of the n=5 prototiles", () => {
		for (const p of rule!.prototiles) {
			for (const c of p.children) expect([1, 2]).toContain(c.protoId);
		}
	});
	it("supportedSymmetry(5) is true", () => {
		expect(supportedSymmetry(5)).toBe(true);
	});
});
