/**
 * Seed-species enumeration for the SEED-ANCHORED Delaney–Dress probe.
 *
 * Builds the vertex-species multisets per k EXACTLY the way the geometric pipeline
 * does (mirrors scripts/probe-pipeline.ts: PolygonsGenerator → VCGenerator →
 * CompatibilityGraph → SeedSetExtractor, incl. the N=24 ring forcing), then projects
 * VC names → UNORIENTED species (dihedral-canonical cyclic face-size sequences) and
 * dedups the projected multisets.
 *
 * ⚑ CAVEAT (inherited from the pipeline, mirrored here, NOT silent): at k≥2 the
 * pipeline keeps only genuinely multi-VC seed multisets — same-VC-name multisets
 * {X,X} are excluded by the same monogonal⇒uniform assumption probe-pipeline.ts uses.
 * Note the projection KEEPS chiral pairs {X, mirror(X)} (they become {s,s} as
 * unoriented species) — only literal same-name repeats are excluded upstream.
 */
import {
  PolygonsGenerator,
  VCGenerator,
  CompatibilityGraph,
  SeedSetExtractor,
  PolygonType,
  type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { dihedralCanonical, dihedralKey } from '@/classes/algorithm/delaney';

export interface SeedSpeciesResult {
  vcCount: number; // VCs the pipeline enumerates (rotation-canonical names)
  speciesCount: number; // distinct UNORIENTED species after dihedral projection
  rawSeedSetCount: number; // pipeline seed multisets (post multi-VC filter at k≥2)
  multisets: number[][][]; // deduped projected species multisets, each = k species
  multisetKeys: string[]; // "spec|spec|..." keys, index-aligned with `multisets`
}

const multisetKey = (species: number[][]): string =>
  species
    .map(dihedralKey)
    .sort()
    .join('|');

export function enumerateSeedSpecies(k: number, ns: number[] = [3, 4, 6, 8, 12]): SeedSpeciesResult {
  const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
  // probe-pipeline.ts ring forcing: the exact layer requires N=24 for {3,4,6,8,12} subsets.
  const baseRing = computeRing(params);
  setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

  const pg = new PolygonsGenerator(params, []);
  const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
  const adj: Record<string, string[]> = {};
  for (const vc of vcs) adj[vc.name] = [];
  for (let i = 0; i < vcs.length; i++) {
    for (let j = i + 1; j < vcs.length; j++) {
      if (vcs[i].isCompatible(vcs[j])) {
        adj[vcs[i].name].push(vcs[j].name);
        adj[vcs[j].name].push(vcs[i].name);
      }
    }
  }
  const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
  const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
  // ⚑ probe-pipeline.ts multi-VC filter (k≥2): {X,X} excluded (monogonal⇒uniform assumption).
  const used = k >= 2 ? seedSets.filter((names) => new Set(names).size >= 2) : seedSets;

  const parseName = (name: string): number[] =>
    name.split(',').map((part) => {
      const v = Number(part);
      if (!Number.isInteger(v) || v < 3) {
        throw new Error(`enumerateSeedSpecies: non-regular polygon name '${part}' in VC '${name}'`);
      }
      return v;
    });

  const speciesKeys = new Set<string>();
  const seen = new Map<string, number[][]>();
  for (const names of used) {
    const species = names.map((n) => dihedralCanonical(parseName(n)));
    for (const s of species) speciesKeys.add(s.join(','));
    const key = multisetKey(species);
    if (!seen.has(key)) seen.set(key, species);
  }
  const multisetKeys = [...seen.keys()].sort();
  return {
    vcCount: vcs.length,
    speciesCount: speciesKeys.size,
    rawSeedSetCount: used.length,
    multisets: multisetKeys.map((key) => seen.get(key)!),
    multisetKeys,
  };
}
