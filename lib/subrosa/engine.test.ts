import { describe, it, expect } from "vitest";
import { Vector } from "@/classes/Vector";
import { sigma, scalingFactor, prototileAngles } from "./sigma";
import {
	boundaryWord,
	buildRule,
	supportedSymmetry,
	SUPPORTED_SYMMETRIES,
	seedSingle,
	seedStar,
	substituteOnce,
	type RenderTile,
} from "./engine";

const key = (v: Vector) => `${Math.round(v.x * 1e6)},${Math.round(v.y * 1e6)}`;
const rhArea = (c: Vector[]) =>
	0.5 * Math.abs((c[2].x - c[0].x) * (c[3].y - c[1].y) - (c[3].x - c[1].x) * (c[2].y - c[0].y));
function edgeOveruse(tiles: RenderTile[]): number {
	const cnt = new Map<string, number>();
	for (const t of tiles)
		for (let i = 0; i < 4; i++) {
			const a = key(t.corners[i]), b = key(t.corners[(i + 1) % 4]);
			const k = a < b ? `${a}|${b}` : `${b}|${a}`;
			cnt.set(k, (cnt.get(k) ?? 0) + 1);
		}
	let over = 0;
	for (const c of cnt.values()) if (c > 2) over++;
	return over;
}

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
	it("n=5 has 4·2·|Σ| = 48 unit vectors (directions in 0..4n−1)", () => {
		for (const x of [1, 2]) {
			const dirs = boundaryWord(5, x);
			expect(dirs.length).toBe(48);
			for (const d of dirs) expect(d).toBeGreaterThanOrEqual(0);
			for (const d of dirs) expect(d).toBeLessThan(4 * 5);
		}
	});
	it("is POINT-symmetric: second half = half-turn σₙ of the first (opposite edges antiparallel)", () => {
		// The self-composition fix: boundary = u·ũ with ũ = σₙ(u) = every direction + 2n (mod 4n),
		// same order. This makes opposite super-edges exact antiparallels so neighbours interlock.
		for (const x of [1, 2]) {
			const dirs = boundaryWord(5, x);
			const h = dirs.length / 2;
			for (let i = 0; i < h; i++) {
				expect(dirs[i + h]).toBe((dirs[i] + 2 * 5) % (4 * 5));
			}
		}
	});
	it("closes exactly (Σ of unit vectors = 0)", () => {
		for (const x of [1, 2]) {
			const dirs = boundaryWord(5, x);
			let sx = 0, sy = 0;
			for (const d of dirs) { sx += Math.cos((d * Math.PI) / 10); sy += Math.sin((d * Math.PI) / 10); }
			expect(Math.hypot(sx, sy)).toBeLessThan(1e-9);
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

// The regression guard for the depth-2 break: the rule must self-compose. Iterating past one
// level is exactly where the old mirror-symmetric boundary tore the tiling; here we assert the
// substitution stays gap/overlap-free two levels deep, on every seed.
describe("n=5 substitution self-composes (gap/overlap-free at depth 2)", () => {
	const rule = buildRule(5)!;
	const seeds: [string, RenderTile[]][] = [
		["single (1,4)", seedSingle(rule, 1)],
		["single (2,3)", seedSingle(rule, 2)],
		["star", seedStar(rule)],
	];
	for (const [name, seed0] of seeds) {
		it(`${name}: two substitutions have zero edge-overuse and conserve area`, () => {
			const a0 = seed0.reduce((s, t) => s + rhArea(t.corners), 0);
			let tiles = seed0;
			for (let d = 1; d <= 2; d++) {
				tiles = substituteOnce(rule, tiles);
				expect(edgeOveruse(tiles)).toBe(0);
				const area = tiles.reduce((s, t) => s + rhArea(t.corners), 0);
				const expected = a0 * Math.pow(rule.scaling, 2 * d);
				expect(Math.abs(area - expected) / expected).toBeLessThan(1e-9);
			}
		});
	}
});

// The de Bruijn matched-line fill reaches the higher symmetries the ear-clip can't. Each must
// fill exactly, have a point-symmetric boundary, and mesh gap-free when its 2n-fold star seed is
// substituted (adjacent super-rhombs interlocking).
describe("higher symmetries via the de Bruijn fill (n = 7, 9, 11)", () => {
	it("SUPPORTED_SYMMETRIES is [4, 5, 6, 7, 8, 9, 11]", () => {
		expect([...SUPPORTED_SYMMETRIES]).toEqual([4, 5, 6, 7, 8, 9, 11]);
	});
	const childCounts: Record<number, number[]> = {
		7: [212, 380, 472],
		9: [464, 868, 1164, 1320],
		11: [860, 1644, 2288, 2744, 2980],
	};
	for (const n of [7, 9, 11]) {
		describe(`n = ${n} (${2 * n}-fold)`, () => {
			it("boundary word is point-symmetric for every prototile", () => {
				for (let x = 1; x <= Math.floor(n / 2); x++) {
					const dirs = boundaryWord(n, x);
					const h = dirs.length / 2;
					for (const d of dirs) expect(d).toBeLessThan(4 * n);
					for (let i = 0; i < h; i++) expect(dirs[i + h]).toBe((dirs[i] + 2 * n) % (4 * n));
				}
			});
			const rule = buildRule(n);
			it("builds; every prototile fills exactly with the expected child count", () => {
				expect(rule).not.toBeNull();
				expect(rule!.check.every((c) => c.ok)).toBe(true);
				expect(rule!.prototiles.map((p) => p.children.length)).toEqual(childCounts[n]);
			});
			it("the 2n-fold star substitutes gap/overlap-free (adjacent super-rhombs mesh)", () => {
				const seed0 = seedStar(rule!);
				const a0 = seed0.reduce((s, t) => s + rhArea(t.corners), 0);
				const tiles = substituteOnce(rule!, seed0);
				expect(edgeOveruse(tiles)).toBe(0);
				const expected = a0 * Math.pow(rule!.scaling, 2);
				const area = tiles.reduce((s, t) => s + rhArea(t.corners), 0);
				expect(Math.abs(area - expected) / expected).toBeLessThan(1e-8);
			});
		});
	}
	it("n=7 thin prototile self-composes to depth 2 gap/overlap-free", () => {
		const rule = buildRule(7)!;
		let tiles = seedSingle(rule, 1);
		const a0 = tiles.reduce((s, t) => s + rhArea(t.corners), 0);
		for (let d = 1; d <= 2; d++) {
			tiles = substituteOnce(rule, tiles);
			expect(edgeOveruse(tiles)).toBe(0);
			const expected = a0 * Math.pow(rule.scaling, 2 * d);
			const area = tiles.reduce((s, t) => s + rhArea(t.corners), 0);
			expect(Math.abs(area - expected) / expected).toBeLessThan(1e-8);
		}
	});
});

// Even n share the same construction (the [0,2,…] edge word + the zero-rhombus boundary branch) and,
// crucially, include a SQUARE prototile (x = n/2, 90°/90°). The gate is that the square fills and the
// rule still self-composes gap/overlap-free — the paper's even-n "fixed point" is about the limit, not
// iteration. Rings: n=4 → ℤ[ζ₁₆], n=6 → ℤ[ζ₂₄], n=8 → ℤ[ζ₃₂].
describe("even symmetries via the de Bruijn fill (n = 4, 6, 8)", () => {
	const childCounts: Record<number, number[]> = {
		4: [40, 56],
		6: [140, 240, 276],
		8: [336, 616, 800, 864],
	};
	for (const n of [4, 6, 8]) {
		describe(`n = ${n} (${2 * n}-fold)`, () => {
			it("boundary word is point-symmetric for every prototile (incl. the square x=n/2)", () => {
				for (let x = 1; x <= Math.floor(n / 2); x++) {
					const dirs = boundaryWord(n, x);
					const h = dirs.length / 2;
					for (const d of dirs) expect(d).toBeLessThan(4 * n);
					for (let i = 0; i < h; i++) expect(dirs[i + h]).toBe((dirs[i] + 2 * n) % (4 * n));
				}
			});
			const rule = buildRule(n);
			it("builds; every prototile (incl. the square) fills exactly with the expected child count", () => {
				expect(rule).not.toBeNull();
				expect(rule!.check.every((c) => c.ok)).toBe(true);
				expect(rule!.prototiles.map((p) => p.children.length)).toEqual(childCounts[n]);
			});
			it("the 2n-fold star substitutes gap/overlap-free at depth 1", () => {
				const seed0 = seedStar(rule!);
				const a0 = seed0.reduce((s, t) => s + rhArea(t.corners), 0);
				const tiles = substituteOnce(rule!, seed0);
				expect(edgeOveruse(tiles)).toBe(0);
				const expected = a0 * Math.pow(rule!.scaling, 2);
				const area = tiles.reduce((s, t) => s + rhArea(t.corners), 0);
				expect(Math.abs(area - expected) / expected).toBeLessThan(1e-8);
			});
		});
	}

	// The depth-2 self-composition gate. n=4 exercises both prototiles (thin + square) directly; n=6
	// runs the square prototile itself; n=8 uses the thin tile (its children include the square, and
	// its depth-2 stays affordable — the square's own depth-2 and the star depth-2 exceed 500k tiles).
	it("n=4 self-composes to depth 2 gap/overlap-free (thin AND square)", () => {
		const rule = buildRule(4)!;
		for (const x of [1, 2]) {
			let tiles = seedSingle(rule, x);
			const a0 = tiles.reduce((s, t) => s + rhArea(t.corners), 0);
			for (let d = 1; d <= 2; d++) {
				tiles = substituteOnce(rule, tiles);
				expect(edgeOveruse(tiles)).toBe(0);
				const expected = a0 * Math.pow(rule.scaling, 2 * d);
				const area = tiles.reduce((s, t) => s + rhArea(t.corners), 0);
				expect(Math.abs(area - expected) / expected).toBeLessThan(1e-8);
			}
		}
	});
	it("n=6 square prototile self-composes to depth 2 gap/overlap-free", () => {
		const rule = buildRule(6)!;
		let tiles = seedSingle(rule, 3); // x=3 = the 90°/90° square
		const a0 = tiles.reduce((s, t) => s + rhArea(t.corners), 0);
		for (let d = 1; d <= 2; d++) {
			tiles = substituteOnce(rule, tiles);
			expect(edgeOveruse(tiles)).toBe(0);
			const expected = a0 * Math.pow(rule.scaling, 2 * d);
			const area = tiles.reduce((s, t) => s + rhArea(t.corners), 0);
			expect(Math.abs(area - expected) / expected).toBeLessThan(1e-8);
		}
	});
	it("n=8 self-composes to depth 2 gap/overlap-free (thin tile; children include the square)", () => {
		const rule = buildRule(8)!;
		let tiles = seedSingle(rule, 1);
		const a0 = tiles.reduce((s, t) => s + rhArea(t.corners), 0);
		for (let d = 1; d <= 2; d++) {
			tiles = substituteOnce(rule, tiles);
			expect(edgeOveruse(tiles)).toBe(0);
			const expected = a0 * Math.pow(rule.scaling, 2 * d);
			const area = tiles.reduce((s, t) => s + rhArea(t.corners), 0);
			expect(Math.abs(area - expected) / expected).toBeLessThan(1e-8);
		}
	});
});
