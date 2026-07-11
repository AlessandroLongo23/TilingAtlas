/* TEMP diagnosis (delete after use): why do the probe (dedupeByNKey) and scout (dedupeByCongruence)
 * composition digests differ at the identical SMALLK_PROVEN config, both at 61?
 *
 * v2 — content-based comparison. The v1 comparison was BROKEN: congruencePartition returns blocks of
 * primitiveReducedCell(c) (NEW objects), but v1 keyed an idxOf map on the ORIGINAL cell objects by
 * reference, so every non-primitive cell mapped to undefined and the printed block indices were noise.
 *
 * Here every cell is identified by a STABLE CONTENT key = nKeyOfCell(primitiveReducedCell(c)) (the
 * proven canonical form of its maximal lattice — the true "which tiling" identity). Two questions:
 *   Q1 partition identity: do the N-key partition and the congruence partition induce the SAME set of
 *      content-key blocks? If yes, the digest gap is pure representative-SELECTION, not a real split.
 *   Q2 representative provenance: for how many classes does dedupeByNKey keep a cell whose RAW
 *      canonicalKey differs from the primitive-reduced representative dedupeByCongruence keeps? Those
 *      classes are exactly the ones carrying a non-primitive supercell encoding — the benign cause.
 */
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { PolygonType, type GeneratorParameters } from '@/classes';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import {
	dedupeByCongruence, dedupeByNKey, congruencePartition, primitiveReducedCell,
} from '@/classes/algorithm/TilingCongruence';
import { nKeyOfCell } from '@/classes/algorithm/canonicalFormN';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { readResumeNdjson, deserializeCell } from './scoutCodec';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 12] } };
const baseRing = computeRing(params);
const ring = baseRing.N === 24 ? baseRing : CyclotomicRing.create(24);
setActiveRing(ring);
const extractor = new TranslationalCellExtractor();

const r = readResumeNdjson('.scout-cache/k3-proven-accepted-7f2f4160092c7ff3.ndjson');
const cells: PeriodCell[] = r.cells.map((sc) => deserializeCell(ring, sc));
console.log(`artifact cells: ${cells.length}`);

const rawKey = (c: PeriodCell) => extractor.canonicalKey(c.cellPolygons);
const contentKey = (c: PeriodCell) => nKeyOfCell(primitiveReducedCell(c)) ?? `NULL:${rawKey(c)}`;

function digestOf(reps: PeriodCell[]): string {
	const ids = reps.map(rawKey).sort();
	let h = 5381n;
	for (const ch of ids.join('|')) h = ((h * 33n) ^ BigInt(ch.codePointAt(0)!)) & 0xffffffffffffffffn;
	return h.toString(16);
}

const repsN = dedupeByNKey(cells, rawKey);
const repsC = dedupeByCongruence(cells, rawKey);
console.log(`dedupeByNKey:       digest=${digestOf(repsN)} count=${repsN.length}`);
console.log(`dedupeByCongruence: digest=${digestOf(repsC)} count=${repsC.length}`);

// --- how many raw cells are non-primitive (a supercell of their own maximal lattice)? ---
let nonPrimitive = 0;
for (const c of cells) if (contentKey(c) !== (nKeyOfCell(c) ?? `NULL:${rawKey(c)}`)) nonPrimitive++;
console.log(`non-primitive raw cells (nKey(c) ≠ nKey(reduce(c))): ${nonPrimitive}/${cells.length}`);

// --- Q1: partition identity under the content key ---
function blockSig(partition: PeriodCell[][]): string[] {
	return partition.map((blk) => blk.map(contentKey).sort().join('~')).sort();
}
// N partition: group original cells by nKeyOfCell (the dedupeByNKey grouping)
const nGroups = new Map<string, PeriodCell[]>();
for (const c of cells) {
	const nk = nKeyOfCell(c) ?? `NULL:${rawKey(c)}`;
	(nGroups.get(nk) ?? nGroups.set(nk, []).get(nk)!).push(c);
}
const nSig = blockSig([...nGroups.values()]);
const congSig = blockSig(congruencePartition(cells));
const same = nSig.length === congSig.length && nSig.every((s, i) => s === congSig[i]);
console.log(`Q1 partition identity (content-key blocks): N=${nSig.length} cong=${congSig.length} → ${same ? 'IDENTICAL' : 'DIFFER'}`);
if (!same) {
	const cs = new Set(congSig), ns = new Set(nSig);
	for (const s of nSig) if (!cs.has(s)) console.log(`  N-only block: ${s.slice(0, 120)}`);
	for (const s of congSig) if (!ns.has(s)) console.log(`  cong-only block: ${s.slice(0, 120)}`);
}

// --- Q2: representatives whose raw key differs between the two paths (⇒ supercell-carrying class) ---
const nRepByContent = new Map(repsN.map((c) => [contentKey(c), c]));
const cRepByContent = new Map(repsC.map((c) => [contentKey(c), c]));
let repDiffer = 0;
for (const [ck, nrep] of nRepByContent) {
	const crep = cRepByContent.get(ck);
	if (crep !== undefined && rawKey(crep) !== rawKey(nrep)) {
		repDiffer++;
		// nail the mechanism on each differing class: is the N-rep already primitive? does reducing it
		// change its canonicalKey (⇒ canonicalKey is basis/representative-dependent, not congruence-invariant)?
		const nReduced = primitiveReducedCell(nrep);
		const nIsPrimitive = (nKeyOfCell(nrep) ?? 'x') === (nKeyOfCell(nReduced) ?? 'y');
		const reduceChangesKey = rawKey(nrep) !== rawKey(nReduced);
		// how many raw members does this class have, and are the two reps the SAME congruence cell?
		const classMembers = cells.filter((c) => contentKey(c) === ck);
		console.log(`  class#${repDiffer} nKey=${ck.slice(0, 40)}… members=${classMembers.length}`);
		console.log(`    N-rep    canonicalKey=${rawKey(nrep).slice(0, 70)}  primitive=${nIsPrimitive}`);
		console.log(`    cong-rep canonicalKey=${rawKey(crep).slice(0, 70)}`);
		console.log(`    reduce(N-rep) changes canonicalKey? ${reduceChangesKey}  →  reduce-rep=${rawKey(nReduced).slice(0, 70)}`);
		console.log(`    cong-rep == reduce(N-rep)? ${rawKey(crep) === rawKey(nReduced)}`);
		const memberKeys = classMembers.map(rawKey).sort();
		console.log(`    raw member canonicalKeys (${memberKeys.length}): ${memberKeys.map((k) => k.slice(0, 24)).join(' | ')}`);
	}
}
console.log(`Q2 classes with differing representative raw-key: ${repDiffer}/${repsN.length}`);
