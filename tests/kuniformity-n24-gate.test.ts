/**
 * CB-5 (review 2026-06-09, 01-code-bugs): the k-uniformity gate is hardcoded to N=24 angle units
 * (full surround = 24 units of 2π/24). On any N≠24 ring `cornerAngleUnits` returns units of 2π/N,
 * so no vertex ever sums to 24 ⇒ reps empty ⇒ the gate returns null ⇒ EVERYTHING is kept — the
 * pipeline would emit ungated candidates as if gated, silently. The honest scope is N=24-only
 * (ST-5); the checker must THROW on N≠24, matching the sibling star code (StarVC.ts,
 * ExactStarPolygon.ts), not silently degrade.
 */
import { describe, it, expect } from 'vitest';
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';

describe('KUniformityChecker N=24 scope gate (CB-5)', () => {
	it('throws loudly on an N≠24 ring instead of silently not gating', () => {
		const ring12 = CyclotomicRing.create(12);
		setActiveRing(ring12);
		// unit square on ℤ[ζ₁₂]: 4 | 12, edge dirs 0,3,6,9 — a valid 4.4.4.4 cell for Λ = (1, i)
		const sq = RegularPolygon.fromAnchorAndDirExact(4, Cyclotomic.ZERO(ring12), 0);
		const u = Cyclotomic.fromRational(ring12, 1n);
		const v = Cyclotomic.zeta(ring12, 3); // i
		const checker = new KUniformityChecker();
		expect(() => checker.countVertexOrbits([sq], u, v)).toThrow(/N=12/);
	});

	it('control: N=24 square tiling still gates normally (1 orbit)', () => {
		const ring24 = CyclotomicRing.create(24);
		setActiveRing(ring24);
		const sq = RegularPolygon.fromAnchorAndDirExact(4, Cyclotomic.ZERO(ring24), 0);
		const u = Cyclotomic.fromRational(ring24, 1n);
		const v = Cyclotomic.zeta(ring24, 6); // i
		const checker = new KUniformityChecker();
		expect(checker.countVertexOrbits([sq], u, v)).toBe(1);
	});
});
