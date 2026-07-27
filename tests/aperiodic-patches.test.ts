// The two aperiodic patches are generated, not stored, so nothing but a test says they are tilings.
// The check that matters is coverage: sample points across the window each generator promises to
// cover and count the tiles containing each one. A gap reads as 0, an overlap as 2 or more.

import { describe, expect, it } from "vitest";
import { HAT_WINDOW, hatPatch } from "@/lib/render/hatPatch";
import { PENROSE_WINDOW, penrosePatch } from "@/lib/render/penrosePatch";
import type { RawPolygon } from "@/lib/utils/renderTiling";

function inside(poly: { x: number; y: number }[], x: number, y: number): boolean {
	let hit = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i];
		const b = poly[j];
		if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
	}
	return hit;
}

function boxOf(p: RawPolygon) {
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const v of p.vertices) {
		if (v.x < minX) minX = v.x;
		if (v.x > maxX) maxX = v.x;
		if (v.y < minY) minY = v.y;
		if (v.y > maxY) maxY = v.y;
	}
	return { minX, maxX, minY, maxY };
}

function signedArea(v: { x: number; y: number }[]): number {
	let s = 0;
	for (let i = 0; i < v.length; i++) {
		const a = v[i];
		const b = v[(i + 1) % v.length];
		s += a.x * b.y - b.x * a.y;
	}
	return Math.abs(s) / 2;
}

/** mulberry32: the same points every run, so a failure can be reproduced. */
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** How many tiles cover each of `samples` points spread over the window. */
function coverage(polys: RawPolygon[], win: { cx: number; cy: number; width: number }, samples: number) {
	const boxes = polys.map(boxOf);
	const rnd = rng(20260726);
	const half = win.width / 2;
	const hist = new Map<number, number>();
	for (let i = 0; i < samples; i++) {
		const x = win.cx + (rnd() * 2 - 1) * half;
		const y = win.cy + (rnd() * 2 - 1) * half;
		let n = 0;
		for (let k = 0; k < polys.length; k++) {
			const b = boxes[k];
			if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
			if (inside(polys[k].vertices, x, y)) n++;
		}
		hist.set(n, (hist.get(n) ?? 0) + 1);
	}
	return hist;
}

describe("penrosePatch", () => {
	const tiles = penrosePatch();

	it("is a tiling of its declared window: every point covered exactly once", () => {
		const hist = coverage(tiles, PENROSE_WINDOW, 4000);
		expect([...hist.keys()]).toEqual([1]);
	});

	it("is made of unit rhombi", () => {
		for (const t of tiles) {
			expect(t.vertices).toHaveLength(4);
			for (let i = 0; i < 4; i++) {
				const a = t.vertices[i];
				const b = t.vertices[(i + 1) % 4];
				expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(1, 9);
			}
		}
	});

	it("holds thick and thin rhombi in the golden ratio", () => {
		// The counts are exactly Fibonacci-adjacent, so the ratio approaches phi from either side.
		const areas = tiles.map((t) => signedArea(t.vertices));
		const thick = areas.filter((a) => a > 0.8).length;
		const thin = areas.length - thick;
		expect(thick / thin).toBeCloseTo(1.618, 1);
	});
});

describe("hatPatch", () => {
	const tiles = hatPatch();

	it("is a tiling of its declared window: every point covered exactly once", () => {
		const hist = coverage(tiles, HAT_WINDOW, 4000);
		expect([...hist.keys()]).toEqual([1]);
	});

	it("uses one tile shape at two handednesses", () => {
		// Congruent copies of a single 13-gon: equal area is a cheap proxy that the placements are
		// isometries rather than shears or scalings.
		const areas = tiles.map((t) => signedArea(t.vertices));
		for (const a of areas) expect(a).toBeCloseTo(areas[0], 9);
		for (const t of tiles) expect(t.vertices).toHaveLength(13);

		// The substitution fixes the reflected fraction; it converges on 1 in phi^4 + 1.
		const reflected = tiles.filter((t) => t.hue === 25).length;
		expect(tiles.length / reflected).toBeCloseTo(7.854, 0);
	});

	it("grows as the squares of every other Fibonacci number", () => {
		expect([1, 2, 3, 4].map((l) => hatPatch(l).length)).toEqual([4, 25, 169, 1156]);
	});
});
