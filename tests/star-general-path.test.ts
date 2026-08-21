/**
 * Phase-1 general star path (CC work order 2026-07-07): lock the contract that star k=2 seed pairs are
 * DERIVED from the exact compatibility relation + seed-set enumeration, not hand-fed. The always-on
 * assertions are cheap (enumeration + merge-search compatibility over one species group, no solve) and
 * mirror the driver's GATE-0: a target fig's two orbit VCs must be enumerated and mutually compatible,
 * and their pair must appear as a k=2 seed-set. The full solve → gate → k=2 cell is heavy (PeriodSolver
 * over a widened pool) and lives behind RUN_STAR_FILL=1, matching tests/star-fill-positive.test.ts.
 */
const RUN_STAR_FILL = process.env.RUN_STAR_FILL === "1";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CyclotomicRing, Cyclotomic, setActiveRing } from "@/classes/Cyclotomic";
import { PeriodSolver } from "@/classes/algorithm/PeriodSolver";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import {
	enumerateStarVCs,
	placeStarVCPair,
	isStarBearing,
	starVCFromOrbitString,
	type StarVC,
} from "@/classes/algorithm/StarVC";
import {
	generateStarVCCompatibility,
	starSeedSets,
	areStarVCsCompatible,
	type StarCompatibility,
} from "@/classes/algorithm/StarCompatibility";
import type { SeedConfigurationLike } from "@/classes/algorithm/SeedExpander";
import { independentCellGate } from "../scripts/_starCellGate";

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

// Two in-ring point-only figs, one star species each (from experiments/star-oracle/myers-2009-k2.json):
//   Fig 40 = (3.4.8.3.8*π/12 ; 4.8.8)   — star orbit + purely-regular orbit, species 8*@1
//   Fig 43 = (4.4.8*π/4.4.8*π/4 ; 4.4.4.4) — species 8*@3, the smallest-det k=2 star cell (≈11.6569)
const FIG40 = { orbits: ["3.4.8.3.8*p@1", "4.8.8"], variants: [{ n: 8, alphaU: 1 }] };
const FIG43 = { orbits: ["4.4.8*p@3.4.8*p@3", "4.4.4.4"], variants: [{ n: 8, alphaU: 3 }] };

type Spec = { orbits: string[]; variants: { n: number; alphaU: number }[] };

/**
 * The enumeration and the compatibility graph are cached SEPARATELY, because their costs differ by six
 * orders of magnitude and most of this file only needs the cheap half.
 *
 * enumerateStarVCs is sub-millisecond (68 VCs for fig 40, 34 for fig 43 — measured). Building the graph
 * over those is O(V²) exact placements: 2,278 + 561 = 2,839 pairs, each running placeStarVCPair twice,
 * ~277 s together. They used to be built as one unit, so the first test to touch a spec paid for a
 * graph it never read.
 */
const enumCache = new Map<string, ReturnType<typeof buildEnum>>();
function buildEnum(spec: Spec) {
	const vcs = enumerateStarVCs({ variants: spec.variants, includeStarFree: true });
	const map = new Map<string, StarVC>();
	for (const vc of vcs) if (!map.has(vc.name)) map.set(vc.name, vc);
	const names = spec.orbits.map((o) => starVCFromOrbitString(o).name) as [string, string];
	return { vcs, map, names };
}
function enumFor(spec: Spec) {
	const key = spec.orbits.join("|");
	if (!enumCache.has(key)) enumCache.set(key, buildEnum(spec));
	return enumCache.get(key)!;
}

/** The O(V²) half. Only the RUN_STAR_FILL block builds this. */
const compatCache = new Map<string, StarCompatibility>();
function compatFor(spec: Spec) {
	const key = spec.orbits.join("|");
	if (!compatCache.has(key)) compatCache.set(key, generateStarVCCompatibility(enumFor(spec).vcs, ring));
	return compatCache.get(key)!;
}

describe("Phase-1 general star path — compatibility & seed-set derivation (GATE-0 contract)", () => {
	it("enumerates both orbit VCs of figs 40 and 43, incl. the purely-regular partner (includeStarFree)", () => {
		for (const spec of [FIG40, FIG43]) {
			const { map, names } = enumFor(spec);
			expect(map.has(names[0])).toBe(true);
			expect(map.has(names[1])).toBe(true);
			// exactly one orbit of each is purely regular (4.8.8 / 4.4.4.4) — the k≥2 star-free partner
			const starCount = names.filter((n) => isStarBearing(map.get(n)!)).length;
			expect(starCount).toBe(1);
		}
	});

	/**
	 * "The pair is derived, not hand-fed" was checked by building the WHOLE graph and then looking up one
	 * edge in it, 277 s to read two booleans. It splits into two independent claims that cost ~0.2 s:
	 *
	 *   (a) the exact relation marks THIS pair compatible, and starSeedSets carries it through to a k=2
	 *       seed-set. Run over the real production chain, just with the node set cut to the pair itself;
	 *       generateStarVCCompatibility decides each edge pairwise, so no other node can change it.
	 *   (b) starSeedSets(., 2) emits every edge of a graph it is given, so (a) surviving in the 2-node
	 *       graph means it survives in the full one. Checked on a synthetic graph, where the expected
	 *       answer is known by construction instead of by a 4-minute search.
	 *
	 * (a) and (b) together are the original assertion. The full-graph derivation runs under RUN_STAR_FILL=1.
	 */
	it("marks each fig's orbit pair mutually compatible and present as a k=2 seed-set", () => {
		for (const spec of [FIG40, FIG43]) {
			const { map, names } = enumFor(spec);
			const pairOnly = generateStarVCCompatibility([map.get(names[0])!, map.get(names[1])!], ring);
			expect(areStarVCsCompatible(pairOnly, names[0], names[1])).toBe(true);
			const key = [...names].sort().join(" + ");
			const seedSets = starSeedSets(pairOnly, 2).filter((ss) => ss.length === 2);
			expect(seedSets.some((ss) => [...ss].sort().join(" + ") === key)).toBe(true);
		}
	});

	it("starSeedSets(., 2) emits exactly the edges of the graph, so no edge is lost among other nodes", () => {
		// path a-b-c plus an isolated d: the k=2 seed-sets must be exactly {a,b} and {b,c}.
		const g: StarCompatibility = {
			vcNames: ["a", "b", "c", "d"],
			adjacencyList: { a: ["b"], b: ["a", "c"], c: ["b"], d: [] },
		};
		const got = starSeedSets(g, 2)
			.filter((ss) => ss.length === 2)
			.map((ss) => [...ss].sort().join(" + "))
			.sort();
		expect(got).toEqual(["a + b", "b + c"]);
	});

	it("the merge-search finds ≥1 admissible 2-fan placement for each fig pair", () => {
		for (const spec of [FIG40, FIG43]) {
			const { map, names } = enumFor(spec);
			const a = map.get(names[0])!;
			const b = map.get(names[1])!;
			const placements = [...placeStarVCPair(a, b, ring, 4), ...placeStarVCPair(b, a, ring, 4)];
			expect(placements.length).toBeGreaterThanOrEqual(1);
			// a placement is a connected, overlap-free union spanning two distinct shared vertices
			const p = placements[0];
			expect(p.anchorA.key()).not.toBe(p.anchorB.key());
			expect(p.union.length).toBeGreaterThanOrEqual(a.tokens.length); // ≥ fan A's tiles
		}
	});

	// The exhaustive form of the seed-set test: derive the pair from the FULL enumerated VC set, the way
	// the driver's GATE-0 does. 2,839 exact pair placements, ~277 s, which is why it is not always-on.
	describe.runIf(RUN_STAR_FILL)("full-graph derivation [HEAVY, RUN_STAR_FILL=1]", () => {
		it("finds each fig's pair among the k=2 seed-sets of the whole compatibility graph", () => {
			for (const spec of [FIG40, FIG43]) {
				const { names } = enumFor(spec);
				const compat = compatFor(spec);
				expect(areStarVCsCompatible(compat, names[0], names[1])).toBe(true);
				const key = [...names].sort().join(" + ");
				const seedSets = starSeedSets(compat, 2).filter((ss) => ss.length === 2);
				expect(seedSets.some((ss) => [...ss].sort().join(" + ") === key)).toBe(true);
			}
		}, 900_000);
	});

	describe.runIf(RUN_STAR_FILL)("end-to-end: fig 43 solves to a gated k=2 cell [HEAVY, RUN_STAR_FILL=1]", () => {
		beforeAll(() => {
			process.env.POOL_STEPS_UP = "8";
			process.env.POOL_LMAX_UP = "5.7";
		});
		afterAll(() => {
			delete process.env.POOL_STEPS_UP;
			delete process.env.POOL_LMAX_UP;
		});

		it("derives fig 43's pair, fills+solves, and certifies a 2-orbit cell (det ≈ 11.6569)", () => {
			const { map, names } = enumFor(FIG43);
			const a = map.get(names[0])!;
			const b = map.get(names[1])!;
			const placements = [...placeStarVCPair(a, b, ring, 12), ...placeStarVCPair(b, a, ring, 12)];
			expect(placements.length).toBeGreaterThanOrEqual(1);

			let solved: { det: number; orbits: number; gate: boolean } | null = null;
			for (const c of placements.slice(0, 4)) {
				const seed: SeedConfigurationLike = {
					polygons: c.union,
					vertexConfigurations: [
						{ computeSharedVertexExact: () => c.anchorA, polygons: c.union.filter((p) => p.vertexKeySet().has(c.anchorA.key())) },
						{ computeSharedVertexExact: () => c.anchorB, polygons: c.union.filter((p) => p.vertexKeySet().has(c.anchorB.key())) },
					],
				};
				const { cells } = new PeriodSolver(2).solve(seed, { maxMs: 300_000 });
				for (const cell of cells) {
					const g = independentCellGate(cell);
					if (!g.pass) continue;
					const orbits = new KUniformityChecker().countVertexOrbits(cell.cellPolygons, cell.basisExact[0], cell.basisExact[1], { syms: 0, reps: 0, blockSize: 0, orbits: null });
					if (orbits !== 2) continue;
					const det = Math.abs(
						cell.basisExact[0].toVector().x * cell.basisExact[1].toVector().y -
							cell.basisExact[0].toVector().y * cell.basisExact[1].toVector().x,
					);
					solved = { det, orbits, gate: g.pass };
					break;
				}
				if (solved) break;
			}
			expect(solved).not.toBeNull();
			expect(solved!.gate).toBe(true);
			expect(solved!.orbits).toBe(2);
			expect(solved!.det).toBeCloseTo(11.6569, 3);
		}, 1_500_000);
	});
});
