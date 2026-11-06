import { describe, expect, it } from "vitest";
import { type Su11, su11Apply, su11Identity, su11Mul, su11Translation } from "@/lib/render/hyperbolic";
import {
	REG_EDGE,
	REG_MAPS,
	binaryAnchor,
	digitAt,
	geodesicChart,
	horocyclicChart,
	moveTo,
	regWalk,
	type BinaryAnchor,
} from "@/lib/tilings/binary";

// The binary family (lib/tilings/binary.ts): the geodesic side maps close around every face, the
// ancestry arithmetic is invertible, and re-anchoring never moves the picture.

/** The geodesic map across side s of a tile with child index j (jp: the parent's, for side 0). */
const side = (s: number, j: number, jp = 0): Su11 => (s === 0 ? REG_MAPS[8 + 2 * j + jp] : REG_MAPS[2 * (s - 1) + j]);
const walk = (steps: [number, number, number?][]) =>
	steps.reduce<Su11>((W, [s, j, jp]) => su11Mul(side(s, j, jp), W), su11Identity());
const isIdentity = (M: Su11) => Math.abs(Math.abs(M.a.x) - 1) + Math.abs(M.a.y) + Math.hypot(M.b.x, M.b.y) < 1e-9;

describe("geodesic binary tiling", () => {
	it("closes 3.4.3.4.4 at the catalogue's edge", () => {
		// hyp-k2-3-4-3-4-4__3-4-3-4-4 in public/hyperbolic-developed.json.gz
		expect(REG_EDGE).toBeCloseTo(0.7389979438517287, 12);
	});

	it("crossing a side and back is the identity", () => {
		for (const j of [0, 1])
			for (const jp of [0, 1]) {
				expect(
					isIdentity(
						walk([
							[0, j, jp],
							[2 + j, jp],
						]),
					),
				).toBe(true); // up, then down to child j
				expect(
					isIdentity(
						walk([
							[1, j],
							[4, 1 - j],
						]),
					),
				).toBe(true); // left, then right
			}
	});

	it("closes around every face a tile touches", () => {
		for (const j of [0, 1]) {
			expect(
				isIdentity(
					walk([
						[2, j],
						[4, 0],
						[0, 1, j],
					]),
				),
			).toBe(true); // bottom triangle
			expect(
				isIdentity(
					walk([
						[1, j],
						[3, 1 - j],
						[4, 1],
						[0, 0, j],
					]),
				),
			).toBe(true); // bottom left square
			expect(
				isIdentity(
					walk([
						[4, j],
						[2, 1 - j],
						[1, 0],
						[0, 1, j],
					]),
				),
			).toBe(true); // bottom right square
		}
		for (const p of [0, 1]) {
			expect(
				isIdentity(
					walk([
						[0, 0, p],
						[1, p],
						[3, 1 - p],
						[4, 1],
					]),
				),
			).toBe(true); // left child's top left square
			expect(
				isIdentity(
					walk([
						[0, 1, p],
						[2, p],
						[4, 0],
					]),
				),
			).toBe(true); // right child's top left triangle
			expect(
				isIdentity(
					walk([
						[4, 0],
						[0, 1, p],
						[2, p],
					]),
				),
			).toBe(true); // left child's top right triangle
			expect(
				isIdentity(
					walk([
						[4, 1],
						[0, 0, 1 - p],
						[1, 1 - p],
						[3, p],
					]),
				),
			).toBe(true); // right child's square
		}
	});

	it("walks a point into the tile whose Voronoi cell holds it", () => {
		const a = binaryAnchor(2, "random", 7);
		for (let i = 0; i < 200; i++) {
			const t = (i * 2.399) % (2 * Math.PI),
				r = 0.99 * Math.sqrt((i + 0.5) / 200);
			const w = { x: r * Math.cos(t), y: r * Math.sin(t) };
			const res = regWalk(a, w);
			expect(res.ok).toBe(true);
			const q = su11Apply(res.W, w);
			expect(Math.hypot(q.x - res.w.x, q.y - res.w.y)).toBeLessThan(1e-9);
			// in the cell: no nearer dual vertex among the walk's own sides (it stopped)
			expect(Math.hypot(res.w.x, res.w.y)).toBeLessThan(0.6);
		}
	});
});

describe("binary ancestry", () => {
	const digits = (a: BinaryAnchor) => Array.from({ length: 40 }, (_, i) => digitAt(a, i)).join("");

	it("moves to a tile and back", () => {
		for (const n of [2, 3, 5])
			for (const v of ["standard", "random"] as const) {
				const a = binaryAnchor(n, v, 11);
				expect(digits(moveTo(moveTo(a, 0, 1), 0, -1))).toBe(digits(a));
				expect(digits(moveTo(moveTo(a, 0, -1), 0, 1))).toBe(digits(a));
				expect(digits(moveTo(moveTo(a, 1, 0), -1, digitAt(a, 0)))).toBe(digits(a));
				const b = moveTo(a, -3, 7);
				expect(b.level).toBe(-3);
			}
	});

	it("borrows through the standard tiling's tail of zeros into the other half", () => {
		const a = moveTo(binaryAnchor(2, "standard"), 0, -1);
		expect(digits(a)).toBe("1".repeat(40));
		expect(digits(moveTo(a, 0, 1))).toBe("0".repeat(40));
	});
});

describe("binary charts keep the picture when they re-anchor", () => {
	const views: Su11[] = [0.3, 0.6, 0.85, 0.95].flatMap((r) =>
		[0.4, 1.9, 3.3, 5.0].map((t) => su11Translation({ x: r * Math.cos(t), y: r * Math.sin(t) })),
	);
	const charts = [
		...[2, 3, 6].map((n) => horocyclicChart(n, binaryAnchor(n, "random", 3))),
		geodesicChart(binaryAnchor(2, "random", 3)),
	];
	it("draws every point where it was, from the tile under the centre", () => {
		let moved = 0;
		for (const chart of charts)
			for (const view of views) {
				const r = chart.reanchor(chart.seedFace, view);
				if (!r.W) continue; // the centre is still in the anchor tile
				moved++;
				for (const p of [
					{ x: 0.1, y: -0.2 },
					{ x: -0.5, y: 0.3 },
				]) {
					const before = su11Apply(view, p);
					const after = su11Apply(r.view, su11Apply(r.W!, p));
					expect(Math.hypot(before.x - after.x, before.y - after.y)).toBeLessThan(1e-9);
				}
				// and the new anchor holds the centre: a second re-anchor stays put
				expect(chart.reanchor(r.f, r.view).W).toBeNull();
			}
		expect(moved).toBeGreaterThan(40);
	});
});
