import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	sphPolyBoardLabel,
	sphPolyFamilyLabel,
	sphPolyKGaps,
	sphPolyShardUrl,
	SPH_POLY_BOARDS,
	type SphPolyBoard,
	type SphPolyPattern,
} from "./sph-poly";
import { sphPolyScene } from "@/lib/render/sphPoly";

// The spherical 3.4.n.4 shelf's decode checks. The develop is develop_ai1_sph.py's business; what is
// asserted here is what the SHIPPED records must satisfy — the solid closes, its faces are the alphabet
// the edge arc forces, and the measured symmetry that names it is actually in the record.

const shardOf = (b: SphPolyBoard, k: number): SphPolyPattern[] | null => {
	const f = `public${sphPolyShardUrl(b.n, k)}`;
	return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as SphPolyPattern[]) : null;
};

const anyShard = existsSync("public/spherical-poly/sp3-k1.json");

/** Interior angle of a regular spherical p-gon of side ρ — the developer's formula, restated. */
function alpha(p: number, rho: number): number {
	const s = Math.sin(rho / 2) / Math.sin(Math.PI / p);
	if (s > 1) return Math.PI;
	const r = Math.asin(s);
	const v = (i: number): [number, number, number] => [
		Math.sin(r) * Math.cos((2 * Math.PI * i) / p),
		Math.sin(r) * Math.sin((2 * Math.PI * i) / p),
		Math.cos(r),
	];
	const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	const tangent = (a: number[], b: number[]) => {
		const d = dot(b, a);
		const t = [b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]];
		const n = Math.hypot(t[0], t[1], t[2]);
		return n < 1e-15 ? t : t.map((x) => x / n);
	};
	const v0 = v(0);
	const t1 = tangent(v0, v(1));
	const t2 = tangent(v0, v(p - 1));
	if (Math.hypot(...(t1 as [number, number, number])) < 1e-15) return 0;
	return Math.acos(Math.min(1, Math.max(-1, dot(t1, t2))));
}

describe("spherical 3.4.n.4 board manifest", () => {
	it("is the complete spherical half of the family: n = 3, 4, 5 and nothing else", () => {
		// 3.4.6.4 is Euclidean and everything above it hyperbolic, so these three are all there are.
		expect(SPH_POLY_BOARDS.map((b) => b.n)).toEqual([3, 4, 5]);
		for (const b of SPH_POLY_BOARDS) {
			expect(b.ks.length).toBeGreaterThan(0);
			expect(Object.keys(b.counts).map(Number).sort((x, y) => x - y)).toEqual([...b.ks].sort((x, y) => x - y));
		}
	});

	it("reports the family's own k holes", () => {
		expect(sphPolyKGaps(SPH_POLY_BOARDS.find((b) => b.n === 5)!)).toEqual([2, 5, 6, 10, 11, 13, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28]);
		expect(sphPolyKGaps(SPH_POLY_BOARDS.find((b) => b.n === 3)!)).toEqual([]);
	});

	it("labels a board by the vertex figure that defines it", () => {
		expect(sphPolyBoardLabel("3")).toBe("3.4.3.4");
		expect(sphPolyBoardLabel("5")).toBe("3.4.5.4");
	});
});

describe.skipIf(!anyShard)("spherical 3.4.n.4 shards", () => {
	const all = () =>
		SPH_POLY_BOARDS.flatMap((b) => b.ks.flatMap((k) => shardOf(b, k) ?? []));

	it("matches the manifest: every listed (board, k) exists with the listed count", () => {
		for (const b of SPH_POLY_BOARDS) {
			for (const k of b.ks) {
				const recs = shardOf(b, k);
				expect(recs, `n=${b.n} k=${k}`).not.toBeNull();
				expect(recs!.length, `n=${b.n} k=${k}`).toBe(b.counts[k]);
				for (const r of recs!) {
					expect(r.k).toBe(k);
					expect(r.base).toBe(String(b.n));
					expect(r.family).toBe(`3.4.${b.n}.4`);
				}
			}
		}
		expect(all().length).toBe(20); // the whole spherical half of the family
	});

	it("closes to a polyhedron whose faces are the alphabet the edge arc forces", () => {
		for (const b of SPH_POLY_BOARDS) {
			const sizes = [...new Set([3, 4, b.n, 2 * b.n])].sort((x, y) => x - y);
			for (const k of b.ks) {
				for (const r of shardOf(b, k)!) {
					const { verts, edges, faces } = r.stats;
					expect(verts - edges + faces, `${r.id} Euler`).toBe(2);
					expect(r.vertices.length).toBe(verts);
					expect(r.faces.length).toBe(faces);
					expect(r.edges.length).toBe(edges);
					expect(r.stats.sizes).toEqual(sizes);
					// Unit sphere; every side the one forced arc; every ring as long as its face size says.
					for (const v of r.vertices) expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 8);
					for (const [u, w] of r.edges) {
						const a = r.vertices[u];
						const c = r.vertices[w];
						expect(Math.acos(Math.min(1, Math.max(-1, a[0] * c[0] + a[1] * c[1] + a[2] * c[2])))).toBeCloseTo(r.edge, 6);
					}
					r.faces.forEach((ring, fi) => expect(ring.length).toBe(r.faceSize[fi]));
					// Both closing figures hold at the shipped arc — the identity that puts 2n in the alphabet.
					expect(alpha(3, r.edge) + 2 * alpha(4, r.edge) + alpha(b.n, r.edge)).toBeCloseTo(2 * Math.PI, 7);
					expect(alpha(4, r.edge) + alpha(b.n, r.edge) + alpha(2 * b.n, r.edge)).toBeCloseTo(2 * Math.PI, 7);
				}
			}
		}
	});

	it("carries a MEASURED symmetry, and it agrees with the certificate on all 20", () => {
		// k is the orbit count read off the finished solid, not the certificate's own. The two agreeing
		// everywhere is a cross-check of Marek's k, and the measurement is what separates the
		// rhombicuboctahedron from J37 — a pair identical in V, E, F and vertex figure.
		for (const r of all()) {
			expect(new Set(r.symOrbit).size, r.id).toBe(r.stats.symmetryOrbits);
			expect(r.stats.symmetryOrbits, r.id).toBe(r.k);
			expect(r.k, r.id).toBe(r.certK);
			expect(r.stats.symmetryOrder, r.id).toBeGreaterThan(0);
		}
		const byId = new Map(all().map((r) => [r.id, r]));
		const rhombi = byId.get("sp4-1-00001")!;
		const j37 = byId.get("sp4-2-00001")!;
		expect([rhombi.stats.verts, rhombi.stats.edges, rhombi.stats.faces]).toEqual([24, 48, 26]);
		expect([j37.stats.verts, j37.stats.edges, j37.stats.faces]).toEqual([24, 48, 26]);
		expect(rhombi.stats.figures).toEqual(j37.stats.figures); // identical everywhere locally
		expect(rhombi.stats.symmetryOrder).toBe(48);
		expect(j37.stats.symmetryOrder).toBe(16);
		expect(rhombi.solid).toBe("rhombicuboctahedron");
		expect(j37.solid).toBe("pseudo-rhombicuboctahedron (J37)");
	});

	it("finds the three uniform solids of the family at k = 1", () => {
		expect(shardOf(SPH_POLY_BOARDS[0], 1)![0].solid).toBe("cuboctahedron");
		expect(shardOf(SPH_POLY_BOARDS[1], 1)!.map((r) => r.solid).sort()).toEqual(["octagonal prism", "rhombicuboctahedron"]);
		expect(shardOf(SPH_POLY_BOARDS[2], 1)![0].solid).toBe("rhombicosidodecahedron");
	});

	it("keeps the n = 3 great-circle face, which is geometry and not a decode failure", () => {
		// At rho = pi/3 the hexagon's circumradius is exactly pi/2: its six vertices are on a great
		// circle and its interior angle is pi. Exactly one record in the family has one.
		expect(alpha(6, Math.PI / 3)).toBeCloseTo(Math.PI, 9);
		const withGC = all().filter((r) => r.stats.greatCircleFaces > 0);
		expect(withGC.map((r) => r.id)).toEqual(["sp3-2-00001"]);
		expect(withGC[0].stats.figures).toEqual([
			["3.4.3.4", 3],
			["3.4.6", 6],
		]);
	});

	it("turns a record into a scene whose tiles are the POLYGON SIZES and every edge is drawn", () => {
		for (const r of all()) {
			const scene = sphPolyScene(r);
			expect(scene.pattern.tiles.length).toBe(r.stats.sizes.length);
			expect(scene.pattern.tiles.reduce((n, t) => n + t.length, 0)).toBe(r.faces.length);
			// One group per size, holding exactly the faces of that size.
			r.stats.sizes.forEach((sz, i) => {
				expect(scene.pattern.tiles[i].length).toBe(r.stats.sizeCensus[i]);
				for (const ring of scene.pattern.tiles[i]) expect(ring.length).toBe(sz);
			});
			expect(scene.pattern.nDrawn).toBe(r.edges.length); // a tiling has no undrawn scaffold
			expect(scene.vertices).toBe(r.vertices); // handed through, never copied
		}
	});

	it("names a solid when it has a name and says what it is made of otherwise", () => {
		const byId = new Map(all().map((r) => [r.id, r]));
		expect(sphPolyFamilyLabel(byId.get("sp3-1-00001")!)).toBe("cuboctahedron");
		const unnamed = all().find((r) => !r.solid)!;
		expect(sphPolyFamilyLabel(unnamed)).toMatch(/^\d+ faces · \d+( · \d+)*$/);
	});
});
