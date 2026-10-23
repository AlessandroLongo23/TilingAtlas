import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDataText } from "../../scripts/atlas/io.mjs";
import type { CataloguePatch } from "@/lib/tilings/hyp-developed";
import { su11Apply } from "@/lib/render/hyperbolic";
import { buildWalk, walkPoint } from "@/lib/render/hyperbolicWalk";
import { familyMember } from "@/lib/render/hypStarFamily";

// The hyperbolic star families: every record re-solved at its default must be the record as shipped
// (the TS solver and tools/ctrnact-oracle/hyp_geom.py agree), every member across the range must still
// be a tiling by stars, and the walk must place points inside the star that holds them.

const FILE = "public/hyperbolic-developed-stars.json.gz";
const families: CataloguePatch[] = existsSync(FILE)
	? (JSON.parse(readDataText(FILE)) as CataloguePatch[]).filter((p) => p.family)
	: [];

/** Poincaré → Klein, where geodesics are straight and an ordinary point-in-polygon test is exact. */
const klein = (z: { x: number; y: number }): [number, number] => {
	const s = 1 + z.x * z.x + z.y * z.y;
	return [(2 * z.x) / s, (2 * z.y) / s];
};
function inside(p: [number, number], poly: [number, number][]): boolean {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
	}
	return c;
}

describe.skipIf(!families.length)("hyperbolic star families", () => {
	it("ships 17,950 families, each with its range", () => {
		// one-star families, and two-star ones whose second point and edge follow the slider's
		expect(families.length).toBe(17950);
		expect(families.filter((p) => p.darts.starParam).length).toBe(15663);
		for (const p of families) expect(p.family!.alphaRangeDegOpen[1]).toBeGreaterThan(p.family!.defaultAlphaDeg);
	});

	it("re-solves every record at its default to the shipped edge and turns", () => {
		for (const p of families) {
			const m = familyMember(p, p.family!.defaultAlphaDeg)!;
			expect(Math.abs(m.edge - p.edge), p.id).toBeLessThan(1e-9);
			m.darts.alpha!.forEach((t, h) => expect(Math.abs(t - p.darts.alpha![h]), p.id).toBeLessThan(1e-9));
		}
	});

	it("keeps every dent reflex from one end of the range to the other", () => {
		for (const p of families) {
			const [lo, hi] = p.family!.alphaRangeDegOpen;
			// a share of the range, not a fixed margin: 50 needle families are under 1° wide
			for (const a of [lo + 0.02 * (hi - lo), (lo + hi) / 2, hi - 0.02 * (hi - lo)]) {
				const m = familyMember(p, a);
				expect(m, `${p.id} at ${a}`).not.toBeNull();
				m!.darts.alpha!.forEach((t, h) => {
					if (p.darts.starKind![h] === 2) expect(t, `${p.id} at ${a}`).toBeGreaterThan(Math.PI);
				});
			}
		}
	});

	it("walks every point into the star that holds it, reflex corners and all", () => {
		let seed = 1;
		const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
		for (const p of families) {
			const [lo, hi] = p.family!.alphaRangeDegOpen;
			const m = familyMember(p, lo + 0.2 * (hi - lo))!;
			const t = buildWalk(m.darts, m.edge, { allDrawn: true });
			for (let k = 0; k < 60; k++) {
				const r = 0.7 * Math.sqrt(rand());
				const th = 2 * Math.PI * rand();
				const res = walkPoint(t, t.dev.face, su11Apply(t.dev.home, { x: r * Math.cos(th), y: r * Math.sin(th) }));
				expect(res.ok, p.id).toBe(true);
				expect(inside(klein(res.w), t.verts[res.f].slice(0, -1).map(klein)), p.id).toBe(true);
			}
		}
	});
});
