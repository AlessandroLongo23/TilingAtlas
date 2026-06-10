/**
 * §35 regression (CB-4 guard discovery, 2026-06-10): `reducedClassKey` must be CLASS-CANONICAL —
 * the SAME key for every Λ-translate of a polygon. The old ±2-float-window lex-min violated this on
 * skewed bases (the guard-caught k=3 pair: Λ = (2ζ⁸, −3+3ζ¹⁶), 12×3+2×6 snub-class cells), which
 * made the cell-set verification step of `tilingsCongruent` produce direction-dependent FALSE
 * NEGATIVES — cong(a,b) ≠ cong(b,a), caught by assertEquivalencePartition on the k=3 artifact.
 * Soundness was never at risk (keys are exact geometry; distinct classes can never collide) — the
 * defect was completeness of the merge, the same axis as §19.6.
 */
import { describe, it, expect } from 'vitest';
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { reducedClassKey, tilingsCongruent } from '@/classes/algorithm/TilingCongruence';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const z = (r: number) => Cyclotomic.zeta(ring, r);
const Q = (a: bigint, b: bigint) => Cyclotomic.fromRational(ring, a).scaleRational(1n, b);

// The guard-caught lattice: u = 2ζ⁸ = (−1, √3), v = −3 + 3ζ¹⁶ = (−4.5, −3√3/2). Skewed: the
// float-window reduction picked non-canonical representatives here.
const u = z(8).scaleRational(2n, 1n);
const v = Q(-3n, 1n).add(z(16).scaleRational(3n, 1n));

const lat = (m: bigint, n: bigint) => u.scaleRational(m, 1n).add(v.scaleRational(n, 1n));

describe('reducedClassKey class-invariance (§35)', () => {
	it('REGRESSION: the exact violating instance the CB-4 guard caught on the k=3 artifact', () => {
		// Extracted verbatim from the artifact (diag-cb4-asymmetry dump): basis u = 2ζ⁴,
		// v = −6 + 3ζ⁴; triangle anchored at −1−5ζ⁴ with edge dirs (0,8,16); shift λ = v.
		// The float-window reduction returned different keys for p and p+λ.
		const u2 = z(4).scaleRational(2n, 1n);
		const v2 = Q(-6n, 1n).add(z(4).scaleRational(3n, 1n));
		const anchor = Q(-1n, 1n).add(z(4).scaleRational(-5n, 1n));
		const tri = RegularPolygon.fromAnchorAndDirExact(3, anchor, 0);
		const shifted = tri.clone();
		shifted.translateExact(v2);
		expect(reducedClassKey(shifted, u2, v2)).toBe(reducedClassKey(tri, u2, v2));
	});

	it('returns the identical key for every lattice translate of a polygon', () => {
		// several anchors spread across the cell, both tile shapes of the offending bucket
		const polys = [
			RegularPolygon.fromAnchorAndDirExact(3, Cyclotomic.ZERO(ring), 0),
			RegularPolygon.fromAnchorAndDirExact(3, z(1), 5),
			RegularPolygon.fromAnchorAndDirExact(6, z(2).add(Q(1n, 1n)), 3),
			RegularPolygon.fromAnchorAndDirExact(3, Q(-2n, 1n).add(z(16)), 11),
		];
		const shifts: [bigint, bigint][] = [
			[1n, 0n], [0n, 1n], [-1n, 0n], [0n, -1n], [1n, 1n], [-1n, -1n],
			[2n, -1n], [-2n, 1n], [3n, 2n], [-3n, -2n], [5n, 3n], [-5n, -3n],
		];
		for (const p of polys) {
			const k0 = reducedClassKey(p, u, v);
			for (const [m, n] of shifts) {
				const q = p.clone();
				q.translateExact(lat(m, n));
				expect(reducedClassKey(q, u, v), `translate (${m},${n})`).toBe(k0);
			}
		}
	});

	it('tilingsCongruent is symmetric when the same tiling is encoded with different per-tile translates', () => {
		// Same tiling, same Λ — but cell B stores its second tile at a different lattice translate.
		// The cell-set verification must reduce both encodings to the same class keys; a
		// non-canonical reduction makes this fail in one direction (the §35 asymmetry mechanism).
		const t0 = RegularPolygon.fromAnchorAndDirExact(3, Cyclotomic.ZERO(ring), 0);
		const t1 = RegularPolygon.fromAnchorAndDirExact(6, z(2).add(Q(1n, 1n)), 3);
		const t1shift = t1.clone();
		t1shift.translateExact(lat(3n, 2n));
		const A = [t0, t1];
		const B = [t0, t1shift];
		const ab = tilingsCongruent(A, u, v, B, u, v);
		const ba = tilingsCongruent(B, u, v, A, u, v);
		expect(ab).toBe(true);
		expect(ba).toBe(true);
	});
});
