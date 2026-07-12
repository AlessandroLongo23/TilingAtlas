# Trust map — where the risk in the completeness proof actually lives

Date: 2026-07-12. Purpose: for a reader who cannot personally certify the geometry, this
sorts every lemma of `skeleton.tex` into one of three tiers, so the question "can I trust
this proof?" reduces to a small, bounded set of lemmas that genuinely need a mathematician,
rather than 27 pages taken as one indivisible object.

Tiers:
- **M — mechanical / finite.** A finite computation or a routine finite argument. Checkable
  by a program, and most are checked by `checks/verify_finite.py` (independent of the
  engine) or by the generator certificates. You (a computer scientist) can vet these.
- **C — classical application.** Leans on a textbook theorem; the work is confirming the
  hypotheses are met, which `classical-citations-audit.md` does. No new mathematics.
- **G — needs a geometer.** Genuinely novel geometric/topological content. This is the
  short list a human expert should review. Everything else supports it.

## The short list (tier G) — what a geometer must actually check

Only these carry novel geometry. They are a few pages, not the whole document.

| Lemma | Content | Why it needs a human |
|---|---|---|
| C1(iv) | the direction-bundle glues to a flat, oriented, closed surface | flatness at vertices depends on the vertex-link = corner-step identification (the "referee surface" owed sub-check); the rest of C1 is arithmetic (A2iv, checked) |
| C3a–C3c | the developed tiling, its rigidity, and Fl(dev M)/H(M) ≅ M | the covering-space / developing-map argument on the bundle; the affine realizations g(z)=ζʰz+w |
| B3 | the Galois correspondence congruences ↔ intermediate symmetry groups, and the bijection | the pivot; freeness + development uniqueness must interlock exactly |
| L1 (orientation half) | each σᵢ reverses local orientation, so return maps are rotations | a short but genuinely geometric argument underpinning condition 2a |

Everything feeding these is either M or C. C2 (Killing–Hopf) is the classical input they
consume; it is confirmed correctly applied (citations audit §2).

## Full ledger by tier

**Model (§3).**
- D1a flag calculus / dictionary / face walk — **M** (finite computation in local
  coordinates; the phase-1 γ error was found exactly by doing this computation).
- D1b quotients + gluing-type dictionary — **M/G** (finite case analysis of stabilizers;
  the stabilizer-geometry is elementary).
- B0 flag rigidity, discreteness — **M** (two-line rigidity + a metric-separation bound).

**Octagon scope (§2).**
- O1 octagon species = {4.8.8, 3.8.24} — **M** (Diophantine; independently re-enumerated
  and complete after the round-1 heptagon fix).
- O2 3.8.24 excluded — **M** (self-contained adjacency argument; G&S is a secondary anchor).
- O3 octagon ⇒ t1002, 1-uniform — **M/G** (finite forcing + a connectivity induction;
  elementary but geometric).
- O4 palette {3,4,6,12}, grid directions — **C** (G&S species table; verified vs the book) + **M** (coset glue).

**Alphabet (§4) — all M, all machine-checked.**
- A1 14 configurations — **M** — `verify_finite.py` PASS (re-enumerated independently).
- A2 variants = subgroup conjugacy classes — **M/C** (the geometric half, "stabilizer acts as a word symmetry," is elementary; the fold count is finite).
- A3 44 entries = folds, three copies agree — **M** — generator gate + `verify_finite.py` from-scratch alphabet matches shipped tables PASS.
- A4 structural identities — **M** — PASS.
- A5 ferk transversal (|Aut|=ferkval, free, reps) — **M** — PASS (independent Aut recompute).
- A6 pairwise non-isomorphic — **M** — PASS (added this round).
- A2(iv) angle-weight divides 12 — **M** — PASS (feeds C1 flatness).

**Local rules (§5) / §3.**
- L1 necessity + heredity — **M** (heredity) + **G** (the orientation argument, tier-G list).
- L2 mirror parity — **M** (follows from the stub-system axioms; Remark 3.2).

**Search (§6) — the completeness core.**
- T1 termination — **M** (finite tree, bounded depth).
- S1 guided descent (no-drop) — **M** in structure (induction on gluings) — and **independently cross-checked**: `verify_finite.py`'s fresh brute enumerator = engine pruned set at k ≤ 3 (10/20/61). This is the lemma the historical Python bug violated; the cross-check is direct evidence it holds.
- S2 min-letter rooting; sharding — **M**.
- S3 emission gates — **M** + audit (deliverable B).
- S4 checkpart = conditions 1/2a/2b — **M** — `verify_finite.py` re-validates all 1247 emitted k ≤ 6 solutions against an independent condition-checker, PASS.

**Rigidity + dedup (§7).**
- R1 refinement = coarsest congruence; discrete ⇔ core — **M/C** (partition-refinement citation, audited; the congruence identity is elementary) — core-ness independently re-checked on all 1247 emitted solutions, PASS.
- R2, R3 — corollaries of B3.
- P1 pruner exact on cores — **M** (fixpoint argument) — independent dedup check: pruned catalog pairwise non-isomorphic per k, PASS; and P3 (canonical form N) passes both directions k ≤ 6.
- P2 bucket keys invariant — **M**.

**Realizability (§8).**
- C0 quotients preserve validity — **M**.
- C1 bundle surface flat/oriented/closed — **G** (tier-G; flatness sub-check owed) + **M** (arithmetic, A2iv).
- C2 closed flat oriented surface = ℂ/Λ — **C** (Killing–Hopf; audited).
- C3a–d developed tiling, rigidity, round-trip, functoriality — **G** (tier-G).
- C4 eu_develop computes the marked development — **M** + audit (deliverable B; FB-1 float caveat quantified).

**Bridge (§9).**
- B1 cocompact wallpaper ⇒ periodic — **C** (Bieberbach; audited) + **M** (cocompactness argument).
- B2a T/G(T) valid over 𝒜, k vertices — **M/C** (assembles A1/A2/A3/O4/L1/B1).
- B2b T/G(T) is a core — **G** (via B3).
- B3 Galois correspondence + bijection — **G** (tier-G; the pivot).

**Composition (§10).** — **M** (assembles closed lemmas; each step's hypotheses match).

## What this buys you

- **Tier M (the bulk): independently verified.** The alphabet (A1–A6, A2iv), the local
  conditions on every emitted solution (S4), core-ness (R1), dedup (P1/P3), and — the one
  that matters most — the no-drop property (S1) at k ≤ 3, are all confirmed by
  `checks/verify_finite.py`, which shares no code with the engine. A reader can run it.
- **Tier C: confirmed correctly applied.** Four classical theorems, hypotheses discharged
  (`classical-citations-audit.md`).
- **Tier G: the actual ask for a human expert.** Four lemmas (C1(iv), C3a–c, B3, L1
  orientation), a few pages, with one explicitly owed sub-check (vertex-link = corner-step).
  This is what to send to Čtrnáct or a tiling geometer — not the whole 27 pages.

Honest caveat: tier assignment is a judgement about where novelty lives, and "M/G" rows are
borderline. When in doubt a row was left in the more-scrutiny tier. The independent checks
cover the finite content; they do not and cannot cover tier G, which is why the human review
is still the gating step for calling the proof settled.
