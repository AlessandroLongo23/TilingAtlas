/**
 * Delaney–Dress symbol core (M0). Pure combinatorics, NO geometry, fs-free.
 *
 * A 2-D Delaney–Dress symbol is (n, s0, s1, s2, m01, m12) with m02 ≡ 2 implicit.
 * Chambers are barycentric flags 0..n-1 (corner 0 = vertex, 1 = edge-mid, 2 = tile-centre).
 *   s0: keep edge & tile, move to the OTHER edge-endpoint (changes vertex)
 *   s1: keep vertex & tile, move to the OTHER tile edge at the vertex (changes edge)
 *   s2: keep vertex & edge, move to the OTHER tile across the edge (changes tile)
 *
 * Axioms (Delgado-Friedrichs TCS-I Def 2):
 *   DS0 connected; DS1 involutions (fixed points = mirror chambers allowed);
 *   DS2 s0,s2 commute (m02=2); DS3 m01 const on {0,1}-orbits, m12 on {1,2}-orbits;
 *   DS4 m_ij is a positive-integer multiple of the (s_i s_j)-cycle length r_ij.
 *
 * Faithful port of experiments/delaney-dress/{dsymbol,minimal_image_test}.py.
 * Canonical form is PLAIN DF Algorithm 8 (brute lex-min over all seeds) — it already
 * merges chirality (a chiral tiling and its mirror share one symbol; FINDINGS §1), so
 * NO reversed/mirror key is needed. Comparison is numeric per-field (the "10 < 2" hazard).
 */

/** A flat serialization of a symbol under its current labeling. */
export type Serialization = number[];

/** Lexicographic NUMERIC comparison of two int arrays (NOT digit-string order). */
export function compareInts(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

export class DSymbol {
  readonly n: number;
  /** s[0], s[1], s[2] as involutions: chamber -> chamber, length n. */
  readonly s: readonly [readonly number[], readonly number[], readonly number[]];
  readonly m01: readonly number[];
  readonly m12: readonly number[];
  private _canonical?: Serialization;

  constructor(
    s0: readonly number[],
    s1: readonly number[],
    s2: readonly number[],
    m01: readonly number[],
    m12: readonly number[],
  ) {
    const n = s0.length;
    if (s1.length !== n || s2.length !== n || m01.length !== n || m12.length !== n) {
      throw new Error('DSymbol: all of s0,s1,s2,m01,m12 must have the same length');
    }
    this.n = n;
    this.s = [Object.freeze(s0.slice()), Object.freeze(s1.slice()), Object.freeze(s2.slice())];
    this.m01 = Object.freeze(m01.slice());
    this.m12 = Object.freeze(m12.slice());
    Object.freeze(this.s);
    // NB: the instance itself is intentionally NOT frozen — canonicalForm() memoizes
    // into _canonical. The data arrays above are frozen, so the symbol is immutable.
  }

  sigma(i: 0 | 1 | 2, c: number): number {
    return this.s[i][c];
  }

  /** m_ij(c) for {i,j} in {{0,1},{1,2},{0,2}}; m02 ≡ 2. */
  m(i: number, j: number, c: number): number {
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    if (lo === 0 && hi === 1) return this.m01[c];
    if (lo === 1 && hi === 2) return this.m12[c];
    if (lo === 0 && hi === 2) return 2;
    throw new Error(`bad index pair ${i},${j}`);
  }

  /** Flat serialization under the CURRENT labeling: [n, s0…, s1…, s2…, m01…, m12…]. */
  serialize(): Serialization {
    return [this.n, ...this.s[0], ...this.s[1], ...this.s[2], ...this.m01, ...this.m12];
  }

  /** DF Algorithm 8: lexicographically smallest index-priority relabeling. */
  canonicalForm(): Serialization {
    if (this._canonical) return this._canonical;
    let best: Serialization | null = null;
    for (let seed = 0; seed < this.n; seed++) {
      const t = relabelFromSeed(this, seed);
      if (t === null) continue;
      if (best === null || compareInts(t, best) < 0) best = t;
    }
    if (best === null) throw new Error('canonicalForm: symbol is disconnected/empty');
    this._canonical = best;
    return best;
  }

  /** Isomorphism key (string of the canonical form). Equal keys ⇔ isomorphic symbols. */
  canonicalKey(): string {
    return this.canonicalForm().join(',');
  }

  /** Rename chambers by a bijection perm (old -> new) of 0..n-1; returns a new DSymbol. */
  relabel(perm: readonly number[]): DSymbol {
    const n = this.n;
    const seen = new Array(n).fill(false);
    if (perm.length !== n) throw new Error('relabel: perm must be a bijection of 0..n-1');
    for (const v of perm) {
      if (v < 0 || v >= n || seen[v]) throw new Error('relabel: perm must be a bijection of 0..n-1');
      seen[v] = true;
    }
    const map = (old: readonly number[]) => {
      const out = new Array(n);
      for (let c = 0; c < n; c++) out[perm[c]] = perm[old[c]];
      return out;
    };
    const mval = (old: readonly number[]) => {
      const out = new Array(n);
      for (let c = 0; c < n; c++) out[perm[c]] = old[c];
      return out;
    };
    return new DSymbol(map(this.s[0]), map(this.s[1]), map(this.s[2]), mval(this.m01), mval(this.m12));
  }

  /** Inverse of serialize(): build a DSymbol from a [n, s0…, s1…, s2…, m01…, m12…] tuple. */
  static fromSerialization(t: readonly number[]): DSymbol {
    const n = t[0];
    const slice = (k: number) => t.slice(1 + k * n, 1 + (k + 1) * n);
    return new DSymbol(slice(0), slice(1), slice(2), slice(3), slice(4));
  }
}

/** Index-priority BFS relabel from `seed` (apply order s0,s1,s2). null if disconnected. */
function relabelFromSeed(sym: DSymbol, seed: number): Serialization | null {
  const n = sym.n;
  const newOf = new Array<number>(n).fill(-1);
  const oldOf: number[] = [seed];
  newOf[seed] = 0;
  let head = 0;
  while (head < oldOf.length) {
    const oldC = oldOf[head++];
    for (let idx = 0 as 0 | 1 | 2; idx < 3; idx = (idx + 1) as 0 | 1 | 2) {
      const nb = sym.s[idx][oldC];
      if (newOf[nb] === -1) {
        newOf[nb] = oldOf.length;
        oldOf.push(nb);
      }
    }
  }
  if (oldOf.length !== n) return null; // disconnected
  const s0 = new Array(n);
  const s1 = new Array(n);
  const s2 = new Array(n);
  const mm01 = new Array(n);
  const mm12 = new Array(n);
  for (let lab = 0; lab < n; lab++) {
    const oldC = oldOf[lab];
    s0[lab] = newOf[sym.s[0][oldC]];
    s1[lab] = newOf[sym.s[1][oldC]];
    s2[lab] = newOf[sym.s[2][oldC]];
    mm01[lab] = sym.m01[oldC];
    mm12[lab] = sym.m12[oldC];
  }
  return [n, ...s0, ...s1, ...s2, ...mm01, ...mm12];
}

// ---------------------------------------------------------------------------
// Orbits / cycles
// ---------------------------------------------------------------------------

/** Orbits of <s_i, s_j> on the chambers, each sorted, list ordered by min member. */
export function components(sym: DSymbol, i: 0 | 1 | 2, j: 0 | 1 | 2): number[][] {
  const seen = new Array(sym.n).fill(false);
  const orbits: number[][] = [];
  for (let start = 0; start < sym.n; start++) {
    if (seen[start]) continue;
    const orbit: number[] = [];
    const stack = [start];
    while (stack.length) {
      const c = stack.pop()!;
      if (seen[c]) continue;
      seen[c] = true;
      orbit.push(c);
      stack.push(sym.s[i][c], sym.s[j][c]);
    }
    orbit.sort((a, b) => a - b);
    orbits.push(orbit);
  }
  orbits.sort((a, b) => a[0] - b[0]);
  return orbits;
}

export const tileOrbits = (sym: DSymbol) => components(sym, 0, 1);
export const vertexOrbits = (sym: DSymbol) => components(sym, 1, 2);
export const edgeOrbits = (sym: DSymbol) => components(sym, 0, 2);
export const kUniformity = (sym: DSymbol) => vertexOrbits(sym).length;

/** r_ij(c): smallest r>0 with (s_i s_j)^r (c) === c. */
export function cycleLengthIJ(sym: DSymbol, i: 0 | 1 | 2, j: 0 | 1 | 2, c: number): number {
  let r = 0;
  let x = c;
  const cap = 4 * sym.n + 4;
  for (;;) {
    x = sym.s[i][sym.s[j][x]];
    r += 1;
    if (x === c) return r;
    if (r > cap) throw new Error('cycle did not close (invalid involutions?)');
  }
}

// ---------------------------------------------------------------------------
// Axiom validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  reason: string;
}

export function validate(sym: DSymbol): ValidationResult {
  const n = sym.n;
  const inRange = (v: number) => v >= 0 && v < n;
  const names: Array<[0 | 1 | 2, string]> = [
    [0, 's0'],
    [1, 's1'],
    [2, 's2'],
  ];

  // values in range
  for (const [idx, name] of names) {
    for (let c = 0; c < n; c++) {
      if (!inRange(sym.s[idx][c])) return { ok: false, reason: `${name}(${c}) out of range` };
    }
  }

  // DS1 involutions (fixed points allowed)
  for (const [idx, name] of names) {
    const s = sym.s[idx];
    for (let c = 0; c < n; c++) {
      if (s[s[c]] !== c) return { ok: false, reason: `DS1: ${name} is not an involution at ${c}` };
    }
  }

  // DS2 s0,s2 commute
  for (let c = 0; c < n; c++) {
    if (sym.s[0][sym.s[2][c]] !== sym.s[2][sym.s[0][c]]) {
      return { ok: false, reason: `DS2: s0,s2 do not commute at ${c}` };
    }
  }

  // DS0 connectivity
  const seen = new Array(n).fill(false);
  const stack = [0];
  let reached = 0;
  while (stack.length) {
    const c = stack.pop()!;
    if (seen[c]) continue;
    seen[c] = true;
    reached += 1;
    stack.push(sym.s[0][c], sym.s[1][c], sym.s[2][c]);
  }
  if (reached !== n) return { ok: false, reason: `DS0: not connected (reached ${reached} of ${n})` };

  // DS3 m-constancy
  for (const orbit of components(sym, 0, 1)) {
    const v = sym.m01[orbit[0]];
    if (orbit.some((c) => sym.m01[c] !== v)) {
      return { ok: false, reason: 'DS3: m01 not constant on a {0,1}-orbit' };
    }
  }
  for (const orbit of components(sym, 1, 2)) {
    const v = sym.m12[orbit[0]];
    if (orbit.some((c) => sym.m12[c] !== v)) {
      return { ok: false, reason: 'DS3: m12 not constant on a {1,2}-orbit' };
    }
  }

  // DS4 divisibility
  for (let c = 0; c < n; c++) {
    const r01 = cycleLengthIJ(sym, 0, 1, c);
    const a = sym.m01[c];
    if (!Number.isInteger(a) || a <= 0) return { ok: false, reason: `DS4: m01(${c}) not a positive int` };
    if (a % r01 !== 0) return { ok: false, reason: `DS4: m01(${c})=${a} not a multiple of r01=${r01}` };
    const r12 = cycleLengthIJ(sym, 1, 2, c);
    const b = sym.m12[c];
    if (!Number.isInteger(b) || b <= 0) return { ok: false, reason: `DS4: m12(${c}) not a positive int` };
    if (b % r12 !== 0) return { ok: false, reason: `DS4: m12(${c})=${b} not a multiple of r12=${r12}` };
    const r02 = cycleLengthIJ(sym, 0, 2, c);
    if (2 % r02 !== 0) return { ok: false, reason: `DS4: m02=2 not a multiple of r02=${r02}` };
  }

  return { ok: true, reason: '' };
}

// ---------------------------------------------------------------------------
// Curvature (exact rational via bigint) — per-component flatness is the filter
// ---------------------------------------------------------------------------

function gcdBig(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Sum of chamber curvatures (1/m01 + 1/m12 − 1/2) over `chambers`, as a reduced fraction. */
function curvatureSum(sym: DSymbol, chambers: Iterable<number>): { num: bigint; den: bigint } {
  let num = 0n;
  let den = 1n;
  const addFrac = (pn: bigint, pd: bigint) => {
    num = num * pd + pn * den;
    den = den * pd;
    const g = gcdBig(num, den) || 1n;
    num /= g;
    den /= g;
  };
  for (const c of chambers) {
    addFrac(1n, BigInt(sym.m01[c]));
    addFrac(1n, BigInt(sym.m12[c]));
    addFrac(-1n, 2n);
  }
  return { num, den };
}

const allChambers = (sym: DSymbol) => Array.from({ length: sym.n }, (_, c) => c);

/** Global topological flatness K === 0 (necessary, NOT sufficient — mixed-sign ghosts). */
export function isEuclidean(sym: DSymbol): boolean {
  return curvatureSum(sym, allChambers(sym)).num === 0n;
}

/** Every {1,2}-component's curvature sub-sum === 0 (per-vertex 360° closure). Strictly stronger. */
export function perComponentFlat(sym: DSymbol): boolean {
  for (const orbit of vertexOrbits(sym)) {
    if (curvatureSum(sym, orbit).num !== 0n) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Minimal image (DF Algorithm 10) — coarsest label-respecting congruence quotient
// ---------------------------------------------------------------------------

/**
 * The unique maximal-symmetry representative: quotient by the coarsest partition with
 * a~b ⇒ (m01,m12) equal AND s_i(a)~s_i(b). Purely combinatorial (no metric development).
 * kUniformity(minimalImage(sym)) is the GENUINE k (the fake-2-uniform-square trap).
 */
export function minimalImage(sym: DSymbol): DSymbol {
  const n = sym.n;
  let block: string[] = Array.from({ length: n }, (_, c) => `${sym.m01[c]},${sym.m12[c]}`);
  let prev = new Set(block).size;
  for (;;) {
    const sig: string[] = new Array(n);
    for (let c = 0; c < n; c++) {
      sig[c] = `${block[c]}|${block[sym.s[0][c]]}|${block[sym.s[1][c]]}|${block[sym.s[2][c]]}`;
    }
    block = sig;
    const cnt = new Set(block).size;
    if (cnt === prev) break;
    prev = cnt;
  }
  // assign ids in first-appearance order; rep = first chamber of each block
  const ids = new Map<string, number>();
  const rep: number[] = [];
  for (let c = 0; c < n; c++) {
    if (!ids.has(block[c])) {
      ids.set(block[c], rep.length);
      rep.push(c);
    }
  }
  const K = ids.size;
  const s0 = new Array(K);
  const s1 = new Array(K);
  const s2 = new Array(K);
  const m01 = new Array(K);
  const m12 = new Array(K);
  for (let b = 0; b < K; b++) {
    const c = rep[b];
    s0[b] = ids.get(block[sym.s[0][c]])!;
    s1[b] = ids.get(block[sym.s[1][c]])!;
    s2[b] = ids.get(block[sym.s[2][c]])!;
    m01[b] = sym.m01[c];
    m12[b] = sym.m12[c];
  }
  return new DSymbol(s0, s1, s2, m01, m12);
}
