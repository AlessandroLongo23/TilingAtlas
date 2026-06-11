/* k=3 re-certification acceptance: per-tiling oracle match of the POST-FIX scout artifact.
 *
 * Reads the fresh re-cert artifact (.scout-cache/k3_3.4.6.12_cap0.ndjson, digest
 * 99919f42a7b58e76 / 61), dedupes by exact congruence, reconstructs every oracle k=3
 * entry via the proven decode (scripts/oracle-match.ts exports), and matches BOTH ways
 * with cellsCongruent. This is the test the pre-fix catalogue failed (NOTES §28):
 * acceptance = 61/61 bijective, t3007 matched, no scout class matching two oracle entries
 * and vice versa. Every failure mode prints loudly and exits 1.
 *
 * ⚑ Any-member class matching + INDEPENDENT exact congruence witness (R2′, 2026-06-11): an
 * oracle entry matches a scout congruence CLASS if cellsCongruent is TRUE for ANY member of the
 * class (fast path — the representative is tried first, remaining members only on false; TRUE
 * verdicts are exact-arithmetic proofs, the bug direction is false negatives only), OR — for the
 * cellsCongruent-false residue only — an exhaustive exact grid-isometry witness verifies
 * congruence: over all 48 grid isometries g, gate on sameLattice(g·Λ_A vs Λ_B), then verify an
 * exact translation-corrected tile-content bijection mod Λ_B via exact keys. The witness is
 * reducedClassKey-FREE — every accept is an exact-arithmetic proof — and is DELIBERATELY a
 * second implementation rather than a call into TilingCongruence internals (differential value,
 * CB-4 spirit: the instrument must not share the fault under test). It exists because of the
 * reducedClassKey float-tie false negative (Math.round tie on half-integer centroid coordinates
 * of skinny lattices; one congruence class → two "canonical" keys → specific representative
 * PAIRS test false — experiments/results/op1-t3019-investigation-2026-06-11.log): on t3019
 * EVERY surviving class member is false-negative-prone, so any-member matching alone (R2) still
 * failed (experiments/results/op1-k3-oracle-R2-2026-06-11.log). Every witness accept logs a loud
 * `⚑ exact-witness match` line. R1 — the lib fix (TilingCongruence.reducedClassKey now reduces
 * the EXACT centroid coordinates, an exact class invariant) — has LANDED (`1aa1c84`), so the
 * float-tie false negative is gone and this fallback is expected DORMANT (0 uses); it is RETAINED
 * as a standing differential check (an independent, reducedClassKey-free second implementation —
 * differential value, CB-4 spirit: the instrument must not share the fault under test), and a
 * non-zero witness count is now itself an anomaly signal. tests/tiling-congruence-t3019.test.ts
 * pins the formerly-failing pair (now congruent via the fast path). Witness logic transplanted
 * from tests/op3-reflective-gate.test.ts (mutation-verified).
 *
 * ⚑ Ring discipline: Cyclotomic.assertSameRing compares ring INSTANCES, and oracle-match.ts
 * owns its module-level ring — so the oracle cells are reconstructed FIRST and the scout
 * artifact is deserialized with THAT ring (creating a second CyclotomicRing.create(24)
 * here would crash every cross comparison).
 *
 *   pnpm tsx scripts/recert-oracle-match.ts
 */
import fs from 'node:fs';
import { Cyclotomic, setActiveRing } from '@/classes/Cyclotomic';
import type { Polygon } from '@/classes/polygons/Polygon';
import {
	cellsCongruent,
	dedupeByCongruence,
	primitiveReducedCell,
} from '@/classes/algorithm/TilingCongruence';
import { gridImage, sameLattice } from '@/classes/algorithm/LatticeEnumerator';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { readResumeNdjson, deserializeCell } from './scoutCodec';
import { loadOracle, reconstructOracleCell } from './oracle-match';

const ART = '.scout-cache/k3_3.4.6.12_cap0.ndjson';
const LOG = `experiments/results/k3-recert-oracle-match-${new Date().toISOString().slice(0, 10)}.log`;
const lines: string[] = [];
function log(s: string): void {
	const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
	console.log(line);
	lines.push(line);
	fs.writeFileSync(LOG, lines.join('\n') + '\n');
}

log(`=== k=3 re-cert per-tiling oracle match — artifact ${ART} ===`);

// --- oracle side first (fixes the ring) ---
const oracle = loadOracle();
const k3codes = Object.keys(oracle)
	.filter((c) => /^t3\d{3}$/.test(c)) // t3001..t3061 — NOT the t3uXXX family (matcher's own filter)
	.sort();
log(`oracle k=3 entries: ${k3codes.length} (must be 61)`);
if (k3codes.length !== 61) {
	log('✗ FAIL: oracle key filter wrong');
	process.exit(1);
}
const recon = new Map<string, PeriodCell>();
let reconErrors = 0;
for (const code of k3codes) {
	const rec = reconstructOracleCell(code, oracle[code]);
	if ('error' in rec) {
		log(`✗ ${code}: reconstruction error: ${rec.error}`);
		reconErrors++;
		continue;
	}
	recon.set(code, rec.cell);
}
log(`reconstructed: ${recon.size}/61 (errors: ${reconErrors})`);
const ring = recon.values().next().value!.basisExact[0].ring;
setActiveRing(ring);
const N = ring.N;
const ZERO = Cyclotomic.ZERO(ring);

/** Exact `w ≡ 0 (mod ⟨u,v⟩)` test, robust to Math.round ties: float-Cramer guesses the integers,
 *  a ±1 neighborhood is verified EXACTLY (only `.isZero()` accepts — sound). Transplanted from
 *  tests/op3-reflective-gate.test.ts (mutation-verified there). */
function isLatticeVectorExact(w: Cyclotomic, u: Cyclotomic, v: Cyclotomic): boolean {
	const d = w.toVector();
	const a = u.toVector();
	const b = v.toVector();
	const det = a.x * b.y - a.y * b.x;
	const m0 = Math.round((d.x * b.y - d.y * b.x) / det);
	const n0 = Math.round((a.x * d.y - a.y * d.x) / det);
	for (let dm = -1; dm <= 1; dm++) {
		for (let dn = -1; dn <= 1; dn++) {
			const recon2 = u.scaleRational(BigInt(m0 + dm), 1n).add(v.scaleRational(BigInt(n0 + dn), 1n));
			if (w.sub(recon2).isZero()) return true;
		}
	}
	return false;
}

/** Exact key of `p` translated by `t` (clone, never mutate). */
function translatedKey(p: Polygon, t: Cyclotomic): string {
	const q = p.clone();
	q.translateExact(t);
	return q.exactKey();
}

/**
 * Exhaustive exact congruence witness, used ONLY as the fallback when `cellsCongruent` says false
 * (its known false-negative mode — see header). Tries every grid isometry g' = (rot, refl) whose
 * linear part maps Λ_A onto Λ_B (exact `sameLattice` gate), anchored at every same-name polygon
 * pair (translation T from the centroid correspondence, exact in the ring); accepts iff g'+T maps
 * the A-cell polygons BIJECTIVELY onto the B-cell's lattice classes with exact key equality after
 * the lattice correction. No float enters a decision — floats only guess lattice integers,
 * exactness comes from .isZero()/.exactKey(). Unit-edge ℚ(ζ₂₄) tilings admit only grid linear
 * parts (edges map to unit ζ-steps), so a TRUE congruence is always reachable by this search.
 */
function exactCongruenceWitness(A: PeriodCell, B: PeriodCell): boolean {
	const [uA, vA] = A.basisExact;
	const [uB, vB] = B.basisExact;
	if (A.cellPolygons.length !== B.cellPolygons.length) return false;
	const P0 = A.cellPolygons.reduce((m, p) => (p.exactKey() < m.exactKey() ? p : m));
	for (let rot = 0; rot < N; rot++) {
		for (const refl of [false, true]) {
			if (!sameLattice(uB, vB, gridImage(uA, rot, refl), gridImage(vA, rot, refl))) continue;
			const gP0c = gridImage(P0.exactCentroid!, rot, refl);
			for (const anchor of B.cellPolygons) {
				if (anchor.getName() !== P0.getName()) continue;
				const T = anchor.exactCentroid!.sub(gP0c);
				const used = new Set<number>();
				const ok = A.cellPolygons.every((p) => {
					const gp = p.transformedRigid(ZERO, refl, refl ? rot : 0, refl ? 0 : rot, T, 'full');
					for (let qi = 0; qi < B.cellPolygons.length; qi++) {
						if (used.has(qi)) continue;
						const q = B.cellPolygons[qi];
						if (q.getName() !== gp.getName()) continue;
						const w = gp.exactCentroid!.sub(q.exactCentroid!);
						if (!isLatticeVectorExact(w, uB, vB)) continue;
						if (translatedKey(gp, w.neg()) === q.exactKey()) {
							used.add(qi);
							return true;
						}
					}
					return false;
				});
				if (ok) return true;
			}
		}
	}
	return false;
}

// --- scout side, in the SAME ring ---
const { cells: raw } = readResumeNdjson(ART);
log(`raw cells: ${raw.length}`);
const deser = raw.map((sc) => deserializeCell(ring, sc));
const mine: PeriodCell[] = dedupeByCongruence(deser);
log(`congruence classes: ${mine.length} (must be 61)`);
if (mine.length !== 61) {
	log('✗ FAIL: class count ≠ 61');
	process.exit(1);
}

// --- class MEMBERSHIP reconstruction (R2) ---
// dedupeByCongruence returns only the representatives — the partition is internal. (Membership is
// reconstructed here so the matcher can fall through class members; retained post-R1 as the
// differential-witness harness, independent of TilingCongruence's now-fixed reducedClassKey.)
// Rebuild the members in the script: primitive-reduce each raw cell exactly as the dedupe does
// internally, then join it to the FIRST class where it is congruent to ANY current member —
// chain-tolerant, mirroring how the dedupe chains classes. A TRUE verdict against any member is an
// exact proof, and the class itself was built from TRUE links, so by transitivity of genuine
// congruence the cell is congruent to the whole class (rep included) even when the direct
// cell↔rep test is a reducedClassKey false negative. Every cell MUST land in a class (the dedupe
// placed it in one via its rep) — anything else is a loud inconsistency.
const memo = new Map<string, string>();
const tGroup = Date.now();
// primitiveReducedCell is the identity OBJECT for already-primitive cells, so reps (which the
// dedupe picked from its own reduced copies) are recognized by reference and not re-added; a
// genuinely reduced cell yields a fresh object and lands as one redundant extra witness — harmless.
const repSet = new Set<PeriodCell>(mine);
const classes: PeriodCell[][] = mine.map((rep) => [rep]);
for (const cell of deser.map(primitiveReducedCell)) {
	if (repSet.has(cell)) continue;
	const cls = classes.find((members) => members.some((m) => cellsCongruent(cell, m, memo)));
	if (!cls) {
		log('✗ FAIL: a raw cell joined NO class — dedupe/membership inconsistency');
		process.exit(1);
	}
	cls.push(cell);
}
const sizes = classes.map((c) => c.length);
log(
	`membership: ${raw.length} raw cells → ${classes.length} classes ` +
		`(sizes ${Math.min(...sizes)}..${Math.max(...sizes)}, Σ=${sizes.reduce((a, b) => a + b, 0)}) ` +
		`in ${((Date.now() - tGroup) / 1000).toFixed(1)}s`
);

// --- bidirectional per-tiling match (any-member witness, rep first; exact-witness fallback) ---
const matchOf = new Map<string, number[]>(); // tCode -> indices of congruent scout CLASSES
let done = 0;
for (const [code, cell] of recon) {
	const hits: number[] = [];
	for (let i = 0; i < classes.length; i++) {
		// rep (members[0]) first — the common case costs one test; fall back through the other
		// members only on false. ANY true member is an exact congruence proof for the class.
		const members = classes[i];
		let hitAt = -1;
		for (let m = 0; m < members.length; m++) {
			if (cellsCongruent(members[m], cell, memo)) {
				hitAt = m;
				break;
			}
		}
		if (hitAt < 0) {
			// cellsCongruent-false residue ONLY: the independent exhaustive exact grid-isometry
			// witness (reducedClassKey-free; every accept is an exact-arithmetic proof). Loud per
			// use — post-R1 this is expected to NEVER fire; a non-zero count is now an anomaly signal
				// (the reducedClassKey float-tie that needed it was fixed in 1aa1c84).
			for (let m = 0; m < members.length; m++) {
				if (exactCongruenceWitness(members[m], cell)) {
					hitAt = m;
					log(
						`  ⚑ exact-witness match (cellsCongruent false-negative): ${code} via member ${m} ` +
							`of class ${i} (all ${members.length} members cellsCongruent-false — UNEXPECTED post-R1, investigate)`
					);
					break;
				}
			}
		} else if (hitAt > 0) {
			log(
				`  ⚑ ${code} ↔ class ${i}: rep test FALSE, matched via member ${hitAt}/${members.length - 1} ` +
					'(exact-witness path; reducedClassKey fixed in R1/1aa1c84 — expected unused)'
			);
		}
		if (hitAt >= 0) hits.push(i);
	}
	matchOf.set(code, hits);
	if (hits.length !== 1) log(`✗ ${code}: ${hits.length} congruent scout classes (need exactly 1)`);
	if (++done % 10 === 0) log(`  …${done}/61 oracle entries matched`);
}

const exact = [...matchOf.values()].filter((h) => h.length === 1);
const hitCounts = new Map<number, number>();
for (const h of exact) hitCounts.set(h[0], (hitCounts.get(h[0]) ?? 0) + 1);
const doubled = [...hitCounts.entries()].filter(([, n]) => n > 1);
const unmatchedMine = classes.map((_, i) => i).filter((i) => !hitCounts.has(i));

log(`oracle entries with exactly one scout class match: ${exact.length}/61`);
log(`t3007 matched: ${matchOf.get('t3007')?.length === 1}`);
log(`scout classes matched by ≥2 oracle entries (duplicates): ${doubled.length}`);
log(`scout classes matched by NO oracle entry (orphans): ${unmatchedMine.length}`);

const pass =
	reconErrors === 0 && exact.length === 61 && doubled.length === 0 && unmatchedMine.length === 0;
log(pass ? '★ PASS — 61/61 per-tiling bijection, t3007 present, no duplicates' : '✗ FAIL — see above');
process.exit(pass ? 0 : 1);
