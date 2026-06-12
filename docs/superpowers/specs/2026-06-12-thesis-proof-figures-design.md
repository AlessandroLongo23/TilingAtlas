# Thesis proof-chapter figure pass + owed-data manifest — design

**Date:** 2026-06-12 · **Author:** CC · **Status:** design, awaiting AL review
**Companion:** `../thesis/FIGURE_PLAN.md` (TA's programme — this spec extends it, does not replace it)

## Goal

Give the proof chapter (`../thesis/chapters/correctness.tex`, 2879 lines, 39 proofs,
46 theorem/lemma environments, **4 figures**) the visual support it lacks, and deliver the
measured data TA's owed tables/figures are blocked on. Target is *not* "a figure per proof" —
a figure stays only if a reader would otherwise reconstruct geometry or state in their head.

## Current state (don't re-derive)

The thesis is **not** a figureless wall. TA has executed almost all of `FIGURE_PLAN.md`:
~16 hand-authored concept figures (`../thesis/figures/fig-*.tex`), the 92 generated gallery
plates (k1/2/3 from `figures/`), front matter with `\listoffigures`/`\listoftheorems`/notation.
What remains on TA's own tracker: **Tier-3 (F15–F21)** and **owed tables needing CC numbers**.
This spec's figure list deliberately *overlaps* TA's Tier-3 where the proof reading independently
flagged the same items (octagon, dent-chain, equivariant) — for those, CC's job is to supply the
spec + data so TA can build them.

## Ownership split (load-bearing — see [[parallel-cc-sessions]] and [[figures-pipeline]])

`../thesis/` is **TA-owned**; CC must not edit TA's chapters or `fig-*.tex`. The only CC write
path into the thesis is `../thesis/figures/generated/` (AL-authorized, Gen output only).

- **CC delivers:** (a) this spec; (b) **Gen figure exports** into `figures/generated/`;
  (c) **DFS-structure data** emitted from the pipeline; (d) **measured tables** (numbers, as
  `.tex` fragments or CSV + a SYNC pointer). CC implements via `figures/` (the existing
  `pnpm figures` route) and the algorithm pipeline.
- **TA authors:** the hand-drawn TikZ schematics (sharing `../thesis/figures/concept-style.tex`),
  the captions, the `\input` placements, and the `\label`/`\cref` wiring in the chapters.

Handoff is via `docs/SYNC.md` (a dated CC→TA entry pointing here) — never by editing TA's files.

---

## The six figures

Each entry: the proof anchor (verified against the live text), the one-line claim, the **exact
objects to draw** (lifted from the proof so TA draws it faithfully), method, and the CC data (if any).
Suggested `\label{}`s reuse `FIGURE_PLAN` names where they already exist so the two plans align.

### G1 — `fig:octagon` · octagon-exclusion rigidity  *(= TA's F15)*
- **Anchor:** `lem:octagon` (`correctness.tex:897`), proof Step 3.
- **Claim:** any edge-to-edge unit-polygon tiling from {3,4,6,8,12} containing an octagon *is* the
  Archimedean 4.8.8 — the octagon forces the whole tiling.
- **Draw (Step 3 a–c, verbatim from the proof):**
  - One octagon `O` centred at origin; its **four octagon-neighbours across alternate sides**
    are translates `O±u`, `O±v` with `u⊥v`, `|u|=|v|=1+√2` (= twice the apothem); the **other
    four sides** are square-shared. Show the alternation (octagon-shared / square-shared sides
    alternate around `∂O`).
  - The octagon lattice `Λ₈ = ℤu ⊕ ℤv`, with `u=(1+√2)(1,0)`, `v=(1+√2)(0,1)` (the proof's
    coordinates) — draw the basis vectors (`basisvec` style).
  - The **holes are unit squares**, one per lattice cell, centred at `λ + ½(u+v)`, each filling a
    270°+90° corner. Mark one hole square.
- **Method:** TikZ schematic (exact coords; geometry is the point). *Optional* faint Gen underlay
  of a real 4.8.8 patch — **CC can export** if TA wants it; schematic alone is sufficient.
- **CC data:** optional 4.8.8 Gen patch (k=1 catalogue has it).

### G2 — `fig:incidence` · incidence of fixed loci  *(NEW — the whole pool-free §incidence is unillustrated)*
- **Anchors:** `lem:fixedincidence` (`correctness.tex:2423`), `def:incidence` (`:2480`),
  `prop:incidencefill` (`:2503`). One composite figure serves all three.
- **Claim:** a symmetry's fixed locus is forced to sit at finitely many spots relative to the
  tiling's vertices, so seeding only at those spots (the incidence anchor set `𝒜(Λ,G)`) loses no
  tiling — this is what makes the seed set *pool-free* (independent of k).
- **Draw (two panels):**
  - **Panel A (rotation centres, schematic):** a small mixed-polygon patch with a rotation centre
    drawn at **each of the only three legal types** — a **vertex** (δ=0), an **edge midpoint**
    (labelled `p=2`, the only order allowed there), and a **tile centroid** of an n-gon (labelled
    `p∣n`). At the centroid, draw the `n` centroid-to-vertex offset vectors `δ∈D_n` (these are
    half-grid directions, powers of ζ_{2N}); annotate `x⋆ = c+δ`.
  - **Panel B (reflection axis):** an axis drawn as a **union of edges / edge-perpendicular
    bisectors / centroid lines**, with the vertices it carries marked, recurring at lattice-bounded
    spacing; show that only the **transverse** position carries information (in-axis position
    absorbed by congruence).
- **Method:** Panel A schematic TikZ; **Panel B** benefits from a **Gen patch** (real polygon
  shapes make "axis runs along edges/bisectors" convincing). Composite figure, two subfloats.
- **CC data:** one Gen patch (a tiling with a clear rotation centre + mirror axis, e.g. a
  trihexagonal or snub-square patch) with the centre/axis marked → `figures/generated/`.

### G3 — `fig:star-graph` · star corner graph + dent-chain dichotomy  *(Panel B = TA's F16 `fig:dent-chain`; Panel A NEW)*
- **Anchors:** `lem:stargraph` (`correctness.tex:619`), `lem:dentchain` (`:650`).
- **Claim:** the corner graph Γ⋆ on a star tiling is well-formed (dent-fill points have degree 2,
  tiling vertices degree ≥3), and — under the *regular-filler hypothesis* — every dent chain has
  length exactly 2 (vertex–dent-fill–vertex). This licenses the star weight bound.
- **Draw (two panels):**
  - **Panel A (Γ⋆ anatomy):** a small star-tiling fragment; mark **dent-fill points** (degree 2:
    the two dent sides coincide with the two sides of the filling corner) vs **tiling vertices**
    (degree t≥3, tiles/sides alternate). Show tile sides as Γ⋆ edges. This is the new object the
    reader has never seen — distinct from the convex-tiling Γ of `lem:quotient`.
  - **Panel B (dichotomy):** the two cases of `lem:dentchain`(ii) side by side —
    (1) **gear contact**: a star point seated inside a star dent (a two-tile 2π point that *extends*
    the chain); (2) **regular filler**: the dent at `x` filled by a convex (non-star) corner, so the
    chain stops. Label the dented star `S` and filler `T`, the shared side `mx`, the reflex corner.
- **Method:** TikZ schematic (reuse `fig-star-anatomy.tex`'s `{n|d}` construction style and
  `tileedge`/`hairline`).
- **Labelling (TA's call):** either **one** two-subfloat figure `fig:star-graph`, or **split** into
  `fig:star-graph` (Panel A, new) + `fig:dent-chain` (Panel B, fills TA's F16 slot). Both panels are
  small enough to combine; splitting lets each sit at its own `\cref` anchor (`lem:stargraph` /
  `lem:dentchain`). Recommend split, so F16 keeps its planned identity.
- **CC data:** none (pure schematic). Optionally a Gen star patch if a real example is wanted.

### G4 — `fig:equivariant-cascade` · (G, placement) completeness  *(adjacent to TA's F20)*
- **Anchor:** `thm:groupcomplete` (`correctness.tex:1622`), with `def:branchclosure` (`:1589`),
  `lem:symrep`.
- **Claim:** every k-uniform tiling's full symmetry group `G_T` is recovered as the branch-closure
  of ≤2 bounded-weight generators drawn from the finite pool `𝒢_Λ(k)` — so the finite branch
  family `𝔉(Λ,k)` *contains every realizable group*.
- **Draw (conceptual cascade, left→right):**
  `T` (a tiling) → `G_T` (wallpaper group, translations = Λ) → point group `P_T`
  (cyclic/dihedral, ≤2 generators `ḡ₁,ḡ₂`) → **lift** each `ḡᵢ` via `lem:symrep` to
  `ĝᵢ=(Lᵢ,wᵢ)` with `wᵢ∈W(k·hol(Λ)−1)` (bounded weight) → **branch closure** `cl(Λ;{ĝ₁,ĝ₂})`
  under `(L,w)(L',w')=(LL', Lw'+w)` recovers `G_T`. Show the **coset map** `L↦[w]` data structure
  and the **abort condition** (one linear part receiving two distinct translation classes).
- **Method:** TikZ conceptual/commutative-style diagram (NOT a tiling render). *Medium-confidence:*
  the risk is decoration. Mitigation — anchor every box to a symbol the proof uses (Λ, P_T, W(s),
  hol(Λ), the coset map) so it reads as a data-flow of the proof, not vibes. **TA's call** at draft
  time whether it earns placement; if it reads thin, drop it (this is the one G-item I'd sacrifice first).
- **CC data:** none.

### G5 — `fig:reflection-cover` · name reversal realises handedness  *(NEW)*
- **Anchor:** `lem:reflectioncover` (`correctness.tex:1163`).
- **Claim:** a chiral vertex corona in *either* handedness is reached by an **on-grid rotation** of
  a generated node (or its mirror) — no geometric reflection of seeds is needed; the chiral pair is
  then merged by congruence (settled decision: mirror pairs merge).
- **Draw (the two cases of the proof):**
  - Canonical fan `s₀=fan(v₀,0)` with its first directed edge at angle `θ₀∈(2π/N)ℤ`.
  - **Case det g=+1:** the occurrence is `fan(v₀,r)+t`, `r` = on-grid rotation by `θ₁−θ₀`.
  - **Case det g=−1:** `g=ρ∘κ` (κ: z↦z̄ reflection in real axis); `κ·s₀` realises the mirror type
    `v̄₀`, equals `ζ_N^a·s̄₀`; then `ρ` = rotation by `θ₁+θ₀`, giving `fan(v̄₀,r)+t`.
  - Visual: the canonical fan, its mirror fan, and an occurrence reached via reflect-then-rotate —
    all coinciding up to on-grid rotation. Show edge-angle arcs (θ₀, θ₁) in Okabe–Ito overlay.
- **Method:** TikZ schematic. Lower priority of the six.
- **CC data:** none.

### G6 — vc-generation DFS tree + seed-assembly DFS  *(owed `\TODO`s; need CC's real search data)*
- **Anchors:** `../thesis/chapters/algorithm.tex:54` (vc-gen DFS), `:100` (seed-assembly DFS).
- **Claim:** illustrate the actual search structure of two pipeline stages (not hand-faked trees).
- **Draw:** the real DFS tree from a small concrete run (the worked example `{3³.4², 4⁴}` already
  in `sec:worked-example` is the natural subject — reuse it so the chapter stays coherent).
- **Method:** CC emits the tree structure as data → TA renders as TikZ `forest`/tree (or a table).
- **CC data:** **DFS-structure export** from the pipeline for the worked-example seed.
  ⚑ *Verify during planning:* `PipelineLogger.ts` may not currently emit tree structure — may need
  a small instrumented run. Flag if it can't, don't fake it.

---

## Data manifest (CC deliverables, beyond the figure specs)

`Gen` = `figures/generated/` export via the `pnpm figures` route. `Data` = numbers/structure.

1. **F19 `fig:oblique`** (Gen) — the two oblique k=3 tilings missed by symmetry-pinned cells,
   recovered by join-closure (already on TA's Tier-3; pure CC lane). Source: the certified k=3
   catalogue (digest `99919f42a7b58e76`); identify the two oblique-lattice tilings, render as a
   gallery pair. See [[k3-pertiling-defect]].
2. **G1 / G2 Gen patches** (Gen) — 4.8.8 patch (optional, G1); rotation-centre+axis patch (G2).
3. **G6 DFS structure** (Data) — vc-gen + seed-assembly trees for the worked example.
4. **Seed-set count tables** (Data, `algorithm.tex:80`) — counts + timings, regular and
   regular+stars. Likely extractable from `experiments/results/op*-k3-census-table-*.log` and the
   sweep logs; re-run only to fill gaps.
5. **Per-stage performance profile** (Data, `results.tex:444`) — candidate counts, fill rates,
   gate costs per stage. Source: census/sweep logs + `PipelineLogger`. The k=4-wall numbers are
   already in `fig-k4-wall` (TA's F14); this is the broader per-stage split.
6. **Star-family growth + timing** (Data, `results.tex:452`) — combinatorial growth + timings.
   Source: star-lane runs; see [[star-lane-state]]. ⚑ honest scope: only what's actually measured.

> **`results.tex:366` (k=4..6 campaign) stays a stated gap** — "open / measured wall", not a table.
> Manufacturing numbers there would violate the completeness-honesty rule. See [[advisor-review-2026-06-09]].

## Production notes

- TikZ figures share `../thesis/figures/concept-style.tex`: fills `tileN3/4/6/8/12` (+ extended
  n), edges `figEdge`/`figFaint`, `tileedge`/`hairline`/`basisvec`/`latticept`/`orbitmark`,
  Okabe–Ito overlays (`oiBlue`, `oiVermillion`, …) for annotation. This keeps concept figures and
  the generated galleries in one visual language.
- Gen figures: color-by-polygon-type (`byNGon`), white background, mm-precise widths — consistent
  with the galleries (`figures/README.md` conventions). Canonical orientation = shortest lattice
  vector onto +x, rotation only (never reflection — chirality is type-distinguishing).
- Gen exports must pass the snapshot gate (certified 11/20/61 with known digests) — the figure
  route never renders unproven data.

## Out of scope (proofs deliberately left figureless)

Dropped after reading — short algebraic/bounds arguments where a figure decorates, not clarifies:
`prop:gate` (orbit-gate window), `lem:fillreach` step-sequence (redundant with the existing
`fig-corner-fill`), `def:branchclosure` data-structure snapshot (folded into G4 if useful),
`lem:equicert` fixed-locus case, `lem:starseedcover`, `def:reanchorset` before/after,
`lem:gridisometry`, `prop:congruence`, `lem:wallpaper`/`lem:quotient`, the termination argument,
the pruning props (`prop:orbitfloor`, `prop:typeprune`). `lem:ddrealize` is already served by the
existing `fig:dd-chamber`.

## Risks / verify-during-planning

- **DFS export (G6):** `PipelineLogger` may not emit tree structure today → small instrumentation.
- **Measured tables:** confirm the logs actually contain per-stage splits at the granularity the
  table needs before promising the table; if not, scope down honestly.
- **Coordination:** TA is actively editing thesis figures (4 commits 2026-06-11). Post the SYNC
  handoff before TA starts Tier-3 so the labels (`fig:octagon`=F15, `fig:dent-chain`=F16,
  `fig:equivariant`) don't diverge. Confirm no second CC session is mid-write first.
- **G4 is the soft one:** if the cascade diagram reads as decoration at draft, cut it.

## What the implementation plan will cover (CC's portion only)

Gen exports (F19 + G1/G2 patches), the G6 DFS-structure export, the measured-data extraction
(items 4–6), and assembling the figure specs above into a single handoff doc + SYNC entry for TA.
The TikZ authoring and chapter placement are TA's work, tracked in `../thesis/FIGURE_PLAN.md`.

## Delivery status (2026-06-12, branch `feat/proof-figure-data`)

**Delivered** → `../thesis/figures/generated/explanatory/` (PDFs + auto README; TA to commit in the
thesis repo), all rendered from the certified catalogue (digest `99919f42a7b58e76`), galleries untouched:
- `oblique-A.pdf` = **t3046**, `oblique-B.pdf` = **t3055** — F19 oblique k=3 pair (basis overlay = the
  oblique cell). Identified by exact `holohedry==2` (test `figures/tiling/oblique-k3.test.ts`).
- `octagon-488.pdf` = **t1002** — G1 4.8.8 underlay (TA overlays Λ₈ vectors + square holes).
- `incidence-axis.pdf` = **t1006** (3.4.6.4) — G2 Panel B underlay (TA draws the reflection axis).
- Build path: `pnpm tsx figures/build.ts --explanatory` (manifest in `figures/build.ts`).

**Deferred — NOT delivered (need clean/coordinated runs or own recon):**
- **Lattice/seed-set census table** (manifest item 4, `algorithm.tex:80`): parser + tests shipped
  (`figures/data-extract/censusTable.ts`), but the only census logs (op2/op3) are **dup-inflated and
  mutually inconsistent** (72275/2468 vs 189359/9210 work/lattices — different OP lanes, neither
  canonical). No fragment emitted; needs a clean re-run before any number is quoted.
- **Per-stage perf profile** (item 5, `results.tex:444`) + **star-family timings** (item 6,
  `results.tex:452`): not in existing logs; need fresh coordinated runs.
- **G6 DFS trees** (`algorithm.tex:54`,`:100`): need generator instrumentation; own plan.

**TA-authored TikZ (specs only, no CC data):** G3 star-graph/dent-chain, G4 equivariant cascade,
G5 reflection-cover, plus the proof-specific overlays on the G1/G2/F19 underlays above.
