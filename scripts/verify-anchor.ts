/*
 * 𝒜 ≡ 𝒳 per-branch fill-equality oracle runner (incidence-contract §5.2 — the C4 de-risker).
 *
 *   pnpm tsx scripts/verify-anchor.ts <k> <tiles> [maxMs]
 *   e.g. pnpm tsx scripts/verify-anchor.ts 1 3,4,6,8,12 0
 *
 * Forces PS_ANCHOR_XCHECK on; the orbifold fill then fills EVERY rotation-bearing branch from both the
 * incidence set 𝒜 and the cocycle set 𝒳 (both proven complete) and asserts the deduped tiling sets are
 * equal by canonical key. A branch whose 𝒳 fill is cut by the wall cap is counted inconclusive, not a
 * divergence. Exit non-zero on ANY divergence. Once this passes at k≤3, C4's --crosscheck only has to
 * prove the branch ENUMERATION matches (the seeding is already trusted).
 */
import { PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder, PolygonType, type GeneratorParameters } from "@/classes";
import { setActiveRing, CyclotomicRing } from "@/classes/Cyclotomic";
import { PeriodSolver } from "@/classes/algorithm/PeriodSolver";

const k = parseInt(process.argv[2] ?? "1", 10);
const ns = (process.argv[3] ?? "3,4,6,8,12").split(",").map(Number);
const maxMs = process.argv[4] ? parseInt(process.argv[4], 10) : 0;

process.env.PS_ANCHOR_XCHECK = "1"; // force the per-branch oracle on inside the solver

const ring = CyclotomicRing.create(24); // ONE instance shared by seeds, candidate lattices, branches
setActiveRing(ring);
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++) for (let j = i + 1; j < vcs.length; j++) if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
const useSeeds = k >= 2 ? seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : seeds;
console.log(`anchor-xcheck k=${k} {${ns.join(",")}}: ${useSeeds.length} seeds, maxMs=${maxMs}`);

const t0 = Date.now();
let div = 0, inc = 0, timedOutSeeds = 0;
for (let i = 0; i < useSeeds.length; i++) {
	const r = new PeriodSolver(k).solve(useSeeds[i], { maxMs, mode: "orbifold", anchor: "incidence" });
	div += r.diag.anchorDivergence ?? 0;
	inc += r.diag.anchorXcheckInconclusive ?? 0;
	if (r.diag.timedOut) timedOutSeeds++;
	if ((r.diag.anchorDivergence ?? 0) > 0) console.error(`  [${i}] ${useSeeds[i].name}: ${r.diag.anchorDivergence} divergence(s)`);
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n=== anchor-xcheck k=${k} {${ns.join(",")}} (${secs}s) ===`);
console.log(`divergences=${div}  inconclusive(branch 𝒳-fill timed out)=${inc}  timedOut seeds=${timedOutSeeds}`);
console.log(div === 0
	? `✅ 𝒜 ≡ 𝒳 per-branch on every COMPLETED branch — seeding trusted for C4${inc > 0 ? ` (${inc} branch(es) inconclusive — re-run with maxMs=0 / smaller family to close)` : ""}`
	: `❌ ANCHOR-DIVERGENCE: ${div} branch(es) where fill_𝒜 ≠ fill_𝒳 — a SEED bug, do NOT proceed to C4`);
process.exit(div === 0 ? 0 : 1);
