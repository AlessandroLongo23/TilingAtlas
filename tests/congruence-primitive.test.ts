/**
 * Regression for the k=3 non-primitive duplicate (DEVELOPMENT_NOTES §28.2/§29).
 *
 * `dedupeByCongruence` buckets by (name-multiset, |det Λ|) and `tilingsCongruent` cheap-rejects on
 * cell size — both SOUND only for primitive cells. A non-primitive encoding (index-m supercell of
 * the same tiling) lands in a different bucket and can never merge with its primitive twin: the
 * certified k=3 catalogue carried an 18-tile index-2 duplicate of a 9-tile cell. The fix
 * primitive-reduces every input cell (exactly verified) before bucketing; already-primitive cells
 * pass through UNCHANGED so existing k≤2 digests stay byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { dedupeByCongruence, primitiveReducedCell } from '@/classes/algorithm/TilingCongruence';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const ZERO = Cyclotomic.ZERO(ring);
const ONE = Cyclotomic.ONE(ring);
const I = Cyclotomic.zeta(ring, 6); // i

/** Unit square tiling 4.4.4.4: primitive cell = one square, Λ = (1, i). */
function primSquareCell(): PeriodCell {
	return {
		cellPolygons: [RegularPolygon.fromAnchorAndDirExact(4, ZERO, 0)],
		basisExact: [ONE, I],
	};
}

/** Same tiling, non-primitive index-2 encoding: two squares, Λ = (1, 2i). */
function nonPrimSquareCell(): PeriodCell {
	const a = RegularPolygon.fromAnchorAndDirExact(4, ZERO, 0);
	const b = RegularPolygon.fromAnchorAndDirExact(4, I, 0);
	return {
		cellPolygons: [a, b],
		basisExact: [ONE, I.scaleRational(2n, 1n)],
	};
}

describe('primitiveReducedCell', () => {
	it('reduces an index-2 supercell encoding to the primitive cell', () => {
		const reduced = primitiveReducedCell(nonPrimSquareCell());
		expect(reduced.cellPolygons).toHaveLength(1);
	});

	it('returns an already-primitive cell UNCHANGED (same object — digest byte-identity)', () => {
		const prim = primSquareCell();
		expect(primitiveReducedCell(prim)).toBe(prim);
	});
});

describe('dedupeByCongruence — non-primitive encodings merge with their primitive twin', () => {
	it('merges the index-2 supercell with the primitive cell (the §28.2 duplicate)', () => {
		const reps = dedupeByCongruence([primSquareCell(), nonPrimSquareCell()]);
		expect(reps).toHaveLength(1);
		expect(reps[0].cellPolygons).toHaveLength(1);
	});

	it('keeps genuinely distinct tilings separate', () => {
		const tri: PeriodCell = {
			// triangle tiling 3.3.3.3.3.3: up+down triangle, Λ = (1, ζ⁴)
			cellPolygons: [
				RegularPolygon.fromAnchorAndDirExact(3, ZERO, 0),
				RegularPolygon.fromAnchorAndDirExact(3, ONE, 8),
			],
			basisExact: [ONE, Cyclotomic.zeta(ring, 4)],
		};
		const reps = dedupeByCongruence([primSquareCell(), tri]);
		expect(reps).toHaveLength(2);
	});
});
