/* Diagnostic: orbifold vs torus key sets for a single tiny family. pnpm tsx scripts/diag-tiny.ts 4 */
import { PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder, PolygonType, type GeneratorParameters } from "@/classes";
import { setActiveRing, CyclotomicRing } from "@/classes/Cyclotomic";
import { PeriodSolver } from "@/classes/algorithm/PeriodSolver";
import { TranslationalCellExtractor } from "@/classes/algorithm/TranslationalCellExtractor";
import { dedupeByCongruence } from "@/classes/algorithm/TilingCongruence";
import type { Polygon } from "@/classes/polygons/Polygon";
import type { Cyclotomic } from "@/classes/Cyclotomic";
type Cell = { cellPolygons: Polygon[]; basisExact: [Cyclotomic, Cyclotomic] };

const ns = (process.argv[2] ?? "4").split(",").map(Number);
const k = parseInt(process.argv[3] ?? "1", 10);
setActiveRing(CyclotomicRing.create(24));
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
console.log(`ns={${ns.join(",")}} k=${k} VCs=${vcs.length} seeds=${useSeeds.length}`);

const ex = new TranslationalCellExtractor();
function run(mode: "torus" | "orbifold") {
	const cells: Cell[] = [];
	let branches = 0, budgetPruned = 0, consV = false, biV = false, to = false;
	for (const s of useSeeds) {
		const r = new PeriodSolver(k).solve(s, { maxMs: 60000, mode });
		cells.push(...r.cells);
		branches += r.diag.orbifoldBranches ?? 0; budgetPruned += r.diag.budgetPruned ?? 0;
		if (r.diag.conservationViolated) consV = true; if (r.diag.branchInvariantViolated) biV = true; if (r.diag.timedOut) to = true;
	}
	const dedup = dedupeByCongruence(cells, (c) => ex.canonicalKey(c.cellPolygons));
	return { cells, dedup, branches, budgetPruned, consV, biV, to };
}
const torus = run("torus");
const orb = run("orbifold");
// Cross-mode comparison BY CONGRUENCE (canonicalKey is a fast hash, not congruence-canonical — NOTES §13):
const union = dedupeByCongruence(torus.cells.concat(orb.cells), (c) => ex.canonicalKey(c.cellPolygons));
console.log(`torus:    ${torus.dedup.length} tilings (congruence), timedOut=${torus.to}`);
console.log(`orbifold: ${orb.dedup.length} tilings (congruence), branches=${orb.branches} budgetPruned=${orb.budgetPruned} consViol=${orb.consV} biViol=${orb.biV} timedOut=${orb.to}`);
console.log(`union(torus∪orbifold) by congruence: ${union.length}  ← equals torus count iff orbifold reproduces torus EXACTLY`);
console.log(union.length === torus.dedup.length && orb.dedup.length === torus.dedup.length ? "✅ MATCH" : "❌ MISMATCH");
