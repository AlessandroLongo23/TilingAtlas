/* Live per-seed diagnostic for the orbifold fill (unbuffered stderr). Compares torus vs orbifold
 * per-seed cell counts so I can SEE progress + timing + correctness as it runs.
 *   pnpm tsx scripts/diag-orbifold.ts [k] [tiles] [maxMs]
 */
import { PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder, PolygonType, type GeneratorParameters } from "@/classes";
import { computeRing } from "@/classes/algorithm/PolygonsGenerator";
import { setActiveRing, CyclotomicRing } from "@/classes/Cyclotomic";
import { PeriodSolver } from "@/classes/algorithm/PeriodSolver";
import { TranslationalCellExtractor } from "@/classes/algorithm/TranslationalCellExtractor";
import { dedupeByCongruence } from "@/classes/algorithm/TilingCongruence";

const k = parseInt(process.argv[2] ?? "1", 10);
const ns = process.argv[3] ? process.argv[3].split(",").map(Number) : [3, 4, 6, 12];
const maxMs = process.argv[4] ? parseInt(process.argv[4], 10) : 30000;
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));
const log = (s: string) => process.stderr.write(s + "\n");

const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++) for (let j = i + 1; j < vcs.length; j++) if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
const useSeeds = k >= 2 ? seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : seeds;
log(`k=${k} tiles={${ns.join(",")}} ring=${baseRing.N === 24 ? 24 : "24(forced)"} seeds=${useSeeds.length} maxMs=${maxMs}`);

const extractor = new TranslationalCellExtractor();
const mode = (process.env.PS_MODE === "orbifold" ? "orbifold" : "torus") as "torus" | "orbifold";
log(`MODE=${mode}`);
const all: { cellPolygons: import("@/classes/polygons/Polygon").Polygon[]; basisExact: [import("@/classes/Cyclotomic").Cyclotomic, import("@/classes/Cyclotomic").Cyclotomic] }[] = [];
for (let i = 0; i < useSeeds.length; i++) {
	const ts = Date.now();
	const { cells, diag } = new PeriodSolver(k).solve(useSeeds[i], { maxMs, mode });
	const ms = Date.now() - ts;
	all.push(...cells);
	log(`  [${i}] ${useSeeds[i].name.padEnd(26)} cells=${cells.length} branches=${diag.orbifoldBranches ?? "-"} budgetPruned=${diag.budgetPruned ?? "-"} poolTrunc=${diag.poolTruncated ?? false} ${ms}ms${diag.timedOut ? " TIMEOUT" : ""}`);
}
const reps = dedupeByCongruence(all, (c) => extractor.canonicalKey(c.cellPolygons));
const ids = reps.map((c) => extractor.canonicalKey(c.cellPolygons)).sort();
let h = 5381n;
for (const c of ids.join("|")) h = ((h * 33n) ^ BigInt(c.codePointAt(0)!)) & 0xffffffffffffffffn;
log(`\n${mode} k=${k} {${ns.join(",")}}: ${reps.length} distinct, digest=${h.toString(16)}`);
