import { describe, it, expect } from "vitest";
import { buildRegularPatch } from "@/lib/render/hyperbolicRegularPatch";

// The regular {p,q} patch the developed-tiling group extraction (hyperbolicGroup.ts) uses to replace an
// under-developed regular baked patch: a central p-gon at the origin grown by edge-reflection, deduped.

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
