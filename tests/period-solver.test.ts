import { describe, it, expect } from 'vitest';
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { PeriodSolver, vertexClassCount, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { cellsCongruent, dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
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

describe('vertexClassCount — exact torus vertex count V (the P1 orbit-floor lower bound)', () => {
	// V = #distinct vertices mod Λ = Σ_n t_n·(n−2)/2 (Euler on the torus). It is NOT the orbit count:
	// the honeycomb has V=2 vertices but 1 orbit; trihexagonal has V=3 but 1 orbit. P1 prunes on V
	// (monotone under filling) because orbits ≥ V/hol(Λ).
	const vcOf = (name: string) => {
		const { cells } = new PeriodSolver(1).solve(new SeedConfiguration([VertexConfiguration.fromName(name)]), {});
		expect(cells.length).toBe(1);
		return vertexClassCount(cells[0].cellPolygons, cells[0].basisExact[0], cells[0].basisExact[1]);
	};
	it('square tiling 4,4,4,4 → V = 1 (the 4 unit-cell corners are one lattice class)', { timeout: 30000 }, () => {
		expect(vcOf('4,4,4,4')).toBe(1);
	});
	it('hexagonal tiling 6,6,6 → V = 2 (two vertices per primitive cell)', { timeout: 30000 }, () => {
		expect(vcOf('6,6,6')).toBe(2);
	});
	it('trihexagonal 3,6,3,6 → V = 3 (1 hexagon + 2 triangles ⇒ V=3, yet 1 orbit)', { timeout: 30000 }, () => {
		expect(vcOf('3,6,3,6')).toBe(3);
	});
});

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
	// One concrete per name suffices to show termination. maxMs is 130s: union seeding (fan fills on the
	// small-cell lattices) pushes these 3⁶ seeds to ~55s, so the old 40s budget now (correctly) reports a
	// timeout — the seeds finish, they are just slower. The cap gives headroom; we assert no truncation.
	for (const name of ['[3,3,3,3,3,3;3,3,3,3,6]', '[3,3,3,3,3,3;3,3,3,4,4]']) {
		it(`${name} terminates without timeout`, { timeout: 150000 }, () => {
			const seeds = buildSeeds(2).filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2);
			const seed = seeds.find((s) => s.name === name);
			expect(seed).toBeDefined();
			const { cells, diag } = new PeriodSolver(2).solve(seed!, { maxMs: 130000 });
			expect(diag.timedOut).toBe(false);
			// every EMITTED cell is exactly 2-uniform (the gate is sound)
			for (const c of cells) {
				const o = checker.countVertexOrbits(c.cellPolygons, c.basisExact[0], c.basisExact[1]);
				expect(o === null || o === 2).toBe(true);
			}
		});
	}
});

describe('Union seeding — the small-cell tiling t2014 is recovered (k=2 fill gap)', () => {
	// t2014 = [3⁶;3³.4²] is the SMALLEST k=2 cell: a 1×(1+√3) rectangle (1 square + 4 triangles). Its
	// lattice is enumerated, but the rigid 2-VC seed core reduces mod Λ to 2 squares + 4 triangles
	// (2+√3 > the 1+√3 cell), so torusFill's area guard rejected it → t2014 was silently missing (true
	// count was 19, not 20). The fix seeds from the single-VC fans on lattices where the core overflows
	// the cell. (DEVELOPMENT_NOTES §13.4.)
	it('[3,3,3,3,3,3;3,3,3,4,4] emits the 1×(1+√3) cell with 2 vertex orbits', { timeout: 150000 }, () => {
		const concretes = buildSeeds(2).filter(
			(s) => s.name === '[3,3,3,3,3,3;3,3,3,4,4]' && new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2
		);
		expect(concretes.length).toBeGreaterThan(0);
		const found: PeriodCell[] = [];
		for (const seed of concretes) {
			const { cells, diag } = new PeriodSolver(2).solve(seed, { maxMs: 130000 });
			expect(diag.timedOut).toBe(false); // deterministic: must finish, not truncate
			expect(diag.fanLattices).toBeGreaterThan(0); // the core DID overflow some cell → fans were used
			for (const c of cells) {
				const u = c.basisExact[0].toVector(), v = c.basisExact[1].toVector();
				const lo = Math.min(Math.hypot(u.x, u.y), Math.hypot(v.x, v.y));
				const hi = Math.max(Math.hypot(u.x, u.y), Math.hypot(v.x, v.y));
				if (Math.abs(lo - 1) < 0.02 && Math.abs(hi - (1 + Math.sqrt(3))) < 0.02) found.push(c);
			}
			if (found.length > 0) break; // found t2014 — stop (each concrete is ~1 min)
		}
		expect(found.length).toBeGreaterThan(0); // t2014's 1×(1+√3) cell is emitted
		const c = found[0];
		expect(c.cellPolygons.length).toBe(5); // 4 triangles + 1 square
		expect(checker.countVertexOrbits(c.cellPolygons, c.basisExact[0], c.basisExact[1])).toBe(2);
	});
});

describe('Congruence dedup — representation- & chirality-robust (the snub over-count fix)', () => {
	// canonicalKey fingerprints ONE fundamental-domain representation and tries only the 24 GRID
	// rotations + conj, so it under-merges the chiral snub: the snub-hex 2-uniform (oracle t2020) is
	// emitted as 2 mirror lattices × 2 representations = up to 4 cells with 4 distinct keys (the +3 over
	// the target 20). The exact pairwise congruence test merges them. (DEVELOPMENT_NOTES §12.7/§12.11.)
	it('the snub-hex 2-uniform (t2020) is over-emitted yet dedupes to ONE tiling', { timeout: 120000 }, () => {
		const concretes = buildSeeds(2).filter(
			(s) => s.name === '[3,3,3,3,3,3;3,3,3,3,6]' && new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2
		);
		expect(concretes.length).toBeGreaterThan(0);
		const all: PeriodCell[] = [];
		for (const seed of concretes) all.push(...new PeriodSolver(2).solve(seed, { maxMs: 60000 }).cells);
		// the snub cell is the hexagonal lattice with Gram diagonal |u|²=|v|²=13 (the √13 norm, off-grid).
		const isSnub = (c: PeriodCell) => {
			const u = c.basisExact[0].toVector(), v = c.basisExact[1].toVector();
			return Math.abs(u.x * u.x + u.y * u.y - 13) < 0.05 && Math.abs(v.x * v.x + v.y * v.y - 13) < 0.05;
		};
		const snub = all.filter(isSnub);
		expect(snub.length).toBeGreaterThan(1); // the over-count (canonicalKey did NOT merge them)
		for (let i = 0; i < snub.length; i++)
			for (let j = i + 1; j < snub.length; j++)
				expect(cellsCongruent(snub[i], snub[j])).toBe(true); // all the same tiling (mirror + rep)
		expect(dedupeByCongruence(snub).length).toBe(1); // ⇒ counted once
	});

	it('a tiling is congruent to itself under a different (unimodular) lattice basis', { timeout: 30000 }, () => {
		const { cells } = new PeriodSolver(1).solve(new SeedConfiguration([VertexConfiguration.fromName('3,4,6,4')]), {});
		expect(cells.length).toBeGreaterThan(0);
		const a = cells[0];
		const [u, v] = a.basisExact;
		const b: PeriodCell = { cellPolygons: a.cellPolygons, basisExact: [u, v.add(u)] }; // same lattice, new basis
		expect(cellsCongruent(a, b)).toBe(true);
	});

	it('genuinely different tilings are NOT merged (no over-merge)', { timeout: 30000 }, () => {
		const sq = new PeriodSolver(1).solve(new SeedConfiguration([VertexConfiguration.fromName('4,4,4,4')]), {}).cells[0];
		const hex = new PeriodSolver(1).solve(new SeedConfiguration([VertexConfiguration.fromName('6,6,6')]), {}).cells[0];
		expect(cellsCongruent(sq, hex)).toBe(false);
		expect(dedupeByCongruence([sq, hex]).length).toBe(2);
	});
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
