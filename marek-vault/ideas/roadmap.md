---
type: plan
tags: [ideas, roadmap]
status: living
sources: ["archive/2026-07-13..15", "marek-vault tilings_exploration.txt"]
---

# Roadmap: everything we said we'd do

The working list distilled from three days of chat plus his [[marek-list-of-ideas]]. Grouped by kind,
roughly ordered by dependency inside each group. Strike items as they land.

## Tiling Atlas platform

- [ ] **Ingest his raw data.** Decide storage (leaning Supabase DB over files-in-repo, for realtime
      run monitoring), then build the decoder: solution files → renderer. Caveats: files aren't all
      identically laid out, and raw solutions carry **no geometry**; the TES converter adds it. Either
      port the converter math or ingest TES directly. See [[solution-file-format]] and [[tes-format]].
      Starter dataset: `solutions.zip` (the `5.5.5.3` / `oo.5.3.3` family, folders = one solution file
      each, same k + same edge + uniformly chiral or not; skip `Soo` dirs at first; goes to k=25).
- [ ] **Local/prod split.** localhost spawns and controls search runs; prod is read-only, shows
      realtime progress from the DB. (My design, he liked it.)
- [ ] **Automatic screenshot generator** — his single biggest UX ask: see every tiling in the database
      before "going into" one. ![[archive/2026-07-13#^msg-1526179298451525672]]
- [ ] **Renderer options** (his direct feedback):
  - [x] catalogue categories collapsed on load ![[archive/2026-07-15#^msg-1526988155558035661]]
  - [ ] color modes: same-shape-same-color (good for high-k Euclidean) vs **orbit coloring** (better
        for understanding structure; default for medium complexity); keep my per-shape palette
        consistent across geometries
  - [ ] checkerboard mode only for tilings where every vc has an even tile count
  - [ ] **colored dots on vertices to show vertex orbits** (tile orbits are visible, vertex orbits
        aren't) — the `feat/vertex-orbit-dots` branch is exactly this
  - [ ] line width follows geometry (thick centre → thin rim) as default, constant width as option
  - [ ] pan snapping to cell/edge/vertex anchors (free dragging rarely lands on a symmetric view)
- [ ] **Next tilings to render** (his suggested order): rectified tilings (edge still easy to
      compute), then simple apeirogonal ones like `{oo,3}`.
- [ ] Read **Zeno's rendering docs** before extending the hyperbolic renderer ([[contacts]]).
- [ ] Fix chiral-duplicate display in the tetromino catalogue (mirror images shown as two tilings;
      also missing: the 4×4 square of 4 T-tetrominoes, 2 isohedral tilings; "k-1" label wrong for
      S+O mixes since not isohedral). ![[archive/2026-07-15#^msg-1526915095442096140]]

## Engine (STS) work

- [ ] **Generalize the many-main.cpp workflow**: one binary reading tile/vertex data + parameters from
      a file. Must be able to do everything the variants do (initial-vertex restriction, reduced sets,
      extra rules). See [[main-cpp-workflow]].
- [ ] **Interrupt/resume** for long runs (the 2-month run had no checkpoint).
- [ ] **Restore edge types** (non-commensurable edges; existed in the old version, lost in the new).
- [ ] **Canonization**: a canonical form so multithreaded runs record deterministic representatives.
      My Soto-Sánchez-matrix idea might fit. See [[canonical-form]].
- [ ] **Edge-selector experiments**: same search, different selectors, measure. Possibly per-search
      crafted selectors. See [[dual-search]].
- [ ] Euclidean-only: wallpaper-group detection for pruning and automatic classification of output.
- [ ] Refine k to exclude degenerate vertices (2-tile vertices, star-dent vertices), aligning with the
      Myers convention my thesis uses. He was already considering it. ![[archive/2026-07-14#^msg-1526666323818713211]]
- [ ] Try compiling `planar_tilings-main.zip` and race it against my TS/C++ implementation to 16
      vertices (his challenge). ![[archive/2026-07-13#^msg-1526180880509571092]]

## Research questions (the hard fun)

Tracked in detail in [[open-questions]]; headline items:

- [ ] Prove the numerically-found hybrid edge identities exact ([[hybrid-identities]]).
- [ ] Formalize the corona/"can't surround a polygon" conditions into precise existence criteria.
- [ ] The `(A3^2,Aoo)=(A8,A24)` family: why does no hybrid tiling seem to exist?
- [ ] Uniqueness proofs for isolated systems (`3.3.6.9` and, he suspects, all `3.3.6.3n`, n>2), in the
      style of the 4.8.8 argument.
- [ ] The ≥5-valent periodic-tiling hypothesis (arXiv:2302.05661).
- [ ] 3D first target: isohedral tilings of space by 1×1×2 cuboids ([[marek-list-of-ideas]] 1e).

## Publication and community

- [ ] The **wiki** ("Marek Čtrnáct's Tiling Atlas"): complete catalogue across geometries + the
      definitions, classification, and how STS works. I own the bookkeeping; he supplies knowledge and
      data. **Tutorial first** — he wants to see which parts are hard to learn, using me as the test
      reader. Possibly merge or interlink with Zeno's tes-catalog (ask Zeno).
- [ ] The Euclidean paper: he forwarded the old review email; mine for weaknesses, then decide venue.
      A hyperbolic follow-up could involve Goodman-Strauss ([[contacts]]).
- [ ] Post the repo in #tessellations; Illustrating Mathematics invite via Marek.
- [ ] OEIS: A068599 higher terms come from STS itself (can't self-verify); note the k=18 completion
      status. ![[archive/2026-07-14#^msg-1526652621497045003]]

## Learning path (mine)

1. Get fluent in the [[conway-symbol]] (his `(a^3,b^2)` walkthrough is the exercise to redo by hand).
2. Read [[tes-format]] against real files in `solutions/`, render one end-to-end.
3. Redo a small [[hybrid-identities]] derivation: cancel a shared identity into mixing rules.
4. Then the harder theory: [[hyperbolic-tilings]] families, apeirogonal arithmetic.

## Related

[[marek-list-of-ideas]] · [[contacts]] · [[open-questions]] · [[classification]]
