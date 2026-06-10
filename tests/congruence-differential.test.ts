/**
 * CB-4: the standing independent congruence differential. The independent implementation must
 * (a) decide the §19.6 rotation-only congruences correctly (the class production historically got
 * wrong), (b) agree with production on the regression fixtures, and (c) flag injected partition
 * faults — both inflation (split congruent pair) and over-merge (joined non-congruent pair).
 */
import { describe, it, expect } from 'vitest';
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { cellsCongruent, congruencePartition } from '@/classes/algorithm/TilingCongruence';
import {
	independentCellsCongruent,
	diffPartitionAgainstIndependent,
} from '@/classes/algorithm/CongruenceDifferential';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const z = (r: number) => Cyclotomic.zeta(ring, r);
const Q = (a: bigint, b: bigint) => Cyclotomic.fromRational(ring, a).scaleRational(1n, b);

// Same oblique fixture as tests/tiling-congruence.test.ts (t3046's reduced Gram; holohedry 2).
const u = Q(2n, 1n);
const v = Q(1n, 2n).add(z(4).add(z(8)).scaleRational(3n, 2n));
const specs: [number, Cyclotomic, number][] = [
	[3, Cyclotomic.ZERO(ring), 0],
	[4, z(1), 2],
];
const buildCell = (xform: (a: Cyclotomic) => Cyclotomic, dirShift: number) =>
	specs.map(([n, a, d]) => RegularPolygon.fromAnchorAndDirExact(n, xform(a), (((d + dirShift) % 24) + 24) % 24));
const cellOf = (polys: ReturnType<typeof buildCell>, uu: Cyclotomic, vv: Cyclotomic): PeriodCell =>
	({ cellPolygons: polys, basisExact: [uu, vv] } as PeriodCell);

const A = cellOf(buildCell((a) => a, 0), u, v);
const B4 = cellOf(buildCell((a) => a.mulZeta(4), 4), u.mulZeta(4), v.mulZeta(4)); // ζ⁴·A
const C = cellOf(
	[
		RegularPolygon.fromAnchorAndDirExact(3, Cyclotomic.ZERO(ring), 0),
		RegularPolygon.fromAnchorAndDirExact(4, z(5), 2), // different lattice class — not congruent to A
	],
	u,
	v
);

describe('independentCellsCongruent (CB-4 differential implementation)', () => {
	it('detects rotation-only congruences (the §19.6 bug class)', () => {
		for (const R of [4, 8, 16]) {
			const BR = cellOf(buildCell((a) => a.mulZeta(R), R), u.mulZeta(R), v.mulZeta(R));
			expect(independentCellsCongruent(A, BR)).toBe(true);
			expect(independentCellsCongruent(BR, A)).toBe(true); // symmetric
		}
	});

	it('rejects genuinely non-congruent cells (soundness)', () => {
		expect(independentCellsCongruent(A, C)).toBe(false);
		expect(independentCellsCongruent(C, A)).toBe(false);
	});

	it('agrees with production cellsCongruent on the regression fixtures', () => {
		for (const [x, y] of [
			[A, B4],
			[A, C],
			[B4, C],
			[A, A],
		] as [PeriodCell, PeriodCell][]) {
			expect(independentCellsCongruent(x, y)).toBe(cellsCongruent(x, y));
		}
	});
});

describe('diffPartitionAgainstIndependent', () => {
	it('passes the production partition of the fixtures (zero mismatches)', () => {
		const classes = congruencePartition([A, B4, C]);
		expect(classes.length).toBe(2); // {A, B4}, {C}
		const rep = diffPartitionAgainstIndependent(classes);
		expect(rep.ok).toBe(true);
		expect(rep.mismatches).toEqual([]);
		expect(rep.positives).toBe(1);
		expect(rep.negatives).toBe(1);
	});

	it('flags an injected inflation (congruent pair split across classes)', () => {
		const rep = diffPartitionAgainstIndependent([[A], [B4], [C]]);
		expect(rep.ok).toBe(false);
		expect(rep.mismatches.some((m) => m.includes('ARE independently congruent'))).toBe(true);
	});

	it('flags an injected over-merge (non-congruent pair in one class)', () => {
		const rep = diffPartitionAgainstIndependent([[A, C], [B4]]);
		expect(rep.ok).toBe(false);
		expect(rep.mismatches.some((m) => m.includes('NOT independently congruent'))).toBe(true);
	});
});
