/* Probe 8: reproduce the k=3 duplicate (NOTES §28.2). The certified catalogue holds an 18-tile
 * cell that is an index-2 (non-primitive) encoding of the 9-tile cell also present. Verify:
 *   (a) the two are NOT merged by dedupeByCongruence (cheap rejects assume primitivity),
 *   (b) TranslationalCellExtractor on the replicated 18-tile patch yields a 9-tile primitive cell,
 *   (c) that reduction IS cellsCongruent to the 9-tile certified cell.
 *   pnpm tsx scripts/diag-k3-duplicate.ts
 */
import { setActiveRing, CyclotomicRing, Cyclotomic } from '@/classes/Cyclotomic';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { cellsCongruent, dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import { detSurd } from '@/classes/algorithm/exact/Surd';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import type { Polygon } from '@/classes/polygons/Polygon';
import { deserializeCell } from './scoutCodec';
import { loadSnapshot } from '../figures/snapshot';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

const snap = loadSnapshot();
const k3 = snap.tilings.filter((t) => t.k === 3).map((t) => ({
	key: t.canonicalKey,
	cell: deserializeCell(ring, t.cellCodec),
}));

const detOf = (c: PeriodCell) => {
	const u = c.basisExact[0].toVector();
	const v = c.basisExact[1].toVector();
	return Math.abs(u.x * v.y - u.y * v.x);
};

const big = k3.find((t) => t.cell.cellPolygons.length === 18 && Math.abs(detOf(t.cell) - 8.928) < 0.01 && t.key.startsWith('3:1|-1,0,0,0,-1,0,0,0'));
const small = k3.find((t) => t.cell.cellPolygons.length === 9 && Math.abs(detOf(t.cell) - 4.464) < 0.01 && t.key.startsWith('3:1|-1,0,-1,0,-1,0,0,0'));
console.log(`big:   ${big ? `${big.cell.cellPolygons.length} tiles det=${detOf(big.cell).toFixed(3)}` : 'NOT FOUND'}`);
console.log(`small: ${small ? `${small.cell.cellPolygons.length} tiles det=${detOf(small.cell).toFixed(3)}` : 'NOT FOUND'}`);
if (!big || !small) process.exit(1);

// (a) dedupeByCongruence does NOT merge them
const reps = dedupeByCongruence([big.cell, small.cell]);
console.log(`(a) dedupeByCongruence([big, small]) → ${reps.length} reps (defect if 2)`);

// (b) replicate the big cell over a 5×5 window, extract primitive cell
const R = 2;
const patch: Polygon[] = [];
const seen = new Set<string>();
for (let i = -R; i <= R; i++) {
	for (let j = -R; j <= R; j++) {
		const t = big.cell.basisExact[0].scaleRational(BigInt(i), 1n).add(big.cell.basisExact[1].scaleRational(BigInt(j), 1n));
		for (const p of big.cell.cellPolygons) {
			const q = p.clone();
			q.translateExact(t);
			const kk = q.exactKey();
			if (!seen.has(kk)) { seen.add(kk); patch.push(q); }
		}
	}
}
const extractor = new TranslationalCellExtractor();
const reduced = extractor.extract(patch);
if (!reduced || !reduced.basisExact) { console.log('(b) extraction FAILED'); process.exit(1); }
const reducedCell: PeriodCell = { cellPolygons: reduced.cellPolygons, basisExact: reduced.basisExact };
console.log(`(b) extractor on replicated big patch → ${reducedCell.cellPolygons.length} tiles det=${detOf(reducedCell).toFixed(3)}`);

// (c) reduction congruent to the small certified cell?
console.log(`(c) cellsCongruent(reduced, small) = ${cellsCongruent(reducedCell, small.cell)}`);
console.log(`    cellsCongruent(big, small)     = ${cellsCongruent(big.cell, small.cell)} (expected false — det/size cheap rejects)`);
