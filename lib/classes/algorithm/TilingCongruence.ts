/**
 * Exact pairwise congruence of periodic tilings — the representation- and chirality-robust dedup
 * that `TranslationalCellExtractor.canonicalKey` could not provide (docs/DEVELOPMENT_NOTES.md §12.7,
 * §12.11). A periodic tiling is given as a fundamental cell (one polygon per lattice class) + an exact
 * translation basis Λ = (u, v). Two such tilings are the SAME tiling iff some plane isometry maps one
 * onto the other; under the project's chirality-MERGE convention (count enantiomorphs once,
 * A068599) that isometry may be a reflection.
 *
 * Why a GRID isometry suffices (the key fact — see §12.8 and the verify spike). Every tile is built
 * by `RegularPolygon.fromAnchorAndDirExact`, a unit-ζ-step boundary walk, so every edge vector is a
 * unit grid direction ζ^t (`Polygon.recomputeEdgeDirsExact` encodes the invariant). An isometry that
 * maps one tiling onto another maps edges to edges, so its rotation generator is a ratio of two unit
 * grid edges = a grid power ζ^r. The "off-gridness" of the snub lives only in its lattice period
 * vector (3+ζ₆), never in an edge or in the merging isometry. So the candidate isometries are exactly
 * { ζ^r·z + T , ζ^r·conj(z) + T : r ∈ [0,N) } — the same family `KUniformityChecker` enumerates.
 *
 * The test is exact: no floating-point value enters a decision. Floats are used only as a broadphase
 * to GUESS integer lattice coordinates, which are then verified exactly (`sameLattice`/`isIntCombo`
 * float-guess then `.isZero()`-verify; `Polygon.exactKey` is pure bigint).
 *
 * Soundness: a passing candidate is an explicit grid isometry g with g(Λ_A)=Λ_B (verified exactly)
 * and a bijection of A's tiles onto B's tiles mod Λ_B (exact-key set equality). That is precisely a
 * congruence of the two periodic tilings — so two cells are merged only if they are genuinely the
 * same tiling. Completeness: every congruence's linear part is a grid op (above) and maps the
 * reference polygon P0 onto some same-name polygon Q of B; the candidate loop tries every (Q, reflect,
 * r), so if a congruence exists it is found.
 */

import type { Polygon } from '../polygons/Polygon';
import { Cyclotomic } from '../Cyclotomic';
import { detSurd } from './exact/Surd';
import { sameLattice } from './LatticeEnumerator';
import type { PeriodCell } from './PeriodSolver';

/**
 * Canonical lattice-class representative key of `p` under Λ = (u, v): the lexicographically smallest
 * exact key among `p`'s near-origin lattice translates. The same key for every member of a class (the
 * near-origin translate SET is identical for p and p+λ), so it is immune to the half-integer-boundary
 * rounding that splits a class when each polygon is reduced independently (the bug `canonicalRep` was
 * written to fix in PeriodSolver). Float only picks the integer translations; the keys are exact.
 */
function reducedClassKey(
	p: Polygon,
	u: Cyclotomic,
	v: Cyclotomic,
	memo?: Map<string, string>,
	latKey?: string
): string {
	// Pure function of (p geometry, Λ=(u,v)) ⇒ memoizable. Keyed by (p.exactKey, latKey) where latKey
	// identifies the basis; the same class rep is the comparison target for many candidates in a bucket.
	const cacheKey = memo && latKey ? `${latKey}@${p.exactKey()}` : undefined;
	if (cacheKey !== undefined) {
		const hit = memo!.get(cacheKey);
		if (hit !== undefined) return hit;
	}
	const uV = u.toVector();
	const vV = v.toVector();
	const det = uV.x * vV.y - uV.y * vV.x;
	const c = p.exactCentroid!.toVector();
	// integer combo bringing the centroid into the fundamental cell (exact translate, float-guessed m,n)
	const ma = Math.round((c.x * vV.y - c.y * vV.x) / det);
	const mb = Math.round((uV.x * c.y - uV.y * c.x) / det);
	let base = p;
	if (ma !== 0 || mb !== 0) {
		const T = u.scaleRational(BigInt(-ma), 1n).add(v.scaleRational(BigInt(-mb), 1n));
		base = p.clone();
		base.translateExact(T);
	}
	const cellDiam = Math.max(Math.hypot(uV.x, uV.y), Math.hypot(vV.x, vV.y));
	const lim = 1.5 * cellDiam + 0.1;
	let bestKey = base.exactKey();
	for (let i = -2; i <= 2; i++) {
		for (let j = -2; j <= 2; j++) {
			if (i === 0 && j === 0) continue;
			const T = u.scaleRational(BigInt(i), 1n).add(v.scaleRational(BigInt(j), 1n));
			const q = base.clone();
			q.translateExact(T);
			const cf = q.exactCentroid!.toVector();
			if (Math.hypot(cf.x, cf.y) > lim) continue;
			const kq = q.exactKey();
			if (kq < bestKey) bestKey = kq;
		}
	}
	if (cacheKey !== undefined) memo!.set(cacheKey, bestKey);
	return bestKey;
}

/** Multiset of polygon names (sorted) — a necessary congruence invariant and a cheap bucket key. */
function nameMultiset(cell: Polygon[]): string {
	return cell.map((p) => p.getName()).sort().join(',');
}

/** Exact |det Λ| key (canonical Surd components) — a necessary congruence invariant and bucket key. */
function detAbsKey(u: Cyclotomic, v: Cyclotomic): string {
	const d = detSurd(u, v).abs();
	return `${d.P},${d.Q},${d.R},${d.S},${d.D}`;
}

/**
 * True iff the periodic tilings (cellA, Λ_A=(uA,vA)) and (cellB, Λ_B=(uB,vB)) are congruent (one is a
 * grid isometry image of the other, reflections included). See the module header for soundness +
 * completeness.
 */
export function tilingsCongruent(
	cellA: Polygon[],
	uA: Cyclotomic,
	vA: Cyclotomic,
	cellB: Polygon[],
	uB: Cyclotomic,
	vB: Cyclotomic,
	memo?: Map<string, string>
): boolean {
	if (cellA.length === 0 || cellB.length === 0) return false;
	// --- cheap necessary rejects ---
	if (cellA.length !== cellB.length) return false;
	if (nameMultiset(cellA) !== nameMultiset(cellB)) return false;
	if (detSurd(uA, vA).abs().cmp(detSurd(uB, vB).abs()) !== 0) return false;

	const ring = cellA[0].exactVertices![0].ring;
	const N = ring.N;
	const ZERO = Cyclotomic.ZERO(ring);

	// target tiling B as a set of canonical class keys. reducedClassKey is a pure function of
	// (polygon, Λ_B), so it is memoized per (p.exactKey, Λ_B) across all pairwise comparisons — the
	// same class rep B is the target for every candidate compared against it (audit perf C5).
	const latKeyB = `${uB.key()}|${vB.key()}`;
	const KB = new Set(cellB.map((q) => reducedClassKey(q, uB, vB, memo, latKeyB)));

	// reference polygon in A (deterministic: min exact key)
	const P0 = cellA.reduce((m, p) => (p.exactKey() < m.exactKey() ? p : m));
	const c0 = P0.exactCentroid!;
	const p0Name = P0.getName();

	const mapPoint = (z: Cyclotomic, reflect: boolean, r: number, T: Cyclotomic): Cyclotomic =>
		(reflect ? z.conj().mulZeta(r) : z.mulZeta(r)).add(T);
	const transformedKey = (p: Polygon, reflect: boolean, r: number, T: Cyclotomic): string => {
		const c = mapPoint(p.exactCentroid!, reflect, r, T);
		const vks = p.exactVertices!.map((vx) => mapPoint(vx, reflect, r, T).key()).sort().join(';');
		return `${p.getName()}:${c.key()}:${vks}`;
	};

	const targets = cellB.filter((q) => q.getName() === p0Name);
	for (const Q of targets) {
		const cQ = Q.exactCentroid!;
		const qKey = Q.exactKey();
		for (const reflect of [false, true]) {
			for (let r = 0; r < N; r++) {
				// T pins g(P0) = Q (translation derived from the reference-polygon correspondence)
				const Mc0 = reflect ? c0.conj().mulZeta(r) : c0.mulZeta(r);
				const T = cQ.sub(Mc0);
				// candidate must map P0 exactly onto Q (a flag correspondence pins the isometry)
				if (transformedKey(P0, reflect, r, T) !== qKey) continue;
				// (i) lattice preservation: g(Λ_A) = Λ_B (translation is irrelevant to the lattice)
				const Mu = reflect ? uA.conj().mulZeta(r) : uA.mulZeta(r);
				const Mv = reflect ? vA.conj().mulZeta(r) : vA.mulZeta(r);
				if (!sameLattice(uB, vB, Mu, Mv)) continue;
				// (ii) whole cell maps onto cell B, mod Λ_B, as a set of canonical class keys
				const mapped = new Set<string>();
				for (const p of cellA) {
					const gp = p.transformedRigid(ZERO, reflect, r, 0, T, 'full');
					mapped.add(reducedClassKey(gp, uB, vB, memo, latKeyB));
				}
				if (mapped.size === cellB.length && [...mapped].every((kk) => KB.has(kk))) return true;
			}
		}
	}
	return false;
}

/** Convenience wrapper over `PeriodCell`s. */
export function cellsCongruent(a: PeriodCell, b: PeriodCell, memo?: Map<string, string>): boolean {
	return tilingsCongruent(
		a.cellPolygons, a.basisExact[0], a.basisExact[1],
		b.cellPolygons, b.basisExact[0], b.basisExact[1],
		memo
	);
}

/**
 * Dedup a list of certified tilings up to congruence — the authoritative replacement for
 * `canonicalKey`-Set dedup (which under-merges the chiral snub, §12.7). Congruence is an equivalence
 * relation, so the resulting PARTITION (and hence the count) is independent of input order.
 *
 * @param keyOf  optional deterministic id of a cell (e.g. `canonicalKey`). When given, the
 *   representative kept for each class is the member with the lexicographically smallest id, and the
 *   output is ordered by that id — so the representative (and any digest derived from it) is fully
 *   order-independent, not just the count. When omitted, the first-seen member is kept, in first-seen
 *   order.
 *
 * Buckets by (name-multiset, |det Λ|) first — both are necessary congruence invariants, so cells in
 * different buckets are never compared; this keeps the cost near-linear when classes are small.
 */
export function dedupeByCongruence(cells: PeriodCell[], keyOf?: (c: PeriodCell) => string): PeriodCell[] {
	// bucket by necessary invariants so we only run the O(class²) test within a bucket
	const buckets = new Map<string, PeriodCell[][]>(); // bucketKey → list of classes (each a list of members)
	// memoize reducedClassKey per (polygon exact-key, lattice) across all pairwise tests — each class
	// rep is the comparison target for many candidates, so its key set is computed once, not per pair.
	const rckMemo = new Map<string, string>();
	for (const c of cells) {
		const bk = `${nameMultiset(c.cellPolygons)}@${detAbsKey(c.basisExact[0], c.basisExact[1])}`;
		let classes = buckets.get(bk);
		if (!classes) { classes = []; buckets.set(bk, classes); }
		const cls = classes.find((members) => cellsCongruent(c, members[0], rckMemo));
		if (cls) cls.push(c);
		else classes.push([c]);
	}

	const reps: PeriodCell[] = [];
	for (const classes of buckets.values()) {
		for (const members of classes) {
			if (keyOf) {
				reps.push(members.reduce((m, c) => (keyOf(c) < keyOf(m) ? c : m)));
			} else {
				reps.push(members[0]);
			}
		}
	}
	if (keyOf) reps.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
	return reps;
}
