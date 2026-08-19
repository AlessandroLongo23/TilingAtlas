// Exact integer linear algebra for the Smith-diagram solve. BigInt only — there is deliberately no
// rational type here, and that is the point of the normalisation described below.
//
// The system we solve is the reduced Laplacian of a network with unit conductances: for every free
// vertex v (every vertex except the battery's two poles),
//
//     deg(v)·V(v) − Σ_{w ~ v} V(w) = 0,
//
// with the pole potentials moved to the right-hand side. Solved naively that is a rational system and
// the fractions explode: the 60-vertex records in this corpus have potentials with 27-digit numerators,
// and gcd-reducing every intermediate entry costs more than the solve.
//
// Kirchhoff's matrix-tree theorem removes the fractions entirely. Fix the positive pole's potential at
// det(A) rather than at 1, and the solution becomes x = det(A)·A⁻¹b = adj(A)·b — the adjugate of an
// integer matrix against an integer vector, so every potential, every current and every square side
// comes out an integer with no division at all. det(A) is not an arbitrary scale factor either: by the
// all-minors matrix-tree theorem it counts the spanning 2-forests of the network that separate the two
// poles, which is exactly the squared rectangle's height. See lib/squaring/smith.ts.
//
// Bareiss is what keeps the elimination itself integral. Ordinary Gauss-Jordan on an integer matrix
// introduces fractions immediately; Bareiss divides each update by the previous pivot, and that
// division is always exact (Sylvester's identity — every intermediate entry is itself a minor of the
// original matrix). So the entries stay integers AND stay bounded by the minors of A, instead of
// growing like a product of denominators.

/** Greatest common divisor of two BigInts, sign-insensitive. */
export function gcdBig(a: bigint, b: bigint): bigint {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

/** gcd of a list; 0n for an empty list or an all-zero one. */
export function gcdAll(values: Iterable<bigint>): bigint {
	let g = 0n;
	for (const v of values) {
		g = gcdBig(g, v);
		if (g === 1n) return 1n;
	}
	return g;
}

export interface BareissSolution {
	/** det(A). The scale the solution is expressed in, and never zero — a singular A throws. */
	det: bigint;
	/** numer[i] = det(A)·x_i, exactly. Divide by `det` for the true rational solution. */
	numer: bigint[];
}

/**
 * Fraction-free Gauss-Jordan (one-step Bareiss) on the augmented system [A | b].
 *
 * Returns det(A) and the vector det(A)·x rather than x itself, because for our use that scaled vector
 * IS the answer we want — the integer squaring — and dividing it back down would only reintroduce the
 * fractions this routine exists to avoid.
 *
 * @param a square integer matrix, m×m, consumed by value (copied internally)
 * @param b right-hand side, length m
 * @throws if A is singular, which for a connected network cannot happen and so signals a graph bug
 */
export function bareissSolve(a: bigint[][], b: bigint[]): BareissSolution {
	const m = a.length;
	if (m === 0) return { det: 1n, numer: [] };
	if (b.length !== m) throw new Error(`bareissSolve: A is ${m}×${m} but b has length ${b.length}`);

	// Augmented matrix, m rows × (m+1) columns. Column m is the right-hand side.
	const M: bigint[][] = a.map((row, i) => {
		if (row.length !== m) throw new Error(`bareissSolve: row ${i} has length ${row.length}, expected ${m}`);
		return [...row, b[i]];
	});

	let prev = 1n;
	let sign = 1n;

	for (let k = 0; k < m; k++) {
		if (M[k][k] === 0n) {
			// Partial pivot. Only a row swap is allowed: scaling a row would break the exact division.
			let swap = -1;
			for (let r = k + 1; r < m; r++) {
				if (M[r][k] !== 0n) {
					swap = r;
					break;
				}
			}
			if (swap < 0) throw new Error(`bareissSolve: singular matrix at column ${k}`);
			const t = M[k];
			M[k] = M[swap];
			M[swap] = t;
			sign = -sign;
		}

		const pivot = M[k][k];
		for (let i = 0; i < m; i++) {
			if (i === k) continue;
			const factor = M[i][k];
			// Columns below k are already zero in the Jordan form, so only k+1.. need updating.
			for (let j = k + 1; j <= m; j++) {
				M[i][j] = (M[i][j] * pivot - factor * M[k][j]) / prev;
			}
			M[i][k] = 0n;
		}
		prev = pivot;
	}

	// After a full one-step Bareiss sweep every diagonal entry equals the same value: ±det(A).
	const det = sign * prev;
	// x_i = M[i][m] / M[i][i], and every M[i][i] is `prev`, so det·x_i = sign·M[i][m].
	return { det, numer: M.map((row) => sign * row[m]) };
}

/**
 * det(A) alone, by the same elimination. Used for the spanning-tree counts the tests assert against
 * (Kirchhoff: any cofactor of the Laplacian counts spanning trees).
 */
export function integerDet(a: bigint[][]): bigint {
	const m = a.length;
	if (m === 0) return 1n;
	const M = a.map((row) => [...row]);
	let prev = 1n;
	let sign = 1n;
	for (let k = 0; k < m; k++) {
		if (M[k][k] === 0n) {
			let swap = -1;
			for (let r = k + 1; r < m; r++) {
				if (M[r][k] !== 0n) {
					swap = r;
					break;
				}
			}
			if (swap < 0) return 0n;
			const t = M[k];
			M[k] = M[swap];
			M[swap] = t;
			sign = -sign;
		}
		const pivot = M[k][k];
		for (let i = k + 1; i < m; i++) {
			const factor = M[i][k];
			for (let j = k + 1; j < m; j++) {
				M[i][j] = (M[i][j] * pivot - factor * M[k][j]) / prev;
			}
			M[i][k] = 0n;
		}
		prev = pivot;
	}
	return sign * prev;
}
