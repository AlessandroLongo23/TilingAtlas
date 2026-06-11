import { describe, it, expect } from 'vitest';
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { PeriodSolver, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { cellsCongruent } from '@/classes/algorithm/TilingCongruence';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';
import type { SeedConfiguration as SeedConfigurationType } from '@/classes/algorithm/SeedConfiguration';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } };
setActiveRing(computeRing(params));

/** All k-uniform seeds (pipeline stages 1–5) — INCLUDING singletons (no ≥2-distinct-VC filter): the
 *  proven config (O1, lem:seedcover) requires singleton seed multisets for k>1. */
function buildSeeds(k: number): SeedConfigurationType[] {
	const pg = new PolygonsGenerator(params, []);
	const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
	const adj: Record<string, string[]> = {};
	for (const vc of vcs) adj[vc.name] = [];
	for (let i = 0; i < vcs.length; i++)
		for (let j = i + 1; j < vcs.length; j++)
			if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
	const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
	const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
	return new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
}

// C1 — the proven configuration (route-a-proven-box.md §O2 prop:fanseed): instead of the rigid k-VC
// core (a SOUND FAST PATH that cannot carry the completeness claim), seed every candidate lattice from
// the single-vertex corona fans over all grid orientations (reduced by Λ's rotational symmetry). The
// blanket-fan run must reproduce, by congruence, exactly the tilings the fast path emits.
describe('PeriodSolver proven seeding (blanket fans) — mechanism + correctness', () => {
	it('k=1 honeycomb (6,6,6): proven mode finds the same tiling, via the blanket-fan path', { timeout: 30000 }, () => {
		const seed = new SeedConfiguration([VertexConfiguration.fromName('6,6,6')]);
		const fast = new PeriodSolver(1).solve(seed, {});
		const proven = new PeriodSolver(1).solve(seed, { provenSeeding: true });
		expect(fast.cells.length).toBe(1);
		expect(proven.cells.length).toBe(1);
		expect(cellsCongruent(proven.cells[0], fast.cells[0])).toBe(true); // same tiling
		// the blanket-fan path actually ran (fast path does not fan-seed a core-fitting lattice)
		expect(proven.diag.blanketFanLattices).toBeGreaterThan(0);
		expect(fast.diag.blanketFanLattices ?? 0).toBe(0);
	});

	// The acceptance criterion (route-a-proven-box.md §O2): the provably-complete config (singletons +
	// blanket fans) must reproduce EXACTLY the fast-path catalogue — no tiling lost, none spurious. The
	// union test is the sharp check: if proven ≡ fast as sets, fast ∪ proven dedupes to the same count.
	it('k=1: proven config reproduces the 11 Archimedean tilings, set-identical to the fast path', { timeout: 60000 }, () => {
		const seeds = buildSeeds(1); // k=1 seeds are already singletons
		const fast: PeriodCell[] = [];
		const proven: PeriodCell[] = [];
		for (const s of seeds) {
			fast.push(...new PeriodSolver(1).solve(s, {}).cells);
			proven.push(...new PeriodSolver(1).solve(s, { provenSeeding: true }).cells);
		}
		expect(dedupeByCongruence(fast).length).toBe(11);
		expect(dedupeByCongruence(proven).length).toBe(11);
		// set-identity: proven loses nothing and adds nothing → the union still dedupes to 11
		expect(dedupeByCongruence([...fast, ...proven]).length).toBe(11);
	});

	// Reflection-coverage falsifier (reflection-coverage-experiment-2026-06-07.md), k=1 decisive case.
	// Proven seeding places by on-grid ROTATION only; mirrors are handled indirectly (name-reversal +
	// congruence-merge). H₀: rotation-only (stream A) already reaches a representative of every mirror
	// class. Falsify by explicitly placing the MIRROR fans (stream B, reflectFans) and checking B adds
	// ZERO new congruence classes. A FAIL here = rotation-only seeding is incomplete (a chiral class
	// silently dropped) — a completeness bug under both the torus and orbifold paths.
	it('k=1 reflection coverage: mirror seeds (stream B) add 0 new congruence classes (B ⊆ A)', { timeout: 180000 }, () => {
		const seeds = buildSeeds(1);
		const A: PeriodCell[] = [];
		const B: PeriodCell[] = [];
		for (const s of seeds) {
			A.push(...new PeriodSolver(1).solve(s, { provenSeeding: true }).cells);
			B.push(...new PeriodSolver(1).solve(s, { provenSeeding: true, reflectFans: true }).cells);
		}
		expect(dedupeByCongruence(A).length).toBe(11);          // stream A = the certified catalogue
		expect(dedupeByCongruence([...A, ...B]).length).toBe(11); // B ⊆ A: reflection adds nothing ⇒ PASS
	});
});
