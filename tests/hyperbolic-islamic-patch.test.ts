import { describe, it, expect } from "vitest";
import {
	buildRegularPatch,
	constructTileStraps,
	hyperbolicInterlaceData,
	uniformIslamicData,
	snubIslamicData,
} from "@/lib/render/hyperbolicIslamicPatch";
import type { WythoffSpec, StrapSegment } from "@/lib/render/hyperbolic";

// The regular {p,q} patch + the faithful polygons-in-contact construction that feed the fold-shader Islamic
// path. The A/B/C classification itself lives in the shader (crossing parity), so it's verified visually;
// here we pin the geometry the shader consumes: a valid central tile and in-disk strap segments.

const inDisk = (x: number, y: number, eps = 1e-6) => Math.hypot(x, y) < 1 - eps;

describe("buildRegularPatch (hyperbolic {p,q} tiling patch)", () => {
	for (const [p, q] of [[7, 3], [5, 4], [8, 3]] as Array<[number, number]>) {
		it(`{${p},${q}}: central tile is a p-gon at the origin, all vertices in-disk`, () => {
			const patch = buildRegularPatch(p, q, 0);
			expect(patch.length).toBe(1);
			expect(patch[0].verts.length).toBe(p);
			expect(inDisk(patch[0].centroid.x, patch[0].centroid.y)).toBe(true);
			expect(Math.hypot(patch[0].centroid.x, patch[0].centroid.y)).toBeLessThan(1e-9); // centred at O
			for (const v of patch[0].verts) expect(inDisk(v.x, v.y)).toBe(true);
		});

		it(`{${p},${q}}: more layers ⇒ strictly more tiles, all in-disk and deduped`, () => {
			const a = buildRegularPatch(p, q, 1);
			const b = buildRegularPatch(p, q, 2);
			expect(a.length).toBeGreaterThan(1);
			expect(b.length).toBeGreaterThan(a.length);
			const keys = new Set<string>();
			for (const t of b) {
				expect(inDisk(t.centroid.x, t.centroid.y)).toBe(true);
				for (const v of t.verts) expect(inDisk(v.x, v.y)).toBe(true);
				const k = `${Math.round(t.centroid.x * 1e4)},${Math.round(t.centroid.y * 1e4)}`;
				expect(keys.has(k)).toBe(false); // no duplicate tiles
				keys.add(k);
			}
		});
	}
});

describe("constructTileStraps (faithful growing-ray construction)", () => {
	const patch = buildRegularPatch(7, 3, 0);
	const tile = patch[0];

	it("produces in-disk strap segments; count = one per edge-ray that finds a crossing", () => {
		const segs = constructTileStraps(tile, (45 * Math.PI) / 180, 0, 1);
		expect(segs.length).toBeGreaterThan(0);
		expect(segs.length).toBeLessThanOrEqual(2 * tile.verts.length); // ≤ 2 rays per edge
		for (const [a, b] of segs) {
			expect(inDisk(a.x, a.y)).toBe(true);
			expect(inDisk(b.x, b.y)).toBe(true);
		}
	});

	it("edge offset slides the ray origins off the edge midpoints", () => {
		const base = constructTileStraps(tile, (45 * Math.PI) / 180, 0, 1);
		const shifted = constructTileStraps(tile, (45 * Math.PI) / 180, 0.4, 1);
		// Same number of rays, but the origins (segment starts) have moved.
		expect(shifted.length).toBe(base.length);
		let moved = 0;
		for (let i = 0; i < base.length; i++) {
			if (Math.hypot(base[i][0].x - shifted[i][0].x, base[i][0].y - shifted[i][0].y) > 1e-4) moved++;
		}
		expect(moved).toBeGreaterThan(0);
	});
});

describe("hyperbolicInterlaceData (over/under weave for the interlace style)", () => {
	const central = (p: number, q: number, ang = 45): StrapSegment[] =>
		constructTileStraps(buildRegularPatch(p, q, 0)[0], (ang * Math.PI) / 180, 0, 1).map(([a, b]) => ({ a, b, tile: 0 }));

	for (const [p, q] of [[4, 5], [5, 4], [7, 3]] as Array<[number, number]>) {
		const spec: WythoffSpec = { p, q, rings: [true, false, false], snub: false };
		it(`{${p},${q}}: appends 2 neighbour stubs per edge (central 2p + stubs 2p) and weaves consistently`, () => {
			const c = central(p, q);
			const { straps, under, degenerate } = hyperbolicInterlaceData(spec, c, 45, 0, 1, false);
			expect(c.length).toBe(2 * p);              // two rays per edge
			expect(straps.length).toBe(4 * p);          // central rosette + one neighbour stub pair per edge
			expect(under.length).toBe(straps.length);
			expect(degenerate).toBe(false);             // the 1-ring patch closes into a proper 4-valent weave
			// the leading entries are exactly the central straps, in order
			for (let i = 0; i < c.length; i++) {
				expect(straps[i].a).toEqual(c[i].a);
				expect(straps[i].b).toEqual(c[i].b);
			}
			// flags are bits, and both over and under occur (a real weave, not all one layer)
			expect(under.every((u) => u === 0 || u === 1)).toBe(true);
			expect(under.some((u) => u === 1)).toBe(true);
			expect(under.some((u) => u === 0)).toBe(true);
			// every neighbour stub shares its origin with a central edge midpoint (that shared point is the crossing)
			const QUANT = 1e5, key = (v: { x: number; y: number }) => `${Math.round(v.x * QUANT)},${Math.round(v.y * QUANT)}`;
			const centralOrigins = new Set(c.map((s) => key(s.a)));
			for (const stub of straps.slice(c.length)) expect(centralOrigins.has(key(stub.a))).toBe(true);
		});

		it(`{${p},${q}}: startUnder flips every flag (the two chiralities)`, () => {
			const c = central(p, q);
			const a = hyperbolicInterlaceData(spec, c, 45, 0, 1, false).under;
			const b = hyperbolicInterlaceData(spec, c, 45, 0, 1, true).under;
			expect(b.length).toBe(a.length);
			for (let i = 0; i < a.length; i++) expect(b[i]).toBe(a[i] ^ 1);
		});
	}

	it("uniform/snub: no neighbour stubs appended (central-only), but a consistent over/under weave", () => {
		// Uniform/snub can't take stubs (their fold reflects into the Schwarz triangle), so the shader uses the
		// disc-break fallback; the flags still have to be a consistent (non-degenerate) alternating weave over
		// the ACTUAL multi-tile strap set (uniformIslamicData / snubIslamicData).
		const cases: WythoffSpec[] = [
			{ p: 5, q: 4, rings: [true, true, false], snub: false }, // truncated
			{ p: 5, q: 4, rings: [true, true, true], snub: false },  // omnitruncated
			{ p: 5, q: 4, rings: [true, true, true], snub: true },   // snub
		];
		for (const spec of cases) {
			const data = spec.snub ? snubIslamicData(spec, 45, 0, 1) : uniformIslamicData(spec, 45, 0, 1);
			const { straps, under, degenerate } = hyperbolicInterlaceData(spec, data.straps, 45, 0, 1, false);
			expect(straps.length).toBe(data.straps.length); // central multi-tile set only — no 1-ring patch
			expect(degenerate).toBe(false);
			expect(under.some((u) => u === 1)).toBe(true);  // a real weave, both layers present
			expect(under.some((u) => u === 0)).toBe(true);
		}
	});
});
