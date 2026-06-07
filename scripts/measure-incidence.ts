/*
 * Increment-3 measurement (incidence anchoring): the seed-count collapse 𝒜 vs 𝒳 + the live fill timing.
 *
 *   pnpm tsx scripts/measure-incidence.ts <tiles> <k> [maxMs] [--no-live]
 *   e.g. PS_POOLCAP=200000 pnpm tsx scripts/measure-incidence.ts 3,4,6,12 2 0
 *
 * Part 1 (DRY, deterministic, contention-immune): for every candidate lattice of every seed, sum the
 * per-branch seed counts |𝒜| (incidence) vs |𝒳| (cocycle) over the rotation-bearing branches that
 * incidence anchoring collapses, grouped by Bravais class. This is the headline "reduce by a lot the
 * number of anchors" number — independent of whether the fill completes.
 *
 * Part 2 (LIVE timing, skip with --no-live): solve the seeds in orbifold mode under cocycle vs
 * incidence; report wall time, cells, branches, timeouts. This is the "does 𝒜 crack the hex wall?"
 * measurement (rem:incidenceaccount: a measurement, not a corollary — per-fill cost is unchanged).
 */
import { PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder, PolygonType, type GeneratorParameters } from "@/classes";
import { setActiveRing, CyclotomicRing } from "@/classes/Cyclotomic";
import { PeriodSolver, type PeriodCell } from "@/classes/algorithm/PeriodSolver";
import { enumerateNormalizedBranches, incidenceDisplacements, incidenceAnchorSet } from "@/classes/algorithm/OrbifoldNormalized";
import { holohedry } from "@/classes/algorithm/LatticeEnumerator";
import { TranslationalCellExtractor } from "@/classes/algorithm/TranslationalCellExtractor";
import { dedupeByCongruence } from "@/classes/algorithm/TilingCongruence";
import type { Polygon } from "@/classes/polygons/Polygon";

const ns = (process.argv[2] ?? "3,4,6,12").split(",").map(Number);
const k = parseInt(process.argv[3] ?? "2", 10);
const maxMs = process.argv[4] && !process.argv[4].startsWith("--") ? parseInt(process.argv[4], 10) : 0;
const noLive = process.argv.includes("--no-live");
const poolCap = process.env.PS_POOLCAP ? parseInt(process.env.PS_POOLCAP, 10) : 50000;

const ring = CyclotomicRing.create(24); // ONE instance — seeds + candidate lattices + branches must share it
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
console.log(`tiles={${ns.join(",")}} k=${k} VCs=${vcs.length} seeds=${useSeeds.length} poolCap=${poolCap} maxMs=${maxMs}`);

// ---- Part 1: DRY seed-count A/B (𝒜 vs 𝒳) by Bravais class --------------------------------------
const bravaisOf = (h: number) => (h >= 12 ? "hex" : h >= 8 ? "square" : h >= 4 ? "rect/cmm" : "oblique");
const D = incidenceDisplacements(ring, ns);
console.log(`|D| = ${D.length}  (≤ (2+|sizes|)·N = ${(2 + new Set(ns).size) * ring.N})`);
const solver = new PeriodSolver(k);
const agg = new Map<string, { A: number; X: number; latts: number; trunc: number }>();
const t0 = Date.now();
for (const s of useSeeds) {
	const { lattices } = solver.candidateLatticesFor(s);
	for (const [u, v] of lattices) {
		const bravais = bravaisOf(holohedry(u, v));
		const { branches, diag } = enumerateNormalizedBranches(u, v, ring, ns, k, { poolClassCap: poolCap });
		let A = 0, X = 0;
		for (const B of branches) {
			if (B.type.kind !== "cyclic-rot" && B.type.kind !== "dihedral") continue;
			A += incidenceAnchorSet(B, u, v, ring, D).length; // 𝒜
			X += B.reAnchorSet.length; // 𝒳 (the cocycle baseline for the SAME branches)
		}
		const g = agg.get(bravais) ?? { A: 0, X: 0, latts: 0, trunc: 0 };
		g.A += A; g.X += X; g.latts++; if (diag.poolTruncated) g.trunc++;
		agg.set(bravais, g);
	}
}
console.log(`\n— Part 1: rotation-bearing seed counts 𝒜 (incidence) vs 𝒳 (cocycle), by Bravais (${((Date.now() - t0) / 1000).toFixed(1)}s) —`);
let totA = 0, totX = 0;
for (const b of ["oblique", "rect/cmm", "square", "hex"]) {
	const g = agg.get(b);
	if (!g) continue;
	totA += g.A; totX += g.X;
	const ratio = g.A > 0 ? (g.X / g.A).toFixed(1) : "∞";
	console.log(`  ${b.padEnd(9)} latts=${String(g.latts).padStart(4)}  Σ|𝒳|=${String(g.X).padStart(7)} → Σ|𝒜|=${String(g.A).padStart(6)}  (${ratio}× fewer)${g.trunc ? `  ⚑ ${g.trunc} pool-truncated` : ""}`);
}
console.log(`  TOTAL                Σ|𝒳|=${String(totX).padStart(7)} → Σ|𝒜|=${String(totA).padStart(6)}  (${totA > 0 ? (totX / totA).toFixed(1) : "∞"}× fewer)`);

// ---- Part 2: LIVE fill timing (cocycle vs incidence) -------------------------------------------
if (noLive) process.exit(0);
const ex = new TranslationalCellExtractor();
function live(anchor: "cocycle" | "incidence") {
	const t = Date.now();
	const cells: PeriodCell[] = [];
	let branches = 0, to = false, budget = 0;
	for (const s of useSeeds) {
		const r = new PeriodSolver(k).solve(s, { maxMs, mode: "orbifold", anchor });
		for (const c of r.cells) cells.push(c);
		branches += r.diag.orbifoldBranches ?? 0; budget += r.diag.budgetPruned ?? 0;
		if (r.diag.timedOut) to = true;
	}
	const tilings = dedupeByCongruence(cells, (c) => ex.canonicalKey(c.cellPolygons)).length;
	return { ms: Date.now() - t, tilings, cells: cells.length, branches, to, budget };
}
console.log(`\n— Part 2: live orbifold fill timing (maxMs=${maxMs} per seed) —`);
const coc = live("cocycle");
console.log(`  cocycle (𝒳):   ${(coc.ms / 1000).toFixed(1)}s  tilings=${coc.tilings} cells=${coc.cells} branches=${coc.branches} budgetPruned=${coc.budget} timedOut=${coc.to}`);
const inc = live("incidence");
console.log(`  incidence (𝒜): ${(inc.ms / 1000).toFixed(1)}s  tilings=${inc.tilings} cells=${inc.cells} branches=${inc.branches} budgetPruned=${inc.budget} timedOut=${inc.to}`);
console.log(inc.tilings === coc.tilings ? `\n✅ same tiling set by congruence (${inc.tilings})` : `\n⚑ tiling sets differ: cocycle=${coc.tilings} incidence=${inc.tilings} — investigate (a drop would be a completeness bug)`);
