// tests/helpers/solveK2.ts
import {
  PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
  PolygonType, type GeneratorParameters,
} from '@/classes';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { PeriodSolver, _testOnlyClearCandidateStageCaches, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';

/** Run stages 1–5 + the k=2 period solve for a regular set `ns`; return VC names + canonical cell keys. */
export function solveK2(ns: number[]): { vcNames: string[]; cellKeys: string[] } {
  const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
  // PeriodSolver's OP-3 candidate-lattice stage (gridDirOf/imSurd) hard-requires the N=24 ring
  // regardless of which polygon subset is in play (3/4/6/8/12 all divide 24) — the same convention
  // every other test file in this repo follows (CyclotomicRing.create(24)), not derived from `ns`.
  setActiveRing(CyclotomicRing.create(24));
  _testOnlyClearCandidateStageCaches(); // module-global caches must not leak across runs
  const pg = new PolygonsGenerator(params, []);
  const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
  const adj: Record<string, string[]> = {};
  for (const vc of vcs) adj[vc.name] = [];
  for (let i = 0; i < vcs.length; i++)
    for (let j = i + 1; j < vcs.length; j++)
      if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
  const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
  const seedSets = new SeedSetExtractor(graph).findSeedSets(2);
  const seeds = new SeedBuilder().buildSeeds(2, 1, { seedSetLoader: () => seedSets });
  const extractor = new TranslationalCellExtractor();
  const cells: PeriodCell[] = [];
  for (const seed of seeds) cells.push(...new PeriodSolver(2).solve(seed, { maxMs: 60000 }).cells);
  return {
    vcNames: vcs.map((v) => v.name).sort(),
    cellKeys: cells.map((c) => extractor.canonicalKey(c.cellPolygons)).sort(),
  };
}
