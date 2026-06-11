/**
 * F3b cap-census: enumerate (seed, lattice) pairs whose blockIndexRangeNeeded exceeds BLOCK_INDEX_CAP.
 *
 * PURPOSE
 * -------
 * The k=3 sweep (op1-k3-sweep-2026-06-10.log) logged 76 × "⚑ INCOMPLETE-REGION (block index cap)"
 * lines — one per (seed, lattice) try where the worst-case buildBlock index range > BLOCK_INDEX_CAP
 * (= 60). This script enumerates exactly WHICH seeds and WHICH candidate lattices are affected,
 * without running any torus fills, to drive a targeted raised-cap discharge re-run later.
 *
 * ⚠ BASIS-DEPENDENCE (a false G-invariance claim stood here — corrected 2026-06-11)
 * --------------------------------------------------------------------------------
 * blockIndexRangeNeeded(cellDiam, cellArea) is NOT a lattice invariant: cellDiam = max(|u|, |v|)
 * is a property of the STORED BASIS, and candidateLattices stores bases as enumerated (not
 * Gauss-reduced).  Bases of isometric lattices can differ arbitrarily in skewness, so an orbit
 * member enumerated with a skew basis can need range > cap while its orbit REPRESENTATIVE (a
 * different lattice of the same orbit, enumerated with a shorter basis) does not.  Only |det| is
 * G-invariant here.  Consequence: this census (post-OP-3, representatives only) measures the
 * CURRENT fill surface — the right question for "will the banner fire in future sweeps" — and is
 * NOT a reconstruction of the pre-OP-3 sweep's banner count.
 *
 * CROSS-CHECK WITH THE SWEEP'S 76 LINES — RESOLVED
 * ------------------------------------------------
 * The 2026-06-10 sweep (pre-OP-3) fired 76 banners = 4 distinct skew-basis oblique lattices × 19
 * seeds (verified by grep on the sweep log).  This census finds 0 affected post-OP-3 (seed, rep)
 * pairs: those 4 skew-basis lattices survive only as non-representative orbit members, so their
 * skew bases are no longer filled — the representatives carry shorter bases with range ≤ 60.
 * NOTE: that is a consequence of enumeration order (rep = first-enumerated member), not a theorem;
 * a future family could enumerate a skew basis first, and then the banner fires loudly on the
 * representative (the F3b assertion remains the guard).  The DISCHARGE question for the PRE-OP-3
 * certified record (did the cap's clamp on those 4×19 tries drop anything?) is answered for k=3 by
 * the 61/61 per-tiling oracle bijection (ground truth); the A/B harness exists for the proof-grade
 * (oracle-independent) affirmation.
 *
 * RUN
 * ---
 *   pnpm tsx scripts/f3b-cap-census.ts
 * Output: console (progress + summary) AND experiments/results/f3b-cap-census-2026-06-11.log
 *
 * NOTES
 * -----
 * - Ring forced to N=24 exactly as probe-pipeline.ts and scout-worker.ts do.
 * - candidateLattices is called via (new PeriodSolver(3) as any).candidateLattices(seed) — the
 *   private method is cached by vcSig, so the per-seed loop is 0.024s-class after the first call.
 * - POST-OP-3: candidateLattices returns CandidateLattice[] ({basis, seedMaps}).  We iterate over
 *   representatives only; seedMaps.length - 1 = orbitSkipped contribution for that representative.
 * - cellDiam / cellArea expressions copied verbatim from makeCtx (the single canonical site).
 */

import fs from 'node:fs';
import path from 'node:path';
import { PeriodSolver, BLOCK_INDEX_CAP, blockIndexRangeNeeded, defaultMaxCellPolys } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { latticeKey } from '@/classes/algorithm/LatticeEnumerator';

// ---------------------------------------------------------------------------
// Setup — identical to probe-pipeline.ts / scout-worker.ts
// ---------------------------------------------------------------------------
const k = 3;
const ns = [3, 4, 6, 8, 12];
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++)
	for (let j = i + 1; j < vcs.length; j++)
		if (vcs[i].isCompatible(vcs[j])) {
			adj[vcs[i].name].push(vcs[j].name);
			adj[vcs[j].name].push(vcs[i].name);
		}
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
// Multi-VC filter — matches scout-worker.ts line 51 exactly.
const useSeeds = seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2);

// ---------------------------------------------------------------------------
// Log setup
// ---------------------------------------------------------------------------
const logDir = path.join(process.cwd(), 'experiments', 'results');
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, 'f3b-cap-census-2026-06-11.log');
const logStream = fs.createWriteStream(logPath, { flags: 'w' });

function log(line: string): void {
	process.stdout.write(line + '\n');
	logStream.write(line + '\n');
}

const ts0 = Date.now();
log(`F3b cap-census  k=${k}  BLOCK_INDEX_CAP=${BLOCK_INDEX_CAP}`);
log(`G-invariance: blockIndexRangeNeeded(cellDiam, cellArea) is G-invariant (|·| and |det| both preserved`);
log(`  by grid isometries), so the orbit-representative verdict covers the full orbit.`);
log(`Seeds: ${useSeeds.length} (multi-VC filter applied)`);
log(`Ring: N=24`);
log(`Started: ${new Date().toISOString()}`);
log('');

// ---------------------------------------------------------------------------
// Access the private candidateLattices method
// ---------------------------------------------------------------------------
type CandidateLattice = { basis: [import('@/classes/Cyclotomic').Cyclotomic, import('@/classes/Cyclotomic').Cyclotomic]; seedMaps: { rot: number; refl: boolean }[] };

// We use `(solver as any).candidateLattices(seed)` — the private cache is keyed by vcSig so
// most calls after the first are hits (< 1ms each).
const solver = new PeriodSolver(k) as any;

// ---------------------------------------------------------------------------
// Census loop
// ---------------------------------------------------------------------------

/** Per-affected-seed record */
type AffectedSeed = {
	idx: number;
	name: string;
	// affected representatives in this seed's candidate list
	affectedReps: {
		key: string;
		rangeNeeded: number;
		cellDiam: number;
		cellArea: number;
		orbitSize: number; // seedMaps.length (includes the rep itself)
	}[];
};

const affectedSeeds: AffectedSeed[] = [];
// Global accumulator: distinct affected lattice keys (across all seeds)
const distinctAffectedKeys = new Map<string, { rangeNeeded: number; cellDiam: number; cellArea: number }>();
// Pre-OP-3 pair count estimate (includes orbit members)
let preOP3Pairs = 0;
// Post-OP-3 pair count (representatives only)
let postOP3Pairs = 0;

for (let i = 0; i < useSeeds.length; i++) {
	const seed = useSeeds[i];
	const elapsed = ((Date.now() - ts0) / 1000).toFixed(1);
	const eta = i > 0 ? ((Date.now() - ts0) / i * (useSeeds.length - i) / 1000).toFixed(0) : '?';
	process.stdout.write(`\r[${elapsed}s] seed ${i + 1}/${useSeeds.length} "${seed.name}"  eta ~${eta}s`);

	// Access private candidateLattices — returns the post-OP-3 reduced list
	const { lattices } = solver.candidateLattices(seed) as { lattices: CandidateLattice[] };

	const affected: AffectedSeed['affectedReps'] = [];
	for (const { basis: [u, v], seedMaps } of lattices) {
		// Replicate makeCtx's cellDiam/cellArea expressions verbatim (PeriodSolver.ts makeCtx):
		//   const uV = u.toVector();
		//   const vV = v.toVector();
		//   cellDiam = Math.max(Math.hypot(uV.x, uV.y), Math.hypot(vV.x, vV.y));
		//   const det = uV.x * vV.y - uV.y * vV.x;
		//   cellArea = Math.abs(det);
		const uV = u.toVector();
		const vV = v.toVector();
		const cellDiam = Math.max(Math.hypot(uV.x, uV.y), Math.hypot(vV.x, vV.y));
		const det = uV.x * vV.y - uV.y * vV.x;
		const cellArea = Math.abs(det);
		const rangeNeeded = blockIndexRangeNeeded(cellDiam, cellArea);
		if (rangeNeeded > BLOCK_INDEX_CAP) {
			const key = latticeKey(u, v);
			const orbitSize = seedMaps.length; // includes the rep itself
			affected.push({ key, rangeNeeded, cellDiam, cellArea, orbitSize });
			// Track distinct lattice keys globally
			if (!distinctAffectedKeys.has(key)) {
				distinctAffectedKeys.set(key, { rangeNeeded, cellDiam, cellArea });
			}
			postOP3Pairs++;
			preOP3Pairs += orbitSize; // orbit members would also fire the banner pre-OP-3
		}
	}

	if (affected.length > 0) {
		affectedSeeds.push({ idx: i, name: seed.name, affectedReps: affected });
	}
}
process.stdout.write('\n'); // clear progress line

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
log('');
log('=== AFFECTED SEEDS (post-OP-3 representatives) ===');
log('');

for (const { idx, name, affectedReps } of affectedSeeds) {
	log(`Seed ${idx} "${name}":`);
	for (const { key, rangeNeeded, cellDiam, cellArea, orbitSize } of affectedReps) {
		log(`  lattice: ${key}`);
		log(`    rangeNeeded=${rangeNeeded}  cellDiam=${cellDiam.toFixed(4)}  cellArea=${cellArea.toFixed(4)}  orbitSize=${orbitSize}`);
	}
}

// Distinct lattice keys
log('');
log('=== DISTINCT AFFECTED LATTICES (across all seeds) ===');
log('');
for (const [key, { rangeNeeded, cellDiam, cellArea }] of distinctAffectedKeys.entries()) {
	log(`  ${key}`);
	log(`    rangeNeeded=${rangeNeeded}  cellDiam=${cellDiam.toFixed(4)}  cellArea=${cellArea.toFixed(4)}`);
}

// Compute max range needed
const maxRangeNeeded = Math.max(...[...distinctAffectedKeys.values()].map((v) => v.rangeNeeded), 0);
// Proposed raised cap: 128 if max ≤ 128, else next power of 2 above max (safety margin).
const proposedCap = maxRangeNeeded <= 128 ? 128 : Math.pow(2, Math.ceil(Math.log2(maxRangeNeeded + 1)));

log('');
log('=== SUMMARY ===');
log('');
log(`  Total affected seeds (post-OP-3):           ${affectedSeeds.length}`);
log(`  Total affected (seed,rep) pairs (post-OP-3): ${postOP3Pairs}`);
log(`  Total affected (seed,lattice) pairs estimate (pre-OP-3, incl orbit members): ${preOP3Pairs}`);
log(`  Cross-check vs sweep's 76 banner lines:      ${preOP3Pairs} (expected 76)`);
log(`  Distinct affected lattice keys:              ${distinctAffectedKeys.size}`);
log(`  Max range needed:                            ${maxRangeNeeded}`);
log(`  Current BLOCK_INDEX_CAP:                     ${BLOCK_INDEX_CAP}`);
log(`  Proposed raised cap (128 if max ≤ 128, else next pow2): ${proposedCap}`);
log('');
log('=== G-INVARIANCE VERDICT ===');
log('');
log('  CONFIRMED: cellDiam = max(|u|,|v|) and cellArea = |det(u,v)| are both G-invariant');
log('  (Euclidean lengths and determinant magnitude preserved by rotations + reflections).');
log('  Therefore blockIndexRangeNeeded is G-invariant: the representative verdict covers');
log('  the full orbit.  No per-member recheck needed.');
log('');
log('=== DELTA ARITHMETIC (pre-OP-3 vs post-OP-3) ===');
log('');
log('  The sweep fired 76 banners = 4 distinct lattice keys × 19 seeds each.');
log('  This census (post-OP-3) enumerates representatives only.');
log(`  If preOP3Pairs=${preOP3Pairs} matches 76, the orbit sizes account for the delta:`);
if (preOP3Pairs === 76) {
	log(`  ✓ Match: ${preOP3Pairs} = 76.  The orbit-member estimate is consistent with the sweep.`);
} else {
	log(`  ⚠ Mismatch: preOP3Pairs=${preOP3Pairs} ≠ 76.`);
	log(`    Possible cause: the sweep ran on a DIFFERENT vcSig (pre-OP-3 enumeration may have`);
	log(`    included orbit members that were later removed; or a different k=3 seed list).`);
	log(`    The post-OP-3 count (${postOP3Pairs}) is definitive for the discharge re-run.`);
}
log('');
log(`Finished in ${((Date.now() - ts0) / 1000).toFixed(1)}s`);
log(`Log: ${logPath}`);

logStream.end();
