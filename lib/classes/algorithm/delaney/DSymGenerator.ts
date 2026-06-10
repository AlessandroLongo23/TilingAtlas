/**
 * Delaney–Dress generator (M1). Pure, fs-free.
 *
 * SOUNDNESS-CRITICAL base = a faithful port of the PUBLISHED canonical-augmentation
 * order for 2-D Delaney SETS (odf/julia-dsymbols, src/dsetGenerator.jl — Delgado-
 * Friedrichs / Read–Faradžev). We do NOT invent an order (FINDINGS §5): the D-set
 * enumeration visits each iso-class of connected 2-D D-set of size ≤ maxSize exactly
 * once, via firstUndefined → scan02Orbit (the DS2/m02=2 closure) → checkCanonicity.
 *
 * The regular-Euclidean LABEL layer is a definitional filter that matches the verified
 * oracle k2_minimal_fixed.py exactly: per {0,1}-orbit assign m01 ∈ P with r01 | m01;
 * per {1,2}-orbit assign m12 ∈ {3,4,5,6} with r12 | m12; keep iff validate() AND
 * perComponentFlat() (the exact per-vertex 360° closure — B2.5; the D-symbol axioms
 * already kill the ghost arrangements, FINDINGS §3, so no VC-alphabet coupling is
 * needed). Dedup by PLAIN canonical form (chirality auto-merges). Genuine k comes from
 * minimalImage (the §7 fake-2-uniform trap).
 *
 * Cross-check (the trust anchor): k=1/δ≤12 → 93 candidates → 11 minimal; k=2/δ≤12 →
 * 144 → 17; k=2/δ≤24 → 20. A drop = an unsound prune; the generation order is the
 * published one precisely so this cannot happen above δ=12.
 */
import { DSymbol, validate, perComponentFlat, minimalImage, kUniformity, compareInts } from './DSymbol';

const M12_RANGE = [3, 4, 5, 6]; // regular vertex degrees (3–6 tiles meet; >6 impossible for unit angles)

// ---------------------------------------------------------------------------
// PART 0 — vertex species (seed-anchoring support, 2026-06)
// ---------------------------------------------------------------------------

/**
 * Dihedral (rotation + reflection) canonical form of a cyclic int sequence:
 * the numeric-lex-min over all rotations of `seq` and of its reversal. This is
 * the right invariant for a vertex SPECIES — a 2-D Delaney symbol is unoriented,
 * so a species and its mirror are the same anchor class.
 */
export function dihedralCanonical(seq: readonly number[]): number[] {
  const n = seq.length;
  if (n === 0) return [];
  const rev = [...seq].reverse();
  let best: number[] | null = null;
  for (const base of [seq, rev]) {
    for (let r = 0; r < n; r++) {
      const rot = new Array<number>(n);
      for (let i = 0; i < n; i++) rot[i] = base[(r + i) % n];
      if (best === null || compareInts(rot, best) < 0) best = rot;
    }
  }
  return best!;
}

/** String key of the dihedral canonical form (species identity). */
export const dihedralKey = (seq: readonly number[]): string => dihedralCanonical(seq).join(',');

/**
 * UNFOLDED vertex species of the {1,2}-orbit containing chamber `c`: the cyclic
 * sequence of face sizes around the REPRESENTED VERTEX, i.e. m12(c) steps of the
 * walk x ↦ s2(s1(x)) collecting m01.
 *
 * Soundness of the unfolding (the folding caution): in the universal tiling the
 * 2m flags around a degree-m vertex form a 2m-cycle under alternating s1,s2; the
 * quotient projection π onto the symbol COMMUTES with every s_i and preserves m01.
 * Hence the projection of the cover walk (s2∘s1)^i IS the quotient walk, and the
 * true face sequence around the vertex is exactly [m01((s2∘s1)^i c)]_{i=0..m-1}.
 * A closed {1,2}-orbit with cycle length r12 = r therefore carries the species as
 * its r-periodic walk repeated m/r times (cyclic fold) — and for chain orbits
 * (mirror chambers, dihedral fold) the SAME m-step walk reads the species out
 * correctly, reflections included. Never compare the raw r-length orbit sequence.
 * Requires r12 | m12 (DS4), which the label layer guarantees by construction.
 */
export function vertexSpeciesAt(sym: DSymbol, c: number): number[] {
  const m = sym.m12[c];
  const out = new Array<number>(m);
  let x = c;
  for (let i = 0; i < m; i++) {
    out[i] = sym.m01[x];
    x = sym.s[2][sym.s[1][x]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// PART 1 — published D-set canonical augmentation (1-indexed; op[D] = [s0,s1,s2], 0 = undef)
// ---------------------------------------------------------------------------

type Op = number[][]; // op[D] for D in 1..size; op[0] unused. Values 1-indexed, 0 = undefined.

function getOp(op: Op, size: number, i: number, E: number): number {
  return E >= 1 && E <= size ? op[E][i] : 0;
}

/** Set the involution edge s_i(D)=E, recording prior slot values into `undo` for backtracking. */
function setEdgeUndo(op: Op, i: number, D: number, E: number, undo: number[]): void {
  undo.push(D, i, op[D][i]);
  if (E !== D) undo.push(E, i, op[E][i]);
  op[D][i] = E;
  op[E][i] = D;
}

function firstUndefined(op: Op, size: number): [number, number] | null {
  for (let D = 1; D <= size; D++) {
    for (let i = 0; i <= 2; i++) {
      if (op[D][i] === 0) return [D, i];
    }
  }
  return null;
}

/** Walk the word `w` from D, up to `limit` steps while defined. Returns [end, steps]. */
function scan(op: Op, size: number, w: number[], D: number, limit: number): [number, number] {
  let E = D;
  let steps = 0;
  while (steps < limit && getOp(op, size, w[steps], E) !== 0) {
    E = getOp(op, size, w[steps], E);
    steps += 1;
  }
  return [E, steps];
}

/** The 02-orbit closure check (DS2 / m02 = 2): the orbit must be a 4-cycle (or degenerate). */
function scan02Orbit(op: Op, size: number, D: number): [number, number, number, number] {
  const [head, iSteps] = scan(op, size, [0, 2, 0, 2], D, 4);
  const [tail, jSteps] = scan(op, size, [2, 0, 2, 0], D, 4 - iSteps);
  return [head, tail, 4 - iSteps - jSteps, 2 * (iSteps % 2)];
}

/** Canonical augmentation: reject if some remap-start chamber yields a smaller renumbering. */
function checkCanonicity(op: Op, size: number, isRemapStart: boolean[]): boolean {
  for (let D = 1; D <= size; D++) {
    if (isRemapStart[D]) {
      const d = compareRenumberedFrom(op, size, D);
      if (d < 0) return false;
      if (d > 0) isRemapStart[D] = false;
    }
  }
  return true;
}

function compareRenumberedFrom(op: Op, size: number, D0: number): number {
  const n2o = new Array(size + 1).fill(0);
  const o2n = new Array(size + 1).fill(0);
  n2o[1] = D0;
  o2n[D0] = 1;
  let next = 2;
  for (let D = 1; D <= size; D++) {
    for (let i = 0; i <= 2; i++) {
      const Ei = getOp(op, size, i, n2o[D]);
      if (Ei === 0) return 0;
      if (o2n[Ei] === 0) {
        o2n[Ei] = next;
        n2o[next] = Ei;
        next += 1;
      }
      const Di = getOp(op, size, i, D);
      if (Di === 0) return 0;
      if (o2n[Ei] !== Di) return o2n[Ei] - Di;
    }
  }
  return 0;
}

/**
 * Walk the connected component of D under DEFINED s_i,s_j edges. Returns its chambers,
 * whether it is fully closed (every chamber has both s_i and s_j defined), and (if closed)
 * the (s_i s_j)-cycle length r_ij. Marks visited chambers in `seen`.
 */
function orbitInfo(
  op: Op,
  size: number,
  i: number,
  j: number,
  D: number,
  seen: boolean[],
): { closed: boolean; r: number; start: number } {
  let closed = true;
  const stack = [D];
  seen[D] = true;
  const members: number[] = [];
  while (stack.length) {
    const c = stack.pop()!;
    members.push(c);
    for (const g of [i, j]) {
      const nb = op[c][g];
      if (nb === 0) {
        closed = false;
        continue;
      }
      if (!seen[nb]) {
        seen[nb] = true;
        stack.push(nb);
      }
    }
  }
  if (!closed) return { closed: false, r: 0, start: D };
  let r = 0;
  let x = D;
  do {
    x = op[op[x][j]][i]; // (s_i ∘ s_j)(x)
    r += 1;
  } while (x !== D);
  return { closed: true, r, start: D };
}

/**
 * Hereditary regular-feasibility prune (sound: a closed orbit is frozen — adding chambers
 * elsewhere never touches it, so an infeasible closed orbit can never become feasible).
 *   - a closed {1,2}-orbit must admit m12 ∈ {3,4,5,6} (r12 divides one), i.e. r12 ≤ 6;
 *   - a closed {0,1}-orbit must admit m01 ∈ P (r01 divides one);
 *   - the number of CLOSED {1,2}-components must not exceed k (they can no longer merge).
 */
function makeFeasible(
  k: number,
  p01: Set<number>,
  p12: Set<number>,
): (op: Op, size: number) => boolean {
  return (op, size) => {
    const seen12 = new Array(size + 1).fill(false);
    let closed12 = 0;
    for (let D = 1; D <= size; D++) {
      if (seen12[D]) continue;
      const o = orbitInfo(op, size, 1, 2, D, seen12);
      if (o.closed) {
        if (!p12.has(o.r)) return false;
        if (++closed12 > k) return false;
      }
    }
    const seen01 = new Array(size + 1).fill(false);
    for (let D = 1; D <= size; D++) {
      if (seen01[D]) continue;
      const o = orbitInfo(op, size, 0, 1, D, seen01);
      if (o.closed && !p01.has(o.r)) return false;
    }
    return true;
  };
}

/** r-values that divide some m in `ms` (a closed orbit's cycle length must be one of these). */
function feasibleRs(ms: number[]): Set<number> {
  const out = new Set<number>();
  for (const m of ms) for (let r = 1; r <= m; r++) if (m % r === 0) out.add(r);
  return out;
}

/**
 * Enumerate every connected 2-D D-set of size ≤ maxSize exactly once (published order),
 * INTERLEAVED with the hereditary regular-feasibility prune (closed-orbit only ⇒ sound).
 * Yields complete op arrays (1-indexed). `budget.nodes` caps the DFS (LOUD wall, never silent).
 */
/** A completed D-set as 0-indexed involution arrays (the snapshot the generator yields). */
type DSet = [number[], number[], number[]];

function* genDSets(
  maxSize: number,
  budget: { nodes: number },
  feasible: (op: Op, size: number) => boolean,
): Generator<DSet> {
  // Single pre-allocated op, mutated in place with edge-undo on backtrack (allocation-free per node).
  const op: Op = Array.from({ length: maxSize + 1 }, () => [0, 0, 0]);
  const state = { size: 1 };
  const rootRemap = new Array(maxSize + 1).fill(false);
  yield* dfs(rootRemap);

  function* dfs(isRemapStart: boolean[]): Generator<DSet> {
    if (budget.nodes <= 0) return;
    budget.nodes -= 1;
    const size = state.size;
    const undef = firstUndefined(op, size);
    if (undef === null) {
      // snapshot to 0-indexed arrays (complete D-sets are far rarer than DFS nodes ⇒ cheap)
      const s0 = new Array(size);
      const s1 = new Array(size);
      const s2 = new Array(size);
      for (let c = 0; c < size; c++) {
        s0[c] = op[c + 1][0] - 1;
        s1[c] = op[c + 1][1] - 1;
        s2[c] = op[c + 1][2] - 1;
      }
      yield [s0, s1, s2];
      return;
    }
    const [D, i] = undef;
    const limit = Math.min(size + 1, maxSize);
    for (let E = D; E <= limit; E++) {
      if (getOp(op, size, i, E) !== 0) continue;
      const addedChamber = E > size;
      const undo: number[] = [];
      if (addedChamber) {
        state.size = E; // op[E] is pre-zeroed; firstUndefined will fill its remaining slots
      }
      setEdgeUndo(op, i, D, E, undo);
      const [head, tail, gap, kk] = scan02Orbit(op, state.size, D);
      let ok = true;
      if (gap === 1) {
        setEdgeUndo(op, kk, head, tail, undo);
      } else if (gap === 0 && head !== tail) {
        ok = false;
      }
      if (ok) {
        const childRemap = isRemapStart.slice();
        if (addedChamber) childRemap[E] = true;
        if (checkCanonicity(op, state.size, childRemap) && feasible(op, state.size)) {
          yield* dfs(childRemap);
        }
      }
      // backtrack: undo edges (newest first) and restore size
      for (let u = undo.length - 3; u >= 0; u -= 3) op[undo[u]][undo[u + 1]] = undo[u + 2];
      if (addedChamber) state.size = size;
    }
  }
}

// ---------------------------------------------------------------------------
// PART 2 — regular-Euclidean labels (matches k2_minimal_fixed.py) + minimal-image collapse
// ---------------------------------------------------------------------------

/** {i,j}-orbits on raw involution arrays (0-indexed), each as a list of chambers. */
function rawComponents(sa: number[], sb: number[], n: number): number[][] {
  const seen = new Array(n).fill(false);
  const orbits: number[][] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start]) continue;
    const orbit: number[] = [];
    const stack = [start];
    while (stack.length) {
      const c = stack.pop()!;
      if (seen[c]) continue;
      seen[c] = true;
      orbit.push(c);
      stack.push(sa[c], sb[c]);
    }
    orbits.push(orbit);
  }
  return orbits;
}

/** r_ij(c): smallest r>0 with (sa∘sb)^r(c) === c, on raw arrays. */
function rawCycleLen(sa: number[], sb: number[], c: number): number {
  let r = 0;
  let x = c;
  for (;;) {
    x = sa[sb[x]];
    r += 1;
    if (x === c) return r;
  }
}

function* cartesian(lists: number[][]): Generator<number[]> {
  if (lists.length === 0) {
    yield [];
    return;
  }
  const [first, ...rest] = lists;
  for (const v of first) {
    for (const tail of cartesian(rest)) yield [v, ...tail];
  }
}

export interface GenResult {
  k: number;
  polygons: number[];
  maxSize: number;
  dsetsGenerated: number; // complete D-sets with raw-k === k
  generated: number; // labeled symbols constructed (before per-component-flat)
  candidatesRaw: number; // distinct canonical labeled symbols, raw-k, per-component-flat (the "93")
  candidateSymbols: number; // distinct genuine-k minimal symbols (the "11")
  symbols: DSymbol[]; // the genuine-k minimal symbols (canonical reps)
  completed: boolean; // false ⇒ a DFS budget wall was hit (reported LOUD)
  nodesUsed: number; // DFS nodes consumed (for the completed-vs-walled gate signal)
}

export interface GenOptions {
  maxNodes?: number; // DFS node budget; default very large
  /**
   * SEED ANCHOR (optional): the candidate vertex-species MULTISET S — exactly k cyclic
   * face-size sequences (e.g. [[3,4,6,4],[3,3,4,3,4]]). With it set, the run keeps only
   * symbols whose k vertex orbits carry EXACTLY this species multiset (dihedral-canonical
   * comparison, mirrors merged), and prunes the D-set DFS with the matching restricted
   * p01/p12 (still hereditary ⇒ still sound). With it UNDEFINED the behavior is
   * byte-identical to the unanchored generator.
   */
  anchor?: number[][];
}

/**
 * Enumerate all genuine-k-uniform regular minimal D-symbols for polygon set P, size ≤ maxSize.
 * Sound by the published D-set order + a definitional label filter; deduped by canonical form.
 */
export function generateCandidateSymbols(
  k: number,
  polygons: number[],
  maxSize: number,
  opts: GenOptions = {},
): GenResult {
  const P = [...polygons].sort((a, b) => a - b);
  const maxNodes = opts.maxNodes ?? 200_000_000;
  const budget = { nodes: maxNodes };

  // --- seed anchor (optional): restricted face/degree alphabets + species keys ---
  let anchorKeys: string[] | null = null; // sorted multiset of dihedral species keys
  let anchorKeySet: Set<string> | null = null;
  let anchorFaces: number[] | null = null; // unique face sizes across S (⊆ P enforced LOUD)
  let anchorDegrees: number[] | null = null; // unique species degrees (⊆ M12_RANGE enforced LOUD)
  if (opts.anchor) {
    if (opts.anchor.length !== k) {
      throw new Error(`anchor: species multiset has ${opts.anchor.length} entries, need exactly k=${k}`);
    }
    anchorKeys = opts.anchor.map(dihedralKey).sort();
    anchorKeySet = new Set(anchorKeys);
    anchorFaces = [...new Set(opts.anchor.flat())].sort((a, b) => a - b);
    for (const f of anchorFaces) {
      if (!P.includes(f)) throw new Error(`anchor: face size ${f} not in polygon set {${P.join(',')}}`);
    }
    anchorDegrees = [...new Set(opts.anchor.map((s) => s.length))].sort((a, b) => a - b);
    for (const d of anchorDegrees) {
      if (!M12_RANGE.includes(d)) throw new Error(`anchor: species degree ${d} outside regular range {3..6}`);
    }
  }
  const faceAlphabet = anchorFaces ?? P;
  const degreeAlphabet = anchorDegrees ?? M12_RANGE;
  const feasible = makeFeasible(k, feasibleRs(faceAlphabet), feasibleRs(degreeAlphabet));

  let dsetsGenerated = 0;
  let generated = 0;
  const rawCanon = new Map<string, DSymbol>(); // candidate canonical key -> a representative
  const minimalCanon = new Map<string, DSymbol>(); // genuine-k minimal canonical key -> rep

  for (const [s0, s1, s2] of genDSets(maxSize, budget, feasible)) {
    const n = s0.length;

    // raw-k filter: # {1,2}-components must equal k (a property of the D-set, not the labels)
    const c12 = rawComponents(s1, s2, n);
    if (c12.length !== k) continue;
    dsetsGenerated += 1;

    const o01 = rawComponents(s0, s1, n);
    const r01 = o01.map((orb) => rawCycleLen(s0, s1, orb[0]));
    const r12 = c12.map((orb) => rawCycleLen(s1, s2, orb[0]));

    const m01opts = r01.map((r) => faceAlphabet.filter((m) => m % r === 0));
    if (m01opts.some((o) => o.length === 0)) continue;
    const m12opts = r12.map((r) => degreeAlphabet.filter((m) => m % r === 0));
    if (m12opts.some((o) => o.length === 0)) continue;

    for (const m01a of cartesian(m01opts)) {
      const m01 = new Array(n);
      o01.forEach((orb, idx) => orb.forEach((c) => (m01[c] = m01a[idx])));
      for (const m12a of cartesian(m12opts)) {
        const m12 = new Array(n);
        c12.forEach((orb, idx) => orb.forEach((c) => (m12[c] = m12a[idx])));
        const sym = new DSymbol(s0, s1, s2, m01, m12);
        generated += 1;
        if (!validate(sym).ok || !perComponentFlat(sym)) continue;
        // anchored: every closed {1,2}-component's UNFOLDED species must be in S,
        // and the multiset over the k components must equal S exactly.
        if (anchorKeySet) {
          const keys: string[] = [];
          let ok = true;
          for (const orb of c12) {
            const key = dihedralKey(vertexSpeciesAt(sym, orb[0]));
            if (!anchorKeySet.has(key)) {
              ok = false;
              break;
            }
            keys.push(key);
          }
          if (!ok) continue;
          keys.sort();
          if (keys.some((v, i) => v !== anchorKeys![i])) continue;
        }
        rawCanon.set(sym.canonicalKey(), sym);
      }
    }
  }

  // collapse candidates to genuine-k minimal symbols (the §7 minimal-image step)
  for (const sym of rawCanon.values()) {
    const mi = minimalImage(sym);
    if (!validate(mi).ok) continue;
    if (kUniformity(mi) !== k) continue; // genuine-k filter (P4b)
    minimalCanon.set(mi.canonicalKey(), mi);
  }

  return {
    k,
    polygons: P,
    maxSize,
    dsetsGenerated,
    generated,
    candidatesRaw: rawCanon.size,
    candidateSymbols: minimalCanon.size,
    symbols: [...minimalCanon.values()],
    completed: budget.nodes > 0,
    nodesUsed: maxNodes - budget.nodes,
  };
}
