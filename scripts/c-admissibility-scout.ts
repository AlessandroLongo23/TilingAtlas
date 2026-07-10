/* C-admissibility scout — MEASUREMENT ONLY, no pipeline change.
 *
 * Evaluates the proposed per-lattice admissibility condition C(Λ,S) (Fable, 2026-07-10;
 * docs/canonical-form sibling deliverable "P3"):
 *
 *   C(Λ,S): ∃ orbit-type vector τ of length k over the seed's DISTINCT VC types (every type ≥ 1,
 *   i.e. same support as S), ∃ per-orbit class counts V_1..V_k with every V_i a divisor of hol(Λ),
 *   such that every tile count t_n = (Σ_i V_i·m_{τ_i,n})/n is a non-negative integer and
 *   Σ_n t_n·area(n) = |det Λ| EXACTLY (Surd equality via areaKey).
 *
 * This is a NECESSARY condition for Λ to carry a primitive, full-support, exactly-k-uniform cell
 * (see the accompanying note for the proof). The scout measures, on real seeds:
 *   (a) kill rate: how many post-P0 candidates fail C;
 *   (b) time share: what fraction of native fill time those candidates burn;
 *   (c) SOUNDNESS: no candidate that produces a raw cell may fail C (violations = derivation bug).
 * Ground truth comes twice: this scout's own mirrored per-lattice fill loop, and a real solve()
 * with onRawCell (belt and suspenders — the mirror is checked against the real path).
 *
 * Run: USE_NATIVE_FILL=1 pnpm tsx scripts/c-admissibility-scout.ts [nSeeds] [name...]
 * Logs synchronously to experiments/results/c-admissibility-scout-2026-07-10.{md,csv}.
 */
import * as fs from 'node:fs';
import { PeriodSolver, defaultMaxCellPolys, applySeedMapInv } from '@/classes/algorithm/PeriodSolver';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { holohedry, areaKey, latticeKey } from '@/classes/algorithm/LatticeEnumerator';
import { detSurd, tileAreaSurd, Surd } from '@/classes/algorithm/exact/Surd';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, Cyclotomic, CyclotomicRing } from '@/classes/Cyclotomic';
import type { Polygon } from '@/classes/polygons/Polygon';

const k = 3;
const ns = [3, 4, 6, 12];
const nSeeds = process.argv[2] ? parseInt(process.argv[2], 10) : 8;
const extraNames = process.argv.slice(3);
const HARD = '[3,3,3,3,3,3;3,3,3,3,6;3,3,3,3,6]';

const stamp = '2026-07-10';
const mdPath = `experiments/results/c-admissibility-scout-${stamp}.md`;
const csvPath = `experiments/results/c-admissibility-scout-${stamp}.csv`;
const log = (s: string) => { fs.appendFileSync(mdPath, s + '\n'); process.stdout.write(s + '\n'); };
fs.writeFileSync(mdPath, `# C-admissibility scout — ${stamp}\n\nCondition under test: C(Λ,S) = divisor-constrained orbit-class feasibility (per-orbit V_i | hol(Λ), full support, exact area). Candidates are the REAL post-P0/post-OP-3 lists. Fills native (USE_NATIVE_FILL=${process.env.USE_NATIVE_FILL ?? '0'}).\n`);
fs.writeFileSync(csvPath, 'seed\tlatticeKey\thol\tareaKey\tdetFloat\tcVerdict\tfillMs\trawCells\tsolveRawCells\n');

if (process.env.USE_NATIVE_FILL !== '1') log('⚠ USE_NATIVE_FILL is OFF — timings will be pure-TS (13× slower), verdicts unaffected.');

// --- Seed generation (same prelude as scripts/profile-k3-seed.ts) ---
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));
log(`\nBuilding k=${k} seeds for {${ns.join(',')}} …`);
const tb = Date.now();
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
log(`Built ${seeds.length} seeds in ${((Date.now() - tb) / 1000).toFixed(1)}s`);

// Deterministic sample: first concrete per distinct name; HARD + extras always in; then a stride
// across the distinct-name list up to nSeeds.
const firstByName = new Map<string, (typeof seeds)[number]>();
for (const s of seeds) if (!firstByName.has(s.name)) firstByName.set(s.name, s);
const names = [...firstByName.keys()];
const picked: string[] = [];
for (const n of [HARD, ...extraNames]) if (firstByName.has(n) && !picked.includes(n)) picked.push(n);
const stride = Math.max(1, Math.floor(names.length / nSeeds));
for (let i = 0; i < names.length && picked.length < nSeeds; i += stride)
	if (!picked.includes(names[i])) picked.push(names[i]);
log(`Sampled ${picked.length}/${names.length} distinct seed names (stride ${stride}).`);

// --- C(Λ,S): feasible exact-area sets per holohedry class ---
const DIVS: Record<number, number[]> = { 2: [1, 2], 4: [1, 2, 4], 8: [1, 2, 4, 8], 12: [1, 2, 3, 4, 6, 12] };

/** Feasible areaKey set for one seed at holohedry h: union over support-preserving orbit-type
 *  vectors τ (compositions n_c ≥ 1, Σ n_c = k over the distinct types) and per-orbit counts
 *  V ∈ divisors(h), of the exact areas with integral tile counts. Also records max t_n per area. */
function feasSet(distinctIncidences: Map<number, number>[], h: number): Map<string, Map<number, number>> {
	const divs = DIVS[h] ?? [1, 2, 3, 4, 6, 12];
	const T = distinctIncidences.length;
	const out = new Map<string, Map<number, number>>();
	if (T === 0 || T > k) return out;
	// compositions of k into T parts ≥ 1
	const comps: number[][] = [];
	const comp = (left: number, parts: number, acc: number[]): void => {
		if (parts === 1) { comps.push([...acc, left]); return; }
		for (let q = 1; q <= left - (parts - 1); q++) comp(left - q, parts - 1, [...acc, q]);
	};
	comp(k, T, []);
	for (const c of comps) {
		// aggregate per type: W_c = sum of n_c values drawn (with repetition, order-free) from divs
		const wLists: number[][] = c.map((cnt) => {
			// all achievable sums of cnt divisors (multiset) — small
			let sums = new Set<number>([0]);
			for (let q = 0; q < cnt; q++) {
				const nx = new Set<number>();
				for (const s of sums) for (const d of divs) nx.add(s + d);
				sums = nx;
			}
			return [...sums];
		});
		const walk = (ti: number, inc: Map<number, number>): void => {
			if (ti === T) {
				let area = Surd.ZERO;
				const tcounts = new Map<number, number>();
				for (const [n, cnt] of inc) {
					if (cnt % n !== 0) return;
					const t = cnt / n;
					tcounts.set(n, t);
					area = area.add(tileAreaSurd(n).scaleRational(BigInt(t), 1n));
				}
				if (area.isZero()) return;
				const keyA = areaKey(area);
				const prev = out.get(keyA);
				if (!prev) out.set(keyA, tcounts);
				else for (const [n, t] of tcounts) prev.set(n, Math.max(prev.get(n) ?? 0, t));
				return;
			}
			for (const w of wLists[ti]) {
				const nx = new Map(inc);
				for (const [n, m] of distinctIncidences[ti]) nx.set(n, (nx.get(n) ?? 0) + m * w);
				walk(ti + 1, nx);
			}
		};
		walk(0, new Map());
	}
	return out;
}

// --- Per-seed measurement ---
const checker = new KUniformityChecker();
type Row = { lk: string; hol: number; ak: string; detF: number; c: boolean; ms: number; raw: number; solveRaw: number };
const totals = { cand: 0, cRej: 0, ms: 0, msCRej: 0, viol: 0, mirrorMismatch: 0 };
const t0all = Date.now();

for (let si = 0; si < picked.length; si++) {
	const seed = firstByName.get(picked[si])!;
	const solver = new PeriodSolver(k);
	const S = solver as any;
	log(`\n## Seed ${si + 1}/${picked.length}: ${seed.name}`);

	if (seed.polygons.some((p: Polygon) => p.isStar)) { log('star seed — C out of scope, skipped'); continue; }
	const corePolys: Polygon[] = seed.polygons;
	const ring = corePolys[0].exactVertices![0].ring;
	const ZERO = Cyclotomic.ZERO(ring);

	// distinct VC types by canonical name → incidence map n → count
	const byName = new Map<string, Map<number, number>>();
	for (const vc of seed.vertexConfigurations) {
		const nm = vc.getName();
		if (byName.has(nm)) continue;
		const m = new Map<number, number>();
		for (const p of vc.polygons) m.set(p.n, (m.get(p.n) ?? 0) + 1);
		byName.set(nm, m);
	}
	const distinctIncidences = [...byName.values()];
	const feasByHol = new Map<number, Map<string, Map<number, number>>>();
	for (const h of [2, 4, 8, 12]) feasByHol.set(h, feasSet(distinctIncidences, h));

	// real candidate list (post-P0, post-OP-3) + mirrored solve prelude
	const cl = S.candidateLattices(seed);
	const coreVertices: Cyclotomic[] = seed.vertexConfigurations.map((vc) => vc.computeSharedVertexExact());
	const allowed = new Set<string>(
		coreVertices.map((cv) => S.vcNameAt(cv, corePolys.filter((p) => p.vertexKeySet().has(cv.key()))))
	);
	const polySizes = Array.from(new Set(corePolys.map((p) => p.n))).sort((a, b) => a - b);
	const maxCellPolys = defaultMaxCellPolys(k);
	const fanCoreSets: Polygon[][] = [];
	const seenFan = new Set<string>([corePolys.map((p) => p.exactKey()).sort().join('|')]);
	for (const cv of coreVertices) {
		const fan = corePolys.filter((p) => p.vertexKeySet().has(cv.key()));
		if (fan.length < 2 || fan.length >= corePolys.length) continue;
		const fk = fan.map((p) => p.exactKey()).sort().join('|');
		if (seenFan.has(fk)) continue;
		seenFan.add(fk);
		fanCoreSets.push(fan);
	}
	const totalCoreArea = corePolys.reduce((s, p) => s + Math.abs(p.exactVertices!.reduce((a, v, i, arr) => {
		const w = arr[(i + 1) % arr.length].toVector(), u = v.toVector();
		return a + (u.x * w.y - u.y * w.x);
	}, 0) / 2), 0); // shoelace float; mirror of totalCoreArea's role (short-circuit only)

	const rows: Row[] = [];
	const tSeed = Date.now();
	for (const { basis: [u, v], seedMaps } of cl.lattices as { basis: [Cyclotomic, Cyclotomic]; seedMaps: { rot: number; refl: boolean }[] }[]) {
		const hol = holohedry(u, v);
		const det = detSurd(u, v).abs();
		const ak = areaKey(det);
		const c = feasByHol.get(hol)!.has(ak);
		const ctx = S.makeCtx(u, v, ring, allowed, polySizes, maxCellPolys, [], cl.allKeys, cl.areaKeys);
		if (!ctx) continue;
		ctx.gate = (r: Polygon[]) => checker.countVertexOrbits(r, u, v); // k=3 early gate, as solve()
		const diag: Record<string, unknown> = { candidateLattices: 0, latticesTried: 0, rawCells: 0, emitted: 0, gateRejected: 0, earlyGateRejected: 0, fanLattices: 0, p0Skipped: 0, orbitSkipped: 0, p1Pruned: 0, p2Skipped: 0, vBelowKSkipped: 0, seedStateDedup: 0, obliqueCandidates: 0, obliqueTruncated: null, supercellRejected: 0, primitivityGuardMisses: 0, primitivityGuardAreaSuppressed: 0, starLadderTruncated: false, blockIndexCapTruncated: 0, timedOut: false };
		const seedCores: Polygon[][] = [];
		for (const m of seedMaps) {
			const core = applySeedMapInv(corePolys, m, ring, ZERO);
			const overflows = fanCoreSets.length > 0 && ctx.cellArea < totalCoreArea - 1e-9 &&
				S.footprintArea(core, ctx) > ctx.cellArea + 1e-6;
			if (overflows) for (const fan of fanCoreSets) seedCores.push(applySeedMapInv(fan, m, ring, ZERO));
			else seedCores.push(core);
		}
		const t0 = performance.now();
		let raw = 0;
		for (const core of seedCores) raw += S.torusFill(core, ctx, () => false, diag).length;
		const ms = performance.now() - t0;
		rows.push({ lk: latticeKey(u, v), hol, ak, detF: det.toFloat(), c, ms, raw, solveRaw: 0 });
	}

	// belt & suspenders: the REAL solve path, attributing raw cells to lattices
	const perLatticeSolve = new Map<string, number>();
	solver.solve(seed, { maxMs: 0, onRawCell: (_reps: Polygon[], basis: [Cyclotomic, Cyclotomic]) => {
		const lk2 = latticeKey(basis[0], basis[1]);
		perLatticeSolve.set(lk2, (perLatticeSolve.get(lk2) ?? 0) + 1);
	} } as any);
	for (const r of rows) r.solveRaw = perLatticeSolve.get(r.lk) ?? 0;

	// report
	let cRej = 0, ms = 0, msCRej = 0, viol = 0, mm = 0;
	for (const r of rows) {
		ms += r.ms;
		if (!r.c) { cRej++; msCRej += r.ms; }
		if (!r.c && (r.raw > 0 || r.solveRaw > 0)) viol++;
		if ((r.raw > 0) !== (r.solveRaw > 0)) mm++;
		fs.appendFileSync(csvPath, `${seed.name}\t${r.lk}\t${r.hol}\t${r.ak}\t${r.detF.toFixed(4)}\t${r.c ? 1 : 0}\t${r.ms.toFixed(1)}\t${r.raw}\t${r.solveRaw}\n`);
	}
	totals.cand += rows.length; totals.cRej += cRej; totals.ms += ms; totals.msCRej += msCRej; totals.viol += viol; totals.mirrorMismatch += mm;
	const byHol = [2, 4, 8, 12].map((h) => {
		const rs = rows.filter((r) => r.hol === h);
		const rj = rs.filter((r) => !r.c).length;
		return `hol${h}: ${rj}/${rs.length} rejected`;
	}).join(', ');
	log(`candidates=${rows.length} C-rejected=${cRej} (${(100 * cRej / Math.max(1, rows.length)).toFixed(0)}%) | fill=${(ms / 1000).toFixed(1)}s, on C-rejected=${(msCRej / 1000).toFixed(1)}s (${(100 * msCRej / Math.max(1, ms)).toFixed(0)}%) | ${byHol}`);
	log(`SOUNDNESS violations (C-rejected but productive): ${viol}${viol > 0 ? '  ⚠⚠⚠ CONDITION OR PORT IS WRONG' : ''} | mirror-vs-solve productive mismatches: ${mm}`);
	const elapsed = (Date.now() - t0all) / 1000;
	const eta = elapsed / (si + 1) * (picked.length - si - 1);
	log(`progress ${si + 1}/${picked.length}, elapsed ${(elapsed / 60).toFixed(1)}m, ETA ${(eta / 60).toFixed(1)}m (seed took ${((Date.now() - tSeed) / 1000).toFixed(1)}s)`);
}

log(`\n# TOTALS`);
log(`candidates=${totals.cand}, C-rejected=${totals.cRej} (${(100 * totals.cRej / Math.max(1, totals.cand)).toFixed(1)}%)`);
log(`fill time=${(totals.ms / 1000).toFixed(1)}s, on C-rejected lattices=${(totals.msCRej / 1000).toFixed(1)}s (${(100 * totals.msCRej / Math.max(1, totals.ms)).toFixed(1)}%)`);
log(`soundness violations=${totals.viol} (MUST be 0), mirror mismatches=${totals.mirrorMismatch} (should be 0)`);
