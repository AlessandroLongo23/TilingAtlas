import { describe, it, expect } from 'vitest';
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { SeedExpander } from '@/classes/algorithm/SeedExpander';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator,
	VCGenerator,
	CompatibilityGraph,
	SeedSetExtractor,
	SeedBuilder,
	PolygonType,
	type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import type { Polygon } from '@/classes/polygons/Polygon';

setActiveRing(CyclotomicRing.create(24));

/** Expand a single VC (k=1), extract the cell, and count vertex orbits under the full symmetry group. */
function orbitCountForVC(name: string, threshold?: number): number | null {
	const vc = VertexConfiguration.fromName(name);
	const seed = new SeedConfiguration([vc]);
	const expander = new SeedExpander(1);
	if (threshold != null) expander.threshold = threshold;
	const patches: Polygon[][] = [];
	expander.expand(seed, (patch) => patches.push(patch));
	expect(patches.length).toBeGreaterThan(0);
	const patch = patches[0];
	const res = new TranslationalCellExtractor().extract(patch);
	expect(res).not.toBeNull();
	expect(res!.basisExact).toBeDefined();
	return new KUniformityChecker().countVertexOrbits(res!.cellPolygons, res!.basisExact![0], res!.basisExact![1]);
}

describe('exact k-uniformity gate: the 11 regular 1-uniform tilings each have exactly 1 vertex orbit', () => {
	// The 11 Archimedean (regular 1-uniform) tilings.
	const oneUniform = [
		'4,4,4,4',
		'3,3,3,3,3,3',
		'6,6,6',
		'3,3,3,3,6', // snub hexagonal (chiral; rotation-only symmetry group)
		'3,3,3,4,4',
		'3,3,4,3,4',
		'3,4,6,4',
		'3,6,3,6',
		'3,12,12',
		'4,6,12',
		'4,8,8',
	];
	for (const name of oneUniform) {
		it(`${name} → 1 orbit`, () => {
			expect(orbitCountForVC(name)).toBe(1);
		});
	}
});

describe('k=1 regular-polygon pipeline reproduces 11 (the gate is purely additive: all 11 pass)', () => {
	it('counts exactly 11 distinct 1-uniform tilings, all with orbit-count 1', () => {
		const parameters: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } };
		setActiveRing(computeRing(parameters));

		const pg = new PolygonsGenerator(parameters, []);
		const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
		const adj: Record<string, string[]> = {};
		for (const vc of vcs) adj[vc.name] = [];
		for (let i = 0; i < vcs.length; i++)
			for (let j = i + 1; j < vcs.length; j++)
				if (vcs[i].isCompatible(vcs[j])) {
					adj[vcs[i].name].push(vcs[j].name);
					adj[vcs[j].name].push(vcs[i].name);
				}
		const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
		const seedSets = new SeedSetExtractor(graph).findSeedSets(1);
		const seeds = new SeedBuilder().buildSeeds(1, 1, { seedSetLoader: () => seedSets });

		const extractor = new TranslationalCellExtractor();
		const checker = new KUniformityChecker();
		const seenCanonical = new Set<string>();
		const cells: PeriodCell[] = [];
		let extracted = 0;
		let gateRejected = 0;

		for (const seed of seeds) {
			new SeedExpander(1).expand(seed, (patch) => {
				const canonical = extractor.canonicalPatchKey(patch);
				if (seenCanonical.has(canonical)) return;
				seenCanonical.add(canonical);
				const result = extractor.extract(patch);
				if (!result || !result.basisExact) return;
				const orbits = checker.countVertexOrbits(result.cellPolygons, result.basisExact[0], result.basisExact[1]);
				if (orbits !== null && orbits !== 1) {
					gateRejected++;
					return;
				}
				extracted++;
				cells.push({ cellPolygons: result.cellPolygons, basisExact: [result.basisExact[0], result.basisExact[1]] });
			});
		}

		expect(extracted).toBe(11);
		expect(gateRejected).toBe(0); // no genuine 1-uniform tiling is wrongly dropped
		// congruence dedup must be ADDITIVE here: the 11 distinct Archimedean tilings (incl. the chiral
		// snub 3,3,3,3,6) are pairwise non-congruent, so it must not over-merge any of them.
		expect(dedupeByCongruence(cells).length).toBe(11);
	});
});

describe('the gate returns 2 for genuine 2-uniform tilings (not stuck at 1, and over-count fixed)', () => {
	// Build the k=2 seeds once.
	const parameters: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } };
	setActiveRing(computeRing(parameters));
	const pg = new PolygonsGenerator(parameters, []);
	const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
	const adj: Record<string, string[]> = {};
	for (const vc of vcs) adj[vc.name] = [];
	for (let i = 0; i < vcs.length; i++)
		for (let j = i + 1; j < vcs.length; j++)
			if (vcs[i].isCompatible(vcs[j])) {
				adj[vcs[i].name].push(vcs[j].name);
				adj[vcs[j].name].push(vcs[i].name);
			}
	const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
	const seedSets = new SeedSetExtractor(graph).findSeedSets(2);
	const seeds = new SeedBuilder().buildSeeds(2, 1, { seedSetLoader: () => seedSets });

	const STOP = Symbol('stop');
	/** Orbit count of the first DFS leaf that yields a valid periodic cell (deterministic). */
	function firstCellOrbits(seedName: string): number | null {
		const seed = seeds.find(
			(s) => s.name === seedName && new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2
		);
		expect(seed).toBeDefined();
		const cell = new TranslationalCellExtractor();
		const checker = new KUniformityChecker();
		let oc: number | null = null;
		try {
			new SeedExpander(2).expand(seed!, (patch) => {
				const r = cell.extract(patch);
				if (r && r.basisExact) {
					oc = checker.countVertexOrbits(r.cellPolygons, r.basisExact[0], r.basisExact[1]);
					throw STOP;
				}
			});
		} catch (e) {
			if (e !== STOP) throw e;
		}
		return oc;
	}

	// These two 2-uniform seeds reach their first periodic leaf quickly and deterministically.
	for (const name of ['[3,3,3,3,3,3;3,3,6,6]', '[3,3,3,3,3,3;3,3,4,3,4]']) {
		it(`${name} → first periodic cell has 2 vertex orbits`, { timeout: 30000 }, () => {
			expect(firstCellOrbits(name)).toBe(2);
		});
	}

	// Correctness invariant guaranteed by the Step-3b disallowed-VC prune: every emitted leaf uses
	// ONLY the seed's allowed vertex configurations (the old expander could emit invalid-VC patches).
	const angleUnits = (n: number) => (12 * (n - 2)) / n;
	const canonVC = (ns: number[]) => {
		const rotMin = (a: number[]) => {
			let best: string | null = null;
			for (let i = 0; i < a.length; i++) {
				const r = a.slice(i).concat(a.slice(0, i)).join(',');
				if (best === null || r < best) best = r;
			}
			return best!;
		};
		const f = rotMin(ns), r = rotMin(ns.slice().reverse());
		return f < r ? f : r;
	};
	function leafHasDisallowedVC(patch: Polygon[], allowed: Set<string>): boolean {
		const inc = new Map<string, { units: number; polys: Polygon[]; v: import('@/classes/Cyclotomic').Cyclotomic }>();
		for (const p of patch)
			for (const vx of p.exactVertices!) {
				const k = vx.key();
				const e = inc.get(k);
				if (e) { e.units += angleUnits(p.n); e.polys.push(p); }
				else inc.set(k, { units: angleUnits(p.n), polys: [p], v: vx });
			}
		for (const { units, polys, v } of inc.values()) {
			if (Math.abs(units - 24) > 1e-9) continue;
			const vf = v.toVector();
			const ns = polys
				.map((p) => ({ n: p.n, a: Math.atan2(p.centroid.y - vf.y, p.centroid.x - vf.x) }))
				.sort((x, y) => x.a - y.a)
				.map((w) => w.n);
			if (!allowed.has(canonVC(ns))) return true;
		}
		return false;
	}

	it('every emitted leaf of a fast 2-uniform seed uses only allowed VCs', { timeout: 30000 }, () => {
		const name = '[3,3,3,3,3,3;3,3,6,6]';
		const seed = seeds.find(
			(s) => s.name === name && new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2
		)!;
		const allowed = new Set(seed.vertexConfigurations.map((vc) => canonVC(vc.name.split(',').map(Number))));
		let leaves = 0, bad = 0;
		new SeedExpander(2).expand(seed, (patch) => {
			leaves++;
			if (leafHasDisallowedVC(patch, allowed)) bad++;
		});
		expect(leaves).toBeGreaterThan(0);
		expect(bad).toBe(0);
	});
});
