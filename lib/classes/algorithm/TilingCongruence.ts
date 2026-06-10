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
import { Surd, detSurd } from './exact/Surd';
import { sameLattice } from './LatticeEnumerator';
import { TranslationalCellExtractor } from './TranslationalCellExtractor';
import type { PeriodCell } from './PeriodSolver';

/** Exact integer floor of a Surd: float guess, then exact `cmp` correction (each loop step moves
 *  monotonically toward the unique n with n ≤ s < n+1; cmp/sign are exact — CB-2). */
function surdFloor(s: Surd): bigint {
	let n = BigInt(Math.floor(s.toFloat()));
	while (s.cmp(Surd.rational(n)) < 0) n -= 1n;
	while (s.cmp(Surd.rational(n + 1n)) >= 0) n += 1n;
	return n;
}

/**
 * Canonical lattice-class representative key of `p` under Λ = (u, v): translate `p` so its
 * centroid's EXACT coordinates (α, β) in the basis (u, v) land in the fundamental domain [0,1)²
 * (α, β computed by Surd Cramer — they lie in ℚ(√2,√3); representative = p − ⌊α⌋u − ⌊β⌋v).
 * Class-canonical by construction: lattice translates shift (α, β) by integers, which cancel in
 * the exact floor — the SAME key for every member of a class, with no float in the decision.
 *
 * §34 (CB-4 guard discovery, 2026-06-10): this replaces the original float-guessed ±2-window
 * lex-min reduction, which was NOT class-canonical on skewed bases (window/`lim` cutoffs picked
 * different representatives for members of one class) — producing direction-dependent FALSE
 * NEGATIVES in `tilingsCongruent`'s cell-set verification, caught as a cong(a,b) ≠ cong(b,a)
 * symmetry violation by `assertEquivalencePartition` on the k=3 artifact. Soundness was never at
 * risk (keys are exact geometry — distinct classes cannot collide); the defect was completeness
 * of the merge, the same axis as §19.6.
 * Exported for the §34 class-invariance regression test only — not part of the public dedup API.
 */
export function reducedClassKey(
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
	const den = detSurd(u, v); // ≠ 0: (u, v) is a basis
	const c = p.exactCentroid!;
	const ma = surdFloor(detSurd(c, v).div(den)); // α: c = α·u + β·v (Cramer, exact)
	const mb = surdFloor(detSurd(u, c).div(den)); // β
	let base = p;
	if (ma !== 0n || mb !== 0n) {
		const T = u.scaleRational(-ma, 1n).add(v.scaleRational(-mb, 1n));
		base = p.clone();
		base.translateExact(T);
	}
	const bestKey = base.exactKey();
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
					// rotation power r is rotK; axisK=0. reflect=false ⇒ z·ζ^r+T, reflect=true ⇒
					// conj(z)·ζ^{0+r}+T — both matching `mapPoint`/`transformedKey` above. (Passing r as
					// axisK with rotK=0 dropped the rotation in the reflect=false branch, missing
					// rotation-only congruences and over-counting oblique cells — DEVELOPMENT_NOTES §19.)
					const gp = p.transformedRigid(ZERO, reflect, 0, r, T, 'full');
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

/** True iff w is an exact integer combination of (u, v): float Cramer guess, exact verify. */
function isIntegerCombo(w: Cyclotomic, u: Cyclotomic, v: Cyclotomic): boolean {
	const d = w.toVector();
	const a = u.toVector();
	const b = v.toVector();
	const det = a.x * b.y - a.y * b.x;
	if (Math.abs(det) < 1e-9) return false;
	const m = Math.round((d.x * b.y - d.y * b.x) / det);
	const n = Math.round((a.x * d.y - a.y * d.x) / det);
	const recon = u.scaleRational(BigInt(m), 1n).add(v.scaleRational(BigInt(n), 1n));
	return w.sub(recon).isZero();
}

/** Exact (m,n) with w = m·u + n·v, or null. */
function integerCombo(w: Cyclotomic, u: Cyclotomic, v: Cyclotomic): [number, number] | null {
	const d = w.toVector();
	const a = u.toVector();
	const b = v.toVector();
	const det = a.x * b.y - a.y * b.x;
	if (Math.abs(det) < 1e-9) return null;
	const m = Math.round((d.x * b.y - d.y * b.x) / det);
	const n = Math.round((a.x * d.y - a.y * d.x) / det);
	const recon = u.scaleRational(BigInt(m), 1n).add(v.scaleRational(BigInt(n), 1n));
	return w.sub(recon).isZero() ? [m, n] : null;
}

/**
 * Primitive-reduce a periodic-tiling encoding (§29). A solver candidate lattice can be a proper
 * SUBLATTICE of the tiling's full translation lattice; the fill then passes every gate but encodes
 * the tiling with an index-m supercell (m× the tiles), and the (name-multiset, |det Λ|) buckets in
 * `dedupeByCongruence` — sound only for primitive cells — can never merge it with its primitive
 * twin (the certified k=3 duplicate, §28.2). Reduction: replicate the cell over a 5×5 lattice
 * window, re-extract the translational cell (TranslationalCellExtractor prefers the shortest,
 * Gauss-reduced basis), and accept the result ONLY under exact verification:
 *   (i)  the original basis is an integer combination of the reduced basis (Λ ⊆ Λ′, exact), and
 *   (ii) every original cell polygon is an exact Λ′-translate of a reduced cell polygon
 * — which proves (cell, Λ) and (cell′, Λ′) define the SAME infinite tiling, so the swap is sound.
 * Already-primitive cells (and any unverifiable reduction) return the ORIGINAL object unchanged —
 * never drop or alter on uncertainty, and k≤2 digests stay byte-identical.
 */
export function primitiveReducedCell(cell: PeriodCell): PeriodCell {
	let current = cell;
	// fixed-point: an index-4 encoding may reduce 2× (guard bound is generous, not load-bearing)
	for (let guard = 0; guard < 4; guard++) {
		const next = reduceOnce(current);
		if (next === current) break;
		current = next;
	}
	return current;
}

function reduceOnce(cell: PeriodCell): PeriodCell {
	if (cell.cellPolygons.length <= 1) return cell;
	if (!cell.cellPolygons.every((p) => p.hasExact())) return cell;
	const [u, v] = cell.basisExact;

	// replicate over a (2R+1)² lattice window — large enough that a false sub-period would
	// produce a visible overlap for the extractor's full-patch verification
	const R = 2;
	const patch: Polygon[] = [];
	const seen = new Set<string>();
	for (let i = -R; i <= R; i++) {
		for (let j = -R; j <= R; j++) {
			const t = u.scaleRational(BigInt(i), 1n).add(v.scaleRational(BigInt(j), 1n));
			for (const p of cell.cellPolygons) {
				const q = p.clone();
				q.translateExact(t);
				const k = q.exactKey();
				if (seen.has(k)) continue;
				seen.add(k);
				patch.push(q);
			}
		}
	}

	const ext = new TranslationalCellExtractor().extract(patch);
	if (!ext || !ext.basisExact) return cell;
	if (ext.cellPolygons.length >= cell.cellPolygons.length) return cell; // already primitive
	const [u2, v2] = ext.basisExact;

	// (i) Λ ⊆ Λ′ — exact
	if (!isIntegerCombo(u, u2, v2) || !isIntegerCombo(v, u2, v2)) return cell;

	// (ii) every original polygon is an exact Λ′-translate of a reduced polygon
	for (const p of cell.cellPolygons) {
		const ok = ext.cellPolygons.some((q) => {
			if (q.getName() !== p.getName()) return false;
			const mn = integerCombo(p.exactCentroid!.sub(q.exactCentroid!), u2, v2);
			if (!mn) return false;
			const T = u2.scaleRational(BigInt(mn[0]), 1n).add(v2.scaleRational(BigInt(mn[1]), 1n));
			const qt = q.clone();
			qt.translateExact(T);
			return qt.exactKey() === p.exactKey();
		});
		if (!ok) return cell;
	}

	return { cellPolygons: ext.cellPolygons, basisExact: ext.basisExact };
}

/**
 * Assert a `dedupeByCongruence` bucket's partition is a genuine EQUIVALENCE RELATION — the
 * target-independent, oracle-free merge guard the k≥4 regime needs (no count oracle there; the
 * frozen-catalogue ⊇ check catches misses but is blind to inflation). It fires DIRECTLY on the §19.6
 * bug class: an argument-order-asymmetric `tilingsCongruent` makes the partition non-symmetric /
 * non-transitive, which fails here at ANY k. Exported (and `congruent`-injectable) so a deliberately
 * broken predicate can be unit-tested. Throws loud on violation — a non-equivalence partition makes the
 * dedup COUNT meaningless. Cheap: buckets are tiny (the name-multiset@|detΛ| split is aggressive).
 */
export function assertEquivalencePartition(
	classes: PeriodCell[][],
	congruent: (a: PeriodCell, b: PeriodCell) => boolean,
	bucketKey = ""
): void {
	const bug = (reason: string): never => {
		const msg = `[congruence] ⚑ IMPLEMENTATION-BUG: merge relation is not an equivalence (${reason})${bucketKey ? ` in bucket ${bucketKey}` : ""}`;
		console.error(msg);
		throw new Error(msg);
	};
	const members = classes.flat();
	const classOf = new Map<PeriodCell, number>();
	classes.forEach((cls, ci) => cls.forEach((c) => classOf.set(c, ci)));
	for (const c of members) if (!congruent(c, c)) bug("reflexivity: a cell is not congruent to itself");
	for (let i = 0; i < members.length; i++) {
		for (let j = i + 1; j < members.length; j++) {
			const cij = congruent(members[i], members[j]);
			const cji = congruent(members[j], members[i]); // ← the §19.6 root cause: argument-order asymmetry
			if (cij !== cji) bug("symmetry: cong(a,b) ≠ cong(b,a)");
			const same = classOf.get(members[i]) === classOf.get(members[j]);
			if (cij !== same) bug(cij ? "intransitivity: a congruent pair landed in different classes (under-merge → inflation)" : "a non-congruent pair was merged (over-merge)");
		}
	}
}

/**
 * The congruence PARTITION underlying `dedupeByCongruence` — exported (CB-4) so the certifying
 * harnesses can hand the full classes (not just the reps) to the independent differential oracle
 * (`CongruenceDifferential.ts`). Classes are returned in deterministic first-seen order (bucket
 * insertion order, then class insertion order within a bucket) — exactly the order the old inlined
 * loop produced, so `dedupeByCongruence` built on top is byte-identical.
 */
export function congruencePartition(cells: PeriodCell[]): PeriodCell[][] {
	// §29: the bucket keys below (cell size via nameMultiset, |det Λ|) are necessary invariants only
	// for PRIMITIVE cells — reduce every input first (identity for already-primitive cells, so this
	// is byte-neutral on catalogues that carry no supercell encodings).
	const reducedCells = cells.map(primitiveReducedCell);
	// bucket by necessary invariants so we only run the O(class²) test within a bucket
	const buckets = new Map<string, PeriodCell[][]>(); // bucketKey → list of classes (each a list of members)
	// memoize reducedClassKey per (polygon exact-key, lattice) across all pairwise tests — each class
	// rep is the comparison target for many candidates, so its key set is computed once, not per pair.
	const rckMemo = new Map<string, string>();
	for (const c of reducedCells) {
		const bk = `${nameMultiset(c.cellPolygons)}@${detAbsKey(c.basisExact[0], c.basisExact[1])}`;
		let classes = buckets.get(bk);
		if (!classes) { classes = []; buckets.set(bk, classes); }
		const cls = classes.find((members) => cellsCongruent(c, members[0], rckMemo));
		if (cls) cls.push(c);
		else classes.push([c]);
	}

	// Always-on merge guard (CB-4, cherry-picked from feat/c4-pool-bypass): every bucket's partition
	// must be a genuine equivalence relation. Catches the §19.6 argument-order asymmetry → inflation
	// at any k, with no count oracle. Pure assertion — output (and digest) unchanged when the
	// relation is valid.
	for (const [bk, classes] of buckets) assertEquivalencePartition(classes, (a, b) => cellsCongruent(a, b, rckMemo), bk);

	const out: PeriodCell[][] = [];
	for (const classes of buckets.values()) for (const members of classes) out.push(members);
	return out;
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
	const classes = congruencePartition(cells);

	// PS_MERGECHECK=full: order-invariance — re-partition the REVERSED input and assert the same
	// classes (a genuinely independent run through the same predicate; catches an order-dependent
	// merge bug). Off by default (it ~doubles the dedup cost). Needs keyOf for an order-independent
	// class signature.
	if (process.env.PS_MERGECHECK === "full" && keyOf) {
		const classes2 = congruencePartition([...cells].reverse());
		const sig = (cls: PeriodCell[][]) => cls.map((m) => m.map(keyOf).sort()[0]).sort().join("|");
		if (sig(classes) !== sig(classes2)) {
			const msg = "[congruence] ⚑ IMPLEMENTATION-BUG: dedupe partition is ORDER-DEPENDENT (merge relation not transitive)";
			console.error(msg);
			throw new Error(msg);
		}
	}

	const reps: PeriodCell[] = [];
	for (const members of classes) {
		if (keyOf) {
			reps.push(members.reduce((m, c) => (keyOf(c) < keyOf(m) ? c : m)));
		} else {
			reps.push(members[0]);
		}
	}
	if (keyOf) reps.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
	return reps;
}
