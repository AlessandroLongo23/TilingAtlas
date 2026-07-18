// Exact rational linear algebra over ℚ with BigInt fractions. Matrices here are tiny (≤ ~80²) with ±1
// entries, so plain Gauss-Jordan with normalised BigInt fractions is exact and fast. Used to extract
// homology-generator bases; ranks for Betti numbers stay with chainComplex's modular method.

type Frac = { n: bigint; d: bigint }; // invariant: d > 0, gcd(|n|,d)=1
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; };
const mk = (n: bigint, d: bigint): Frac => {
  if (d === 0n) throw new Error('zero denominator');
  if (d < 0n) { n = -n; d = -d; }
  if (n === 0n) return { n: 0n, d: 1n };
  const g = gcd(n, d); return { n: n / g, d: d / g };
};
const add = (a: Frac, b: Frac) => mk(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Frac, b: Frac) => mk(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Frac, b: Frac) => mk(a.n * b.n, a.d * b.d);
const div = (a: Frac, b: Frac) => mk(a.n * b.d, a.d * b.n);
const isZero = (a: Frac) => a.n === 0n;
const F = (x: number): Frac => mk(BigInt(x), 1n);

/** Reduced row echelon form (on a copy); returns { R, pivotCols }. */
function rref(rows: number[][], cols: number): { R: Frac[][]; pivots: number[] } {
  const R = rows.map((r) => r.map(F));
  const pivots: number[] = [];
  let row = 0;
  for (let col = 0; col < cols && row < R.length; col++) {
    let piv = -1;
    for (let r = row; r < R.length; r++) if (!isZero(R[r][col])) { piv = r; break; }
    if (piv === -1) continue;
    [R[row], R[piv]] = [R[piv], R[row]];
    const inv = R[row][col];
    R[row] = R[row].map((x) => div(x, inv));
    for (let r = 0; r < R.length; r++) {
      if (r === row || isZero(R[r][col])) continue;
      const f = R[r][col];
      R[r] = R[r].map((x, c) => sub(x, mul(f, R[row][c])));
    }
    pivots.push(col);
    row++;
  }
  return { R, pivots };
}

export function matRank(rows: number[][]): number {
  if (rows.length === 0) return 0;
  return rref(rows, rows[0].length).pivots.length;
}

/** Basis of the null space { x : M x = 0 } as integer vectors (each length `cols`). One vector per free
 *  column: set that free var to 1, back-solve the pivots, then clear denominators. */
export function nullSpace(rows: number[][], cols: number): number[][] {
  const src = rows.length ? rows : [new Array(cols).fill(0)];
  const { R, pivots } = rref(src, cols);
  const pivotSet = new Set(pivots);
  const pivotRowOf = new Map<number, number>();
  pivots.forEach((c, i) => pivotRowOf.set(c, i));
  const basis: number[][] = [];
  for (let free = 0; free < cols; free++) {
    if (pivotSet.has(free)) continue;
    const x: Frac[] = new Array(cols).fill(0).map(() => F(0));
    x[free] = F(1);
    for (const pc of pivots) {
      x[pc] = sub(F(0), R[pivotRowOf.get(pc)!][free]);
    }
    let lcm = 1n;
    for (const f of x) lcm = (lcm / gcd(lcm, f.d)) * f.d;
    basis.push(x.map((f) => Number((f.n * lcm) / f.d)));
  }
  return basis;
}
