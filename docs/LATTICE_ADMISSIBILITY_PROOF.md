# P3 — divisor-constrained orbit-class admissibility: the sound pruning lever for k ≥ 3

**Author: Fable, 2026-07-10. Status: derived + scouted (V0 PASSED, headline below); stage A (the
lattice pre-filter) IMPLEMENTED same session — `vcFeasAreaSets`/`bravaisClassExact` in
LatticeEnumerator, the skip beside P0 in `candidateLattices`, diag `cSkipped`, hatch `PS_P3=0`,
tests `tests/c-admissibility.test.ts`; V2 run results in
`experiments/results/p3-stageA-validation-2026-07-10.md` — digest-neutral at k=1/2/3 (k≤2 equal
the certified anchors; k=3 ON==OFF, 61 both legs), k=3 wall 43.7→30.1 min (1.45×), the win
concentrated on the hex family (6–8×/seed) while the 3³.4² fan-heavy family now owns the budget.
Stage B (in-fill domination) IMPLEMENTED same session: `vcFeasAreaSets` now returns the
Pareto-maximal feasible tile-count vectors per (Bravais class, area); `FillCtx.feasVectors`
carries F*(Λ) into both DFSs (TS `torusFill` root + place; native `torusfill.hpp` with the
optional bridge field 13 — absent ⇒ byte-identical, difftest 100,029/100,029 post-rebuild);
`p3Pruned` diag counter (TS-side; bridge mode reports only the emitted set, as with `p1Pruned`);
`PS_P3_FILL=0` disables just the fill arm. k≤2 probes re-verified byte-identical to the anchors
with stage B in the tree. k=3 stage-A+B leg: see the validation log.

Examined and DEPRIORITIZED (recorded so it is not re-litigated): pushing the class-2 feasibility
into `obliqueCells`. Two reasons: (a) the candidate enumeration is cached per vcSig, so its cost
is paid once per family, not per seed — the win is small; (b) any source-level shrink also
shrinks `allKeys`, the CB-7 primitivity-guard membership universe (built pre-filter by design,
"Do not move it"), which would fire false guard alarms and break the §38-I1 alarm-count
reconciliation. If ever revisited, the guard's area-suppression logic must be extended first.**
Companion measurement: `scripts/c-admissibility-scout.ts` →
`experiments/results/c-admissibility-scout-2026-07-10.{md,csv}`.
This is the deliverable for the §49 handoff ("k=3 is a pruning wall"): the method stated precisely,
its soundness proof with the one open lemma named, and the validation plan. Model: the N canonical
form (NOTES §45).

---

## 0. Verdict, in five sentences

The two dormant prunes are not mis-tuned and cannot be re-engaged: `p1Prune=0` is structural
(§16.3 already measured and root-caused it — the waste is <k degenerations with too FEW vertex
classes, and P1 bounds from above) and is additionally a bridge reporting artifact
(`torusfill.hpp` line 11 omits diag counters; the prune itself is compiled in at line 92);
`ssDedup=0` is by design (`PeriodSolver.ts:661` guards it to multi-seed lattices, which the k=3
fast path never produces). The real lever is a new necessary condition C(Λ,S) — "the exact cell
area must be realizable by per-orbit class counts that divide hol(Λ), with full VC support and
integral tile counts" — applied twice: as a lattice pre-filter (skip the fill entirely) and as an
in-fill tile-multiset domination prune (P3) that finally attacks the <k-degeneration waste §16.3
declared un-prunable — that verdict was about ORBIT-counting prunes; tile-count arithmetic is a
different axis. Soundness reduces to five already-settled facts plus one new two-line lemma
(orbit-stabilizer) and one open but easy lemma (L7, the gate's −1 escape). The lattice-level form
is one hash lookup per candidate; the fill-level form is a few integer compares per placement.
Measured (V0 scout, 8 seeds, 1311 real post-P0 candidates, native fills): **0 soundness
violations; 53.5% of candidates rejected; 79.0% of total fill time — 85% on the profiled hard seed
— sits on rejected lattices**, so the pre-filter arm alone projects ~70 min → ~15 min at k=3
before the in-fill arm contributes anything.

## 1. Part I — diagnosis of the dormant prunes (work-order item 2)

### 1.1 `p1Prune = 0` — structural, plus a reporting artifact. No win available.

Three stacked facts, in decreasing importance:

1. **It was already measured and root-caused in NOTES §16.3 (2026-06-04).** On the hard seed
   `[3⁶;3⁴.6;3⁴.6]` (hex, floor 3·12 = 36) P1 fired 0 times in the pure-TS path, because the ~90%
   wasted fills are **<k degenerations** — closures (or dead subtrees) with too FEW vertex classes,
   which never approach 37. P1 is an upper-bound prune (`vReps > k·hol(Λ)` ⇒ dead); the junk lives
   below the bound, not above it. This is TA's `rem:unsoundprunes` ceiling, empirically confirmed
   then and re-confirmed by the §49 profile now. The §49 phrasing "the fills are running largely
   unpruned" is half-right: they run un-P1-pruned because nothing crosses the floor.
2. **In bridge mode the counter cannot move even when the prune fires.** The native DFS carries P1
   (`native-engine/torusfill.hpp:92`, `orbitFloor` shipped via `fill-server.cpp` field p[9]) and the
   seed-core floor check (line 40), but deliberately omits all diag counters (header comment, line
   10–11). So under `USE_NATIVE_FILL=1` the TS `diag.p1Pruned` is structurally 0 regardless of
   behavior. Any future "is prune X firing?" profile must either run the TS path or add a counter
   line to the bridge response — otherwise it measures the reporting gap, not the prune.
3. **It is not a threshold bug.** The floor `k·hol(Λ)` is the proven bound (V ≤ k·hol for any
   k-uniform tiling on Λ), `holohedry` never underestimates (falls back to 12), and the plumbing is
   correct end-to-end. Tightening the numeric floor without new structure would be unsound.

Conclusion: no cheap win here. P1 stays (it costs ~nothing and guards the too-many-classes /
supercell direction); the correct response to `p1Prune=0` is Part II, which prunes on a different
invariant.

### 1.2 `ssDedup = 0` — by design. No win available.

`seedStateDedup` is guarded by `seedSets.length > 1` (`PeriodSolver.ts:661`): it can only fire on
lattices that carry multiple seed sets — fan/core-overflow lattices (`t2014`-type) or OP-3 oblique
representatives with multiple seed maps whose mapped cores coincide mod Λ. The k=3 regular fast
path is single-seed on virtually every lattice, so the counter is 0 structurally. §16.4 said at
landing time that its real payoff is the proven blanket-fan mode (O2), not the rigid-core path.
Not a bug, nothing to re-tune.

### 1.3 Consequence for the work order

Item (2) yields zero speedup — its value is negative knowledge, now written down: the two proven
prunes are active, sound, and non-binding at k=3, and one profile counter is a bridge artifact.
The entire prize therefore sits in item (1), pursued next.

## 2. Part II — the admissibility condition C(Λ,S) and the P3 domination prune

### 2.1 Setting and notation

Fixed: a regular seed S for uniformity k, with vertex-configuration instances (orbit slots)
c_1..c_k over d ≤ k distinct VC types; m_{c,n} = number of n-gons incident to a vertex of type c;
A_n = exact area of the regular n-gon (Surd); a candidate lattice Λ = ⟨u,v⟩ with exact
|det Λ| and holohedry hol(Λ) ∈ {2,4,8,12} (`LatticeEnumerator.holohedry`, never underestimates).

Pipeline facts about an EMITTED cell at k ≥ 3 (a raw cell that reaches `cells.push` in
`PeriodSolver.solve`), all already landed and relied on elsewhere:

- (E1) it is a certified edge-to-edge torus tiling of ℝ²/Λ (`isCompleteTiling`);
- (E2) its vertex-orbit count under the FULL symmetry group G equals k (early gate at k≥3,
  same function as the post-gate; the `−1` escape is L7 below);
- (E3) its occurring VC-type set equals the seed's allowed set (OP-1 / prop:typeprune);
- (E4) it is primitive: Λ is the full translation lattice T(G) of the tiling (`isPrimitive`;
  the supercell-refound argument P0 already leans on).

### 2.2 The condition

For h ∈ {2,4,8,12} define the **feasible set**

> F(S,h) = { (t_n)_n : ∃ orbit-type vector τ = (τ_1..τ_k) over the distinct types of S with every
> type occurring ≥ 1, ∃ (V_1..V_k) with each **V_i a divisor of h**, such that for every tile size
> n, n · t_n = Σ_i V_i · m_{τ_i,n} with t_n ∈ ℤ≥0 } ,

each member carrying its exact area A(t) = Σ_n t_n·A_n. Then:

> **C(Λ,S)** (lattice pre-filter): ∃ t ∈ F(S, hol(Λ)) with A(t) = |det Λ| exactly.
> **P3(Λ,S)** (in-fill prune): let F*(Λ,S) = { t ∈ F(S,hol(Λ)) : A(t) = |det Λ| }. A DFS node whose
> per-size placed-tile counts (p_n) are NOT componentwise dominated by any t ∈ F*(Λ,S) is pruned.
> C(Λ,S) false ⟺ F* = ∅ ⟺ P3 prunes the root ⟺ skip the fill entirely.

Notes on the shape of F:

- The τ-union over ALL support-preserving orbit-type vectors (not just the seed's own multiset) is
  deliberate: the pipeline emits same-support cells whose orbit-type multiplicities differ from the
  seed's slots (they are cross-seed duplicate certifications, deduped later; OP-1's P2 removed only
  strict-subset support). Restricting to the seed's own multiset would drop those emissions and
  break byte-identity. The union only weakens the prune, never its soundness.
- "V_i | h" already encodes 1 ≤ V_i ≤ h and full support. Since every lcm of divisors of h divides
  h (h ∈ {2,4,8,12}), the per-orbit divisor constraint is exactly equivalent to
  "∃ subgroup order d | h with all V_i | d".
- For hol = 12 the divisor set is {1,2,3,4,6,12} — V_i ∈ {5,7,8,9,10,11} is impossible. This is
  strictly sharper than the settled per-orbit bound V_i ≤ 12 (which stays true and untouched as the
  lattice-independent bound inside `vcAreaSet`).

### 2.3 What is genuinely new vs P0 / vcAreaSet

`vcAreaSet`/`vcAreaMinVerts` already enforce: full support (V_i ≥ 1 per slot), per-orbit V_i ≤ 12
(lattice-INDEPENDENT), tile-count integrality, exact area. P0 then rejects Λ when
min ΣV_i > k·hol(Λ). The delta:

| axis | P0 today | C/P3 |
|---|---|---|
| per-orbit cap | 12, lattice-independent | divisors of hol(Λ), lattice-local |
| oblique (hol 2) | keeps any det with min ΣV ≤ 2k, V_i up to 12 in the witness | V_i ∈ {1,2}: at k=3 at most 2³ aggregate assignments per τ — most dets die |
| rect/cmm (hol 4) | ΣV ≤ 4k | V_i ∈ {1,2,4} |
| square (hol 8) | ΣV ≤ 8k | V_i ∈ {1,2,4,8} |
| hex (hol 12) | ΣV ≤ 12k | V_i ∈ {1,2,3,4,6,12} (kills dets needing a 5,7,…,11-class orbit) |
| during the fill | nothing (P1 only bounds ΣV from above) | domination against F*: the pure-3⁶ subtree on a mixed-VC seed dies once its triangle count exceeds max{t_3 : t ∈ F*} — full support forces t_6 ≥ 1 in every member of F*, so max t_3 is strictly below the pure-triangle packing of the cell |

Concrete P0-pass/C-fail witness shape: an oblique candidate whose det is realizable only as
(V_1,V_2,V_3) = (4,1,1) passes P0 (Σ = 6 ≤ 2k = 6) and fails C (4 ∤ 2).

### 2.4 Soundness

**Theorem (P3 is emission-preserving).** At k ≥ 3, on regular seeds, pruning every DFS node whose
partial tile-count vector is undominated in F*(Λ,S) removes no emitted cell; in particular skipping
lattices with F* = ∅ removes no emitted cell. Since the certified catalogue is a function of the
emitted sets (dedup/gate downstream are unchanged), the catalogue and every digest built from it
are byte-identical.

Proof. Let R be an emitted cell on Λ with tile counts (t_n). It suffices to show (t_n) ∈ F*(Λ,S);
domination-pruning then never kills any ancestor of R's closure node, because partial counts grow
monotonically one tile per DFS step, so every ancestor of R is dominated by (t_n) ∈ F*.

1. (Area, standard) Tiles partition the torus: Σ_n t_n·A_n = |det Λ| exactly. So A(t) = |det Λ|.
2. (Incidence, standard — same identity `vcAreaSet` rests on) Every corner of every tile lies at a
   surrounded vertex of the torus tiling; grouping the n·t_n corner-incidences of n-gons by the
   vertex classes gives n·t_n = Σ_{classes x} m_{type(x),n}.
3. (Orbit structure) By E2 the vertex classes partition into exactly k orbits under G; by E3 the
   type map on orbits is a support-preserving τ. Let V_i = #classes in orbit i. Then step 2 reads
   n·t_n = Σ_i V_i·m_{τ_i,n}, integrality of t_n included.
4. (**Lemma C — the new fact, two lines**) By E4, Λ = T(G), so the point group P = G/Λ is finite
   and acts on the set of Λ-classes of orbit i; this action is transitive because G is transitive
   on orbit i and Λ acts trivially on classes. Orbit-stabilizer: V_i divides |P|. P embeds in the
   Bravais group of Λ (a symmetry of the tiling maps Λ to itself, hence its linear part preserves
   the Gram class), so by Lagrange |P| divides hol(Λ). Hence **V_i | hol(Λ)** for every i.
5. Steps 1–4 exhibit (t_n) ∈ F*(Λ,S). ∎

What the theorem does NOT claim (and does not need to): nothing about non-emitted closures. The
branches P3 kills lead only to (a) closures with orbit count ≠ k — gate-rejected today (E2), and at
level j < k these are j-level tilings found by the j-run, exactly the current gate semantics; (b)
same-orbit-count closures with subset support — P2-discarded today, their tilings recovered under
their own exact-support seed (prop:typeprune, already proven); (c) imprimitive closures —
`isPrimitive`-discarded today, their tilings re-found at the primitive lattice (the standing P0 /
CB-7 supercell argument, licensed and guarded); (d) subtrees with no closure at all. Every discard
class is one the pipeline already discards post-hoc; P3 discards it pre-hoc on a proven invariant.

**Dependencies (all existing, cited not re-proven):** exact tile areas A_n (Surd); the incidence
identity (vcAreaSet's docstring, §16.2); `holohedry` never underestimates (§16.1, TDD'd);
prop:typeprune (OP-1, §38); the supercell-refound argument with the CB-7 guard (§16.2, §32);
gate = exactly-k semantics (§43 early gate = post-gate, byte-identical). One dependency worth
naming because step 3 uses the TRUE orbit partition while E2 only gives "the gate said k": the
theorem inherits the standing assumption that `countVertexOrbits` is correct on certified
closures — the same assumption the catalogue itself rests on (oracle bijection 61/61). P3 adds no
new exposure to it.

**L7 — the one open lemma.** `countVertexOrbits` returns −1 ("cannot gate") on degenerate inputs,
and the emit path KEEPS a −1 closure (doubt ⇒ keep). If a certified regular closure could gate −1,
its orbit count is unknown and step 3 above fails for it — P3 could in principle prune a kept cell.
Claim (sketch, to be discharged by TA or a short CC proof): for a certified regular closure the
gate never returns −1 — (i) the identity symmetry always passes its own test (r=0, T=0), so
`syms ≠ ∅`; (ii) every vertex of a certified closure is surrounded with ≥ 3 pairwise-distinct
tiles (regular corner angles ≤ 150° ⇒ ≥ 3 tiles per vertex; a convex tile meets a vertex in one
corner), and the central cell's vertices lie inside the `vertR = 1.6·cellDiam` window, so
`reps ≠ ∅`. Until L7 is signed off, the validation plan (§4, stage V2) carries a loud per-sweep
assert `gateNullOnClosure == 0` — measured 0 on all recorded sweeps; and the full-sweep digest
equality is itself an empirical discharge at k=3. This is the only link in the chain that is
scoped-open rather than settled.

**Scope.** Regular seeds only (the incidence identity is false for stars — same scope rule as P0;
star seeds bypass C/P3 exactly as they bypass P0). Active only when the early gate runs (k ≥ 3
default): at k ≤ 2 the native `runGate=0` path emits gate-doomed closures on purpose (TS gates
post-pass), whose tile vectors need not lie in F — P3 must not run there, and has nothing to win
there (k≤2 whole-solve is 27 s). This also keeps the strict TS↔native difftest corpus
(100,029 cases) valid unchanged.

### 2.5 Implementation sketch (CC's lane; ~1 day incl. gates)

1. `LatticeEnumerator.vcFeasSets(vcIncidences, tileArea, tileCorners, k)` → per h ∈ {2,4,8,12} a
   `Map<areaKey, t-vector[]>`; cache alongside the candidate list (same key). Cost: ≤ a few
   hundred Surd sums per seed, μs–ms, once.
2. Lattice pre-filter: in `candidateLattices` right after the P0 loop (`PeriodSolver.ts:999`):
   `if (!feas.get(hol(u,v))?.has(areaKey(det))) { cSkipped++; continue; }` — one hash lookup.
   New diag counter `cSkipped`, printed next to `p0Skip`.
3. Fill prune: put `F*(Λ,S)` (dozens of small int vectors) into `FillCtx`; in the TS DFS and in
   `torusfill.hpp::place`, keep per-size counts and reject a child not dominated by any member.
   Bridge: serialize F* as one more tab field; native keeps counts in the Frame. Also set the
   per-lattice depth cap to max Σt over F* (≤ maxCellPolys, free extra cut).
4. Escape hatches + counters: `PS_P3=0` restores today's behavior byte-for-byte; `p3Pruned`
   counter; the L7 assert (`gateNullOnClosure`) printed per sweep, loud on ≠ 0.

### 2.6 Measured (V0 scout — numbers of record in the results file)

`scripts/c-admissibility-scout.ts` evaluates C on the REAL post-P0/post-OP-3 candidate lists of
8 sampled k=3 seeds (hard seed included), times every candidate's native fill, and checks
soundness against both a mirrored fill loop and a real `solve()` (`onRawCell`). Results
(`experiments/results/c-admissibility-scout-2026-07-10.md`):

- **Soundness: 0 violations in 1311 candidates** — no C-rejected lattice produced a raw cell in
  either path. (2 mirror-vs-solve attribution mismatches, both on C-KEPT lattices, explained by
  solve's cross-lattice `seenCanonical` dedup — see the results file.)
- **Kill rate: 702/1311 = 53.5%** of post-P0 candidates rejected (hard seed: 27/69 = 39%; per-hol
  breakdown in the log — the rect/cmm and hex classes both contribute).
- **Time share: 79.0% of total fill time (48.9 of 61.9 s) on C-rejected lattices; 85% on the
  profiled hard seed** (46.8 of 55.4 s). The nine biggest single sinks (4.5–6.0 s each) are hex
  lattices, det ≈ 31–34, all C-rejected, all empty in both paths — precisely the §49
  "explores deep and closes into nothing" fills.

The in-fill P3 effect on surviving lattices is NOT measured by the scout (needs the ctx wiring)
and is claimed only qualitatively until stage V3.

## 3. Part III — the `buildSeeds` 140 s asymmetry (work-order item 3, flag only)

`findSeedSets` is pure name combinatorics on the compatibility graph — 1 ms is right.
`SeedBuilder.buildSeedsFromSet` is a geometric BFS whose per-node cost is dominated by:

- `canAnyVCFitAtVertex` (forward checking) re-does full clone + exact placement +
  `computeNeighboringVertices` + `deduplicatePolygons` + `isValid` for EVERY open vertex of EVERY
  node, then again in `passesFinalVertexCheck` — no memoization; the same (VC, local direction
  environment) is re-tested thousands of times;
- `deduplicatePolygons([...seed, ...vc])` is O((n+m)²) float-tolerance pairwise per candidate
  placement;
- `computeCanonicalForm` is O(n²) exact-key (BigInt `normSquared().key()`) per node per layer, and
  `computeAvailableVertices` does linear `find` per vertex.

Fix directions, in effort order: memoize fit-checks by (VC name, canonicalized direction multiset);
spatial-hash the tolerance lookups; only then a C++ port. One-time 140 s at k=3 (~3%), but seed
count grows ~11×/k, so it becomes a real wall at k=4–5. Not pursued here — P3 dominates.

## 4. Part IV — validation plan (acceptance instrument, doctrine-compliant)

- **V0 (scout, this session):** kill-rate + time-share + 0 soundness violations on ≥ 8 sampled
  seeds incl. the profiled hard seed; mirror-vs-solve productive sets must agree.
- **V1 (oracle differential on Lemma C, cheap, N-authority style):** over the reconstructed oracle
  cells k ≤ 6 (61 at k=3; `reconstructOracleCellExact`), compute per-orbit class counts V_i mod
  Λmax and the group order |P| (nClassify), assert V_i | |P| | hol(Λmax) and det ∈ Feas — Lemma C
  tested against every ground-truth tiling, not just the derivation.
- **V2 (implementation gates):** `pnpm build` green; k≤2 probes byte-identical
  (`6f9ca9cf2d16c75f`/11, `f3e2e0517191362c`/20 — P3 inactive at k≤2 by scope, so this is a
  no-regression check); full k=3 449-seed no-cap sweep with P3 ON: digest equality
  `11ee1b1d582811d1`/61 vs the anchored baseline + per-tiling recert bijection 61/61 (t3007
  present, 0 orphans/dupes); A/B with `PS_P3=0` on the 12 profiled seeds; `gateNullOnClosure == 0`
  asserted (L7 belt); counters (`cSkipped`, `p3Pruned`) published Σ-and-distinct, OP-9 style.
- **V3 (the win, honestly):** wall-clock 449-seed sweep P3 ON vs OFF; report the split
  "lattices skipped" vs "in-fill subtree cut" separately. If the total win is < 2×, say so and
  escalate to the next lever (cross-seed dedup, the bigger proof burden) rather than tuning knobs.
- **Doctrine:** C/P3 are licensed necessary conditions, not completeness knobs — no cap, no
  budget, nothing tunable. The single unproven link (L7) is named, asserted loudly per sweep, and
  is the one item that must be formally discharged (TA sign-off or a short proof note) before the
  thesis text may call the k=3 enumeration proof-anchored WITH P3 enabled.

## 5. Honest limits

- C's lattice-level kill rate is measured (V0); the in-fill P3 effect is derived-but-unmeasured
  until V3. The <k-degeneration waste is attacked only where the feasible tile vectors genuinely
  constrain it — on seeds whose VC types share tile sizes in similar proportions, domination binds
  late and the win shrinks. The scout's per-hol breakdown is the early indicator.
- If most fill TIME sits on productive hex lattices with loose F*, the honest conclusion is that
  P3's pre-filter arm saves little there and the fill arm is the load-bearing half — V3 decides.
- Nothing here touches the 449-seed multiplicity (OP-9's 20.6× cross-seed redundancy) — that is
  the next lever after P3, with the heavier proof burden, and it stays deferred exactly as §49
  ranked it.
