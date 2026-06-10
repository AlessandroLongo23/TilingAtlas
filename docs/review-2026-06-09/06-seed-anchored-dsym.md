# 06 — Seed-anchored Delaney–Dress enumeration (SA): scoping contract + probe

> Origin: Alessandro's 2026-06-10 sketch — the chamber complex of a seed patch with the three
> partial involutions drawn by hand (a **partial Delaney symbol**: boundary chambers have free σ₂)
> and the proposal to (a) early-prune/force from the seed's symbol and (b) quotient chambers by the
> seed's symmetries. Back: [README.md](README.md). Owners: **CC** (probe, this increment), **TA**
> (obligations SA-1..SA-3), **AL** (method call after the probe).

## 1. The hybrid, stated precisely

The two existing methods fail in complementary ways:

| | enumerates | wall |
|---|---|---|
| torus/lattice path | candidate lattices Λ, then fills | Λ is **guessed**: the proven box is measured intractable ([DG-1](00-decision-gate.md)); the tuned pool is oracle-fitted |
| Delaney–Dress (M0/M1) | all symbols of size δ ≤ 12k, complete by construction | starts **from nothing**: the D-set tree is ~2.24^δ (404M nodes at k=2; walls at k=3, δ≤36) |

Seed-anchoring conditions the D-D generation on the seed layer the pipeline already enumerates
cheaply and with proven coverage: fix a candidate **vertex-species multiset** S (|S| = k; the
species are VC face-cycles, e.g. 3.4.6.4), and enumerate only symbols compatible with S. In any
tiling whose k vertex orbits carry exactly the species of S:

- every face size occurs in some species of S → the closed-{0,1}-orbit prune set p01 shrinks from
  divisors(P) to **divisors(FACES(S))**;
- every vertex degree is some deg(X), X ∈ S → p12 shrinks from divisors({3..6}) to
  **divisors(DEGREES(S))**;
- every closed {1,2}-component's **unfolded** vertex figure must equal a species of S (up to
  rotation/reflection);
- a completed symbol's component-species multiset must equal S exactly.

The first two bite at the **D-set level — where the 2.24^δ explosion lives**; the engine's
hereditary closed-orbit prune (`makeFeasible`) takes them with a two-line parameter change.
Λ is never guessed (it falls out of the realized symbol), and the tree never starts from nothing.

## 2. Why species-anchoring, not naive subsymbol-start (the folding trap)

The tempting formulation — "embed the seed's 2d-chamber vertex star as a fixed partial symbol and
complete it" — is **unsound as stated**: the completed tiling's *minimal* symbol is a quotient by
its full symmetry group, and a high-symmetry tiling **folds** the vertex star (a mirror through the
vertex halves it; 4.4.4.4's minimal symbol has far fewer chambers than one vertex star). Demanding
2d distinct chambers would silently drop exactly the high-symmetry tilings — most of the k=1
catalogue. The sound statement is existential: *some chamber's σ₁σ₂-orbit unfolds to the species*,
which is precisely the species-anchored prune above. (The stronger geometric anchoring — using the
seed's adjacency structure, not just its species — is the §6 escalation, and inherits a genuine
faithfulness obligation that the species form does not have.)

## 3. Completeness chain (named obligations)

A k-uniform tiling T with species multiset S(T):

1. **SA-1 (species coverage — immediate).** S(T) is among the enumerated seed multisets.
   *Status: the seed-set enumeration is the pipeline's existing coverage layer; at the species
   level this is a tautology — every tiling has a species multiset. One caveat: the pipeline (and
   the probe) excludes same-species multisets {X,…,X} at k ≥ 2, licensed by the monogonal⇒uniform
   theorem — the SAME dependency as [TH-12](03-theory-obligations.md). Until TH-12 is cited, this
   exclusion is an assumption shared with the geometric path, flagged not silent.*
2. **SA-2 (folding soundness — the load-bearing one).** The anchored prunes never reject a symbol
   of such a T: (i) faces(T) ⊆ FACES(S) and degrees(T) ⊆ DEGREES(S) — immediate; (ii) the
   per-component check compares the **unfolded** figure (a closed {1,2}-orbit of cycle length r
   carries m₁₂ = a multiple of r; its face-sequence is a cyclic/dihedral fold of the species) —
   the unfolding must be the same one the engine's flatness check (`perComponentFlat`, B2.5)
   already performs. *TA: one lemma, mostly bookkeeping; the probe's k≤2 exact-recovery acceptance
   is its falsifier.*
3. **B1 (proven).** δ(T) ≤ 12k bounds the enumeration; the anchored run inherits it unchanged.
4. **Generation completeness (inherited).** The anchored generator is the published
   canonical-augmentation order with *additional hereditary prunes on closed orbits only* — the
   same soundness shape as the existing regular-feasibility prune; no new enumeration-order theory.
5. **B2 / realizability ([TH-11](03-theory-obligations.md) — unchanged, still THE gate).** Symbol →
   tiling needs the realizability lemma + a terminating realizer. Seed-anchoring does not weaken
   this; it *helps* it (few completions per multiset → the realizer runs rarely).

⇒ **If SA-1, SA-2, TH-12, and B2 hold, the seed-anchored sweep over all multisets is a provably
complete k-uniform enumeration with no lattice guessing and no from-scratch symbol explosion.**

## 4. The probe (CC, running)

Worktree `feat/dsym-seeded` off master @71eace0. Optional `anchor` parameter on
`generateCandidateSymbols` (flag-off byte-identical — digest discipline); driver
`scripts/dsym-seeded-probe.ts`; log `experiments/results/dsym-seeded-probe.log`.

**Acceptance (falsifiers first):**
- flag-off path reproduces §23.5 exactly (11 / 20, same digests);
- anchored k=1: union over the 21 species = exactly the 11 canonical keys;
- anchored k=2: union over the seed multisets = exactly the 20 canonical keys —
  *any miss = SA-2's folding check is wrong; fix before believing any node count*;
- folding unit test: minimal 4.4.4.4 symbol accepted by anchor 4.4.4.4, rejected by 3.4.6.4.

**Measurements:** Σnodes and per-multiset max at k=2 vs the 404M baseline (the collapse factor —
the headline); then anchored k=3 at the **proven** δ≤36 with loud per-multiset walls.

## 5. Decision table (AL, after the probe)

| k=2 collapse | k=3 δ≤36 anchored | Call |
|---|---|---|
| ≥100× and k=3 completes | completes | **This is the home-run architecture.** B2 (TH-11) becomes the single critical-path lemma; M2/M3 proceed seed-anchored; quotient-first (ST-6) is subsumed. |
| ≥100× but k=3 walls partially | partial | Anchored D-D = certifier to its completed multisets + finder beyond; pair with TH-10/ST-6 for the rest; still likely the best k=3 cross-check of the torus result. |
| <10× | — | Species-anchoring is too weak; escalate to §6 (geometric anchoring) or accept D-D as k≤2 witness only. |

## 6. Escalation: geometric anchoring (only if §5 row 3)

Use the seed's *adjacency structure* (which corners share which faces — the sketch's σ₂ arcs), not
just its species: start generation from the seed's partial symbol **closed under all candidate
foldings** (enumerate quotients of the star by subgroups of its dihedral symmetry, branch over
them). Strictly stronger pruning; pays for it with two new obligations: **SA-4 (converter
faithfulness)** — the geometric-patch → partial-symbol map must pin exactly {σ within the patch,
m-values seen} and leave free exactly {boundary σ₂} (the dent/star conventions of
[ST-1](05-star-and-new-directions.md) intersect here); **SA-5 (folding enumeration completeness)**
— the branched quotient set must contain the true tiling's fold. Do not build on spec; build on a
measured §5-row-3 verdict.

## 7. What this does NOT change

The certified k≤3 torus results stand as they are (oracle-anchored). B2 remains the only route to
proof-anchored counts on ANY D-D variant. The DG-1 verdict and the TX option-(b) thesis wording are
unaffected — if the probe wins, the thesis gains a *fourth* method section and a sharper future-work
claim, not a retroactive rewrite.
