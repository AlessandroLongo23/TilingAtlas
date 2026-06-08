/*
 * C7 star spike — Harness 2 (POST-FILL verification of the 4(j) cell).
 *
 * Harness 1 (the real solve) unexpectedly emitted a certified k=1 cell — the 8.4*.8.4* seed mod the
 * right Λ closes with no corner-completion, so the regular-only fill loop (finding 1) never bit. This
 * harness verifies that emitted cell. Per the TA contract hardening: the cell is an UNVALIDATED INPUT,
 * so it must pass its OWN correctness gate — built ONLY from the independently unit-tested primitives
 * (cornerAngleUnits A1, exactPolygonsOverlap B2, polygonAreaSurd A4), NOT from the validators we want to
 * trust (isCompleteTiling / KUniformityChecker) — BEFORE any post-fill row (the orbit count) is trusted.
 * Otherwise a validator bug and a bad cell are indistinguishable.
 *
 * Independent gate:  G1 no proper overlap · G2 every interior vertex 2π & typed (t≥3 real or t=2 dent) ·
 *                    G3 exact area = |det Λ| · G4 edge-to-edge (every edge reverse-matched).
 * Only if the gate passes do we run KUniformityChecker and trust k=1.
 *
 * Run:  SPIKE_TRACE=1 pnpm tsx scripts/spike-star-4j-cell.ts
 */
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { ExactStarPolygon } from '@/classes/polygons/ExactStarPolygon';
import { PeriodSolver, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { polygonAreaSurd, detSurd } from '@/classes/algorithm/exact/Surd';
import { exactPolygonsOverlap } from '@/classes/algorithm/exact/exactOverlap';
import type { Polygon } from '@/classes/polygons/Polygon';
import type { SeedConfigurationLike } from '@/classes/algorithm/SeedExpander';
import { spikeBreaksSeen } from '@/classes/algorithm/exact/spikeTrace';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const O = Cyclotomic.ZERO(ring);

// --- the 8.4*.8.4* seed (same as Harness 1) ---
const oct1 = RegularPolygon.fromAnchorAndDirExact(8, O, 0);
const star1 = ExactStarPolygon.fourStarPi4(O, 9);
const oct2 = RegularPolygon.fromAnchorAndDirExact(8, O, 12);
const star2 = ExactStarPolygon.fourStarPi4(O, 21);
const polygons = [oct1, star1, oct2, star2];
const seed: SeedConfigurationLike = { polygons, vertexConfigurations: [{ computeSharedVertexExact: () => O, polygons }] };

const starArea = polygonAreaSurd(star1.exactVertices!);
console.log('C7 spike Harness 2 — independent EXACT verification of the 4(j) cell');
console.log(`  exact 4*_{π/4} area = ${starArea.toString()} ≈ ${starArea.toFloat().toFixed(6)}  (unit square = 1)`);

const { cells } = new PeriodSolver(1).solve(seed, { maxMs: 30000 });
if (cells.length === 0) { console.log('  NO CELL emitted — cannot verify.'); process.exit(0); }
const cell: PeriodCell = cells[0];
const [u, v] = cell.basisExact;
const tiles = cell.cellPolygons;

const nStars = tiles.filter((p) => p.isStar).length;
const comp = tiles.map((p) => p.getName()).sort().join(',');

// exact area = |det Λ| (Surd equality)
let area = polygonAreaSurd(tiles[0].exactVertices!);
for (let i = 1; i < tiles.length; i++) area = area.add(polygonAreaSurd(tiles[i].exactVertices!));
const detAbs = detSurd(u, v).abs();
const areaExact = area.equals(detAbs);

// replicate the cell over Λ
const R = 2;
const block: Polygon[] = [];
const seenB = new Set<string>();
for (let mi = -R; mi <= R; mi++) for (let ni = -R; ni <= R; ni++) {
	const t = u.scaleRational(BigInt(mi), 1n).add(v.scaleRational(BigInt(ni), 1n));
	for (const cp of tiles) { const q = cp.clone(); q.translateExact(t); const k = q.exactKey(); if (!seenB.has(k)) { seenB.add(k); block.push(q); } }
}
const cellDiam = Math.max(Math.hypot(u.toVector().x, u.toVector().y), Math.hypot(v.toVector().x, v.toVector().y));

// G1 — no proper overlap among nearby tiles (exact B2, independently unit-tested).
const local = block.filter((p) => Math.hypot(p.exactCentroid!.toVector().x, p.exactCentroid!.toVector().y) <= 2 * cellDiam + 2);
let overlaps = 0;
for (let i = 0; i < local.length; i++) for (let j = i + 1; j < local.length; j++)
	if (exactPolygonsOverlap(local[i].exactVertices!, local[j].exactVertices!)) overlaps++;

// G2 — every interior vertex (within one cell of O) sums to 2π and is well-typed (t≥3 real, or t=2 dent).
const inc = new Map<string, { units: number; tiles: Set<string>; vf: { x: number; y: number } }>();
for (const p of block) p.exactVertices!.forEach((vx, i) => {
	const key = vx.key(); const e = inc.get(key); const a = p.cornerAngleUnits(i);
	if (e) { e.units += a; e.tiles.add(p.exactKey()); } else inc.set(key, { units: a, tiles: new Set([p.exactKey()]), vf: vx.toVector() });
});
let dentFills = 0, realVerts = 0, badSum = 0, badT = 0;
for (const { units, tiles: tset, vf } of inc.values()) {
	if (Math.hypot(vf.x, vf.y) > cellDiam + 0.5) continue; // interior of one cell only
	if (units !== 24) { badSum++; continue; } // an interior vertex not at 2π ⇒ gap/over-fill ⇒ NOT gap-free
	if (tset.size >= 3) realVerts++;
	else if (tset.size === 2) dentFills++;
	else badT++; // a 1-tile point at 2π is impossible in a real tiling
}

// G4 — edge-to-edge: every directed edge of a cell tile has its reverse among the block (each edge
//      shared by exactly two tiles in opposite directions ⇒ no T-junction / partial-edge seam).
const dir = new Set<string>();
for (const p of block) { const vs = p.exactVertices!; for (let i = 0; i < vs.length; i++) dir.add(`${vs[i].key()}->${vs[(i + 1) % vs.length].key()}`); }
let unmatched = 0;
for (const p of tiles) { const vs = p.exactVertices!; for (let i = 0; i < vs.length; i++) { const a = vs[i].key(), b = vs[(i + 1) % vs.length].key(); if (!dir.has(`${b}->${a}`)) unmatched++; } }

const gatePass = overlaps === 0 && badSum === 0 && badT === 0 && unmatched === 0 && areaExact && nStars > 0;
console.log('\n--- independent cell-correctness gate (no validators-under-test) ---');
console.log(`  composition: ${tiles.length} tiles [${comp}], stars=${nStars}`);
console.log(`  G1 no proper overlap (exact B2):                 ${overlaps === 0}  (${overlaps} overlapping pairs)`);
console.log(`  G2 interior vertices all 2π & well-typed:        ${badSum === 0 && badT === 0}  (${realVerts} ≥3-tile, ${dentFills} dent-fills; badSum=${badSum} badT=${badT})`);
console.log(`  G3 exact area = |det Λ| (Surd):                   ${areaExact}  (Σshoelace ${area.toFloat().toFixed(6)} = ${detAbs.toFloat().toFixed(6)})`);
console.log(`  G4 edge-to-edge (every edge reverse-matched):    ${unmatched === 0}  (${unmatched} unmatched)`);
console.log(`  => cell is independently VALID: ${gatePass}`);

// Only NOW trust the post-fill validator (the orbit count) — the cell is independently known-good.
let orbits: number | null = null;
if (gatePass) {
	const kdiag = { syms: 0, reps: 0, blockSize: 0, orbits: null as number | null };
	orbits = new KUniformityChecker().countVertexOrbits(tiles, u, v, kdiag);
	console.log(`\n  post-fill validator (trusted — cell is valid): vertex orbits = ${orbits}  (k target 1; ${kdiag.syms} syms)`);
} else {
	console.log('\n  gate FAILED ⇒ NOT trusting the orbit count (validator-bug vs bad-cell indistinguishable).');
}

console.log('\n--- VERDICT ---');
const confirmed = gatePass && orbits === 1 && dentFills > 0;
console.log(`  4(j) ${confirmed ? 'CONFIRMED' : 'NOT fully confirmed'} — certified k=1 non-convex star tiling, verified exact and independent of the validators under test.`);

const breaks = spikeBreaksSeen();
console.log(`\n--- break list seen this run (${breaks.length}) ---`);
for (const b of breaks) console.log('  ' + b);
