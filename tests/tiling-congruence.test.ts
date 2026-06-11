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
import { tilingsCongruent, reducedClassKey } from '@/classes/algorithm/TilingCongruence';

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

describe('reducedClassKey — exact class invariance (R1: t3019 float-tie fix)', () => {
	// t3019's exact skinny lattice: u = (1,0), v = i·(3+√3) ≈ (0, 4.732). √3 = ζ² + ζ⁻² (= 2cos π/6);
	// v = ζ⁶·(3+√3) is purely imaginary EXACTLY, but its float real part carries ~4e-16 noise — the
	// trigger the OP-1 investigation pinned. A unit square anchored at m·u (m ∈ ℤ) has centroid
	// (m+½, ½), so its u-coordinate α = cross(c,v)/cross(u,v) = m+½ sits EXACTLY on the half-integer
	// Math.round tie. The OLD float-round reduction + ±2 lex-min window rounded different m
	// inconsistently (noise tipping the tie) and gave the same lattice class two keys; the exact
	// half-up reduction is shift-equivariant, so every m reduces to the IDENTICAL representative.
	const sqrt3 = z(2).add(z(22));
	const us = Q(1n, 1n);
	const vs = z(6).mul(Q(3n, 1n).add(sqrt3));

	it('the skinny lattice is rectangular (holohedry 4) and v is exactly imaginary', () => {
		expect(holohedry(us, vs)).toBe(4);
		// v's exact real part is zero (the float wobble that triggers the old bug is NOT in the value)
		expect(vs.add(vs.conj()).isZero()).toBe(true); // v + conj(v) = 2·Re(v) = 0
	});

	it('one key per lattice class across integer u-shifts on the half-integer tie', () => {
		// squares at m·u for several m — all in ONE lattice class (differ by integer multiples of u),
		// each sitting on the α = m+½ tie. Exact invariance ⇒ a single reducedClassKey.
		const keys = [-1, 0, 1, 2, 5].map((m) =>
			reducedClassKey(RegularPolygon.fromAnchorAndDirExact(4, us.scaleRational(BigInt(m), 1n), 0), us, vs)
		);
		expect(new Set(keys).size).toBe(1);
	});

	it('invariant under general λ = a·u + b·v shifts (triangle + square, both tie and non-tie)', () => {
		for (const spec of [[3, Cyclotomic.ZERO(ring), 0], [4, Cyclotomic.ZERO(ring), 0], [3, z(1), 2]] as [number, Cyclotomic, number][]) {
			const base = RegularPolygon.fromAnchorAndDirExact(spec[0], spec[1], spec[2]);
			const k0 = reducedClassKey(base, us, vs);
			for (const [a, b] of [[1, 0], [0, 1], [1, 1], [-2, 3], [4, -1], [-3, -2]]) {
				const T = us.scaleRational(BigInt(a), 1n).add(vs.scaleRational(BigInt(b), 1n));
				const shifted = base.clone();
				shifted.translateExact(T);
				expect(reducedClassKey(shifted, us, vs)).toBe(k0);
			}
		}
	});

	it('distinct lattice classes still get distinct keys (no false merge)', () => {
		// two squares in different classes (anchors not differing by a lattice vector) must NOT collide
		const a = reducedClassKey(RegularPolygon.fromAnchorAndDirExact(4, Cyclotomic.ZERO(ring), 0), us, vs);
		const b = reducedClassKey(RegularPolygon.fromAnchorAndDirExact(4, z(6), 0), us, vs); // shifted by i ≠ λ
		expect(a).not.toBe(b);
	});
});
