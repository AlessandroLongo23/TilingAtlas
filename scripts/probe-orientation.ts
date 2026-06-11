// Adversarial probe: does the fan's rotational-symmetry dedup in blanketFanSeedSets
// ever drop an orientation that yields a DISTINCT downstream fill?
// Strategy: access the private method via prototype, compute seed sets with dedup (as-is)
// and reconstruct the FULL N-orientation set (no dedup), run torusFill on every candidate
// lattice for both, compare the congruence-deduped catalogues.
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { PeriodSolver, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import {
  PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
  PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } };
setActiveRing(computeRing(params));

function buildSeeds(k: number) {
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

// Patch blanketFanSeedSets to OPTIONALLY skip the rotational dedup.
const proto: any = PeriodSolver.prototype as any;
const orig = proto.blanketFanSeedSets;
let NODEDUP = false;
proto.blanketFanSeedSets = function (corePolys: any[], coreVertices: any[], ring: any) {
  if (!NODEDUP) return orig.call(this, corePolys, coreVertices, ring);
  // No-dedup variant: keep ALL N orientations per coreVertex.
  const N = ring.N;
  const out: any[] = [];
  for (const cv of coreVertices) {
    const fan = corePolys.filter((p: any) => p.vertexKeySet().has(cv.key()));
    if (fan.length < 1) continue;
    for (let r = 0; r < N; r++) out.push(fan.map((p: any) => p.clone().rotateZeta(cv, r)));
  }
  return out;
};

for (const k of [1, 2]) {
  const seeds = buildSeeds(k);
  const deduped: PeriodCell[] = [];
  const full: PeriodCell[] = [];
  NODEDUP = false;
  for (const s of seeds) deduped.push(...new PeriodSolver(k).solve(s, { provenSeeding: true }).cells);
  NODEDUP = true;
  for (const s of seeds) full.push(...new PeriodSolver(k).solve(s, { provenSeeding: true }).cells);
  const a = dedupeByCongruence(deduped).length;
  const b = dedupeByCongruence(full).length;
  const u = dedupeByCongruence([...deduped, ...full]).length;
  console.log(`k=${k}: dedup-mode=${a}  NO-dedup-mode=${b}  union=${u}  ${a===b && a===u ? 'IDENTICAL' : '*** DIFFERS ***'}`);
}
