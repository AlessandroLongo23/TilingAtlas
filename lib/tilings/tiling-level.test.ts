import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import {
	canonicalConfig,
	levelConfigsOf,
	tilingLevel,
	tilingLevelOf,
	TILING_LEVEL_ORDER,
	type TilingLevel,
} from "./tiling-level";

// Marek's five levels, asserted twice: once on hand-written configurations, where the boundaries are
// visible, and once as a census over every shipped curved-geometry shard, which is what catches a
// change of meaning in the data the classifier reads.

const read = (p: string) => decodeAtlas<any>(JSON.parse(readFileSync(p, "utf8")));
const HYP = "public/reference-atlas-hyperbolic.json";
const SPH = "public/reference-atlas-spherical.json";
const anyShard = existsSync(HYP) && existsSync(SPH);

describe("vertex-configuration canonicalisation", () => {
	it("identifies rotations and reflections of one configuration", () => {
		const a = canonicalConfig("3.4.10.4");
		expect(canonicalConfig("4.10.4.3")).toEqual(a);
		expect(canonicalConfig("4.3.4.10")).toEqual(a); // reflection
		expect(canonicalConfig("10.4.3.4")).toEqual(a);
	});

	it("keeps two cyclic orders of ONE multiset apart, which is the Combination/Hybrid boundary", () => {
		// {3,4,4,n} arranged two ways. Same combination, different configuration: were these identified,
		// every Combination tiling would collapse to Pseudo-Archimedean.
		expect(canonicalConfig("3.4.7.4")).not.toEqual(canonicalConfig("3.4.4.7"));
	});

	it("refuses what is not a vertex of a regular-polygon tiling", () => {
		expect(canonicalConfig("6*.3.6*")).toBeNull(); // star token
		expect(canonicalConfig("2.4.4")).toBeNull(); // a digon is a drawn edge, not a tile
		expect(canonicalConfig("3.4")).toBeNull(); // quotient figure, too short to be a vertex
		expect(canonicalConfig("4 tiles")).toBeNull();
	});
});

describe("the five levels", () => {
	it("separates the levels on their defining conditions", () => {
		expect(tilingLevelOf(["7.7.7"], 1)).toBe("regular"); // {7,3}
		expect(tilingLevelOf(["3.4.7.4"], 1)).toBe("archimedean"); // uniform, several sizes
		expect(tilingLevelOf(["3.4.7.4", "3.4.7.4"], 2)).toBe("pseudo-archimedean"); // m=1 < k
		expect(tilingLevelOf(["3.4.7.4", "3.4.4.7"], 2)).toBe("combination"); // one combination, two orders
		expect(tilingLevelOf(["3.4.7.4", "4.7.14"], 2)).toBe("hybrid"); // two combinations
	});

	it("takes k from the record, so a deduplicated list still lands on the right level", () => {
		// J37 lists its single configuration and has two vertex orbits. It is the textbook
		// Pseudo-Archimedean solid: 3.4.4.4 at every vertex, yet not vertex-transitive. Inferring k from
		// the list length would call it Archimedean and lose exactly the fact that makes it famous.
		expect(tilingLevelOf(["3.4.4.4"], 2)).toBe("pseudo-archimedean");
		expect(tilingLevelOf(["3.4.4.4"], 1)).toBe("archimedean");
	});

	it("returns null instead of a half-classification", () => {
		expect(tilingLevelOf([], 1)).toBeNull();
		expect(tilingLevelOf(["3.4.7.4", "6*.3"], 2)).toBeNull(); // one entry unparseable
		expect(tilingLevelOf(["3.4.7.4", "4.7.14"], 1)).toBeNull(); // m > k contradicts itself
	});

	it("describes tilings only, never the decorations of one", () => {
		// Edge systems, colourings, freedraw and the hollow shelf are excluded by payload, not by the
		// shape of their label: "6.6.7 · 4 tiles" would otherwise parse its first token as a vertex.
		const base = { k: 2, family: "6.6.7 · 4 tiles" };
		expect(levelConfigsOf({ ...base, hypEdges: {} })).toBeNull();
		expect(levelConfigsOf({ ...base, sphEdges: {} })).toBeNull();
		expect(levelConfigsOf({ ...base, hypColors: {} })).toBeNull();
		expect(levelConfigsOf({ ...base, freedraw: {} })).toBeNull();
		expect(levelConfigsOf({ ...base, schwarz: {} })).toBeNull();
		expect(levelConfigsOf({ ...base, hollow: {} })).toBeNull();
		// And a Euclidean record carries no per-orbit configurations at all.
		expect(levelConfigsOf({ k: 7, family: "3.4" })).toBeNull();
	});

	it("reads both orbit separators", () => {
		// " + " lists one configuration per orbit; " / " lists the distinct ones (the solids).
		expect(tilingLevel({ k: 2, family: "3.4.4.8 + 3.4.8.4", developed: {} })).toBe("combination");
		expect(tilingLevel({ k: 2, family: "3.3.4.4 / 3.4.3.4", spherical: {} })).toBe("combination");
	});
});

describe.skipIf(!anyShard)("the levels over every shipped curved shelf", () => {
	const census = (rows: { level: TilingLevel | null }[]) => {
		const c: Record<string, number> = {};
		for (const r of rows) c[r.level ?? "null"] = (c[r.level ?? "null"] ?? 0) + 1;
		return c;
	};

	it("censuses the hyperbolic developed catalogue, where hybrids are the outliers Marek says they are", () => {
		const rows = (read(HYP) as { k: number; family: string }[]).map((r) => ({
			level: tilingLevel({ ...r, developed: {} }),
		}));
		expect(rows.length).toBe(28453);
		expect(census(rows)).toEqual({
			regular: 27,
			archimedean: 12141,
			"pseudo-archimedean": 7606,
			combination: 8676,
			hybrid: 3,
		});
	});

	it("names the three hyperbolic hybrids, since three in 28,453 is the claim worth pinning", () => {
		const hybrids = (read(HYP) as { id: string; k: number; family: string }[])
			.filter((r) => tilingLevel({ ...r, developed: {} }) === "hybrid")
			.map((r) => r.family);
		expect(hybrids).toEqual(["3.3.3.7.7 + 3.7.7.7", "3.3.3.7.7 + 3.7.7.7", "3.8.3.8.8 + 8.8.8.8"]);
	});

	it("classifies every solid, including the twins the census alone cannot separate", () => {
		const rows = read(SPH) as { id: string; k: number; family: string }[];
		expect(rows.length).toBe(40);
		expect(census(rows.map((r) => ({ level: tilingLevel({ ...r, spherical: {} }) })))).toEqual({
			regular: 5,
			archimedean: 23,
			"pseudo-archimedean": 1,
			combination: 4,
			hybrid: 7,
		});
		const of = (id: string) => {
			const r = rows.find((x) => x.id === id)!;
			return tilingLevel({ ...r, spherical: {} });
		};
		// The pair that motivated the whole measured-symmetry business in develop_sph_edges.py: J37 is
		// 3.4.4.4 at every vertex yet has two orbits, and the cuboctahedron's ortho twin J27 reorders one
		// combination without changing it.
		expect(of("sph-pseudo-rhombicuboctahedron")).toBe("pseudo-archimedean");
		expect(of("sph-triangular-orthobicupola")).toBe("combination");
		// J19 mixes 3.4.4.4 with 4.4.8: two combinations at one edge length, a spherical member of AI1_4.
		expect(of("sph-elongated-square-cupola")).toBe("hybrid");
	});
});

describe("the level order is the ladder", () => {
	it("runs from least to most complex, with no duplicates", () => {
		expect(TILING_LEVEL_ORDER).toEqual([
			"regular",
			"archimedean",
			"pseudo-archimedean",
			"combination",
			"hybrid",
		]);
		expect(new Set(TILING_LEVEL_ORDER).size).toBe(TILING_LEVEL_ORDER.length);
	});
});
