/*
 * C7 star spike — Harness 1 (REAL solve path). Drives the hand-seeded Myers 4(j) `8.4*.8.4*` VC through
 * `PeriodSolver.solve`. This harness reaches the PRE-FILL / FILL breaks and is EXPECTED to block at the
 * regular-only corner-completion fill loop (finding 1) — it cannot construct the star during fill, so it
 * produces 0 cells. That block is itself a valid spike result; the post-fill validators + the A2
 * verification are reached by Harness 2 (`spike-star-4j-cell.ts`).
 *
 * Run:  SPIKE_TRACE=1 pnpm tsx scripts/spike-star-4j.ts
 */
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { ExactStarPolygon } from '@/classes/polygons/ExactStarPolygon';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import type { SeedConfigurationLike } from '@/classes/algorithm/SeedExpander';
import { spikeBreaksSeen } from '@/classes/algorithm/exact/spikeTrace';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const O = Cyclotomic.ZERO(ring); // the shared vertex of the VC

// Build the 8.4*.8.4* vertex: around O (CCW from direction 0) an octagon (135°=9u), a star point
// (45°=3u), an octagon (9u), a star point (3u) — exactly 24u = 2π, edge-to-edge (shared edges at the
// arc boundaries 0,9,12,21). Each tile is seated with a corner at O and its outgoing edge at the arc
// start.
const oct1 = RegularPolygon.fromAnchorAndDirExact(8, O, 0);   // covers [0, 9]
const star1 = ExactStarPolygon.fourStarPi4(O, 9);            // point covers [9, 12]
const oct2 = RegularPolygon.fromAnchorAndDirExact(8, O, 12);  // covers [12, 21]
const star2 = ExactStarPolygon.fourStarPi4(O, 21);          // point covers [21, 24]
const polygons = [oct1, star1, oct2, star2];

const seed: SeedConfigurationLike = {
	polygons,
	vertexConfigurations: [{ computeSharedVertexExact: () => O, polygons }],
};

console.log('C7 spike Harness 1 — REAL solve of Myers 4(j) 8.4*.8.4*');
console.log(`  seed tiles: ${polygons.map((p) => p.getName()).join(', ')}`);
console.log(`  star corner angles (units π/12): [${star1.exactVertices!.map((_, i) => star1.cornerAngleUnits(i)).join(',')}]`);

let raw = 0;
const t0 = Date.now();
const { cells, diag } = new PeriodSolver(1).solve(seed, {
	maxMs: 30000,
	onRawCell: () => { raw++; },
});
const ms = Date.now() - t0;

console.log('\n--- result ---');
console.log(`  candidateLattices=${diag.candidateLattices} latticesTried=${diag.latticesTried} rawCells=${diag.rawCells} emitted=${diag.emitted} gateRejected=${diag.gateRejected} timedOut=${diag.timedOut} ${ms}ms`);
console.log(`  certified cells emitted: ${cells.length}  (raw torus closures seen: ${raw})`);
if (cells.length === 0) {
	console.log('  VERDICT: 0 cells — the real solve cannot complete a star cell (expected: the regular-only fill loop, finding 1).');
} else {
	console.log('  VERDICT: cells emitted — 4(j) reached the certificate via the real path (unexpected; investigate).');
}

const breaks = spikeBreaksSeen();
console.log(`\n--- Harness 1 break list (${breaks.length}) ---`);
for (const b of breaks) console.log('  ' + b);
if (breaks.length === 0) console.log('  (none — re-run with SPIKE_TRACE=1 to harvest)');
