# Prompt for TA (thesis agent) — proof-figure authoring

Copy the block below into a TA chat. It is self-contained.

---

CC has finished the data/Gen half of a **proof-chapter figure pass** for `correctness.tex` and handed
it to you for the TikZ authoring + placement. Your repo (`thesis/`) is yours to edit; CC will not
touch it.

**Read first:**
- `TilingAtlas/docs/superpowers/specs/2026-06-12-thesis-proof-figures-design.md` — the full spec: 6
  figures G1–G6, each grounded in the actual proof text, with exactly what to depict. This is your
  authoritative source; the summary below is just orientation.
- Your own `thesis/FIGURE_PLAN.md` — G1 and G3-Panel-B and F19 are already on your Tier-3 list (F15,
  F16, F19); this pass supplies their specs + Gen data so you can build them.

**Already delivered to you** (in `thesis/figures/generated/explanatory/` — please `git add` + commit
in the thesis repo; rendered from the certified catalogue, galleries untouched):
- `oblique-A.pdf` = t3046, `oblique-B.pdf` = t3055 — the two oblique k=3 tilings (basis overlay = the
  oblique cell), for **F19 `fig:oblique`** (`sec:val-k3`).
- `octagon-488.pdf` = t1002 — clean 4.8.8 patch, underlay for **G1 `fig:octagon`** (= your F15).
- `incidence-axis.pdf` = t1006 (3.4.6.4) — clean reflective patch, underlay for **G2 Panel B**.
- `README.md` lists each.

**Figures to author** (full detail + proof anchors in the spec):
- **G1 `fig:octagon`** (`lem:octagon`, octagon-exclusion rigidity): over the `octagon-488` underlay
  (or as a schematic), draw the Λ₈ basis `u`,`v` (length 1+√2, orthogonal), the alternation of
  octagon-/square-shared sides, and one square hole at `λ+½(u+v)`.
- **G2 `fig:incidence`** (`lem:fixedincidence`/`def:incidence`/`prop:incidencefill`): Panel A =
  schematic showing rotation centres at the only 3 legal spots (vertex / edge-midpoint `p=2` / centroid
  `p∣n`) with the offset vectors `δ∈𝒟`; Panel B = a reflection axis drawn over `incidence-axis.pdf`
  along edges / perpendicular bisectors / centroid lines.
- **G3 `fig:star-graph`** (+ **`fig:dent-chain`** = your F16) (`lem:stargraph`, `lem:dentchain`):
  Panel A = a star-tiling fragment marking dent-fill points (degree 2) vs tiling vertices (degree ≥3)
  in the corner graph Γ⋆; Panel B = gear-contact vs regular-filler dichotomy (why dent chains have
  length 2). Spec recommends splitting into two figures so F16 keeps its identity.
- **G4 `fig:equivariant-cascade`** (`thm:groupcomplete`): conceptual cascade T → G_T → point group
  P_T → ≤2 bounded-weight lifted generators → branch closure recovers G_T. **Medium-confidence — your
  call:** if it reads as decoration, not as load-bearing, cut it. Anchor each box to a symbol the
  proof uses (Λ, P_T, W(s), hol(Λ), the coset map) so it's a data-flow of the proof, not vibes.
- **G5 `fig:reflection-cover`** (`lem:reflectioncover`): a chiral vertex fan reached two ways —
  on-grid rotation (det g=+1) vs reflect-then-rotate (det g=−1) — coinciding up to on-grid rotation;
  show the edge-angle arcs θ₀, θ₁.
- **F19 `fig:oblique`**: place the two delivered oblique PDFs (`sec:val-k3`).

**House style:** share `thesis/figures/concept-style.tex` (`tileedge`, `hairline`, `basisvec`,
`latticept`, `orbitmark`, Okabe–Ito `oiBlue`/`oiVermillion`…, `tileN<n>` fills). For G3 reuse the
`{n|d}` construction style from `thesis/figures/fig-star-anatomy.tex`. Keep concept figures and the
generated galleries in one visual language.

**What is NOT coming from CC yet (do not wait on these):** the owed *tables* — lattice/seed-set
census (`algorithm.tex:80`), per-stage performance profile (`results.tex:444`), star-family timings
(`results.tex:452`) — are deferred (the existing census logs are dup-inflated and inconsistent; the
perf/star numbers need fresh coordinated runs). The G6 vc-gen / seed-assembly DFS trees
(`algorithm.tex:54`,`:100`) also need new generator instrumentation. CC has logged all of this; it
will come in a later coordinated pass. The `results.tex:366` k=4–6 row stays "open / measured wall",
not a table.

**When done:** update `thesis/FIGURE_PLAN.md` (mark G1/G2/G3/G5/F19 landed, note G4 keep/cut) and
append a 3–6-line `docs/SYNC.md` entry (TA → CC+AL) listing what you placed + the new page count.

---
