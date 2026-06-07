import { describe, it, expect } from "vitest";
import {
	bgcdExt,
	hnf,
	reduceModColumnLattice,
	solveModLattice,
	columnLatticeIndex,
	compileReducer,
	compileSolver,
	solveRationalSquare,
	enumerateQuotientReps,
} from "@/classes/algorithm/exact/IntLinalg";

// ----------------------------------------------------------------------------
// Independent oracles (do NOT reuse the code under test)
// ----------------------------------------------------------------------------

const babs = (a: bigint) => (a < 0n ? -a : a);
const bgcd = (a: bigint, b: bigint): bigint => {
	a = babs(a);
	b = babs(b);
	while (b !== 0n) [a, b] = [b, a % b];
	return a;
};

/** [ℤ² : L] for a rank-2 lattice L spanned by 2D column vectors = gcd of all 2×2 minors (the 2nd
 *  determinantal divisor). Independent of the HNF code. Returns 0n if the columns are rank < 2. */
function index2DByMinors(cols: bigint[][]): bigint {
	let g = 0n;
	for (let i = 0; i < cols.length; i++)
		for (let j = i + 1; j < cols.length; j++) {
			const minor = cols[i][0] * cols[j][1] - cols[i][1] * cols[j][0];
			g = bgcd(g, minor);
		}
	return g; // 0 ⇒ rank-deficient
}

/** Brute-force count of distinct residues of ℤ^m modulo a FULL-RANK lattice, by reducing every point
 *  of a box big enough to cover one fundamental domain. Independent check on reduceModColumnLattice. */
function countResiduesByEnumeration(cols: bigint[][], box: number): number {
	const m = cols[0].length;
	const seen = new Set<string>();
	const rec = (i: number, v: bigint[]) => {
		if (i === m) {
			seen.add(reduceModColumnLattice(v, cols).join(","));
			return;
		}
		for (let x = 0; x < box; x++) rec(i + 1, [...v, BigInt(x)]);
	};
	rec(0, []);
	return seen.size;
}

describe("bgcdExt", () => {
	it("returns g = gcd with the Bézout identity g = x·a + y·b, g ≥ 0", () => {
		const cases: [bigint, bigint][] = [
			[12n, 18n], [-12n, 18n], [12n, -18n], [0n, 5n], [5n, 0n], [7n, 1n], [0n, 0n], [-9n, -6n], [1000003n, 17n],
		];
		for (const [a, b] of cases) {
			const [g, x, y] = bgcdExt(a, b);
			expect(g).toBe(bgcd(a, b));
			expect(g).toBeGreaterThanOrEqual(0n);
			expect(x * a + y * b).toBe(g);
		}
	});
});

describe("columnLatticeIndex", () => {
	it("matches the gcd-of-2×2-minors oracle on rank-2 lattices", () => {
		const mats: bigint[][][] = [
			[[2n, 0n], [0n, 3n]],
			[[2n, 0n], [2n, 3n]],
			[[6n, 0n], [0n, 6n], [4n, 9n]], // join-style (Dc,0),(0,Dc),(A,B)
			[[5n, 1n], [3n, 7n]],
			[[12n, 0n], [0n, 12n], [3n, 8n], [7n, 2n]],
		];
		for (const cols of mats) {
			expect(columnLatticeIndex(cols)).toBe(index2DByMinors(cols));
		}
	});

	it("equals the product of the diagonal for a triangular full-rank lattice", () => {
		expect(columnLatticeIndex([[2n, 0n, 0n], [0n, 3n, 0n], [0n, 0n, 5n]])).toBe(30n);
		expect(columnLatticeIndex([[2n, 0n, 0n], [1n, 3n, 0n], [4n, 1n, 5n]])).toBe(30n);
	});

	it("returns null on a rank-deficient column lattice", () => {
		expect(columnLatticeIndex([[1n, 1n], [1n, 1n]])).toBeNull(); // rank 1 in ℤ²
		expect(columnLatticeIndex([[1n, -1n, 0n], [2n, -2n, 0n]])).toBeNull(); // rank 1 in ℤ³
		expect(columnLatticeIndex([[1n, 0n, 0n], [0n, 1n, 0n]])).toBeNull(); // rank 2 in ℤ³
	});
});

/** Brute-force SET of distinct residues of ℤ^m mod a full-rank lattice (one fundamental domain). The
 *  side `box` covers ≥1 domain when ≥ every diagonal pivot, which holds for box = the index ν. */
function residueSetByEnumeration(cols: bigint[][], box: number): Set<string> {
	const m = cols[0].length;
	const seen = new Set<string>();
	const rec = (i: number, v: bigint[]) => {
		if (i === m) { seen.add(reduceModColumnLattice(v, cols).join(",")); return; }
		for (let x = 0; x < box; x++) rec(i + 1, [...v, BigInt(x)]);
	};
	rec(0, []);
	return seen;
}

describe("enumerateQuotientReps", () => {
	// full-rank lattices: the 2D/3D triangular + minor examples reused from columnLatticeIndex's specs
	const fullRank: bigint[][][] = [
		[[2n, 0n], [0n, 3n]],
		[[2n, 0n], [2n, 3n]],
		[[5n, 1n], [3n, 7n]],
		[[12n, 0n], [0n, 12n], [3n, 8n], [7n, 2n]],
		[[2n, 0n, 0n], [0n, 3n, 0n], [0n, 0n, 5n]],
		[[2n, 0n, 0n], [1n, 3n, 0n], [4n, 1n, 5n]],
	];

	it("emits exactly columnLatticeIndex distinct, reduce-idempotent residues", () => {
		for (const cols of fullRank) {
			const nu = columnLatticeIndex(cols)!;
			const reps = enumerateQuotientReps(cols);
			expect(BigInt(reps.length)).toBe(nu); // count == ν
			const keys = new Set(reps.map((r) => r.join(",")));
			expect(keys.size).toBe(reps.length); // pairwise distinct
			for (const r of reps) expect(reduceModColumnLattice(r, cols)).toEqual(r); // each already HNF-least
		}
	});

	it("its rep SET equals the brute-force residue set (complete + sound transversal)", () => {
		for (const cols of fullRank) {
			const nu = Number(columnLatticeIndex(cols)!);
			const mine = new Set(enumerateQuotientReps(cols).map((r) => r.join(",")));
			const brute = residueSetByEnumeration(cols, nu); // side ν ≥ every pivot ⇒ covers a domain
			expect(mine).toEqual(brute);
		}
	});

	it("is a deterministic function of the LATTICE, not the generator order", () => {
		for (const cols of fullRank) {
			const a = enumerateQuotientReps(cols);
			const b = enumerateQuotientReps([...cols].reverse()); // same lattice, permuted generators
			expect(b).toEqual(a);
		}
	});

	it("throws on rank-deficient input (reflections must stay on the pool)", () => {
		for (const cols of [[[1n, 1n], [1n, 1n]], [[1n, -1n, 0n], [2n, -2n, 0n]], [[1n, 0n, 0n], [0n, 1n, 0n]]]) {
			expect(() => enumerateQuotientReps(cols)).toThrow(/rank-deficient/);
		}
	});

	it("handles the trivial and diagonal boxes", () => {
		expect(enumerateQuotientReps([[1n]])).toEqual([[0n]]); // ν = 1
		const six = enumerateQuotientReps([[2n, 0n], [0n, 3n]]); // ν = 6, box {0,1}×{0,1,2}
		expect(six.length).toBe(6);
		expect(new Set(six.map((r) => r.join(",")))).toEqual(
			new Set(["0,0", "0,1", "0,2", "1,0", "1,1", "1,2"]),
		);
	});
});

describe("reduceModColumnLattice", () => {
	it("reduces lattice vectors (and integer combos) to zero", () => {
		const cols = [[2n, 0n], [0n, 3n]];
		expect(reduceModColumnLattice([2n, 0n], cols)).toEqual([0n, 0n]);
		expect(reduceModColumnLattice([0n, 3n], cols)).toEqual([0n, 0n]);
		expect(reduceModColumnLattice([4n, -6n], cols)).toEqual([0n, 0n]);
	});

	it("gives canonical residues in [0,pivot) for a diagonal lattice", () => {
		const cols = [[2n, 0n], [0n, 3n]];
		expect(reduceModColumnLattice([5n, 7n], cols)).toEqual([1n, 1n]);
		expect(reduceModColumnLattice([-1n, -1n], cols)).toEqual([1n, 2n]);
	});

	it("is idempotent and congruence-stable", () => {
		const cols = [[6n, 0n], [0n, 6n], [4n, 9n]];
		const b = [10n, 13n];
		const r = reduceModColumnLattice(b, cols);
		expect(reduceModColumnLattice(r, cols)).toEqual(r);
		// adding any generator leaves the residue unchanged
		for (const g of cols) {
			const bg = b.map((x, i) => x + g[i]);
			expect(reduceModColumnLattice(bg, cols)).toEqual(r);
		}
	});

	it("is basis-independent (same lattice, different generators ⇒ same residue)", () => {
		const A = [[2n, 0n], [0n, 3n]];
		const B = [[2n, 0n], [2n, 3n]]; // same lattice as A: [0,3] = [2,3]−[2,0]
		for (const b of [[5n, 7n], [1n, 1n], [-3n, 4n], [100n, -99n]]) {
			expect(reduceModColumnLattice(b, A)).toEqual(reduceModColumnLattice(b, B));
		}
	});

	it("# distinct residues == columnLatticeIndex for full-rank lattices", () => {
		const cols = [[2n, 0n], [1n, 3n]]; // index 6
		expect(columnLatticeIndex(cols)).toBe(6n);
		expect(countResiduesByEnumeration(cols, 6)).toBe(6);
	});

	it("handles RANK-DEFICIENT lattices (free coordinates pass through)", () => {
		const cols = [[1n, -1n, 0n]]; // rank 1 in ℤ³, pivot col 0
		expect(reduceModColumnLattice([1n, -1n, 0n], cols)).toEqual([0n, 0n, 0n]); // generator → 0
		const r = reduceModColumnLattice([3n, 3n, 5n], cols);
		expect(reduceModColumnLattice(r, cols)).toEqual(r); // idempotent
		// congruent inputs collapse
		expect(reduceModColumnLattice([4n, 2n, 5n], cols)).toEqual(r); // +[1,-1,0]
	});
});

describe("hnf", () => {
	it("U·G == H (unimodular transform tracks the row operations)", () => {
		const gens = [[6n, 0n], [0n, 6n], [4n, 9n]];
		const { H, U } = hnf(gens, true);
		expect(U).toBeDefined();
		const n = gens.length;
		const m = gens[0].length;
		for (let i = 0; i < n; i++)
			for (let j = 0; j < m; j++) {
				let s = 0n;
				for (let k = 0; k < n; k++) s += U![i][k] * gens[k][j];
				expect(s).toBe(H[i][j]);
			}
	});

	it("U is unimodular (det ±1) — sanity via 2×2/3×3 explicit det", () => {
		const { U } = hnf([[2n, 0n], [1n, 3n]], true);
		const d = U![0][0] * U![1][1] - U![0][1] * U![1][0];
		expect(babs(d)).toBe(1n);
	});

	it("reports rank and pivot columns; zero rows for dependencies", () => {
		const { rank, pivotCols, H } = hnf([[1n, -1n, 0n], [2n, -2n, 0n]]); // rank 1
		expect(rank).toBe(1);
		expect(pivotCols).toEqual([0]);
		expect(H[1]).toEqual([0n, 0n, 0n]); // dependency collapsed to a zero row
	});
});

describe("solveModLattice", () => {
	it("returns a valid particular solution: (b − M·x) ∈ ⟨BΛ⟩", () => {
		const M = [[1n, 0n], [0n, 1n]]; // identity columns
		const BL = [[2n, 0n], [0n, 2n]]; // 2ℤ²
		const b = [5n, 7n];
		const x = solveModLattice(M, b, BL);
		expect(x).not.toBeNull();
		// reconstruct M·x and check the residue
		const Mx = [0n, 0n];
		for (let j = 0; j < M.length; j++) for (let i = 0; i < 2; i++) Mx[i] += x![j] * M[j][i];
		const resid = b.map((v, i) => v - Mx[i]);
		expect(reduceModColumnLattice(resid, BL)).toEqual([0n, 0n]);
	});

	it("detects unsolvable systems", () => {
		const M = [[2n, 0n], [0n, 2n]];
		const BL = [[4n, 0n], [0n, 4n]];
		expect(solveModLattice(M, [1n, 0n], BL)).toBeNull(); // span = 2ℤ², [1,0] ∉
	});

	it("solves rank-deficient M (reflection-like)", () => {
		const M = [[1n, -1n]]; // single column in ℤ²
		const BL = [[2n, 0n]];
		const b = [3n, -1n]; // = 1·[1,-1] + 1·[2,0]
		const x = solveModLattice(M, b, BL);
		expect(x).not.toBeNull();
		const Mx = [x![0] * M[0][0], x![0] * M[0][1]];
		const resid = b.map((v, i) => v - Mx[i]);
		expect(reduceModColumnLattice(resid, BL)).toEqual([0n, 0n]);
	});

	it("is deterministic (same inputs ⇒ same x) — bijection prerequisite", () => {
		const M = [[3n, 0n], [0n, 3n]];
		const BL = [[1n, 0n], [0n, 9n]];
		const b = [4n, 5n];
		expect(solveModLattice(M, b, BL)).toEqual(solveModLattice(M, b, BL));
	});
});

describe("solveRationalSquare (exact rational A·x = b; A as column vectors)", () => {
	// Oracle: reconstruct A·num and check it equals b·den exactly (A·x = b with x = num/den).
	// A·x in the COLUMN convention is Σ_j x_j·A[j].
	const reconstructsExactly = (A: bigint[][], b: bigint[], sol: { num: bigint[]; den: bigint }) => {
		const n = A.length;
		for (let i = 0; i < n; i++) {
			let acc = 0n;
			for (let j = 0; j < n; j++) acc += sol.num[j] * A[j][i];
			expect(acc).toBe(b[i] * sol.den); // A·num == b·den  (i.e. A·(num/den) == b)
		}
	};

	it("solves a diagonal system (hand-checked fractions)", () => {
		// A = diag(2,3) as columns [[2,0],[0,3]]; b = [1,1] ⇒ x = [1/2, 1/3]
		const A = [[2n, 0n], [0n, 3n]];
		const sol = solveRationalSquare(A, [1n, 1n])!;
		expect(sol).not.toBeNull();
		reconstructsExactly(A, [1n, 1n], sol);
		// normalise to lowest terms for the explicit check
		expect(sol.num[0] * 2n).toBe(sol.den); // num0/den = 1/2
		expect(sol.num[1] * 3n).toBe(sol.den); // num1/den = 1/3
	});

	it("solves dense full-rank systems exactly (reconstruction oracle)", () => {
		const cases: [bigint[][], bigint[]][] = [
			[[[2n, 1n], [1n, 2n]], [1n, 0n]], // columns (2,1),(1,2)
			[[[1n, 2n, 3n], [0n, 1n, 4n], [5n, 6n, 0n]], [7n, 8n, 9n]],
			[[[3n, 0n, 0n], [1n, 3n, 0n], [4n, 1n, 3n]], [2n, 5n, 7n]],
		];
		for (const [A, b] of cases) {
			const sol = solveRationalSquare(A, b)!;
			expect(sol).not.toBeNull();
			reconstructsExactly(A, b, sol);
		}
	});

	it("returns null on a singular matrix", () => {
		expect(solveRationalSquare([[1n, 1n], [2n, 2n]], [1n, 0n])).toBeNull(); // rank 1
		expect(solveRationalSquare([[0n, 0n], [0n, 0n]], [1n, 0n])).toBeNull();
	});

	it("handles 1×1 and integer-result systems", () => {
		expect(solveRationalSquare([[5n]], [10n])).toEqual({ num: [10n], den: 5n });
		const A = [[1n, 0n], [0n, 1n]]; // identity columns
		const sol = solveRationalSquare(A, [3n, -4n])!;
		reconstructsExactly(A, [3n, -4n], sol);
	});
});

describe("compiled reducer/solver (HNF once, reuse per vector)", () => {
	it("compileReducer agrees with reduceModColumnLattice", () => {
		const gens = [[6n, 0n], [0n, 6n], [4n, 9n]];
		const red = compileReducer(gens);
		for (const b of [[10n, 13n], [1n, 1n], [-3n, 4n], [100n, -99n]]) {
			expect(red(b)).toEqual(reduceModColumnLattice(b, gens));
		}
	});

	it("compileSolver agrees with solveModLattice (incl. unsolvable)", () => {
		const M = [[2n, 0n], [0n, 2n]];
		const BL = [[1n, 0n], [0n, 9n]];
		const solve = compileSolver(M, BL);
		for (const b of [[4n, 5n], [3n, 8n], [7n, 0n]]) {
			expect(solve(b)).toEqual(solveModLattice(M, b, BL));
		}
		const M2 = [[2n, 0n], [0n, 2n]];
		const BL2 = [[4n, 0n], [0n, 4n]];
		expect(compileSolver(M2, BL2)([1n, 0n])).toBeNull();
	});
});
