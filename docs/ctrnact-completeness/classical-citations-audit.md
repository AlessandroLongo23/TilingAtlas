# Classical-citation audit — Čtrnáct completeness proof

Date: 2026-07-12. Companion to `skeleton.tex`. Scope: the four external results the proof
relies on, checked for (a) the citation names a real theorem stated correctly, (b) the
theorem's hypotheses are actually established where the proof applies it, and (c) the
proof uses only what the theorem gives. This is *not* a re-proof of the classical
theorems — Bieberbach and Killing–Hopf are textbook — it is a check that they are applied
correctly and their hypotheses met, which is the part a proof can get wrong.

Honest limitation of this audit: I verify statement-fidelity and hypothesis-discharge, not
the classical theorems themselves. A geometer should still confirm the two geometry
applications (Killing–Hopf via the bundle, and the vertex-link flatness feeding it), which
are the only places the classical input is doing real work rather than bookkeeping.

## Summary

| Citation | Used in | Hypotheses needed | Established by | Verdict |
|---|---|---|---|---|
| Bieberbach (2D crystallographic) | B1 | discrete, cocompact | B0 (discrete), B1-internal (cocompact) | correctly applied |
| Killing–Hopf (closed flat oriented surface) | C2 | compact, flat, oriented, connected, no boundary | C1(i)–(iv) | correctly applied; one owed sub-check |
| Grünbaum–Shephard species table | O2, O4 | edge-to-edge regular tiling | definitional | correctly applied (verified vs the book) |
| Partition refinement (Cardon–Crochemore / Paige–Tarjan) | R1 | deterministic structure | definitional (functional relations) | correctly applied |

No misapplied citation found. One owed sub-check (the vertex-link closure detail that makes
C1's surface *flat*) is the "referee surface" item already flagged in the skeleton; the
independent angle-weight checker (A2iv, `verify_finite.py`, PASS on all 44 letters) is direct
computational support for it.

---

## 1. Bieberbach — B1 (`skeleton.tex`, Lemma B1)

**Cited statement.** A discrete cocompact group of isometries of ℝ² is one of the 17
wallpaper groups and contains a rank-2 lattice of translations of finite index.

**Fidelity.** This is Bieberbach's theorem specialized to dimension 2 (the first
Bieberbach theorem gives the finite-index full-rank translation lattice; the classification
into 17 groups is the 2D crystallographic-group theorem). Stated correctly. Any standard
crystallographic-groups reference substitutes; the proof only uses the translation-lattice
half ("contains rank-2 translations ⇒ doubly periodic").

**Hypotheses, and where they come from.**
- *Isometry group of ℝ²*: `G(T)` is by definition (Def. 1.1). ✓
- *Discrete*: established by **B0** (flag rigidity ⇒ free action on flags ⇒ if `g_m → id`
  then `g_m` fixes a flag hence `= id`), which is Lemma B0, proved in §3 and listed as a
  B1 dependency. Prior to B1. ✓
- *Cocompact*: established **inside B1**: the `G(T)`-translates of `k` closed vertex-stars
  of radius the dodecagon circumradius cover ℝ² (every point lies in a tile, hence within
  that radius of a vertex, hence of a group-translate of one of the `k` orbit reps). Self-
  contained, uses only `k`-uniformity + bounded tile diameter. ✓

**Use.** B1 concludes `k`-uniform ⇒ `G(T)` wallpaper ⇒ contains rank-2 translations ⇒
doubly periodic. Uses exactly the translation-lattice conclusion. No over-reach.

**Verdict: correctly applied.** The one subtlety a referee checks — that discreteness is
proved *before* invoking Bieberbach rather than assumed — is handled by B0. The proof does
not silently assume periodicity; it derives it.

---

## 2. Killing–Hopf — C2 (`skeleton.tex`, Lemma C2), the load-bearing geometry

**Cited statement.** A closed (compact, boundaryless) connected flat oriented surface is
isometric to ℂ/Λ for a rank-2 lattice Λ acting by translations.

**Fidelity.** Correct. Elementary route (given in the proof note): a compact flat surface
is complete ⇒ universal cover is ℝ² (Killing–Hopf) ⇒ deck transformations are
fixed-point-free isometries, orientation-preserving by orientability ⇒ translations ⇒
compact forces the translation group to have rank 2 ⇒ ℂ/Λ. Equivalent to "the only closed
oriented flat surface is the torus" (Gauss–Bonnet gives χ = 0), but the deck-group route is
cleaner and is what the note uses. Stated and routed correctly.

**Hypotheses, and where they come from — this is where the proof does real work (C1).**
- *Compact*: `S(B₀)` is finitely many closed polygons glued along edges (C1(iv)); finite
  ⇒ compact. ✓
- *Connected*: `B₀` is a connected component by construction (Def. 8.4), so the glued
  surface is connected. ✓
- *No boundary*: every bundle edge is traversed by exactly the two face-walks through its
  two darts (C1(iii)), so every polygon edge is glued to exactly one other — no free edge,
  no boundary. ✓ (This is the hypothesis most easily skipped; C1(iii) supplies it.)
- *Oriented*: orient every polygon along its face walk; each gluing reverses boundary
  direction (C1(iii)), so the orientations are globally consistent. ✓
- *Flat*: the only nontrivial one. Interior points are flat (Euclidean polygon); edge
  points are flat (two half-disks glued isometrically). **Vertex points** are flat iff each
  vertex link is a single cycle of total cone angle exactly 2π. C1(i) proves the corner-step
  cycle carries total angle-weight exactly 12 units = 2π, using the angle-weight property
  A2(iv). **The one owed sub-check** (skeleton "referee surface", item 1) is that the
  vertex-link alternation *is* the corner step — i.e., the corners glued around a vertex are
  exactly the corner-step orbit. This is finite bookkeeping from Defs. 3.x/8.4, not written
  out in full.

**Independent support for the owed sub-check.** `verify_finite.py` recomputes A2(iv) freshly
for all 44 letters (every ρ-cycle weight-sum divides 12) — PASS. This is exactly the
arithmetic C1(i) needs; what remains for a geometer is only the combinatorial identification
"link = corner-step orbit," not the angle count.

**Use.** C2 is applied to `S(B₀)` to get ℂ/Λ, then the tiling develops as the pullback
(C3a). Uses exactly the ℂ/Λ conclusion. No over-reach.

**Verdict: correctly applied, with one flagged owed sub-check.** Every hypothesis of
Killing–Hopf is established by an identified part of C1, including the two a referee would
probe first (no-boundary and flatness-at-vertices). The residual is the vertex-link
identification, which the skeleton already lists as owed and which the angle-weight checker
supports.

---

## 3. Grünbaum–Shephard species table — O2, O4

**Cited statement.** For edge-to-edge tilings by regular polygons there are 17 possible
vertex species (21 types); the six species `3.7.42, 3.8.24, 3.9.18, 3.10.15, 4.5.20,
5.5.10` admit no vertex in any such tiling; the realizable species use only polygon sizes
`n ∈ {3,4,6,8,12}`.

**Fidelity.** Verified directly against the book (`resources/papers/Tilings and Patterns`,
Table 2.1.1 pp. 59–61, and the p.59 statement "there is no edge-to-edge tiling by regular
polygons that includes even a single vertex of the species" for the six double-starred
species; equation 2.1.2 is the angle equation; Statement 2.1.3 the 11 uniform tilings). The
citation names the right table and the right six species. ✓

**Hypotheses.** Only "edge-to-edge tiling by regular polygons," which is Definition 1.1. ✓

**Use.**
- **O2** cites it as an anchor for excluding `3.8.24`, but *also gives a self-contained
  proof* (the odd-polygon adjacency / triangle-3-cycle argument), so O2 does not actually
  depend on the citation.
- **O4** uses "only `n ∈ {3,4,6,8,12}` occur" to restrict the octagon-free palette to
  `{3,4,6,12}`. This is exactly the table's content after removing the six non-realizable
  species. ✓

**Verdict: correctly applied, and verified against the physical source.** O4's load-bearing
use is precisely what the table proves; O2 is self-contained anyway. The proof offers to
reprove the six exclusions in the O2 pattern if self-containedness is preferred — a genuine
option, since each is the same shape of argument.

---

## 4. Partition refinement — R1 (Cardon–Crochemore 1982 / Paige–Tarjan 1987)

**Cited statement.** Iterated colour refinement converges to the coarsest partition stable
under the given functions, computable in near-linear time.

**Fidelity.** Standard; stated correctly. R1 uses only "converges to the coarsest stable
partition," not the complexity bound.

**Hypotheses.** The structure's relations are *functions* (rneig, lneig, mirro, glue are
total maps on a closed system). Met by Def. 3.1. The step from "coarsest stable partition"
to "coarsest congruence" is proved *inline* in R1 (on functional structures the two
coincide — Myhill–Nerode), not cited. ✓

**Use.** R1 identifies `W(M)` (what `simplify` computes) with the coarsest congruence, hence
"discrete ⇔ core." Uses exactly the convergence result.

**Verdict: correctly applied.** The one place a referee worries — that colour refinement is
incomplete for *graph* isomorphism — is defused because the structures are deterministic
(functional), where refinement is exact; the skeleton states this explicitly and proves the
congruence identity rather than leaning on the citation for it.

---

## Bottom line

All four classical inputs are real theorems, stated correctly, applied within their
hypotheses, and the hypotheses are each discharged by an identified prior lemma
(discreteness by B0, cocompactness inside B1, the five surface hypotheses by C1, functional
structure by Def. 3.1). No citation is misremembered or over-applied. The single residual is
the vertex-link identification feeding C1's flatness — already flagged as owed in the
skeleton and computationally supported by the A2(iv) checker — and it is the natural thing to
put in front of a geometer, because it is the one spot where the classical geometry is doing
load-bearing work rather than standard bookkeeping.
