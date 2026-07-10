import { describe, it, expect } from 'vitest';
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { SeedExpander } from '@/classes/algorithm/SeedExpander';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { countVertexOrbitsFast } from '@/classes/algorithm/KUniformityFast';
import { setActiveRing, CyclotomicRing, getActiveRing, type Cyclotomic } from '@/classes/Cyclotomic';
import { deserializeCell } from '@/classes/algorithm/cellCodec';
import { loadSnapshot } from '../figures/snapshot';
import type { Polygon } from '@/classes/polygons/Polygon';

setActiveRing(CyclotomicRing.create(24));

/** Expand one VC (k=1), extract its translational cell + exact basis. */
function cellForVC(name: string): { cell: Polygon[]; u: Cyclotomic; v: Cyclotomic } {
	const vc = VertexConfiguration.fromName(name);
	const seed = new SeedConfiguration([vc]);
	const expander = new SeedExpander(1);
	const patches: Polygon[][] = [];
	expander.expand(seed, (patch) => patches.push(patch));
	const res = new TranslationalCellExtractor().extract(patches[0]);
	if (!res || !res.basisExact) throw new Error(`no cell for ${name}`);
	return { cell: res.cellPolygons, u: res.basisExact[0], v: res.basisExact[1] };
}

// The 11 Archimedean (regular 1-uniform) tilings — diverse symmetry groups incl. the chiral snub
// (rotation-only) and the octagon (odd-power ζ₂₄). Each has exactly 1 vertex orbit (k=1, ground truth).
const ONE_UNIFORM = [
	'4,4,4,4', '3,3,3,3,3,3', '6,6,6', '3,3,3,3,6', '3,3,3,4,4', '3,3,4,3,4',
	'3,4,6,4', '3,6,3,6', '3,12,12', '4,6,12', '4,8,8',
];

describe('countVertexOrbitsFast == exact gate on the 11 one-uniform tilings (ground truth = 1 orbit)', () => {
	for (const name of ONE_UNIFORM) {
		it(`${name} → 1 orbit (fast === gate === 1)`, { timeout: 30000 }, () => {
			const { cell, u, v } = cellForVC(name);
			const slow = new KUniformityChecker().countVertexOrbits(cell, u, v);
			const fast = countVertexOrbitsFast(cell, u, v);
			expect(slow).toBe(1); // the existing gate agrees with ground truth
			expect(fast).toBe(1); // ground truth: 1-uniform
			expect(fast).toBe(slow); // differential equivalence with the gate
		});
	}
});

describe('countVertexOrbitsFast === exact gate === true k over the full certified catalogue', () => {
	it('every certified k=1/2/3 tiling: fast orbit count matches k and the gate', { timeout: 120000 }, () => {
		const snap = loadSnapshot();
		const ring = getActiveRing();
		const checker = new KUniformityChecker();
		const mismatches: string[] = [];
		let n = 0;
		for (const t of snap.tilings) {
			if (![1, 2, 3].includes(t.k)) continue;
			const cell = deserializeCell(ring, t.cellCodec);
			const [cu, cv] = cell.basisExact;
			const slow = checker.countVertexOrbits(cell.cellPolygons, cu, cv);
			const fast = countVertexOrbitsFast(cell.cellPolygons, cu, cv);
			n++;
			if (fast !== t.k || slow !== t.k || fast !== slow) {
				mismatches.push(`k=${t.k} ${t.canonicalKey.slice(0, 20)}: fast=${fast} gate=${slow} expected=${t.k}`);
			}
		}
		expect(n).toBeGreaterThanOrEqual(92); // 11 + 20 + 61
		expect(mismatches).toEqual([]);
	});
});
