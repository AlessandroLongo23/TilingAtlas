/*
 * Fill-scaling measurement (settles the "is the orbifold method polynomial or exponential?" debate).
 *
 *   PS_PROFILE=1 pnpm tsx scripts/measure-fill-scaling.ts <k> <tiles> [maxMsPerSeed] [seedLimit]
 *
 * Reports, for the given k, the TWO scaling factors the strategy debate hinges on:
 *  (A) CANDIDATE-CELL count: useSeeds × candidate-lattices × branches — does the OUTER loop grow polynomially?
 *  (B) PER-FILL DFS cost: for every EMITTED cell (a CLEAN cost — the cell closed before any timeout), the
 *      (cell tile-count, DFS nodes explored) pair, grouped by lattice type. The question: is `pops`
 *      polynomial or EXPONENTIAL in `tiles`? (k just scales the cell size, so pops-vs-tiles is the curve.)
 * Run k=1,2,3 and compare; if (B) stays polynomial in tiles and (A) is mild, the method is viable-by-grinding.
 */
import { PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder, PolygonType, type GeneratorParameters } from "@/classes";
import { setActiveRing, CyclotomicRing } from "@/classes/Cyclotomic";
import { PeriodSolver } from "@/classes/algorithm/PeriodSolver";

const k = parseInt(process.argv[2] ?? "1", 10);
const ns = (process.argv[3] ?? "3,4,6").split(",").map(Number);
const maxMs = process.argv[4] ? parseInt(process.argv[4], 10) : 30000;
const seedLimit = process.argv[5] ? parseInt(process.argv[5], 10) : 0;

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const bravais = (h: number) => (h >= 12 ? "hex" : h >= 8 ? "square" : h >= 4 ? "rect/cmm" : "oblique");

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++) for (let j = i + 1; j < vcs.length; j++) if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
let useSeeds = k >= 2 ? seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : seeds;
if (seedLimit > 0) useSeeds = useSeeds.slice(0, seedLimit);

console.log(`\n=== fill-scaling k=${k} {${ns.join(",")}}: ${useSeeds.length} seeds, maxMs=${maxMs}/seed${seedLimit ? ` (limited to ${seedLimit})` : ""} ===`);

const profile: { tiles: number; pops: number; hol: number }[] = [];
let maxPops = 0, candLattices = 0, branches = 0, emitted = 0, to = 0;
const t0 = Date.now();
for (let i = 0; i < useSeeds.length; i++) {
	const r = new PeriodSolver(k).solve(useSeeds[i], { mode: "orbifold", bypass: true, maxMs });
	if (r.diag.fillNodeProfile) profile.push(...r.diag.fillNodeProfile);
	maxPops = Math.max(maxPops, r.diag.orbFillMaxPops ?? 0);
	candLattices += r.diag.candidateLattices ?? 0;
	branches += r.diag.orbifoldBranches ?? 0;
	emitted += r.diag.emitted ?? 0;
	if (r.diag.timedOut) to++;
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);

// (A) candidate-cell factor
console.log(`(A) candidate-cell loop:  useSeeds=${useSeeds.length}  ΣcandidateLattices=${candLattices}  Σbranches=${branches}  emitted=${emitted}  timedOut=${to}/${useSeeds.length}  [${secs}s]`);

// (B) per-fill cost: pops vs tiles, by lattice type
console.log(`(B) per-fill DFS cost (CLEAN, emitted cells only) — "<tiles>t:<maxPops>", is pops poly or exp in tiles?`);
const byHol = new Map<string, Map<number, number>>();
for (const { tiles, pops, hol } of profile) {
	const b = bravais(hol);
	if (!byHol.has(b)) byHol.set(b, new Map());
	const m = byHol.get(b)!;
	m.set(tiles, Math.max(m.get(tiles) ?? 0, pops));
}
if (byHol.size === 0) console.log(`    (no cells emitted within the cap — all fills cut by timeout)`);
for (const b of ["hex", "square", "rect/cmm", "oblique"]) {
	const m = byHol.get(b);
	if (!m) continue;
	const rows = [...m.entries()].sort((a, x) => a[0] - x[0]).map(([t, p]) => `${t}t:${p}`).join("  ");
	console.log(`    ${b.padEnd(9)} ${rows}`);
}
console.log(`    overall max single-fill pops = ${maxPops}  (includes non-emitting fills; a timeout-cut fill is a LOWER bound)`);
