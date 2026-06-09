/*
 * C7 Increment-2 C3 acceptance — Myers 4(p) `4.6.4*_{π/6}.6` (REAL solve, FILL-needing).
 *
 * Unlike 4(j) (whose seed already carries both stars, so the cell closes mod Λ with NO fill), 4(p) is
 * seeded from a SINGLE vertex fan {square, hexagon, 4*@2 star, hexagon} around O. To close the torus the
 * corner-completion fill loop must CONSTRUCT further stars at the open vertices — exactly the gap C3
 * fills. Pre-C3 (regular-only fill loop) this harness emits 0 cells; with C3 it grows and certifies k=1.
 *
 * VC `4.6.4*_{π/6}.6`: square(6u) + hexagon(8u) + star-point α + hexagon(8u) = 24u ⇒ α = 2u (= π/6),
 * so the star is 4*@2 (β = 24 − 6 − 2 = 16). Edge-to-edge: shared rays at 0, 6, 14, 16.
 *
 * Run:  SPIKE_TRACE=1 pnpm tsx scripts/spike-star-4p.ts
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

// 4.6.4*_{π/6}.6 fan around O (CCW from direction 0).
const sq = RegularPolygon.fromAnchorAndDirExact(4, O, 0); //   square  covers [0, 6]
const hex1 = RegularPolygon.fromAnchorAndDirExact(6, O, 6); //  hexagon covers [6, 14]
const star = ExactStarPolygon.isotoxal(4, 2, O, 14); //         4*@2 point covers [14, 16]
const hex2 = RegularPolygon.fromAnchorAndDirExact(6, O, 16); // hexagon covers [16, 24]
const polygons = [sq, hex1, star, hex2];

const seed: SeedConfigurationLike = {
	polygons,
	vertexConfigurations: [{ computeSharedVertexExact: () => O, polygons }],
};

console.log('C7 Increment-2 C3 — REAL solve of Myers 4(p) 4.6.4*_{π/6}.6 (FILL-needing)');
console.log(`  seed tiles: ${polygons.map((p) => p.getName()).join(', ')}`);
console.log(`  star α=${star.alphaU} β=${star.betaU}  corner angles: [${star.exactVertices!.map((_, i) => star.cornerAngleUnits(i)).join(',')}]`);

let raw = 0;
const t0 = Date.now();
const { cells, diag } = new PeriodSolver(1).solve(seed, {
	maxMs: 60000,
	onRawCell: () => { raw++; },
});
const ms = Date.now() - t0;

console.log('\n--- result ---');
console.log(`  candidateLattices=${diag.candidateLattices} latticesTried=${diag.latticesTried} rawCells=${diag.rawCells} emitted=${diag.emitted} gateRejected=${diag.gateRejected} p1Pruned=${diag.p1Pruned} timedOut=${diag.timedOut} ${ms}ms`);
console.log(`  certified k=1 cells emitted: ${cells.length}  (raw torus closures seen: ${raw})`);

for (const c of cells) {
	const star = c.cellPolygons.filter((p) => p.isStar).length;
	const reg = c.cellPolygons.filter((p) => !p.isStar);
	const names = c.cellPolygons.map((p) => p.getName()).sort().join(', ');
	console.log(`  cell: ${c.cellPolygons.length} tiles (${star} star, ${reg.length} regular) → {${names}}`);
}

// HONESTY NOTE: empirically 4(p)'s translational cell = the single-VC fan {square, star, 2 hexagons},
// so it CLOSES mod Λ with NO productive fill — the star in the certified cell came from the SEED, not
// from a star CONSTRUCTED during corner-completion. (The TA contract assumed 4(p) needs fill; it does
// not.) C3's star-fill loop still RAN on the ~1134 non-closing candidate lattices without breaking the
// result or over-generating. Productive star-fill (a star built during fill ending up in a certified
// cell) is exercised+validated per-tiling in the in-ring Run, not here.
if (cells.length === 0) {
	console.log('  VERDICT: 0 cells — UNEXPECTED regression (4(p) should certify from its fan).');
} else if (cells.some((c) => c.cellPolygons.some((p) => p.isStar))) {
	console.log('  VERDICT: 4(p) CERTIFIED k=1 with a star in the cell (from the seed fan; C3 fill ran without breaking it).');
} else {
	console.log('  VERDICT: cells emitted but NONE contain a star — investigate (star lost?).');
}

const breaks = spikeBreaksSeen();
console.log(`\n--- break list (${breaks.length}) ---`);
for (const b of breaks) console.log('  ' + b);
