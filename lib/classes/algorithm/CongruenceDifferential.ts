/**
 * INDEPENDENT congruence differential oracle (CB-4, review 2026-06-09).
 *
 * A from-scratch re-implementation of periodic-tiling congruence, deliberately IMPORT-DISJOINT from
 * `TilingCongruence.ts` — it must never call into the production predicate or its helpers, otherwise
 * it is not a differential (work-order 01-code-bugs CB-4 §3). It promotes the §19.6 one-shot
 * diagnostic (the exact, self-consistent re-implementation that isolated the `transformedRigid`
 * argument-order bug — never committed, reconstructed here) to a STANDING differential: every
 * certifying run re-checks the production merge decisions against this implementation.
 *
 * Design differences from production (deliberate, so the two do not share blind spots):
 *  - ONE map function for BOTH the flag-pin and the cell-set (the §19.6 root cause was production
 *    using `mapPoint` for the pin but `transformedRigid` — with swapped argument semantics — for
 *    the cell-set). Here there is exactly one `mapPt`, applied pointwise everywhere.
 *  - No `transformedRigid`, no Polygon cloning: polygons are mapped as raw exact vertex lists and
 *    compared by self-built keys (name + centroid key + sorted vertex keys), never `Polygon.exactKey`.
 *  - Canonical class reduction by EXACT Surd floor of the centroid's rational coordinates in the
 *    lattice basis ([0,1)² fundamental-domain reduction), instead of production's float-guessed
 *    near-origin translate window (`reducedClassKey`).
 * Shared foundations (`Cyclotomic`, `Surd`, `PeriodCell` field access) are the project's exact
 * arithmetic layer, not TilingCongruence internals — sharing them is licensed by the work order.
 *
 * Soundness: a passing candidate is an explicit grid isometry g(z) = ζ^r·z + T or ζ^r·conj(z) + T
 * with g(Λ_A) = Λ_B verified exactly (integer coordinates + equal |det|, so inclusion ⇒ equality)
 * and an exact bijection of A's tile classes onto B's (fundamental-domain key-set equality).
 * Completeness: every congruence's linear part is a grid op (edge vectors are unit grid directions
 * — TilingCongruence module header, §12.8) and maps the reference polygon P0 onto some same-name
 * polygon of B; the loop tries every (Q, reflect, r), so an existing congruence is found.
 *
 * NOT the production predicate — consumed only by the certifying harnesses
 * (scripts/recert-oracle-match.ts) and the unit tests. Do not refactor to share code with
 * TilingCongruence.ts: divergence is the point.
 */

import type { Polygon } from '../polygons/Polygon';
import { Cyclotomic } from '../Cyclotomic';
import { Surd, detSurd } from './exact/Surd';
import type { PeriodCell } from './PeriodSolver';

/** Exact integer floor of a Surd: float guess, then exact `cmp` correction (terminates: each loop
 *  step moves monotonically toward the unique n with n ≤ s < n+1). */
function surdFloor(s: Surd): bigint {
	let n = BigInt(Math.floor(s.toFloat()));
	while (s.cmp(Surd.rational(n)) < 0) n -= 1n;
	while (s.cmp(Surd.rational(n + 1n)) >= 0) n += 1n;
	return n;
}

/** s is an integer ⇔ canonical form has no irrational part and denominator 1. */
function surdIsInteger(s: Surd): boolean {
	return s.Q === 0n && s.R === 0n && s.S === 0n && s.D === 1n;
}

/** Exact rational coordinates (α, β) of w in the basis (u, v): w = α·u + β·v (Cramer over Surds —
 *  the coordinates of a ℤ[ζ₂₄] point in a ℤ[ζ₂₄] basis lie in the field ℚ(√2,√3)). */
function coordsIn(w: Cyclotomic, u: Cyclotomic, v: Cyclotomic): [Surd, Surd] {
	const den = detSurd(u, v);
	return [detSurd(w, v).div(den), detSurd(u, w).div(den)];
}

/** w ∈ ℤu + ℤv, exactly. */
function inLattice(w: Cyclotomic, u: Cyclotomic, v: Cyclotomic): boolean {
	const [a, b] = coordsIn(w, u, v);
	return surdIsInteger(a) && surdIsInteger(b);
}

/** THE one map function (flag-pin AND cell-set — the §19.6 lesson): z ↦ ζ^r·(conj?)z. */
function mapPt(z: Cyclotomic, reflect: boolean, r: number): Cyclotomic {
	return (reflect ? z.conj() : z).mulZeta(r);
}

/** Self-built polygon key (never Polygon.exactKey): name + centroid + sorted vertex keys. */
function polyKey(name: string, centroid: Cyclotomic, verts: Cyclotomic[]): string {
	return `${name}:${centroid.key()}:${verts.map((x) => x.key()).sort().join(';')}`;
}

/** Canonical lattice-class key: translate so the centroid's exact (α, β) lands in [0,1)² — the
 *  fundamental-domain representative. Members of one Λ-class differ by integer (α, β) shifts, so
 *  their floors cancel and the key is identical; exact arithmetic ⇒ no boundary rounding. */
function reducedPolyKey(
	name: string,
	centroid: Cyclotomic,
	verts: Cyclotomic[],
	u: Cyclotomic,
	v: Cyclotomic
): string {
	const [a, b] = coordsIn(centroid, u, v);
	const t = u.scaleRational(-surdFloor(a), 1n).add(v.scaleRational(-surdFloor(b), 1n));
	return polyKey(name, centroid.add(t), verts.map((x) => x.add(t)));
}

/** Sorted name multiset — recomputed here, not imported. */
function names(cell: Polygon[]): string {
	return cell.map((p) => p.getName()).sort().join(',');
}

/**
 * Independent congruence decision: do (cellA, Λ_A) and (cellB, Λ_B) define the same periodic tiling
 * up to a plane isometry (reflections included — chirality-MERGE convention)?
 */
export function independentCellsCongruent(A: PeriodCell, B: PeriodCell): boolean {
	const cellA = A.cellPolygons;
	const cellB = B.cellPolygons;
	if (cellA.length === 0 || cellB.length === 0) return false;
	if (cellA.length !== cellB.length) return false;
	if (names(cellA) !== names(cellB)) return false;
	const [uA, vA] = A.basisExact;
	const [uB, vB] = B.basisExact;
	// equal covolume, exactly — with the inclusion test below this upgrades g(Λ_A) ⊆ Λ_B to equality
	if (detSurd(uA, vA).abs().cmp(detSurd(uB, vB).abs()) !== 0) return false;

	const N = cellA[0].exactVertices![0].ring.N;

	// target B as the set of fundamental-domain class keys (one per lattice class)
	const KB = new Set(
		cellB.map((q) => reducedPolyKey(q.getName(), q.exactCentroid!, q.exactVertices!, uB, vB))
	);

	// deterministic reference polygon in A (min self-built key)
	const keyOfA = (p: Polygon) => polyKey(p.getName(), p.exactCentroid!, p.exactVertices!);
	const P0 = cellA.reduce((m, p) => (keyOfA(p) < keyOfA(m) ? p : m));
	const c0 = P0.exactCentroid!;
	const p0Name = P0.getName();

	for (const Q of cellB) {
		if (Q.getName() !== p0Name) continue;
		const qKey = polyKey(Q.getName(), Q.exactCentroid!, Q.exactVertices!);
		for (const reflect of [false, true]) {
			for (let r = 0; r < N; r++) {
				// T pins g(P0) = Q exactly (the flag correspondence fixes the isometry)
				const T = Q.exactCentroid!.sub(mapPt(c0, reflect, r));
				const g = (z: Cyclotomic) => mapPt(z, reflect, r).add(T);
				if (polyKey(p0Name, g(c0), P0.exactVertices!.map(g)) !== qKey) continue;
				// lattice: g(Λ_A) ⊆ Λ_B exactly; equal |det| (checked above) ⇒ g(Λ_A) = Λ_B
				if (!inLattice(mapPt(uA, reflect, r), uB, vB)) continue;
				if (!inLattice(mapPt(vA, reflect, r), uB, vB)) continue;
				// whole cell: g(A) must equal B as fundamental-domain class-key sets
				const mapped = new Set<string>();
				for (const p of cellA) {
					mapped.add(
						reducedPolyKey(p.getName(), g(p.exactCentroid!), p.exactVertices!.map(g), uB, vB)
					);
				}
				if (mapped.size === cellB.length && [...mapped].every((k) => KB.has(k))) return true;
			}
		}
	}
	return false;
}

export type DifferentialReport = {
	ok: boolean;
	/** merge decisions re-checked (member ~ class rep, must be congruent) */
	positives: number;
	/** split decisions re-checked (rep ≁ rep across classes, must be non-congruent) */
	negatives: number;
	mismatches: string[];
};

/**
 * Re-check every merge decision of a production `congruencePartition` against the independent
 * implementation. Validates the FULL partition, not a sample:
 *  - within each class: every member must be independently congruent to the class representative
 *    (these are exactly the production merge decisions);
 *  - across classes: every representative pair must be independently NON-congruent — checked over
 *    ALL pairs, not per production bucket, so a buggy production bucket key that wrongly separated
 *    two congruent cells is also caught.
 * Because the independent predicate is an equivalence relation (isometries compose/invert), these
 * two facts pin the independent partition to exactly the production partition — equivalent to
 * partitioning from scratch and diffing, at a fraction of the cost.
 */
export function diffPartitionAgainstIndependent(
	classes: PeriodCell[][],
	onProgress?: (done: number, total: number) => void
): DifferentialReport {
	const mismatches: string[] = [];
	let positives = 0;
	let negatives = 0;
	const total =
		classes.reduce((s, cls) => s + (cls.length - 1), 0) +
		(classes.length * (classes.length - 1)) / 2;
	let done = 0;
	const tick = () => {
		done++;
		if (onProgress && (done % 50 === 0 || done === total)) onProgress(done, total);
	};

	classes.forEach((cls, ci) => {
		for (let m = 1; m < cls.length; m++) {
			positives++;
			if (!independentCellsCongruent(cls[m], cls[0])) {
				mismatches.push(
					`class ${ci}: member ${m} NOT independently congruent to its representative (production over-merge?)`
				);
			}
			tick();
		}
	});
	for (let i = 0; i < classes.length; i++) {
		for (let j = i + 1; j < classes.length; j++) {
			negatives++;
			if (independentCellsCongruent(classes[i][0], classes[j][0])) {
				mismatches.push(
					`classes ${i} and ${j}: representatives ARE independently congruent (production under-merge / inflation?)`
				);
			}
			tick();
		}
	}
	return { ok: mismatches.length === 0, positives, negatives, mismatches };
}
