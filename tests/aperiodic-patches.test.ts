// The two aperiodic patches are generated, not stored, so nothing but a test says they are tilings.
// The check that matters is coverage: sample points across the window each generator promises to
// cover and count the tiles containing each one. A gap reads as 0, an overlap as 2 or more.

import { describe, expect, it } from "vitest";
import { HAT_WINDOW, hatPatch } from "@/lib/render/hatPatch";
import { PENROSE_WINDOW, penrosePatch } from "@/lib/render/penrosePatch";
import { characteristicTileSize, PATCH_DEFAULT_LEVELS } from "@/app/(app)/aperiodic/_patch-view";
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
		// isometries, not shears or scalings.
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

// The /aperiodic patch views fit the whole patch at EVERY level, so the default level is what decides
// how big a tile looks on landing. The two defaults are therefore chosen to have comparable tile
// counts; without that, one construction opens at roughly twice the other's tile size.
describe("the patch views open at a comparable tile scale", () => {
	/** How many tiles span the view when the whole patch is fitted — the thing the eye compares. */
	const tilesAcross = (polys: RawPolygon[]) => {
		let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
		for (const p of polys)
			for (const v of p.vertices) {
				minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x);
				miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y);
			}
		return Math.max(maxx - minx, maxy - miny) / characteristicTileSize(polys);
	};

	const penrose = penrosePatch(PATCH_DEFAULT_LEVELS.penrose);
	const hat = hatPatch(PATCH_DEFAULT_LEVELS.hat);

	it("measures a hat as about twice a Penrose rhombus", () => {
		// Not obvious from the outlines, and the reason median edge is the wrong scale (below).
		expect(characteristicTileSize(hat) / characteristicTileSize(penrose)).toBeCloseTo(2.07, 2);
	});

	it("pairs the default levels on tile count", () => {
		expect(penrose.length).toBe(1140);
		expect(hat.length).toBe(1156);
		expect(Math.abs(penrose.length - hat.length) / hat.length).toBeLessThan(0.05);
	});

	it("lands the two within 1.3x of each other, fitting the whole patch", () => {
		const ratio = tilesAcross(hat) / tilesAcross(penrose);
		expect(ratio).toBeGreaterThan(1 / 1.3);
		expect(ratio).toBeLessThan(1.3);
	});

	it("would be twice as far apart at Penrose's card default", () => {
		// PENROSE_DEPTH (5) is the /defense card's framing, not the view's; 430 rhombi against 1,156
		// hats opens Penrose at about double the tile size. Pinned so the two defaults stay decoupled.
		expect(tilesAcross(hat) / tilesAcross(penrosePatch())).toBeGreaterThan(1.9);
	});

	it("would NOT be matched by median edge — the invariant that looks right and isn't", () => {
		// A hat has SHORTER edges than a Penrose rhombus while being the LARGER tile, so ordering the
		// two by edge length gets the answer backwards.
		const medianEdge = (polys: RawPolygon[]) => {
			const e: number[] = [];
			for (const p of polys)
				for (let i = 0; i < p.vertices.length; i++) {
					const a = p.vertices[i], b = p.vertices[(i + 1) % p.vertices.length];
					e.push(Math.hypot(b.x - a.x, b.y - a.y));
				}
			return e.sort((x, y) => x - y)[e.length >> 1];
		};
		expect(medianEdge(hat)).toBeLessThan(medianEdge(penrose));
		expect(characteristicTileSize(hat)).toBeGreaterThan(characteristicTileSize(penrose));
	});
});
