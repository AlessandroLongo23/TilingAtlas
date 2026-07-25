import { describe, it, expect } from "vitest";
import { Vector } from "@/classes/Vector";
import { sigma, scalingFactor, prototileAngles } from "./sigma";
import {
	boundaryWord,
	buildRule,
	supportedSymmetry,
	seedSingle,
	seedStar,
	substituteOnce,
	type RenderTile,
} from "./engine";

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
