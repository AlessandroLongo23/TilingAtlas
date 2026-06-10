/**
 * Delaney–Dress realizer (M2) — Lemma R (thesis lem:ddrealizer; TA note
 * resources/research/delaney-dress-B22-realizability-proof-2026-06-10.md §4). Pure, fs-free.
 *
 * On any finite symbol over the regular alphabet this module either
 *   REJECTs with a named obstruction — a specific {1,2}-component whose developed angle
 *   sum ≠ 2, decided in exact rational arithmetic (step 1) — or
 *   produces a PeriodCell: exact ℚ(ζ_N) coordinates of a fundamental patch + an exact basis
 *   of the translation lattice Λ (steps 2–6). The corona certificate (lem:corona) is run by
 *   the caller via PeriodSolver.certifyExternalCell — its soundness is independent of B2.2,
 *   so an ACCEPT is a verified tiling even in isolation.
 *
 * The period is COMPUTED from the finite group data (holonomy generators → Schreier
 * generators of ker(π₁→G₀) → exact HNF), never searched for geometrically; every loop is
 * bounded by a step count, never a Euclidean length (NOTES §12.5 doctrine).
 *
 * ⚑ Field-closure rider (binding, B22-note §4 step 3): the octagon's circumradius
 * ½csc(π/8) ∉ ℚ(ζ₂₄), so the development is implemented COORDINATE-WISE — reflections as
 * z ↦ a + ζ^k·conj(z−a) with ζ^k found by exact division-free search (d² = |d|²·ζ^k), and
 * out-of-field lengths never appear as scalars. Any failed ζ-search throws LOUD
 * (FieldClosureError): a naive r·e^{iθ} development cannot be written against this API.
 */
import { Cyclotomic, type CyclotomicRing } from '../../Cyclotomic';
import type { Polygon } from '../../polygons/Polygon';
import { RegularPolygon } from '../../polygons/RegularPolygon';
import type { PeriodCell } from '../PeriodSolver';
import { DSymbol, vertexOrbits, cycleLengthIJ } from './DSymbol';

// ---------------------------------------------------------------------------
// Step 1 — the angle gate (pure rational; REJECT names its component)
// ---------------------------------------------------------------------------

export type AngleGateResult =
  | { flat: true }
  | {
      flat: false;
      /** chambers of the offending {1,2}-component (sorted) */
      component: number[];
      /** developed angle sum Σ(1−2/p_j) as an exact fraction (must equal 2) */
      sumNum: bigint;
      sumDen: bigint;
      /** the developed corner face sequence (p_1..p_q), q = m12 */
      faces: number[];
    };

function gcdBig(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Developed corner face sequence of a {1,2}-component: the (s1 s2)-walk unrolled v12
 *  times (cycle) / mirror-unfolded (chain). q = m12 faces. Walk of the chamber pair
 *  (c, s1 c) per corner; next corner via s2 — at a mirror end the walk bounces, which is
 *  exactly the mirror-unfolding of the developed figure. */
export function developedFaces(sym: DSymbol, startChamber: number): number[] {
  const q = sym.m12[startChamber];
  const faces: number[] = [];
  let c = startChamber;
  for (let step = 0; step < q; step++) {
    faces.push(sym.m01[c]);
    // cross to the corner's other chamber, then to the next corner across the shared edge
    c = sym.s[2][sym.s[1][c]];
  }
  return faces;
}

/** Lemma R step 1. Equivalent decision to perComponentFlat (B2.5) but REJECT names the
 *  component and reports the developed angle sum Σ(1−2/p_j) as an exact fraction. */
export function angleGate(sym: DSymbol): AngleGateResult {
  for (const orbit of vertexOrbits(sym)) {
    const faces = developedFaces(sym, orbit[0]);
    // Σ (1 − 2/p_j) over the developed figure, exact
    let num = 0n;
    let den = 1n;
    for (const p of faces) {
      const pb = BigInt(p);
      // add (p−2)/p
      num = num * pb + (pb - 2n) * den;
      den = den * pb;
      const g = gcdBig(num, den) || 1n;
      num /= g;
      den /= g;
    }
    if (num !== 2n * den) {
      return { flat: false, component: orbit, sumNum: num, sumDen: den, faces };
    }
  }
  return { flat: true };
}

// ---------------------------------------------------------------------------
// Exact planar isometries with linear parts in D_N (point group integer pairs)
// ---------------------------------------------------------------------------

/** z ↦ ζ^k·z + t (refl=0) or ζ^k·conj(z) + t (refl=1). k ∈ ℤ/N. */
interface Iso {
  refl: 0 | 1;
  k: number;
  t: Cyclotomic;
}

export class FieldClosureError extends Error {}

function applyIso(g: Iso, z: Cyclotomic): Cyclotomic {
  const w = g.refl ? z.conj() : z;
  return w.mulZeta(g.k).add(g.t);
}

function composeIso(g1: Iso, g2: Iso, N: number): Iso {
  const k = g1.refl ? (((g1.k - g2.k) % N) + N) % N : (g1.k + g2.k) % N;
  return { refl: (g1.refl ^ g2.refl) as 0 | 1, k, t: applyIso(g1, g2.t) };
}

function invertIso(g: Iso, N: number): Iso {
  if (g.refl === 0) {
    const k = (N - g.k) % N;
    return { refl: 0, k, t: g.t.neg().mulZeta(k) };
  }
  return { refl: 1, k: g.k, t: g.t.conj().mulZeta(g.k).neg() };
}

/** Find k with base·ζ^k == target (refl=0) or conj(base)·ζ^k == target (refl=1).
 *  Division-free; throws FieldClosureError if no root-of-unity ratio exists — the loud
 *  form of the ⚑ field-closure rider. */
function zetaSearch(base: Cyclotomic, target: Cyclotomic, refl: 0 | 1, N: number): number {
  const b = refl ? base.conj() : base;
  for (let k = 0; k < N; k++) {
    if (b.mulZeta(k).equals(target)) return k;
  }
  throw new FieldClosureError(
    `zetaSearch: no ζ^k with ${refl ? 'conj(base)' : 'base'}·ζ^k = target — development left D_N`,
  );
}

// ---------------------------------------------------------------------------
// Step 2 — exact development of a spanning tree (chamber placements)
// ---------------------------------------------------------------------------

/** A placed chamber: V (vertex), E (edge midpoint), F (tile centre), orientation parity. */
interface Placement {
  V: Cyclotomic;
  E: Cyclotomic;
  F: Cyclotomic;
  /** reflection parity of the developing map on this chamber (seed = 0) */
  or: 0 | 1;
}

/** ½·cot(π/p) exact, for p ∈ {3,4,6,8,12} (all in ℚ(ζ₂₄)⁺ — B2.0/B2.4). */
function apothem(ring: CyclotomicRing, p: number): Cyclotomic {
  const z = (k: number) => Cyclotomic.zeta(ring, ((k % ring.N) + ring.N) % ring.N);
  const half = (c: Cyclotomic) => c.scaleRational(1n, 2n);
  const N = ring.N;
  // 2cos(2π·j/N): for N=24, sqrt3 = z(2)+z(−2), sqrt2 = z(3)+z(−3)
  const sqrt3 = z(2).add(z(N - 2));
  const sqrt2 = z(3).add(z(N - 3));
  const one = Cyclotomic.ONE(ring);
  switch (p) {
    case 3:
      return sqrt3.scaleRational(1n, 6n); // 1/(2√3) = √3/6
    case 4:
      return half(one);
    case 6:
      return half(sqrt3);
    case 8:
      return half(one.add(sqrt2)); // (1+√2)/2
    case 12:
      return half(one.add(one).add(sqrt3)); // (2+√3)/2
    default:
      throw new Error(`apothem: unsupported tile degree p=${p}`);
  }
}

/** Reflect z across the line through a,b: z ↦ a + ζ^k·conj(z−a), k by exact search on
 *  d² = |d|²·ζ^k (the wall directions of the regular barycentric complex always satisfy
 *  this — proof: B22 note §4 step 3; violation throws FieldClosureError). */
function reflectAcross(z: Cyclotomic, a: Cyclotomic, b: Cyclotomic, N: number): Cyclotomic {
  const d = b.sub(a);
  const k = zetaSearch(d.normSquared(), d.mul(d), 0, N);
  return a.add(z.sub(a).conj().mulZeta(k));
}

/** Develop across wall i of a placed chamber: the placement of s_i-neighbour with tile
 *  degree pD (= same p for i=0,1; m01(s2 C) for i=2). Corner-type-preserving: corners
 *  j ≠ i are shared; corner i is rebuilt on the other side. */
function developStep(pl: Placement, i: 0 | 1 | 2, pC: number, pD: number, ring: CyclotomicRing): Placement {
  const N = ring.N;
  const or = (1 - pl.or) as 0 | 1;
  if (i === 0) {
    // wall 0 = E–F (apothem line ⊥ edge at E): reflection of V is the other edge endpoint
    return { V: pl.E.add(pl.E.sub(pl.V)), E: pl.E, F: pl.F, or };
  }
  if (i === 1) {
    // wall 1 = V–F (circumradius): reflect E
    return { V: pl.V, E: reflectAcross(pl.E, pl.V, pl.F, N), F: pl.F, or };
  }
  // wall 2 = V–E (half-edge): the neighbour tile has its own degree pD; its centre sits at
  // apothem(pD) from E on the OTHER side of the edge. e = unit edge direction (exact root
  // of unity by induction from the seed), n = i·e the edge normal.
  const e = pl.E.sub(pl.V).scaleRational(2n, 1n);
  const nrm = e.mulZeta(N / 4); // i·e  (N divisible by 4)
  const offC = pl.F.sub(pl.E);
  const aC = apothem(ring, pC);
  const aD = apothem(ring, pD);
  let Fnew: Cyclotomic;
  if (offC.equals(aC.mul(nrm))) {
    Fnew = pl.E.sub(aD.mul(nrm));
  } else if (offC.equals(aC.mul(nrm).neg())) {
    Fnew = pl.E.add(aD.mul(nrm));
  } else {
    throw new FieldClosureError('developStep(s2): centre offset is not ±apothem·(i·e) — placement corrupt');
  }
  return { V: pl.V, E: pl.E, F: Fnew, or };
}

// ---------------------------------------------------------------------------
// Steps 3–5 — holonomy generators, point group, Schreier, exact HNF basis of Λ
// ---------------------------------------------------------------------------

/** The isometry g with g(base corners) = target corners (same chamber shape). */
function isoBetween(base: Placement, target: Placement, N: number): Iso {
  const refl = (base.or ^ target.or) as 0 | 1;
  const k = zetaSearch(base.E.sub(base.V), target.E.sub(target.V), refl, N);
  const lin = (z: Cyclotomic) => (refl ? z.conj() : z).mulZeta(k);
  const t = target.V.sub(lin(base.V));
  const g: Iso = { refl, k, t };
  if (!applyIso(g, base.E).equals(target.E) || !applyIso(g, base.F).equals(target.F)) {
    throw new Error('isoBetween: corner correspondence failed (shape mismatch?)');
  }
  return g;
}

/** Rational 8-vector with a shared denominator (the coefficient space of ℚ(ζ_N)). */
interface QVec {
  num: bigint[];
  den: bigint;
}

const qvecOf = (z: Cyclotomic): QVec => ({ num: z.num.slice(), den: z.den });

function floorDiv(p: bigint, q: bigint): bigint {
  // exact floor of p/q for q > 0
  if (q < 0n) {
    p = -p;
    q = -q;
  }
  let d = p / q;
  if (p % q !== 0n && p < 0n) d -= 1n;
  return d;
}

/** Hermite-form ℤ-basis (unimodular row ops ONLY — the span is preserved exactly).
 *  Returns the nonzero rows, echelonized with positive pivots and reduced above. */
export function hnfRows(rows: bigint[][]): bigint[][] {
  const m = rows.map((r) => r.slice());
  const cols = m[0]?.length ?? 0;
  let r0 = 0;
  for (let c = 0; c < cols && r0 < m.length; c++) {
    // gcd-eliminate column c below/at r0
    for (;;) {
      let piv = -1;
      for (let r = r0; r < m.length; r++) {
        if (m[r][c] !== 0n && (piv === -1 || bigAbsLt(m[r][c], m[piv][c]))) piv = r;
      }
      if (piv === -1) break;
      [m[r0], m[piv]] = [m[piv], m[r0]];
      let again = false;
      for (let r = r0 + 1; r < m.length; r++) {
        if (m[r][c] === 0n) continue;
        const qq = floorDiv(m[r][c], m[r0][c]);
        for (let j = 0; j < cols; j++) m[r][j] -= qq * m[r0][j];
        if (m[r][c] !== 0n) again = true;
      }
      if (!again) break;
    }
    if (m[r0][c] !== 0n) {
      if (m[r0][c] < 0n) for (let j = 0; j < cols; j++) m[r0][j] = -m[r0][j];
      // reduce rows ABOVE the pivot (canonical HNF)
      for (let r = 0; r < r0; r++) {
        const qq = floorDiv(m[r][c], m[r0][c]);
        if (qq !== 0n) for (let j = 0; j < cols; j++) m[r][j] -= qq * m[r0][j];
      }
      r0 += 1;
    }
  }
  return m.slice(0, r0);
}

function bigAbsLt(a: bigint, b: bigint): boolean {
  const aa = a < 0n ? -a : a;
  const bb = b < 0n ? -b : b;
  return aa < bb;
}

/** Canonical coset representative of z modulo the lattice spanned by the HNF rows H
 *  (rows live in (1/dB)·ℤ^φ — pass dB so y = dB·z is reduced in integer-row space).
 *  Pure rational arithmetic; the reduced vector is a unique coset key. */
function cosetKey(z: Cyclotomic, H: bigint[][], pivots: number[], dB: bigint): string {
  // y = dB·z as a QVec
  let num = z.num.map((c) => c * dB);
  let den = z.den;
  for (let r = 0; r < H.length; r++) {
    const j = pivots[r];
    // a = floor( (num[j]/den) / H[r][j] )
    const a = floorDiv(num[j], den * H[r][j]);
    if (a !== 0n) {
      num = num.map((c, idx) => c - a * den * H[r][idx]);
    }
  }
  // canonicalize the fraction (gcd-reduce with den)
  let g = den < 0n ? -den : den;
  for (const c of num) g = gcdBig(g, c);
  if (g === 0n) g = 1n;
  return `${num.map((c) => (c / g).toString()).join(',')}/${(den / g).toString()}`;
}

// ---------------------------------------------------------------------------
// The realizer — Lemma R steps 2–6 (step 1 = angleGate; corona run by the caller)
// ---------------------------------------------------------------------------

export interface RealizeResult {
  cell: PeriodCell;
  /** |G₀| — order of the point group (≤ 2N) */
  pointGroupOrder: number;
  /** chambers in the Λ-quotient — must equal δ·|G₀| (asserted) */
  chamberCount: number;
  /** holonomy generator count (non-tree edges + mirror walls) */
  generatorCount: number;
}

/**
 * Realize a flat symbol to a PeriodCell (fundamental patch + exact Λ basis). Throws on any
 * invariant violation (rank ≠ 2, chamber-count mismatch, field-closure) — by lem:ddrealize
 * none can fire on a flat symbol, so a throw means a bug, never a silent wrong answer.
 * Callers must run the angle gate first (this function asserts flatness).
 */
export function realizeSymbol(sym: DSymbol, ring: CyclotomicRing): RealizeResult {
  const N = ring.N;
  const n = sym.n;
  const gate = angleGate(sym);
  if (!gate.flat) throw new Error('realizeSymbol: symbol is not flat (run angleGate first)');
  for (const p of sym.m01) {
    if (N % p !== 0) throw new Error(`realizeSymbol: tile degree ${p} incompatible with N=${N}`);
  }

  // --- step 2: develop a spanning tree of the Delaney graph -----------------
  const placements: (Placement | null)[] = new Array(n).fill(null);
  const p0 = sym.m01[0];
  const half = Cyclotomic.fromRational(ring, 1n, 2n);
  placements[0] = {
    V: Cyclotomic.ZERO(ring),
    E: half,
    F: half.add(apothem(ring, p0).mulZeta(N / 4)), // E + i·apothem(p)
    or: 0,
  };
  const treeOrder: number[] = [0];
  const nonTreeEdges: Array<[number, 0 | 1 | 2]> = []; // (C,i) with s_i C ≠ C, not in tree, deduped
  const mirrorWalls: Array<[number, 0 | 1 | 2]> = []; // (C,i) with s_i C = C
  {
    const inTree = new Array<boolean>(n).fill(false);
    inTree[0] = true;
    const seenEdge = new Set<string>();
    let head = 0;
    while (head < treeOrder.length) {
      const c = treeOrder[head++];
      for (const i of [0, 1, 2] as const) {
        const d = sym.s[i][c];
        if (d === c) {
          mirrorWalls.push([c, i]);
          continue;
        }
        const ekey = `${Math.min(c, d)}:${i}:${Math.max(c, d)}`;
        if (seenEdge.has(ekey)) continue;
        seenEdge.add(ekey);
        if (!inTree[d]) {
          inTree[d] = true;
          placements[d] = developStep(placements[c]!, i, sym.m01[c], sym.m01[d], ring);
          treeOrder.push(d);
        } else {
          nonTreeEdges.push([c, i]);
        }
      }
    }
    if (treeOrder.length !== n) throw new Error('realizeSymbol: symbol not connected');
  }

  // --- step 3: holonomy generators (non-tree edges + mirror walls) ----------
  const gens: Iso[] = [];
  for (const [c, i] of nonTreeEdges) {
    const d = sym.s[i][c];
    const target = developStep(placements[c]!, i, sym.m01[c], sym.m01[d], ring);
    gens.push(isoBetween(placements[d]!, target, N));
  }
  for (const [c, i] of mirrorWalls) {
    // reflection across the developed wall i of chamber c (wall i = the side opposite corner i)
    const pl = placements[c]!;
    const [a, b] = i === 0 ? [pl.E, pl.F] : i === 1 ? [pl.V, pl.F] : [pl.V, pl.E];
    const dd = b.sub(a);
    const k = zetaSearch(dd.normSquared(), dd.mul(dd), 0, N);
    // z ↦ a + ζ^k conj(z−a) = (a − ζ^k conj a) + ζ^k conj z
    gens.push({ refl: 1, k, t: a.sub(a.conj().mulZeta(k)) });
  }
  // include inverses (Schreier needs a symmetric generating set)
  const gensSym = gens.concat(gens.map((g) => invertIso(g, N)));

  // --- step 4: point group G₀ (finite a priori — integer pairs) + transversal,
  //             then Schreier generators of K = ker(linear part) = Λ ------------
  const linKey = (g: Iso) => `${g.refl}:${g.k}`;
  const transversal = new Map<string, Iso>();
  const idIso: Iso = { refl: 0, k: 0, t: Cyclotomic.ZERO(ring) };
  transversal.set(linKey(idIso), idIso);
  {
    const queue: Iso[] = [idIso];
    while (queue.length) {
      const g = queue.shift()!;
      for (const s of gensSym) {
        const h = composeIso(s, g, N);
        const key = linKey(h);
        if (!transversal.has(key)) {
          transversal.set(key, h);
          queue.push(h);
        }
      }
      if (transversal.size > 2 * N) throw new Error('realizeSymbol: point group exceeded |D_N| — impossible');
    }
  }
  const G0 = transversal.size;

  const lambdaGens: Cyclotomic[] = [];
  {
    const seen = new Set<string>();
    for (const tg of transversal.values()) {
      for (const s of gensSym) {
        const u = composeIso(s, tg, N);
        const rep = transversal.get(linKey(u))!;
        const w = composeIso(invertIso(rep, N), u, N);
        if (w.refl !== 0 || w.k !== 0) throw new Error('realizeSymbol: Schreier element is not a translation');
        if (w.t.isZero()) continue;
        const key = w.t.key();
        if (!seen.has(key)) {
          seen.add(key);
          lambdaGens.push(w.t);
        }
      }
    }
  }
  if (lambdaGens.length === 0) throw new Error('realizeSymbol: no translations found — Λ cannot be rank 2');

  // --- step 5: exact HNF basis of Λ ------------------------------------------
  // Integerize on a common denominator dB, HNF (unimodular ⇒ span preserved exactly).
  let dB = 1n;
  for (const v of lambdaGens) dB = (dB * v.den) / gcdBig(dB, v.den);
  const intRows = lambdaGens.map((v) => v.num.map((c) => c * (dB / v.den)));
  const H = hnfRows(intRows);
  if (H.length !== 2) {
    throw new Error(`realizeSymbol: Λ rank = ${H.length} ≠ 2 — violates lem:ddrealize on flat input`);
  }
  const pivots = H.map((row) => row.findIndex((c) => c !== 0n));
  let b1 = new Cyclotomic(ring, H[0], dB);
  let b2 = new Cyclotomic(ring, H[1], dB);

  // Geometric (Lagrange) reduction of the basis — float picks the integer quotients,
  // every update is an exact unimodular step, so Λ is unchanged; this only tames the
  // certificate's block size. Norm strictly decreases ⇒ terminates; capped LOUD.
  {
    const norm = (z: Cyclotomic) => {
      const v = z.toVector();
      return v.x * v.x + v.y * v.y;
    };
    for (let iter = 0; ; iter++) {
      if (iter > 100) throw new Error('realizeSymbol: basis reduction did not terminate');
      if (norm(b1) > norm(b2)) [b1, b2] = [b2, b1];
      const v1 = b1.toVector();
      const v2 = b2.toVector();
      const mu = Math.round((v1.x * v2.x + v1.y * v2.y) / (v1.x * v1.x + v1.y * v1.y));
      if (mu === 0) break;
      const cand = b2.sub(b1.scaleRational(BigInt(mu), 1n));
      if (norm(cand) >= norm(b2)) break; // float boundary (ratio ≈ ½): stop — basis is already reduced enough
      b2 = cand;
    }
  }

  // --- step 6: the Λ-quotient cell at the precomputed chamber count ----------
  // Develop ALL chambers modulo Λ; dedup key = (symbol element, V mod Λ, E−V, F−V).
  // The count is known a priori: δ·|G₀| (Γ acts freely on chambers; Γ/Λ ≅ G₀).
  const targetChambers = n * G0;
  const cap = 4 * targetChambers + 64;
  const visited = new Map<string, { c: number; pl: Placement }>();
  const startKey = (c: number, pl: Placement) =>
    `${c}|${cosetKey(pl.V, H, pivots, dB)}|${pl.E.sub(pl.V).key()}|${pl.F.sub(pl.V).key()}`;
  {
    const queue: Array<{ c: number; pl: Placement }> = [{ c: 0, pl: placements[0]! }];
    visited.set(startKey(0, placements[0]!), queue[0]);
    while (queue.length) {
      const { c, pl } = queue.shift()!;
      for (const i of [0, 1, 2] as const) {
        // NB: mirror walls (s_i c = c) are crossed too — T's barycentric complex has a real
        // chamber on the other side (the SYMBOL folds it, the tiling does not).
        const d = sym.s[i][c];
        const npl = developStep(pl, i, sym.m01[c], sym.m01[d], ring);
        const key = startKey(d, npl);
        if (!visited.has(key)) {
          visited.set(key, { c: d, pl: npl });
          queue.push({ c: d, pl: npl });
          if (visited.size > cap) {
            throw new Error(
              `realizeSymbol: chamber BFS exceeded ${cap} (target δ·|G₀| = ${targetChambers}) — invariant violated`,
            );
          }
        }
      }
    }
  }
  if (visited.size !== targetChambers) {
    throw new Error(
      `realizeSymbol: Λ-quotient has ${visited.size} chambers, expected δ·|G₀| = ${n}·${G0} = ${targetChambers}`,
    );
  }

  // Tiles = {0,1}-stars: one per distinct centre coset. A single chamber determines its
  // whole tile exactly (vertices = V rotated around F by ζ^{N/p}).
  const tiles = new Map<string, { p: number; V: Cyclotomic; F: Cyclotomic }>();
  for (const { c, pl } of visited.values()) {
    const tkey = cosetKey(pl.F, H, pivots, dB);
    if (!tiles.has(tkey)) tiles.set(tkey, { p: sym.m01[c], V: pl.V, F: pl.F });
  }

  const cellPolygons: Polygon[] = [];
  for (const { p, V, F } of tiles.values()) {
    // geometric reduction of the tile near the origin (float picks integers, exact shift)
    const fv = F.toVector();
    const u1 = b1.toVector();
    const u2 = b2.toVector();
    const det = u1.x * u2.y - u1.y * u2.x;
    const al = Math.round((fv.x * u2.y - fv.y * u2.x) / det);
    const be = Math.round((u1.x * fv.y - u1.y * fv.x) / det);
    const shift = b1.scaleRational(BigInt(-al), 1n).add(b2.scaleRational(BigInt(-be), 1n));
    const Fr = F.add(shift);
    const Vr = V.add(shift);
    // vertices CCW by exact rotation around the centre
    const turn = N / p;
    const verts: Cyclotomic[] = [Vr];
    for (let j = 1; j < p; j++) verts.push(Fr.add(verts[j - 1].sub(Fr).mulZeta(turn)));
    // deterministic anchor = lexicographically smallest vertex key
    let a0 = 0;
    for (let j = 1; j < p; j++) if (verts[j].key() < verts[a0].key()) a0 = j;
    const eDir = verts[(a0 + 1) % p].sub(verts[a0]);
    const dIdx = ring.expFromZetaKey(eDir.key());
    if (dIdx === undefined) {
      throw new FieldClosureError('realizeSymbol: tile edge direction is not a root of unity');
    }
    const poly = RegularPolygon.fromAnchorAndDirExact(p, verts[a0], dIdx);
    // consistency assert: the reconstruction must reproduce the rotated vertex set exactly
    const mine = new Set(verts.map((v) => v.key()));
    for (const w of poly.exactVertices!) {
      if (!mine.has(w.key())) throw new Error('realizeSymbol: fromAnchorAndDirExact vertex mismatch');
    }
    cellPolygons.push(poly);
  }

  return {
    cell: { cellPolygons, basisExact: [b1, b2] },
    pointGroupOrder: G0,
    chamberCount: visited.size,
    generatorCount: gens.length,
  };
}

// ---------------------------------------------------------------------------
// The allowed-VC alphabet for the corona certificate (definitional, exact)
// ---------------------------------------------------------------------------

/**
 * All angle-valid regular vertex configurations over P, as canonical VC names — the
 * `allowed` alphabet for `PeriodSolver.certifyExternalCell`. Exact integer angle units
 * (a regular p-corner covers N(p−2)/(2p) units); Σ = N. Definitional: every vertex of a
 * unit-edge regular tiling with faces in P is one of these, so the alphabet never
 * over-rejects (completeness-knob discipline).
 */
export function allowedVCNames(P: number[], N: number, canonical: (toks: string[]) => string): Set<string> {
  const units = (p: number) => (N * (p - 2)) / (2 * p);
  for (const p of P) {
    if (!Number.isInteger(units(p))) throw new Error(`allowedVCNames: N=${N} does not resolve p=${p}`);
  }
  const out = new Set<string>();
  const seq: number[] = [];
  const rec = (left: number) => {
    if (left === 0) {
      if (seq.length >= 3) out.add(canonical(seq.map(String)));
      return;
    }
    for (const p of P) {
      const u = units(p);
      if (u > left) continue;
      seq.push(p);
      rec(left - u);
      seq.pop();
    }
  };
  rec(N);
  return out;
}
