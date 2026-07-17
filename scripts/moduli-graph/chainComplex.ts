// Cellular chain complex C2 →∂2 C1 →∂1 C0 over a CW complex, and its rational homology.
// Betti numbers come from exact integer matrix ranks (computed mod two large primes and cross-checked);
// rank over ℚ equals rank over 𝔽_p for all but finitely many p, so agreement of two primes is decisive.
//
// The Betti formula is valid only for a genuine chain complex — ∂1∘∂2 = 0, i.e. every face boundary is a
// closed cycle. χ = V−E+F ALWAYS equals b0−b1+b2 algebraically (it is an identity, not a check), so it
// cannot detect a malformed boundary. `homology` therefore VALIDATES ∂1∘∂2 = 0 up front and throws on a
// non-cycle face — that (not a χ tautology) is the real guardrail against a mis-stitched boundary.

export interface FaceEdge { edge: number; sign: 1 | -1 }
export interface CellComplex {
  nodes: string[];
  edges: [number, number][];     // [fromNodeIdx, toNodeIdx]; ∂1(e) = to − from
  faces: FaceEdge[][];           // each face: ordered signed boundary edges; ∂2(f) = Σ sign·edge
}
export interface Homology {
  V: number; E: number; F: number;
  chi: number;
  betti: [number, number, number];
}

// Two primes with p² < 2⁵³ so products stay exact in double precision (a 31-bit prime would overflow
// Number.MAX_SAFE_INTEGER in `f * m[rank][c]`). Entries are −1/0/1 and matrices are small, so p ~ 10⁶
// makes a false-low rank (a nonzero ℚ-minor divisible by p) astronomically unlikely, and the two-prime
// cross-check catches it if it ever happens.
const PRIMES = [1000003, 999983];

/** Exact rank of an integer matrix (rows × cols) modulo p, via Gaussian elimination. */
function rankModP(rows: number[][], cols: number, p: number): number {
  if (rows.length === 0 || cols === 0) return 0;
  const m = rows.map((r) => r.map((x) => ((x % p) + p) % p));
  let rank = 0;
  for (let col = 0; col < cols && rank < m.length; col++) {
    let piv = -1;
    for (let r = rank; r < m.length; r++) if (m[r][col] % p !== 0) { piv = r; break; }
    if (piv === -1) continue;
    [m[rank], m[piv]] = [m[piv], m[rank]];
    const inv = modInv(m[rank][col], p);
    for (let r = 0; r < m.length; r++) {
      if (r === rank || m[r][col] === 0) continue;
      const f = (m[r][col] * inv) % p;
      if (f === 0) continue;
      for (let c = col; c < cols; c++) m[r][c] = (((m[r][c] - f * m[rank][c]) % p) + p) % p;
    }
    rank++;
  }
  return rank;
}

function modInv(a: number, p: number): number {
  let [old_r, r] = [((a % p) + p) % p, p];
  let [old_s, s] = [1, 0];
  while (r !== 0) { const q = Math.floor(old_r / r); [old_r, r] = [r, old_r - q * r]; [old_s, s] = [s, old_s - q * s]; }
  return ((old_s % p) + p) % p;
}

/** Exact rank over ℚ via two primes; throws if they disagree (a prime hit an invariant factor). */
function rankQ(rows: number[][], cols: number): number {
  const r0 = rankModP(rows, cols, PRIMES[0]);
  const r1 = rankModP(rows, cols, PRIMES[1]);
  if (r0 !== r1) throw new Error(`rank disagreement across primes (${r0} vs ${r1}) — retry with new primes`);
  return r0;
}

export function homology(cx: CellComplex): Homology {
  const V = cx.nodes.length, E = cx.edges.length, F = cx.faces.length;
  // Guard: edge endpoints in range (a bad index would otherwise corrupt ∂1 silently).
  cx.edges.forEach(([from, to], e) => {
    if (from < 0 || from >= V || to < 0 || to >= V) throw new Error(`edge ${e} references a node out of range [${from},${to}] (V=${V})`);
  });
  // Guard: ∂1∘∂2 = 0 — each face boundary is a closed cycle, i.e. its net node incidence is zero
  // (Σ sign at `to`, −sign at `from`, over the boundary edges). This is the condition the Betti formula
  // needs; a mis-stitched boundary (open path, duplicated/mis-signed edge) violates it and would give
  // silent wrong numbers. Throw, naming the face, exactly as rankQ throws on prime disagreement.
  cx.faces.forEach((face, f) => {
    const net = new Map<number, number>();
    for (const { edge, sign } of face) {
      const pair = cx.edges[edge];
      if (!pair) throw new Error(`face ${f} references a non-existent edge ${edge} (E=${E})`);
      const [from, to] = pair;
      net.set(to, (net.get(to) ?? 0) + sign);
      net.set(from, (net.get(from) ?? 0) - sign);
    }
    for (const [node, v] of net) if (v !== 0) throw new Error(`face ${f} boundary is not a closed cycle (∂1∂2 ≠ 0 at node ${node})`);
  });
  // ∂1 as V×E (rows = nodes): column e has −1 at from, +1 at to.
  const d1: number[][] = Array.from({ length: V }, () => new Array(E).fill(0));
  cx.edges.forEach(([from, to], e) => { d1[from][e] -= 1; d1[to][e] += 1; });
  // ∂2 as E×F (rows = edges): column f accumulates the signed boundary edges.
  const d2: number[][] = Array.from({ length: E }, () => new Array(F).fill(0));
  cx.faces.forEach((face, f) => { for (const { edge, sign } of face) d2[edge][f] += sign; });

  const r1 = rankQ(d1, E);
  const r2 = rankQ(d2, F);
  const b0 = V - r1;
  const b1 = (E - r1) - r2;
  const b2 = F - r2;
  if (b1 < 0 || b2 < 0) throw new Error(`negative Betti number (b=[${b0},${b1},${b2}]) — malformed complex`);
  return { V, E, F, chi: V - E + F, betti: [b0, b1, b2] };
}
