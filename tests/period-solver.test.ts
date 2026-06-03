import { describe, it, expect } from 'vitest';
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
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
import { setActiveRing } from '@/classes/Cyclotomic';
import type { SeedConfiguration as SeedConfigurationType } from '@/classes/algorithm/SeedConfiguration';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } };
setActiveRing(computeRing(params));

const checker = new KUniformityChecker();

/** Build all k-uniform seeds for the regular core (pipeline stages 1–5). */
function buildSeeds(k: number): SeedConfigurationType[] {
	const pg = new PolygonsGenerator(params, []);
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
	const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
	return new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
}

describe('PeriodSolver (solve-for-period torus construction) — k=1 cells are primitive & 1-uniform', () => {
	// Each VC, solved by fixing the period and filling the torus, yields exactly ONE primitive cell
	// with exactly one vertex orbit. (No supercells: the primitivity filter rejects them.)
	for (const name of ['4,4,4,4', '3,3,3,3,6', '6,6,6', '3,6,3,6']) {
		it(`${name} → one primitive cell, 1 vertex orbit`, { timeout: 30000 }, () => {
			const seed = new SeedConfiguration([VertexConfiguration.fromName(name)]);
			const { cells } = new PeriodSolver(1).solve(seed, {});
			expect(cells.length).toBe(1);
			const orbit = checker.countVertexOrbits(cells[0].cellPolygons, cells[0].basisExact[0], cells[0].basisExact[1]);
			expect(orbit).toBe(1);
		});
	}
});

describe('PeriodSolver — a 2-uniform seed yields a genuine 2-orbit cell', () => {
	it('[3,3,3,3,3,3;3,3,6,6] yields a cell with exactly 2 vertex orbits', { timeout: 90000 }, () => {
		// The pipeline runs every concrete realisation of a seed name; at least one must tile.
		const concretes = buildSeeds(2).filter((s) => s.name === '[3,3,3,3,3,3;3,3,6,6]');
		expect(concretes.length).toBeGreaterThan(0);
		const orbits: (number | null)[] = [];
		for (const seed of concretes) {
			const { cells } = new PeriodSolver(2).solve(seed, { maxMs: 60000 });
			for (const c of cells) orbits.push(checker.countVertexOrbits(c.cellPolygons, c.basisExact[0], c.basisExact[1]));
		}
		expect(orbits).toContain(2); // the genuine 2-uniform cell is found
		for (const o of orbits) expect(o === null || o === 2).toBe(true); // gate is sound: only 2-uniform emitted
	});
});

describe('PeriodSolver — the hard k=2 seeds now FINISH (bounded torus, no hang)', () => {
	// The expand-and-extract path could not finish these seeds (it grew unbounded allowed-VC
	// non-periodic patches to radius 6k and hit the 90s cap). Fixing the period first makes the fill
	// finite, so the solver returns well within budget without timing out.
	for (const name of ['[3,3,3,3,3,3;3,3,3,3,6]', '[3,3,3,3,3,3;3,3,3,4,4]']) {
		it(`${name} terminates without timeout`, { timeout: 60000 }, () => {
			const seeds = buildSeeds(2).filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2);
			const concretes = seeds.filter((s) => s.name === name);
			expect(concretes.length).toBeGreaterThan(0);
			for (const seed of concretes) {
				const { cells, diag } = new PeriodSolver(2).solve(seed, { maxMs: 40000 });
				expect(diag.timedOut).toBe(false);
				// every EMITTED cell is exactly 2-uniform (the gate is sound)
				for (const c of cells) {
					const o = checker.countVertexOrbits(c.cellPolygons, c.basisExact[0], c.basisExact[1]);
					expect(o === null || o === 2).toBe(true);
				}
			}
		});
	}
});

describe('PeriodSolver — emitted cells are exact, gap-free, primitive tilings', () => {
	it('every emitted k=1 cell area equals |det(basis)| (gap-free) and canonicalises uniquely', { timeout: 30000 }, () => {
		const seed = new SeedConfiguration([VertexConfiguration.fromName('3,4,6,4')]);
		const { cells } = new PeriodSolver(1).solve(seed, {});
		const ex = new TranslationalCellExtractor();
		const regularArea = (n: number) => n / (4 * Math.tan(Math.PI / n));
		const keys = new Set<string>();
		for (const c of cells) {
			const [u, v] = c.basisExact;
			const uV = u.toVector(), vV = v.toVector();
			const det = Math.abs(uV.x * vV.y - uV.y * vV.x);
			const area = c.cellPolygons.reduce((s, p) => s + regularArea(p.n), 0);
			expect(Math.abs(area - det)).toBeLessThan(1e-4 * Math.max(1, det)); // gap-free
			keys.add(ex.canonicalKey(c.cellPolygons));
		}
		expect(keys.size).toBe(cells.length); // distinct cells
	});
});
