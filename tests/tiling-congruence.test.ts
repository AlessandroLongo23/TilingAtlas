/**
 * Regression for the rotation-only congruence false-negative (DEVELOPMENT_NOTES §19).
 *
 * `tilingsCongruent` pins the candidate isometry with `mapPoint` (z ↦ (conj?)·ζ^r + T) but mapped the
 * whole cell with `transformedRigid(ZERO, reflect, r, 0, T)` — which passes the rotation power as the
 * REFLECTION AXIS (axisK) with rotK=0. For reflect=true the two agree (ak = axisK+rotK = r); for
 * reflect=FALSE the rotation is silently dropped (rk = rotK = 0 ⇒ z + T, a pure translation). So a
 * congruence whose ONLY witness is a non-trivial rotation (reflect=false, r≠0) was missed. This never
 * bit k≤2 (the merges there are reflections — the chiral snub) but over-counted the low-symmetry
 * oblique k=3 tilings t3046/t3055 (66 instead of 61): three fundamental-domain extractions of t3046
 * related by ζ^4/ζ^16 rotations failed to merge.
 */
import { describe, it, expect } from 'vitest';
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { holohedry } from '@/classes/algorithm/LatticeEnumerator';
import { tilingsCongruent } from '@/classes/algorithm/TilingCongruence';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const z = (r: number) => Cyclotomic.zeta(ring, r);
const Q = (a: bigint, b: bigint) => Cyclotomic.fromRational(ring, a).scaleRational(1n, b);

// Oblique period lattice (no symmetry beyond ±1) — t3046's reduced Gram: |u|²=4, |v|²=7, u·v=1.
// v = 1/2 + i·3√3/2 = 1/2 + (3/2)(ζ^4 + ζ^8).
const u = Q(2n, 1n);
const v = Q(1n, 2n).add(z(4).add(z(8)).scaleRational(3n, 2n));

// A two-class fundamental cell, built from explicit (n, anchor, dirIndex) tuples.
const specs: [number, Cyclotomic, number][] = [
	[3, Cyclotomic.ZERO(ring), 0],
	[4, z(1), 2],
];
const buildCell = (xform: (a: Cyclotomic) => Cyclotomic, dirShift: number) =>
	specs.map(([n, a, d]) => RegularPolygon.fromAnchorAndDirExact(n, xform(a), (((d + dirShift) % 24) + 24) % 24));

describe('tilingsCongruent — rotation-only congruences (oblique cells)', () => {
	it('the test lattice is genuinely oblique (holohedry 2)', () => {
		expect(holohedry(u, v)).toBe(2);
	});

	it('detects a pure ζ^r rotation congruence (reflect=false, r≠0)', () => {
		// Build cellB = ζ^4·cellA INDEPENDENTLY of transformedRigid: a ζ^r rotation sends
		// (anchor, dir) ↦ (anchor·ζ^r, dir+r) and the basis ↦ (ζ^r u, ζ^r v).
		for (const R of [4, 8, 16]) {
			const cellA = buildCell((a) => a, 0);
			const cellB = buildCell((a) => a.mulZeta(R), R);
			expect(tilingsCongruent(cellA, u, v, cellB, u.mulZeta(R), v.mulZeta(R))).toBe(true);
		}
	});

	it('still rejects genuinely non-congruent cells (soundness guard)', () => {
		const cellA = buildCell((a) => a, 0);
		// move the square to a different lattice class — no isometry maps A onto this
		const cellC = [
			RegularPolygon.fromAnchorAndDirExact(3, Cyclotomic.ZERO(ring), 0),
			RegularPolygon.fromAnchorAndDirExact(4, z(5), 2),
		];
		expect(tilingsCongruent(cellA, u, v, cellC, u, v)).toBe(false);
	});

	it('congruence is symmetric for a rotation witness', () => {
		const cellA = buildCell((a) => a, 0);
		const cellB = buildCell((a) => a.mulZeta(4), 4);
		const uB = u.mulZeta(4), vB = v.mulZeta(4);
		expect(tilingsCongruent(cellA, u, v, cellB, uB, vB)).toBe(
			tilingsCongruent(cellB, uB, vB, cellA, u, v)
		);
	});
});
