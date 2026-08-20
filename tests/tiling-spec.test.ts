import { describe, it, expect } from "vitest";
import { buildTilingSpec } from "@/lib/services/tilingSpec";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import type { SymmetryData } from "@/lib/classes/symmetry/types";

const base = { certified: false as const, runIds: [] as string[], renderCell: null };

const euclid: CatalogueTiling = {
	...base,
	canonicalKey: "t123",
	k: 7,
	family: "3.4.6.12",
	m: 3,
	partition: [5, 1, 1],
	wallpaperGroup: "p6m",
	latticeShape: "hexagonal",
};

describe("buildTilingSpec", () => {
	it("euclidean: derives orbifold from the group, carries k/m/partition, flags orbits", () => {
		const spec = buildTilingSpec(euclid, null, { k: 7, orbitAt: () => -1 });
		expect(spec.geometry).toBe("euclidean");
		if (spec.geometry !== "euclidean") throw new Error("geometry");
		expect(spec.label).toBe("3.4.6.12");
		expect(spec.wallpaperGroup).toBe("p6m");
		expect(spec.orbifold).toBe("*632");
		expect(spec.latticeShape).toBe("hexagonal");
		expect(spec.k).toBe(7);
		expect(spec.m).toBe(3);
		expect(spec.partition).toEqual([5, 1, 1]);
		expect(spec.edgeOrbits).toBeNull();
		expect(spec.faceOrbits).toBeNull();
	});

	it("euclidean: live symmetryData overrides the build-computed group/lattice", () => {
		const sd = { group: "p4m", orbifold: "*442", latticeShape: "square" } as unknown as SymmetryData;
		const spec = buildTilingSpec(euclid, sd, null);
		if (spec.geometry !== "euclidean") throw new Error("geometry");
		expect(spec.wallpaperGroup).toBe("p4m");
		expect(spec.orbifold).toBe("*442");
		expect(spec.latticeShape).toBe("square");
	});

	it("spherical Platonic: point group + V/E/F via Euler", () => {
		const t: CatalogueTiling = {
			...base,
			canonicalKey: "s",
			k: 1,
			family: "5.5.5",
			spherical: { p: 5, q: 3, solid: "dodecahedron" },
		};
		const spec = buildTilingSpec(t, null, null);
		if (spec.geometry !== "spherical") throw new Error("geometry");
		// The name leads and {p,q} goes under it: these headers truncate, and the name is what is read.
		expect(spec.label).toBe("Dodecahedron");
		expect(spec.detail).toBe("{5,3}");
		expect(spec.pointGroup).toBe("Ih");
		expect(spec.orbifold).toBe("*532");
		expect(spec.counts).toEqual({ V: 20, E: 30, F: 12 });
	});

	it("spherical Archimedean: solid name only, no {p,q}, no counts", () => {
		const t: CatalogueTiling = {
			...base,
			canonicalKey: "a",
			k: 1,
			family: "3.6.6",
			spherical: { solid: "truncated-tetrahedron" },
		};
		const spec = buildTilingSpec(t, null, null);
		if (spec.geometry !== "spherical") throw new Error("geometry");
		expect(spec.label).toBe("Truncated tetrahedron");
		expect(spec.detail).toBe("3.6.6");
		expect(spec.pointGroup).toBeNull();
		expect(spec.counts).toBeNull();
	});

	// ⚑ The two below are the regression: geometryOf answers "spherical" for six shelves, and until
	// 2026-08-20 only `spherical` and `sphericalFreedraw` had a branch. The other four fell through to the
	// Euclidean return and the info card printed "Euclidean" over a record on the sphere.
	it("spherical star: the solid's name leads and the density goes under it", () => {
		const t: CatalogueTiling = {
			...base,
			canonicalKey: "ss-12-30-12-d3",
			k: 1,
			family: "density 3 · great dodecahedron {5,5/2}",
			sphStar: {
				config: "5.5.5.5.5",
				density: 3,
				solid: "great dodecahedron {5,5/2}",
				stats: { types: [[5, 1, 12]] },
			} as unknown as CatalogueTiling["sphStar"],
		};
		const spec = buildTilingSpec(t, null, null);
		expect(spec.geometry).toBe("spherical");
		if (spec.geometry !== "spherical") throw new Error("geometry");
		expect(spec.label).toBe("great dodecahedron {5,5/2}");
		expect(spec.detail).toBe("density 3");
	});

	it("an unnamed star polyhedron says its density once, not twice", () => {
		// ⚑ Its family label carries the density too, since an unnamed record has nothing else to be called
		// by. Reusing that as the heading's name printed "… · density 4" over "density 4".
		const t: CatalogueTiling = {
			...base,
			canonicalKey: "ss-60-150-92-d4",
			k: 1,
			family: "20{3} + 12{5/2} + 12{10} · density 4",
			sphStar: {
				config: "3.10.5/2.10",
				density: 4,
				stats: { types: [[3, 1, 20], [5, 2, 12], [10, 1, 12]] },
			} as unknown as CatalogueTiling["sphStar"],
		};
		const spec = buildTilingSpec(t, null, null);
		if (spec.geometry !== "spherical") throw new Error("geometry");
		expect(spec.label).toBe("20{3} + 12{5/2} + 12{10}");
		expect(spec.label).not.toContain("density");
		expect(spec.detail).toBe("density 4");
	});

	it("spherical shelves with no solid to name still say Spherical", () => {
		const t: CatalogueTiling = {
			...base,
			canonicalKey: "sp3-1-00001",
			k: 1,
			family: "3.4.3.4 · cuboctahedron",
			sphPoly: { base: "3", config: "3.4", solid: "cuboctahedron" } as unknown as CatalogueTiling["sphPoly"],
		};
		const spec = buildTilingSpec(t, null, null);
		expect(spec.geometry).toBe("spherical");
		if (spec.geometry !== "spherical") throw new Error("geometry");
		// The board label is the vertex figure; the solid's own name is what leads.
		expect(spec.label).toBe("cuboctahedron");
		expect(spec.detail).toBe("3.4.3.4");
	});

	it("V/E/F for the other four Platonic solids", () => {
		const mk = (p: number, q: number, solid: string): CatalogueTiling => ({
			...base, canonicalKey: solid, k: 1, family: "x", spherical: { p, q, solid },
		});
		const cube = buildTilingSpec(mk(4, 3, "cube"), null, null);
		const octa = buildTilingSpec(mk(3, 4, "octahedron"), null, null);
		const tetra = buildTilingSpec(mk(3, 3, "tetrahedron"), null, null);
		const icosa = buildTilingSpec(mk(3, 5, "icosahedron"), null, null);
		if (cube.geometry !== "spherical" || octa.geometry !== "spherical") throw new Error();
		if (tetra.geometry !== "spherical" || icosa.geometry !== "spherical") throw new Error();
		expect(cube.counts).toEqual({ V: 8, E: 12, F: 6 });
		expect(octa.counts).toEqual({ V: 6, E: 12, F: 8 });
		expect(tetra.counts).toEqual({ V: 4, E: 6, F: 4 });
		expect(icosa.counts).toEqual({ V: 12, E: 30, F: 20 });
		expect(cube.pointGroup).toBe("Oh");
		expect(tetra.pointGroup).toBe("Td");
	});
});
