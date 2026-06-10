import { describe, it, expect } from 'vitest';
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import {
	PeriodSolver,
	vertexClassCount,
	blockIndexRangeNeeded,
	defaultMaxCellPolys,
	BLOCK_INDEX_CAP,
	type PeriodCell,
} from '@/classes/algorithm/PeriodSolver';
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

describe('OP-1 prop:typeprune prep', () => {
	it('isCompleteTiling reports the occurring VC-name set via the out-param', { timeout: 30000 }, () => {
		// Use the 3,4,6,4 k=1 seed — a small cell that certifies quickly.
		const seed = new SeedConfiguration([VertexConfiguration.fromName('3,4,6,4')]);
		const solver = new PeriodSolver(1);
		const { cells } = solver.solve(seed, {});
		expect(cells.length).toBeGreaterThan(0);

		const cell = cells[0];
		const [u, v] = cell.basisExact;
		const ring = u.ring;

		// Build allowed + polySizes the same way solve() does.
		const corePolys = seed.polygons;
		const coreVertices = seed.vertexConfigurations.map((vc) => vc.computeSharedVertexExact());
		const allowed = new Set<string>(
			coreVertices.map((cv) =>
				(solver as any).vcNameAt(cv, corePolys.filter((p) => p.vertexKeySet().has(cv.key())))
			)
		);
		const polySizes = Array.from(
			new Set(corePolys.filter((p) => !p.isStar).map((p) => p.n))
		).sort((a: number, b: number) => a - b);

		const ctx = (solver as any).makeCtx(u, v, ring, allowed, polySizes, Number.MAX_SAFE_INTEGER);
		expect(ctx).not.toBeNull();

		// First call WITHOUT the out-param — must still return true (zero behavior change).
		const withoutOut = solver.isCompleteTiling(cell.cellPolygons, ctx);
		expect(withoutOut).toBe(true);

		// Second call WITH the out-param — must collect the full occurring VC-name set.
		const occ = new Set<string>();
		const withOut = solver.isCompleteTiling(cell.cellPolygons, ctx, occ);
		expect(withOut).toBe(true);
		// At k=1 every VC type that is allowed must occur (occurring = allowed for this fixture).
		expect([...occ].sort()).toEqual([...allowed].sort());
	});
});

describe('OP-1 prop:typeprune', () => {
	// prop:typeprune (correctness.tex:731-751, two-sided): a certified closed cell whose occurring
	// VC-type set ⊊ the seed's allowed set does not realize the seed's orbit-VC multiset — it is
	// another seed's tiling and may be discarded WITHOUT the orbit gate. V<k closes the cheap half
	// (orbits ≤ V). Pinned baselines (UNCHANGED solver @ 62e2434, experiments/results/
	// op1-pin-k2-2026-06-10.log): both fixtures are single-concrete and deterministic (no timeout).
	it('[3,3,3,3,3,3;3,3,6,6]: pure-3⁶ supercells die at P2 BEFORE the CB-7 guard; catalogue unchanged', { timeout: 90000 }, () => {
		// Pinned (pre-change): cells=1 rawCells=1 supercellRejected=29 gateRejected=0.
		const concretes = buildSeeds(2).filter((s) => s.name === '[3,3,3,3,3,3;3,3,6,6]');
		expect(concretes.length).toBe(1);
		const { cells, diag } = new PeriodSolver(2).solve(concretes[0], { maxMs: 60000 });
		expect(diag.timedOut).toBe(false); // deterministic run — the pins are only valid untruncated
		expect(diag.p2Skipped).toBeGreaterThan(0); // the filter FIRES (pure-3⁶ closures: occ ⊊ allowed)
		expect(cells.length).toBe(1); // emitted catalogue for the seed UNCHANGED (pinned)
		expect(diag.rawCells).toBe(1); // the one genuine 2-uniform cell still certifies (pinned)
		// The 29 pre-change supercell discards now die at P2 upstream of isPrimitive — the CB-7
		// surface DROPS (a count shift, not a loss: theorem-licensed upstream of the guard).
		// Measured split (op1-vbelowk-sweep-k2-2026-06-10.log, seed index 6):
		// 27 die at P2 (p2Skipped=27) and 2 remain to CB-7 (scRej=2).
		expect(diag.supercellRejected).toBeLessThan(29);
		// FALLBACK pin for the V<k half (plan-approved): vBelowKSkipped CANNOT fire at k=2. V<2 means
		// V=1 — a certified closure with ONE vertex class mod Λ — which bounds the cell area below the
		// k=2 candidate area floor: the candidate area filter excludes the sub-area primitive lattices
		// whose completions would have V<k. Measured: 0 fires across ALL 40 k=2 concretes
		// (experiments/results/op1-vbelowk-sweep-k2-2026-06-10.log; segment 16-40 explicit timeouts=0,
		// indices 1-15 corroborated by wall-times < budget). The k=3 sweep's diag aggregation is the
		// live verification of this half.
		expect(diag.vBelowKSkipped).toBe(0);
	});
	it('[3,3,3,4,4;4,4,4,4]: NEGATIVE control — full-type-support orbits>k closures must REACH the gate', { timeout: 90000 }, () => {
		// Pinned (pre-change): cells=2 rawCells=5 supercellRejected=0 gateRejected=2. The two gate
		// rejects use BOTH allowed VC types — occ = allowed (so ≥2 names ⇒ orbits ≥ 2) and are
		// gate-rejected (orbits ≠ 2) ⇒ orbits ≥ 3. That is exactly the class prop:typeprune provably
		// cannot catch (type support is necessary, not sufficient for orbits = k). OP-1 must not
		// over-fire: every diagnostic must match the pre-change pin and both former gate rejects must
		// still die AT THE GATE, not earlier.
		const concretes = buildSeeds(2).filter((s) => s.name === '[3,3,3,4,4;4,4,4,4]');
		expect(concretes.length).toBe(1);
		const { cells, diag } = new PeriodSolver(2).solve(concretes[0], { maxMs: 60000 });
		expect(diag.timedOut).toBe(false);
		expect(diag.p2Skipped).toBe(0); // no subset-support closure on this seed — the filter must NOT fire
		expect(diag.vBelowKSkipped).toBe(0); // no V<k closure either
		expect(diag.rawCells).toBe(5); // all five certified closures still reach the gate loop (pinned)
		expect(diag.gateRejected).toBe(2); // the two orbits=3 cells die at the GATE, exactly as pre-change
		expect(cells.length).toBe(2); // emitted catalogue UNCHANGED (pinned)
	});
});

describe('lem:fillreach F3 loud-cap guards (TH-2 work orders, 2026-06-10)', () => {
	// F3b: buildBlock's per-axis index cap must never bind SILENTLY. The worst-case requirement is
	// asserted per candidate lattice (certificate radius dominates: limit = 2·cellDiam+10, range
	// driver = the longer basis vector = cellDiam).
	it('F3b: ordinary cells need far less than the cap (unit square → 13)', () => {
		expect(blockIndexRangeNeeded(1, 1)).toBe(13);
		// TA-measured worst over the certified catalogues: 16/19/23 at k=1/2/3 — all ≪ 60.
		expect(23).toBeLessThan(BLOCK_INDEX_CAP);
	});
	it('F3b: a long thin (anisotropic) cell EXCEEDS the cap — the flagged regime', () => {
		// |u|=1 ⊥ |v|=40 → cellDiam=40, area=40 → ⌈(2·40+10)·40/40⌉+1 = 91 > 60.
		expect(blockIndexRangeNeeded(40, 40)).toBe(91);
		expect(blockIndexRangeNeeded(40, 40)).toBeGreaterThan(BLOCK_INDEX_CAP);
	});
	it('F3b: a normal k=1 solve flags nothing (diag.blockIndexCapTruncated = 0)', { timeout: 30000 }, () => {
		const seed = new SeedConfiguration([VertexConfiguration.fromName('3,4,6,4')]);
		const { cells, diag } = new PeriodSolver(1).solve(seed, {});
		expect(cells.length).toBeGreaterThan(0);
		expect(diag.blockIndexCapTruncated).toBe(0);
	});
	// F3a: the default per-cell polygon cap must never undersize the proven F ≤ 24k (torus Euler).
	// The old default 20k+24 < 24k from k=7 — a silent pop-site discard.
	it('F3a: default maxCellPolys ≥ 24k for ALL k; unchanged (digest-neutral) for k ≤ 6', () => {
		for (let k = 1; k <= 12; k++) expect(defaultMaxCellPolys(k)).toBeGreaterThanOrEqual(24 * k);
		expect(defaultMaxCellPolys(1)).toBe(44); // = 20k+24, unchanged
		expect(defaultMaxCellPolys(6)).toBe(144); // boundary: 20·6+24 = 24·6
		expect(defaultMaxCellPolys(7)).toBe(168); // was 164 — the F3a hole, now 24k
	});
});
