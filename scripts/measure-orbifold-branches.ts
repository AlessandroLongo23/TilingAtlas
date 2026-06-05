/*
 * Measure equivariant-branch counts per Bravais class — orbifold Phase A, step 1 (the gating
 * measurement). For every DISTINCT candidate period lattice the pipeline produces, enumerate the
 * candidate wallpaper-group branches (OrbifoldBranches.enumerateBranches) with the licensed cuts
 * ACTIVE (edge-direction subgroup on the quotient-BFS pool, glide pre-filter, group-key dedup) and
 * the arithmetic branch filter applied as a per-lattice post-step. The numbers decide whether TA's
 * re-anchoring lemma is needed before the equivariant fill is written (contract §5 Phase B).
 *
 * Branch enumeration depends only on (Λ, k) — NOT on the seed/VC-signature — so we dedup candidate
 * lattices by latticeKey and enumerate each ONCE (the earlier per-(vcSig×lattice) version redid the
 * same lattice dozens of times). The arithmetic filter (the only seed-dependent cut) is applied with
 * the MOST PERMISSIVE producer minV (conservative: the most branches the fill could face).
 *
 * Run:  pnpm tsx scripts/measure-orbifold-branches.ts [k] [tiles] [poolClassCap]
 * Server-only (no network).
 */
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing, type Cyclotomic } from '@/classes/Cyclotomic';
import { enumerateBranches, type Bravais } from '@/classes/algorithm/OrbifoldBranches';
import { vcAreaMinVerts, areaKey, latticeKey } from '@/classes/algorithm/LatticeEnumerator';
import { detSurd } from '@/classes/algorithm/exact/Surd';
import type { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';

const k = parseInt(process.argv[2] ?? '2', 10);
const ns = process.argv[3] ? process.argv[3].split(',').map(Number) : k >= 3 ? [3, 4, 6, 12] : [3, 4, 6, 8, 12];
const poolClassCap = process.argv[4] ? parseInt(process.argv[4], 10) : 8000;
const enumCap = 4000; // above this many generator-multisets, report the explosion magnitude, skip closure
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
const ring = baseRing.N === 24 ? baseRing : CyclotomicRing.create(24); // Surd enumeration requires N=24
setActiveRing(ring);
const polySizes = [...new Set(ns)].sort((a, b) => a - b);
const regularArea = (n: number) => n / (4 * Math.tan(Math.PI / n)); // float ceiling (matches PeriodSolver)
const aMax = Math.max(...polySizes.map(regularArea));
const areaBoundF = 24 * k * aMax;

console.log(`orbifold branch measurement: k=${k}  tiles={${ns.join(',')}}  ring N=${ring.N}  poolClassCap=${poolClassCap}  depth=k·|gridSurvivors|−1`);

// --- build seeds (mirrors scripts/probe-pipeline.ts) ---
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

const vcIncOf = (seed: SeedConfiguration) =>
	seed.vertexConfigurations.map((vc) => {
		const m = new Map<number, number>();
		for (const p of vc.polygons) m.set(p.n, (m.get(p.n) ?? 0) + 1);
		return m;
	});
const vcSigOf = (seed: SeedConfiguration) =>
	vcIncOf(seed)
		.map((m) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}^${c}`).join('.'))
		.sort()
		.join('|');

// --- Phase 1: collect DISTINCT candidate lattices across all VC-signatures (candidate enum is cheap,
// cached by vcSig; the per-lattice minVerts producers are recorded for the arithmetic filter). ---
const uniq = new Map<string, { u: Cyclotomic; v: Cyclotomic; minVs: number[] }>();
const seenSig = new Set<string>();
let vcSigCount = 0;
const t0 = Date.now();
for (const seed of useSeeds) {
	const sig = vcSigOf(seed);
	if (seenSig.has(sig)) continue;
	seenSig.add(sig);
	vcSigCount++;
	const minVerts = vcAreaMinVerts(vcIncOf(seed), areaBoundF);
	const { lattices } = new PeriodSolver(k).candidateLatticesFor(seed);
	for (const [u, v] of lattices) {
		const lk = latticeKey(u, v);
		const mv = minVerts.get(areaKey(detSurd(u, v).abs()));
		const e = uniq.get(lk);
		if (e) { if (mv !== undefined) e.minVs.push(mv); }
		else uniq.set(lk, { u, v, minVs: mv !== undefined ? [mv] : [] });
	}
}
console.log(`seeds: ${useSeeds.length} used, ${vcSigCount} distinct VC-signatures → ${uniq.size} DISTINCT candidate lattices; candidate enum ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

// --- Phase 2: enumerate branches per DISTINCT lattice ONCE; aggregate per Bravais class. ---
type Agg = {
	latts: number;
	pool: number[];          // poolClasses P over ALL lattices of this class
	genMs: number[];         // generator-multiset count ≈ 1+(R+F)+R·F (the enumeration work); excludes pool-capped
	branches: number[];      // exact distinct branches (fully-enumerated lattices only)
	filt: number[];          // exact arith-filtered survivors (fully-enumerated only)
	glide: number;
	aborts: number;
	nFull: number;           // fully enumerated (exact branch count available)
	nEnumCap: number;        // gen-multisets > enumCap (explosion; branches uncounted)
	nPoolCap: number;        // pool > poolClassCap (even the pool is intractable)
};
const init = (): Agg => ({ latts: 0, pool: [], genMs: [], branches: [], filt: [], glide: 0, aborts: 0, nFull: 0, nEnumCap: 0, nPoolCap: 0 });
const perBravais = new Map<Bravais, Agg>();
const orderB: Bravais[] = ['oblique', 'rect/cmm', 'square', 'hex'];

const t1 = Date.now();
let done = 0;
for (const { u, v, minVs } of uniq.values()) {
	const { branches, diag } = enumerateBranches(u, v, ring, polySizes, k, { poolClassCap, enumCap });
	const agg = perBravais.get(diag.bravais) ?? init();
	agg.latts++;
	agg.pool.push(diag.poolClasses);
	agg.glide += diag.glideFiltered;
	agg.aborts += diag.closureAborts;
	if (diag.poolTruncated) {
		agg.nPoolCap++;
	} else if (diag.enumCapped) {
		agg.nEnumCap++;
		agg.genMs.push(diag.generatorMultisets);
	} else {
		agg.nFull++;
		agg.genMs.push(diag.generatorMultisets);
		agg.branches.push(branches.length);
		// arithmetic filter (branch-exact P0): a branch is dropped iff minV > k·order. Use the most
		// PERMISSIVE producer minV (smallest) ⇒ fewest drops ⇒ conservative survivor count.
		const minV = minVs.length ? Math.min(...minVs) : undefined;
		agg.filt.push(minV === undefined ? branches.length : branches.filter((b) => !(minV > k * b.order)).length);
	}
	perBravais.set(diag.bravais, agg);
	if (++done % 50 === 0) process.stderr.write(`  …${done}/${uniq.size} lattices, ${((Date.now() - t1) / 1000).toFixed(0)}s\n`);
}

const stat = (xs: number[]) => {
	if (xs.length === 0) return { min: 0, med: 0, max: 0, total: 0 };
	const s = [...xs].sort((a, b) => a - b);
	return { min: s[0], med: s[Math.floor(s.length / 2)], max: s[s.length - 1], total: s.reduce((a, b) => a + b, 0) };
};

console.log(`branch enumeration ${((Date.now() - t1) / 1000).toFixed(1)}s   (poolClassCap=${poolClassCap}, enumCap=${enumCap})\n`);
console.log('bravais   | #latt | poolClasses min/med/max | genMultisets med/max (the work) | EXACT branches min/med/max/Σ (fully-enum) | full/enumCap/poolCap');
console.log('-'.repeat(135));
for (const b of orderB) {
	const a = perBravais.get(b);
	if (!a) continue;
	const p = stat(a.pool), gm = stat(a.genMs), br = stat(a.branches);
	console.log(
		`${b.padEnd(9)} | ${String(a.latts).padStart(5)} | ` +
		`${String(p.min).padStart(5)}/${String(p.med).padStart(5)}/${String(p.max).padStart(6)}     | ` +
		`${String(gm.med).padStart(8)}/${String(gm.max).padStart(9)}        | ` +
		`${String(br.min).padStart(4)}/${String(br.med).padStart(4)}/${String(br.max).padStart(4)}/${String(br.total).padStart(7)}            | ` +
		`${a.nFull}/${a.nEnumCap}/${a.nPoolCap}`
	);
}
const tEnumCap = [...perBravais.values()].reduce((s, a) => s + a.nEnumCap, 0);
const tPoolCap = [...perBravais.values()].reduce((s, a) => s + a.nPoolCap, 0);
const tFull = [...perBravais.values()].reduce((s, a) => s + a.nFull, 0);
console.log('-'.repeat(135));
console.log(`TOTAL distinct lattices=${uniq.size}: fully-enumerated=${tFull}, enum-capped=${tEnumCap}, pool-capped=${tPoolCap}`);
if (tEnumCap + tPoolCap > 0)
	console.log(`⚑ INCOMPLETE-REGION: ${tEnumCap + tPoolCap}/${uniq.size} lattices INTRACTABLE to enumerate (genMultisets>${enumCap} or pool>${poolClassCap}) — the rank-(φ(N)−2) placement explosion; re-anchoring-lemma territory (contract §5 Phase B).`);
