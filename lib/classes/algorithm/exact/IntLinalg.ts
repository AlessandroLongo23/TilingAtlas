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
 * Enumerate the `ν = columnLatticeIndex(gens)` distinct HNF-least coset representatives of the finite
 * quotient `ℤ^m / ⟨gens⟩` — the direct quotient enumeration the C4 pool-bypass needs (the realizable
 * cyclic-rotation branches biject with `𝒬_{L,Λ}=ℤ[ζ_N]/(Λ+(1−L)ℤ[ζ_N])`, enumerable as this quotient
 * of `[B_Λ | M_{1−L}]`). Each returned rep is idempotent under `reduceModColumnLattice(·, gens)` and
 * the array is sorted deterministically (so the result is a function of the LATTICE, not of generator
 * order). THROWS on rank-deficient input (`columnLatticeIndex===null`) — this guard keeps reflection
 * coboundary matrices `M_{1−σ}` (infinite quotient, `ci:kernel`) off this path; they MUST stay on the
 * pool-indexed 𝒳.
 *
 * Method (HNF-box): for a full-rank column lattice the HNF is upper-triangular with positive diagonal
 * `d_k = H[k][k]` and pivot columns `[0..m-1]`; the diagonal box `∏_k [0, d_k)` is EXACTLY the set of
 * ν canonical residues (each box tuple is already HNF-least: the reducer's per-step quotient is 0 when
 * the coordinate is in `[0,d_k)`, and inductively no step fires). Reuses `hnf`/`reduceModColumnLattice`.
 */
export function enumerateQuotientReps(gens: bigint[][]): bigint[][] {
	const m = gens.length > 0 ? gens[0].length : 0;
	const idx = columnLatticeIndex(gens);
	if (idx === null) throw new RangeError("enumerateQuotientReps: rank-deficient column lattice (infinite quotient — reflections must stay on the pool)");
	const { H, pivotCols } = hnf(gens, false); // full rank ⇒ pivotCols = [0..m-1], H upper-triangular
	const diag = pivotCols.map((c, k) => H[k][c]); // the m positive pivots d_0..d_{m-1}
	const reduce = compileReducer(gens); // canonical residue; a no-op on box tuples but keeps reps == the pool-path's HNF-least form
	const reps: bigint[][] = [];
	const a = new Array<bigint>(m).fill(0n); // mixed-radix counter over the diagonal box
	for (let count = 0n; count < idx; count++) {
		const rep = new Array<bigint>(m).fill(0n);
		for (let k = 0; k < pivotCols.length; k++) rep[pivotCols[k]] = a[k];
		reps.push(reduce(rep));
		for (let k = m - 1; k >= 0; k--) { // increment the counter (least-significant = last pivot)
			a[k] += 1n;
			if (a[k] < diag[k]) break;
			a[k] = 0n;
		}
	}
	reps.sort((p, q) => { const ps = p.join(","), qs = q.join(","); return ps < qs ? -1 : ps > qs ? 1 : 0; });
	return reps;
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

/**
 * Exact determinant of a square bigint matrix (row-major) via the Bareiss fraction-free algorithm:
 * every intermediate division is exact (the Sylvester–Desnanot identity), so the result is the precise
 * integer determinant with no rounding. Row swaps (to dodge a zero pivot) flip a tracked sign; the
 * exact-division invariant is unaffected by row order. Returns 0n for a singular matrix. Operates on a
 * copy.
 */
function detBareiss(M: bigint[][]): bigint {
	const n = M.length;
	if (n === 0) return 1n;
	const a = M.map((r) => r.slice());
	let sign = 1n;
	let prev = 1n;
	for (let k = 0; k < n - 1; k++) {
		if (a[k][k] === 0n) {
			let sw = -1;
			for (let i = k + 1; i < n; i++) if (a[i][k] !== 0n) { sw = i; break; }
			if (sw < 0) return 0n; // whole sub-column zero ⇒ singular
			[a[k], a[sw]] = [a[sw], a[k]];
			sign = -sign;
		}
		for (let i = k + 1; i < n; i++) {
			for (let j = k + 1; j < n; j++) a[i][j] = (a[i][j] * a[k][k] - a[i][k] * a[k][j]) / prev; // exact
			a[i][k] = 0n;
		}
		prev = a[k][k];
	}
	return sign * a[n - 1][n - 1];
}

/**
 * Exact rational solution of the square system `A·x = b` over ℚ, with `A` given as `n` COLUMN vectors
 * (each length n) — the same column convention as `coboundaryMatrix` (column j is `(1−L)·ζ^j`) — and
 * `b` of length n. Returns `{ num, den }` with `x_j = num[j]/den` (common positive-or-signed
 * denominator; the caller's `Cyclotomic` constructor canonicalises the sign), or `null` if `A` is
 * singular. This is the orbifold incidence-anchoring branch centre `c = (1−L)⁻¹·w`, which is in general
 * NON-integral — `Cyclotomic` provides no field inversion, so the rotation centre cannot be obtained by
 * `solveModLattice` (that reduces mod Λ and moves the centre). For a rotation generator `L≠1`, `A` is
 * full rank, so the solve never returns null on the enumerated branches. Cramer's rule with Bareiss
 * determinants; exact, n≤8 in practice (`φ(N)`).
 */
export function solveRationalSquare(A: bigint[][], b: bigint[]): { num: bigint[]; den: bigint } | null {
	const n = A.length;
	if (n === 0) return { num: [], den: 1n };
	if (b.length !== n || A.some((col) => col.length !== n)) throw new Error("solveRationalSquare: non-square system or shape mismatch");
	// row-major M[i][j] = A[j][i]  (A[j] is column j) ⇒ M·x = b is the standard form of A·x = b
	const M: bigint[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => A[j][i]));
	const det = detBareiss(M);
	if (det === 0n) return null; // singular
	const num: bigint[] = [];
	for (let j = 0; j < n; j++) {
		const Mj = M.map((row, i) => row.map((val, c) => (c === j ? b[i] : val))); // Cramer: column j ← b
		num.push(detBareiss(Mj));
	}
	return { num, den: det }; // x_j = num[j] / det
}
