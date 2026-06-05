/*
 * Measure NORMALIZED equivariant-branch counts per Bravais class — the re-anchoring-lemma deliverable
 * (Increment 1). For every DISTINCT candidate period lattice the pipeline produces, run
 * `enumerateNormalizedBranches` (coboundary-normalized branches + re-anchor sets, all subgroup types
 * per A1) and aggregate per Bravais class. This is the A/B counterpart to `measure-orbifold-branches.ts`
 * (the non-normalized Phase-A baseline, NOTES §20.4): the headline is the collapse — oblique cyclic
 * branches 478→~4, hex p6→1, dihedral linear, and NO enumCap/poolCap explosion. The conservation laws
 * (Σ|𝒳| = pool / glide-passing count per rotation / reflection type) are asserted per lattice and any
 * violation is reported loudly (a completeness tripwire, not a perf stat).
 *
 * Run:  pnpm tsx scripts/measure-normalized-branches.ts [k] [tiles] [poolClassCap] [--baseline]
 *   --baseline also runs the non-normalized Phase-A enumerator on the SAME lattices for a direct A/B
 *   (slower; the capped regime). Server-only, no network.
 */
import { PeriodSolver } from "@/classes/algorithm/PeriodSolver";
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from "@/classes";
import { computeRing } from "@/classes/algorithm/PolygonsGenerator";
import { setActiveRing, CyclotomicRing, type Cyclotomic } from "@/classes/Cyclotomic";
import { enumerateBranches, type Bravais } from "@/classes/algorithm/OrbifoldBranches";
import { enumerateNormalizedBranches } from "@/classes/algorithm/OrbifoldNormalized";
import { latticeKey } from "@/classes/algorithm/LatticeEnumerator";
import type { SeedConfiguration } from "@/classes/algorithm/SeedConfiguration";

const args = process.argv.slice(2);
const baseline = args.includes("--baseline");
const pos = args.filter((a) => !a.startsWith("--"));
const k = parseInt(pos[0] ?? "2", 10);
const ns = pos[1] ? pos[1].split(",").map(Number) : k >= 3 ? [3, 4, 6, 12] : [3, 4, 6, 8, 12];
const poolClassCap = pos[2] ? parseInt(pos[2], 10) : 8000;
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
const ring = baseRing.N === 24 ? baseRing : CyclotomicRing.create(24); // Surd enumeration requires N=24
setActiveRing(ring);
const polySizes = [...new Set(ns)].sort((a, b) => a - b);

console.log(`normalized branch measurement: k=${k}  tiles={${ns.join(",")}}  ring N=${ring.N}  poolClassCap=${poolClassCap}  baseline=${baseline}`);

// --- build seeds (mirrors scripts/probe-pipeline.ts / measure-orbifold-branches.ts) ---
const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++)
	for (let j = i + 1; j < vcs.length; j++)
		if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
const useSeeds = k >= 2 ? seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : seeds;

const vcSigOf = (seed: SeedConfiguration) =>
	seed.vertexConfigurations
		.map((vc) => {
			const m = new Map<number, number>();
			for (const p of vc.polygons) m.set(p.n, (m.get(p.n) ?? 0) + 1);
			return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}^${c}`).join(".");
		})
		.sort()
		.join("|");

// --- Phase 1: collect DISTINCT candidate lattices (enumeration depends only on (Λ,k)) ---
const uniq = new Map<string, { u: Cyclotomic; v: Cyclotomic }>();
const seenSig = new Set<string>();
const t0 = Date.now();
for (const seed of useSeeds) {
	const sig = vcSigOf(seed);
	if (seenSig.has(sig)) continue;
	seenSig.add(sig);
	const { lattices } = new PeriodSolver(k).candidateLatticesFor(seed);
	for (const [u, v] of lattices) {
		const lk = latticeKey(u, v);
		if (!uniq.has(lk)) uniq.set(lk, { u, v });
	}
}
console.log(`seeds: ${useSeeds.length}, ${seenSig.size} VC-signatures → ${uniq.size} DISTINCT candidate lattices; candidate enum ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

// --- Phase 2: normalized enumeration per distinct lattice ---
type Agg = {
	latts: number;
	pool: number[];
	branches: number[];       // total normalized branches per lattice
	cyclicRotMax: number[];   // max distinct classes over cyclic-rot types (the collapse headline)
	reAnchorTotal: number[];  // Σ|𝒳| per lattice (the conserved fill count)
	dihedral: number[];       // dihedral branch count per lattice
	consOK: number;           // lattices with rotation+reflection conservation OK
	consBad: number;
	poolTrunc: number;
	// baseline (Phase-A) on the same lattices
	baseFull: number; baseEnumCap: number; basePoolCap: number; baseBranches: number[];
};
const init = (): Agg => ({ latts: 0, pool: [], branches: [], cyclicRotMax: [], reAnchorTotal: [], dihedral: [], consOK: 0, consBad: 0, poolTrunc: 0, baseFull: 0, baseEnumCap: 0, basePoolCap: 0, baseBranches: [] });
const perBravais = new Map<Bravais, Agg>();
const orderB: Bravais[] = ["oblique", "rect/cmm", "square", "hex"];
const violations: string[] = [];

const t1 = Date.now();
let done = 0;
for (const [lk, { u, v }] of uniq) {
	const { branches, diag } = enumerateNormalizedBranches(u, v, ring, polySizes, k, { poolClassCap });
	const agg = perBravais.get(diag.bravais) ?? init();
	agg.latts++;
	agg.pool.push(diag.poolClasses);
	agg.branches.push(diag.branches);
	agg.dihedral.push(diag.byKind.dihedral);
	if (diag.poolTruncated) agg.poolTrunc++;
	// the collapse headline: max distinct classes among cyclic-rot types (one per rotation subgroup)
	const rotClassCounts = new Map<string, number>();
	for (const b of branches) if (b.type.kind === "cyclic-rot") rotClassCounts.set(`R${b.order}`, (rotClassCounts.get(`R${b.order}`) ?? 0) + 1);
	agg.cyclicRotMax.push(rotClassCounts.size ? Math.max(...rotClassCounts.values()) : 0);
	agg.reAnchorTotal.push(branches.reduce((s, b) => s + b.reAnchorSet.length, 0));
	if (diag.rotationConserved && diag.reflectionConserved) agg.consOK++;
	else {
		agg.consBad++;
		if (violations.length < 12) violations.push(`${lk}: rot=${diag.rotationConserved} refl=${diag.reflectionConserved} ${JSON.stringify(diag.conservationDetail.filter((c) => !c.ok))}`);
	}
	if (baseline) {
		const { diag: bd } = enumerateBranches(u, v, ring, polySizes, k, { poolClassCap, enumCap: 4000 });
		if (bd.poolTruncated) agg.basePoolCap++;
		else if (bd.enumCapped) agg.baseEnumCap++;
		else { agg.baseFull++; agg.baseBranches.push(bd.branches); }
	}
	perBravais.set(diag.bravais, agg);
	if (++done % 100 === 0) process.stderr.write(`  …${done}/${uniq.size} lattices, ${((Date.now() - t1) / 1000).toFixed(0)}s\n`);
}

const stat = (xs: number[]) => {
	if (xs.length === 0) return { min: 0, med: 0, max: 0, total: 0 };
	const s = [...xs].sort((a, b) => a - b);
	return { min: s[0], med: s[Math.floor(s.length / 2)], max: s[s.length - 1], total: s.reduce((a, b) => a + b, 0) };
};

console.log(`normalized enumeration ${((Date.now() - t1) / 1000).toFixed(1)}s\n`);
console.log("bravais   | #latt | pool med/max | NORM branches med/max/Σ | cyclicRot classes med/max | dihedral med/max | Σ|𝒳| med/max | cons OK/BAD | poolCap");
console.log("-".repeat(140));
for (const b of orderB) {
	const a = perBravais.get(b);
	if (!a) continue;
	const p = stat(a.pool), br = stat(a.branches), cr = stat(a.cyclicRotMax), dh = stat(a.dihedral), ra = stat(a.reAnchorTotal);
	console.log(
		`${b.padEnd(9)} | ${String(a.latts).padStart(5)} | ${String(p.med).padStart(4)}/${String(p.max).padStart(5)} | ` +
		`${String(br.med).padStart(4)}/${String(br.max).padStart(4)}/${String(br.total).padStart(6)} | ` +
		`${String(cr.med).padStart(4)}/${String(cr.max).padStart(4)}              | ` +
		`${String(dh.med).padStart(4)}/${String(dh.max).padStart(4)}        | ` +
		`${String(ra.med).padStart(5)}/${String(ra.max).padStart(6)} | ${String(a.consOK).padStart(4)}/${String(a.consBad).padStart(3)} | ${a.poolTrunc}`
	);
}
console.log("-".repeat(140));
const totOK = [...perBravais.values()].reduce((s, a) => s + a.consOK, 0);
const totBad = [...perBravais.values()].reduce((s, a) => s + a.consBad, 0);
const totTrunc = [...perBravais.values()].reduce((s, a) => s + a.poolTrunc, 0);
console.log(`CONSERVATION: ${totOK}/${uniq.size} lattices OK, ${totBad} VIOLATIONS, ${totTrunc} pool-capped`);
if (totBad > 0) {
	console.log("⚑ CONSERVATION VIOLATIONS (a completeness tripwire — dropped tilings):");
	for (const v of violations) console.log(`   ${v}`);
}
if (baseline) {
	console.log("\n--- A/B vs non-normalized Phase-A on the SAME lattices ---");
	console.log("bravais   | base full/enumCap/poolCap | base branches med/max | norm branches med/max");
	console.log("-".repeat(95));
	for (const b of orderB) {
		const a = perBravais.get(b);
		if (!a) continue;
		const bb = stat(a.baseBranches), nb = stat(a.branches);
		console.log(`${b.padEnd(9)} | ${String(a.baseFull).padStart(5)}/${String(a.baseEnumCap).padStart(5)}/${String(a.basePoolCap).padStart(5)}        | ${String(bb.med).padStart(5)}/${String(bb.max).padStart(6)}        | ${String(nb.med).padStart(5)}/${String(nb.max).padStart(6)}`);
	}
}
