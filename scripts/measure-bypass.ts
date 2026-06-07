/*
 * C4 pool-bypass measurement + crosscheck (the make-or-break harness).
 *
 *   pnpm tsx scripts/measure-bypass.ts <k> <tiles> [--crosscheck] [--fill] [--maxMs=N]
 *
 * --crosscheck (default if no mode flag): for every candidate lattice, enumerate the rotation/dihedral
 *   branches BOTH ways — the proven pool walk and the direct quotient bypass — and assert the bypass
 *   classKey SET is a SUPERSET of the pool's (the bypass enumerates the FULL finite quotient 𝒬_{L,Λ},
 *   so it can only add phantom classes the pool's bounded ball didn't reach, never drop a realizable
 *   one). A pool class MISSING from the bypass = ⚑ BYPASS-DIVERGENCE (under-enumeration), exit non-zero.
 *   Reports ν vs pool-count per Bravais and the branch-formation speedup (pool BFS deleted on oblique).
 *
 * --fill: live k=4-hex fill timing (E2 measurement) — does the equivariant fill emit cells or wall once
 *   the pool sweep is bypassed?  Pairs with PS_PROFILE=1 to attribute pool-build vs fill cost.
 */
import { PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder, PolygonType, type GeneratorParameters } from "@/classes";
import { setActiveRing, CyclotomicRing } from "@/classes/Cyclotomic";
import { PeriodSolver } from "@/classes/algorithm/PeriodSolver";
import { enumerateNormalizedBranches } from "@/classes/algorithm/OrbifoldNormalized";
import { holohedry } from "@/classes/algorithm/LatticeEnumerator";
import { TranslationalCellExtractor } from "@/classes/algorithm/TranslationalCellExtractor";
import { dedupeByCongruence } from "@/classes/algorithm/TilingCongruence";

const k = parseInt(process.argv[2] ?? "2", 10);
const ns = (process.argv[3] ?? "3,4,6,12").split(",").map(Number);
const doFill = process.argv.includes("--fill");
const crosscheck = process.argv.includes("--crosscheck") || !doFill;
const maxMsArg = process.argv.find((a) => a.startsWith("--maxMs="));
const maxMs = maxMsArg ? parseInt(maxMsArg.split("=")[1], 10) : 0;
const poolCap = process.env.PS_POOLCAP ? parseInt(process.env.PS_POOLCAP, 10) : 50000;

const ring = CyclotomicRing.create(24);
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
const bravaisOf = (h: number) => (h >= 12 ? "hex" : h >= 8 ? "square" : h >= 4 ? "rect/cmm" : "oblique");
console.log(`measure-bypass k=${k} {${ns.join(",")}}: ${useSeeds.length} seeds, poolCap=${poolCap}`);

const rotKeys = (branches: { type: { kind: string }; key: string }[]) =>
	new Set(branches.filter((b) => b.type.kind === "cyclic-rot" || b.type.kind === "dihedral").map((b) => b.key));

if (crosscheck) {
	const solver = new PeriodSolver(k);
	const agg = new Map<string, { latts: number; poolMs: number; bypMs: number; poolN: number; bypN: number; extra: number; poolBuilt: number }>();
	let divergences = 0;
	for (const s of useSeeds) {
		const { lattices } = solver.candidateLatticesFor(s);
		for (const [u, v] of lattices) {
			const br = bravaisOf(holohedry(u, v));
			const tP = Date.now();
			const pool = enumerateNormalizedBranches(u, v, ring, ns, k, { poolClassCap: poolCap, skipRotationReAnchor: true });
			const poolMs = Date.now() - tP;
			const tB = Date.now();
			const byp = enumerateNormalizedBranches(u, v, ring, ns, k, { poolClassCap: poolCap, skipRotationReAnchor: true, bypass: true });
			const bypMs = Date.now() - tB;
			const pK = rotKeys(pool.branches), bK = rotKeys(byp.branches);
			const missing = [...pK].filter((kk) => !bK.has(kk)); // pool class the bypass dropped = a BUG
			if (missing.length) { divergences += missing.length; console.error(`  ⚑ BYPASS-DIVERGENCE ${br}: ${missing.length} pool class(es) missing from bypass — e.g. ${missing[0]}`); }
			const g = agg.get(br) ?? { latts: 0, poolMs: 0, bypMs: 0, poolN: 0, bypN: 0, extra: 0, poolBuilt: 0 };
			g.latts++; g.poolMs += poolMs; g.bypMs += bypMs; g.poolN += pK.size; g.bypN += bK.size;
			g.extra += [...bK].filter((kk) => !pK.has(kk)).length; // phantoms the pool's bounded ball missed
			if (byp.diag.poolBuilt) g.poolBuilt++;
			agg.set(br, g);
		}
	}
	console.log(`\n— crosscheck: rotation/dihedral branch SET, pool-walk vs direct bypass, by Bravais —`);
	console.log(`  bravais    latts   poolN   bypN  extra(bypass-only)  poolMs  bypMs   bypass-poolBuilt`);
	for (const b of ["oblique", "rect/cmm", "square", "hex"]) {
		const g = agg.get(b); if (!g) continue;
		console.log(`  ${b.padEnd(9)} ${String(g.latts).padStart(5)} ${String(g.poolN).padStart(6)} ${String(g.bypN).padStart(6)} ${String(g.extra).padStart(8)}            ${String(g.poolMs).padStart(6)} ${String(g.bypMs).padStart(6)}   ${g.poolBuilt}/${g.latts}`);
	}
	console.log(divergences === 0
		? `\n✅ bypass branch SET ⊇ pool branch SET on every lattice — direct quotient enumeration is complete (no pool class dropped)`
		: `\n❌ ${divergences} BYPASS-DIVERGENCE(s): the bypass DROPPED a pool class — under-enumeration bug`);
	if (!doFill) process.exit(divergences === 0 ? 0 : 1);
}

if (doFill) {
	console.log(`\n— live fill timing (E2): orbifold + incidence + bypass, maxMs=${maxMs} per seed —`);
	const ex = new TranslationalCellExtractor();
	const t = Date.now();
	const cells = [];
	let branches = 0, emitted = 0, to = 0, budget = 0, empty = 0, poolBuilt = 0, lattices = 0;
	for (let i = 0; i < useSeeds.length; i++) {
		const r = new PeriodSolver(k).solve(useSeeds[i], { maxMs, mode: "orbifold", bypass: true });
		for (const c of r.cells) cells.push(c);
		branches += r.diag.orbifoldBranches ?? 0; emitted += r.diag.emitted ?? 0; budget += r.diag.budgetPruned ?? 0;
		empty += r.diag.emptyAnchorBranches ?? 0; poolBuilt += r.diag.poolBuiltLattices ?? 0; lattices += r.diag.latticesFilled ?? 0;
		if (r.diag.timedOut) to++;
		console.log(`  [${i}] ${useSeeds[i].name.padEnd(26)} cells=${r.cells.length} branches=${r.diag.orbifoldBranches ?? 0} poolBuilt=${r.diag.poolBuiltLattices ?? 0}/${r.diag.latticesFilled ?? 0} orbPool=${r.diag.orbPoolBuildMs ?? 0}ms orbFill=${r.diag.orbFillMs ?? 0}ms fillCalls=${r.diag.orbFillCalls ?? 0} pops=${r.diag.orbFillPops ?? 0} stamps=${r.diag.orbFillStamps ?? 0} [seed=${r.diag.orbSeedMs ?? 0} block=${r.diag.orbSetupBlockMs ?? 0}]ms preSkip=${r.diag.orbPrecheckSkipped ?? 0} rej(area=${r.diag.orbRejArea ?? 0},block=${r.diag.orbRejBlockOverlap ?? 0}) ${r.diag.timedOut ? "TIMEOUT" : ""}`);
	}
	const tilings = dedupeByCongruence(cells, (c) => ex.canonicalKey(c.cellPolygons)).length;
	console.log(`\n  ${((Date.now() - t) / 1000).toFixed(1)}s  distinct=${tilings} rawCells=${cells.length} branches=${branches} budgetPruned=${budget} emptyPhantom=${empty} timedOutSeeds=${to}/${useSeeds.length}`);
	console.log(`  ⚑ E1: pool STILL built on ${poolBuilt}/${lattices} filled lattices (reflections force it) — bypass deletes it only where rotations are the sole pool user`);
	console.log(to === 0 ? `  ✅ no wall — the bypassed fill completed` : `  ⚑ ${to} seed(s) walled — pool-build and/or FILL is the residual wall (E1/E2)`);
}
