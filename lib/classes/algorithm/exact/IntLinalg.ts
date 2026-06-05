/*
 * Exact integer linear algebra over ℤ — general Hermite Normal Form, reduce-mod-column-lattice, and
 * solve-mod-lattice. The orbifold normalized-branch layer (re-anchoring lemma, thesis `7a0586e`)
 * rides entirely on this: cyclic/dihedral class keys are HNF-least residues modulo a column lattice
 * `[B_Λ | M_{1−L}]`, and the re-anchor solutions t(d) solve `(1−Lᵢ)·t ≡ w′ᵢ−dᵢ (mod Λ)`. Pure
 * bigint — no Cyclotomic dependency, fully unit-testable in isolation.
 *
 * Convention: a "column lattice" is given as an array of COLUMN VECTORS `gens: bigint[][]`, each of
 * length m; the lattice is their ℤ-span in ℤ^m. Internally we treat the generators as the ROWS of a
 * working matrix and compute a row-style HNF (the unique canonical echelon basis). RANK-DEFICIENT
 * inputs are handled: reflection coboundary matrices `M_{1−σ}` have rank φ/2 < φ (the σ-fixed
 * subspace is killed), so `[B_Λ | M_{1−σ}]` need not span ℤ^φ — the free coordinates pass through the
 * HNF zero-pivot rows unchanged and `columnLatticeIndex` refuses (returns null) rather than reporting
 * a wrong pivot product.
 */

function babs(a: bigint): bigint {
	return a < 0n ? -a : a;
}

/** Extended gcd: returns [g, x, y] with g = x·a + y·b and g ≥ 0. */
export function bgcdExt(a: bigint, b: bigint): [bigint, bigint, bigint] {
	let [or, r] = [a, b];
	let [os, s] = [1n, 0n];
	let [ot, t] = [0n, 1n];
	while (r !== 0n) {
		const q = or / r;
		[or, r] = [r, or - q * r];
		[os, s] = [s, os - q * s];
		[ot, t] = [t, ot - q * t];
	}
	return or < 0n ? [-or, -os, -ot] : [or, os, ot];
}

/** Floor division for bigint (rounds toward −∞); `b` is assumed nonzero. */
function floorDiv(a: bigint, b: bigint): bigint {
	let q = a / b; // truncates toward zero
	if (a % b !== 0n && (a < 0n) !== (b < 0n)) q -= 1n;
	return q;
}

export type HnfResult = {
	/** Same number of rows as the input generators; first `rank` rows are the canonical echelon basis
	 *  (positive pivots, strictly increasing pivot columns, off-pivot column entries reduced to
	 *  [0,pivot)); the remaining rows are all-zero (collapsed dependencies). */
	H: bigint[][];
	rank: number;
	/** Pivot column of echelon row k, for k in [0, rank). Strictly increasing. */
	pivotCols: number[];
	/** Unimodular n×n transform with U·G = H (G = generators as rows). Present iff `wantU`. */
	U?: bigint[][];
};

/**
 * Row-style Hermite Normal Form of the lattice spanned by `gens` (each a length-m column vector,
 * treated as a row of the working matrix). Canonical — two generating sets of the SAME lattice yield
 * the SAME H. Handles rank-deficient input. With `wantU`, also returns the unimodular transform U
 * (U·G = H) used to recover integer combinations in `solveModLattice`.
 */
export function hnf(gens: bigint[][], wantU = false): HnfResult {
	const n = gens.length;
	const m = n > 0 ? gens[0].length : 0;
	const A = gens.map((row) => row.slice());
	const U: bigint[][] | null = wantU
		? Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n)))
		: null;

	const axpy = (i: number, src: number, q: bigint) => {
		// row_i -= q · row_src  (applied to A and, in lockstep, U)
		for (let j = 0; j < m; j++) A[i][j] -= q * A[src][j];
		if (U) for (let j = 0; j < n; j++) U[i][j] -= q * U[src][j];
	};
	const negate = (i: number) => {
		for (let j = 0; j < m; j++) A[i][j] = -A[i][j];
		if (U) for (let j = 0; j < n; j++) U[i][j] = -U[i][j];
	};
	const swap = (i: number, k: number) => {
		[A[i], A[k]] = [A[k], A[i]];
		if (U) [U[i], U[k]] = [U[k], U[i]];
	};

	let r = 0;
	const pivotCols: number[] = [];
	for (let c = 0; c < m && r < n; c++) {
		// Euclidean elimination: drive all rows in [r, n) but one to zero in column c.
		for (;;) {
			let pivot = -1;
			for (let i = r; i < n; i++) {
				if (A[i][c] !== 0n && (pivot < 0 || babs(A[i][c]) < babs(A[pivot][c]))) pivot = i;
			}
			if (pivot < 0) break; // column c is free (no pivot among rows ≥ r)
			if (pivot !== r) swap(r, pivot);
			let progressed = false;
			for (let i = r + 1; i < n; i++) {
				if (A[i][c] !== 0n) {
					axpy(i, r, A[i][c] / A[r][c]); // truncated quotient ⇒ |remainder| < |pivot|
					progressed = true;
				}
			}
			if (!progressed) break; // only row r is nonzero in column c ⇒ pivot finalized
		}
		if (A[r][c] === 0n) continue; // free column
		if (A[r][c] < 0n) negate(r); // positive pivot
		const p = A[r][c];
		for (let i = 0; i < r; i++) {
			// back-reduce rows above so their column-c entry lands in [0, p) (canonicalisation)
			if (A[i][c] !== 0n) {
				const q = floorDiv(A[i][c], p);
				if (q !== 0n) axpy(i, r, q);
			}
		}
		pivotCols.push(c);
		r++;
	}
	return { H: A, rank: r, pivotCols, U: U ?? undefined };
}

/**
 * Compile a reducer for a FIXED column lattice: runs the HNF once and returns a closure that maps any
 * `b` to its canonical residue. Use when reducing many vectors against the same lattice (the orbifold
 * measurement reduces a whole pool per (Λ, generator)).
 */
export function compileReducer(gens: bigint[][]): (b: bigint[]) => bigint[] {
	const { H, rank, pivotCols } = hnf(gens, false);
	return (b: bigint[]) => {
		const res = b.slice();
		for (let k = 0; k < rank; k++) {
			const c = pivotCols[k];
			const q = floorDiv(res[c], H[k][c]);
			if (q !== 0n) for (let j = 0; j < res.length; j++) res[j] -= q * H[k][j];
		}
		return res;
	};
}

/**
 * Canonical (HNF-least) residue of `b` modulo the column lattice spanned by `gens`. Idempotent,
 * congruence-stable, and basis-independent (because the HNF is canonical). Free coordinates of a
 * rank-deficient lattice pass through unchanged.
 */
export function reduceModColumnLattice(b: bigint[], gens: bigint[][]): bigint[] {
	return compileReducer(gens)(b);
}

/**
 * [ℤ^m : L] for the column lattice L = ⟨gens⟩ — the product of HNF pivots when L is FULL RANK, else
 * `null` (rank-deficient: the index is infinite, and the caller must count classes from the pool, not
 * from an index). Never returns a wrong pivot product on deficient input.
 */
export function columnLatticeIndex(gens: bigint[][]): bigint | null {
	const m = gens.length > 0 ? gens[0].length : 0;
	if (m === 0) return null;
	const { H, rank, pivotCols } = hnf(gens, false);
	if (rank < m) return null; // not full rank ⇒ infinite index
	let idx = 1n;
	for (let k = 0; k < rank; k++) idx *= H[k][pivotCols[k]];
	return idx;
}

/**
 * A particular canonical solution `x` of `M·x ≡ b (mod ⟨BΛ⟩)` over ℤ — i.e. integer `x` (and some
 * integer `y`) with `M·x + BΛ·y = b`, returning the M-part `x`. `null` if no integer solution exists.
 * Deterministic (same inputs ⇒ same x), which is all the conservation law needs: distinct pool data d
 * give distinct t(d) because `M·t(d) − M·t(d′) = d′ − d (mod Λ)`, so t is injective for any
 * deterministic choice. `M` and `BΛ` are arrays of column vectors of common length m.
 */
/**
 * Compile a solver for a FIXED system shape `(M, BΛ)`: runs the augmented HNF once and returns a
 * closure mapping any right-hand side `b` to a particular M-part solution x (or null). Use when
 * re-anchoring a whole pool against the same (Λ, generator).
 */
export function compileSolver(M: bigint[][], BLambda: bigint[][]): (b: bigint[]) => bigint[] | null {
	const nM = M.length;
	const gens = [...M, ...BLambda];
	if (gens.length === 0) return (b: bigint[]) => (b.every((x) => x === 0n) ? [] : null);
	const { H, rank, pivotCols, U } = hnf(gens, true);
	return (b: bigint[]) => {
		const res = b.slice();
		const coeff = new Array<bigint>(gens.length).fill(0n); // coefficient over H rows
		for (let k = 0; k < rank; k++) {
			const c = pivotCols[k];
			const q = floorDiv(res[c], H[k][c]);
			if (q !== 0n) {
				coeff[k] = q;
				for (let j = 0; j < res.length; j++) res[j] -= q * H[k][j];
			}
		}
		if (res.some((x) => x !== 0n)) return null; // b ∉ ⟨M, BΛ⟩
		// b = Σ_k coeff[k]·H[k] = (coeff·U)·G ⇒ combination over the original generators is a = coeff·U.
		const a = new Array<bigint>(gens.length).fill(0n);
		for (let k = 0; k < rank; k++) {
			if (coeff[k] === 0n) continue;
			for (let j = 0; j < gens.length; j++) a[j] += coeff[k] * U![k][j];
		}
		return a.slice(0, nM); // the M-part x
	};
}

export function solveModLattice(M: bigint[][], b: bigint[], BLambda: bigint[][]): bigint[] | null {
	return compileSolver(M, BLambda)(b);
}
