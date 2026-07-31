# STATUS — TilingAtlas (current-state cache)

> **What this file is.** The 30-second "where are we" snapshot. **Mutable, disposable,
> clobber-tolerant** — if two agents overwrite it, nothing is lost, because the *canonical*
> history lives in the append-only **ledgers** below. Regenerate it from the latest signed
> entry of each ledger. **Never write history here.** — last updated 2026-07-31, CC
> (acting as TA too, AL authorization 2026-07-10).

## The hyperbolic freedraw renderer is finished (2026-07-31)

Marek's open item from 2026-07-29 is closed. The hyperbolic Schwarz shelf now draws through the
per-pixel WebGL path like every other hyperbolic shelf: the disk fills to the rim, panning re-anchors
through the side pairings and never drifts. The fully-drawn (2,4,5) triangle he could not find is
`hs245-3-00010` and renders. Roadmap item ticked in `marek-vault/ideas/roadmap.md`.

- **`force2d` deleted** from `HyperbolicEdgesCanvas` / `HyperbolicEdgesThumbnail` and all five Schwarz
  call sites. The reason it existed was wrong: the reducer never rebuilt side pairings from one edge
  length, it takes them from the developer's deck frames.
- **`maxTileRadius()`** (new, `hyperbolicDevelopClient.ts`) bounds the develop margin by the longest
  per-dart class on a scalene board, replacing three inlined copies that used the scalar `edge`.
  Regular boards compute the same number, so {p,q} records bake byte-identically.
- **The edge field measures a texel against its face's VERTEX STAR**, not its own sides. Closes a white
  pinhole at every vertex a bold run passes straight through — a defect on every hyperbolic edge shelf,
  not only this one. Cost 0.94–1.33× via a per-edge bbox reject; colorings byte-identical.
- ⚑ `hs237-3-00001` draws 0 of 6 edge orbits, so it renders as a blank disk with the scaffold off.
  Correct, but reads as broken — the shelf may want the scaffold forced on when nothing is drawn.
- ⚑ `tests/star-general-path.test.ts` fails on a 60 s timeout at ~160 s of real work. Pre-existing, on
  the superseded lattice path; untouched by this change.

Detail: DEVELOPMENT_NOTES.md §"the hyperbolic Schwarz shelf joins the per-pixel renderer"; numbers in
`experiments/results/hyp-schwarz-renderer-2026-07-31.md`.

## The Schwarz boards are a nine-board family across all three geometries — UNCOMMITTED (2026-07-28)

Marek's corpora (`materials/solvers/edges/Schwarz/`) are decoded and live. 135,636
certificates (122,419 curved + 13,217 Euclidean), **0 failures**. Surfaced on /library, /play and
/freedraw under all three geometries — verified in the browser, 2026-07-29.
`pnpm build` clean; `pnpm test` 1612 pass, 1 fail — the same pre-existing
`star-general-path.test.ts` 60 s timeout noted below (file untouched; it needs 167 s alone). Detail:
DEVELOPMENT_NOTES.md §"The Schwarz family becomes a family".

- **Three back ends, split by the sign of 1/p + 1/q + 1/r − 1.** Spherical (2,2,3) (2,2,4) (2,3,3)
  (2,3,4) (2,3,5) close under an SO(3) develop and ship finished geometry; hyperbolic (2,3,7) (2,4,5)
  ship darts and re-develop under the view; Euclidean (2,4,4) joins the planar grids beside (2,3,6).
  New: `tools/ctrnact-oracle/{schwarz_board,develop_schwarz}.py`, `lib/freedraw/schwarz.ts`.
- **Two conventions were READ off the certificates, not assumed.** `Sn` names an ANGLE π/n (not a site
  of rotation order n — the isoceles boards diverge and would reject), and a digon letter names a pair
  of ANGLES (which is why (2,4,4) has two edge classes and (2,3,6) three). `check_corpus` derives the
  map from each corpus and asserts it against the rule; that is also what filed the 16 (2,3,3)
  certificates Marek left in a folder named 236, with every file classifying to exactly one board.
- **Every spherical pattern is aligned onto ONE canonical board per shard.** Exact, not fitted: a
  developed instance is a flag and the board's group is transitive on flags of a given (corner, edge
  class). The geometry then ships once per shard instead of 61,914 times — **175 MB → 44 MB at full
  coverage**, which is what made (2,2,4) k=10 and (2,3,3) k=7 shippable at all.
- **`Darts` grew optional `alpha`/`elen`/`drawn`.** On a scalene board none of the three is derivable
  (one polygon size, three angles, three lengths, a digon on every edge). Absent on every existing
  record, so the {p,q} shelves develop byte-identically. The per-pixel disk shader DOES serve these
  boards (2026-07-31): its reducer takes side pairings from the developer's deck frames, which read
  `alpha`/`elen` already, and all 27 patterns certify in 3–18 ms. `force2d` is gone.
- **(2,4,4) needed ℤ[ζ₈] in `develop_freedraw.py`** (45° directions, sides 1 : √2). A `Ring` knob per
  grid; every `% 12` is now `% block.ndir`. Regression: all nine hexagonal k slices (86 MB) and
  sch236 k=3/k=4 regenerate **byte-identical**.
- **I had (2,4,4)'s board wrong and the develop caught it.** Not the barycentric subdivision (that
  would put the floor at k=3); y = ½ is not a mirror, so it is the square grid with both diagonals —
  four triangles per square, two vertex classes, floor k=2. All 270,768 faces measure 1 : 1 : √2.
- ⚑ **Coverage is Marek's run, not the board.** (2,2,4) has no k=8 and (2,3,5) no k=4 — gaps in the
  solve, surfaced by `schwarzKGaps` in the /freedraw board picker and asserted in the test suite.
  **(2,3,4) reran on 2026-07-29 to k=11** (842 → 5,974 certificates, contiguous k=3..11, 0 failures,
  same canonical board). A rerun that ADDS k is one manifest row; the board hoist is what keeps the
  new 5,132 tilings at 2.7 MB, not ~10 MB.
- ⚑ **The `F2` flag was a solver bug. Four boards are corrected; THREE ARE STILL SHORT.**
  (Marek, 2026-07-29.) A typo on the boards whose triangle has three different angles dropped every
  tiling that draws the longest edge class — which is why `E2` named all 103 scalene certificates and
  `F2` named none. A second bug (too few starting vertices) hit (2,2,3) and (2,2,4).

  | board | was | now | |
  |---|---|---|---|
  | (2,2,3) | 2,297 | **2,347** | the missing all-edges-drawn pattern is back at `ss223-2-00007` |
  | (2,2,4) | 65,257 | 65,257 | rerun CONFIRMS it; byte diffs are board orientation only |
  | (2,3,6) | 43 | **462** | k=3 5→10, k=4 38→452 |
  | (2,4,5) | 7 | **23** | k=3 5→10, k=4 2→13 |
  | (2,3,4) (2,3,5) (2,3,7) | | | ⚑ STILL SHORT — no corrected corpus yet |

  (2,3,3) and (2,4,4) are in neither bug and stand as shipped.
  **sch236 k=5 was DELETED, not corrected** (AL: better to show nothing than something false). The
  only slice we had came from the withdrawn build and Marek's drop stops at k=4; its k chip went too,
  and `sch236.test.ts` asserts the file stays absent.
  ⚑ Marek's drop for 236 again contained 16 misfiled certificates, all (2,3,3), holding exactly the
  247 that failed to develop. `--classify` catches this; never trust the folder name.
- **His solvers RUN here — see `docs/RUNNING_MAREK_SOLVERS.md`.** Reporting them unrunnable on this
  arm64 Mac was wrong for the third time. An extracted Homebrew `wine-stable` runs them via Rosetta 2
  with no sudo. Driver: `tools/ctrnact-oracle/run_schwarz_solver.sh`. My own runs reproduced Marek's
  k=3 exactly on (2,3,6), (2,4,5) and (2,3,7), and reached (2,3,4) k=5 at 1,568 (his: 80) and
  (2,3,5) k=4 at **0** — so that "gap" is an empty slice, not an unsearched one.

## /freedraw has a fifth grid: Schwarz (2,3,6) — UNCOMMITTED (2026-07-27)

Marek's `_schwarz.zip` (solver + 43 tilings at k=3 and k=4) is decoded and live as the `sch236` grid.
`pnpm build` clean; `pnpm test` 1602 pass, 1 fail — the same pre-existing `star-general-path.test.ts`
timeout noted below, file untouched. Detail: DEVELOPMENT_NOTES.md §"The Schwarz (2,3,6) board joins
/freedraw".

- **It is the first SCALENE board here.** Three edge classes at three lengths (1 : √3 : 2), where every
  other grid is equilateral and `develop_patch` hardcoded a unit step. √3 = 2z − z³ lives in ℤ[ζ₁₂], so
  the exact develop survives; `edge_len` + `Block.far_step` scale the step. Also the first board where
  EVERY edge carries a digon (drawn or not, the letter says which), so crossing to a neighbouring face
  hops the digon — `PatchComplex.adj`.
- **All three additions are `GRIDS`-table knobs, not new code paths.** Defaults reproduce the four old
  grids exactly: `hexagons_edges` regenerates byte-identical across nine k files / 86 MB, `squares_edges`
  byte-identical against pre-change code.
- **k=3 is the floor, not a gap** — the bare board already has three vertex orbits, so k=1 and k=2
  cannot exist (Marek). Finite tiles are polydrafters, and all of them are an even number of drafters.
- ⚑ **`F2` appears nowhere in the corpus.** It is the drawn 60–30 edge, so all 43 solutions leave that
  class undrawn — five of six letters used. The one real coverage gap; needs a rerun from Marek.
- ⚑ **The exhaustive-`Record` guard has a hole, now plugged for grids.** `FreedrawGrid` forced five
  sites to update but MISSED the /play sidebar tree: `SUB_ORDER` listed the freedraw subs as loose
  strings and `SUB_LABEL` is a `Record<string, string>`, so the grid loaded and counted but had no
  folder row (AL caught it). `FREEDRAW_GRID_SUBS` is now `as const satisfies` + an `Exclude` guard that
  fails the build naming the missing grid. **The colors and hyperbolic sub-axes are still hand-listed
  in the same `SUB_ORDER` and may have the same hole — unaudited.**
- ⚑ **A latent precision bug got fixed on the way**, and it moved shipped numbers. `regularOf` collapsed
  collinear boundary runs with an ABSOLUTE epsilon, which is exact on the integer bitmask grids but not
  on patch grids whose vertices ship rounded to 5 decimals. It suppressed every regular tile on the new
  board and under-counted DILATIONS on **ts**: `allRegular` 12 → 18 at k=2, 36 → 70 at k=3. `allUnit` is
  unchanged everywhere, so the classical slice never moved (4/7/17 oracle, 43 edge-to-edge, both
  dodecagon results all still hold). Goldens updated in `regular.test.ts` / `filter.test.ts`.

## The aperiodic shelf is one page with four views — UNCOMMITTED (2026-07-27)

The seven clusters listed here before are committed (through `4808b4e`). What is now in the working
tree is one piece of work: `/substitutions` + `/multigrid` merged into **`/aperiodic`**, joined by
**Penrose** and **the hat**, all four driving the same pan/rotate/zoom layer. `pnpm build` clean;
`pnpm test` 1569 pass, 1 timeout in `tests/star-general-path.test.ts` (untouched here — it takes 180 s
and times out under load). `pnpm docs:check` fails on the same 5 broken links, all in committed SYNC
entries. Detail: DEVELOPMENT_NOTES.md §"The aperiodic shelf: two pages merge into four views".

- **The registry is the extension point.** `app/(app)/aperiodic/_views.ts` lists the constructions
  (label, blurb, icon, group); the sidebar renders what it lists. AL's next additions — Wang tiles,
  more substitutions from the encyclopedia — are an entry plus a component.
- **`lib/hooks/useAperiodicView.ts` is the shared interaction layer**, on the same state and constants
  as /play and the theory cards (`lib/render/viewControls.ts`). Drag pans, wheel zooms at the cursor,
  Shift+wheel rotates in 5° detents, right-click resets. `subrosaGL` gained `uRot`/`uCentre`;
  `zoomAtPoint`/`resetCardControls` gained an optional `bounds` (existing callers untouched).
- **All four views are on the GPU.** `lib/render/triangulate.ts` (ear clipping + the barycentric edge
  mask) and `SubRosaGL.uploadPolygons` let the non-convex hat onto the batched renderer; `uploadTiles`
  keeps the fixed quad split for the rhombic views. Colours are unchanged — a `uSat` uniform lets the
  patch views ask for the atlas' own HSB(h, 40, 100) fill. Caps rose 18×/7×: Penrose depth 11 (143,010
  rhombi), hat level 6 (54,289 hats), both at 8.3 ms a frame on an M5.
- ⚑ **Headless WebGL numbers are worthless.** The hat-level-6 upload measures 11 s headless
  (SwiftShader) and 140 ms headed. CLAUDE.md says this about FPS; it is just as true of upload. Check
  the renderer string.
- **Patch framing is one rule at every level: fit the whole patch.** Scale across constructions is
  matched by pairing the default LEVELS on tile count (Penrose view default 6 = 1,140 rhombi vs hat
  level 4 = 1,156 hats), not by special-casing the default's framing — an earlier attempt did that and
  made the default the only slider position not showing the whole patch.
- **The sidebars are /play's, not their own.** `AperiodicSidebar` = `PageSidebar` + the `ta-wall` cell
  system + `.ta-tab` segments + the shared `Slider`/`Checkbox`/`Button`. No hand-rolled chips or bare
  range inputs remain on the page.
- ⚑ Switching views unmounts the old one, so its controls reset; `?view=` carries the view, not its
  parameters.

⚑ **`public/` is 669 MB, 504 MB of it tracked.** `hex-solutions-k9.json` alone is 56 MB for one array
entry. Nothing is broken by it; it is the next thing to get expensive.

## Three clusters were backfilled into the ledgers (2026-07-27, NOTES ×3)

They had shipped with no entry anywhere. Symmetry overlays now draw through a `Pen` interface
(`lib/render/overlayPen.ts`) so one implementation serves /play's p5 canvas and the preview cards' 2-D
layer — the old `canvas-overlays` module under `components/` is deleted; Penrose and the hat arrive as
finite patches with measured clean windows. `/defense` is an unlisted `force-static` `noindex` route outside the `(app)`
group, 40 slides from one markdown file with live atlas cards. The ring sweep answers the taxonomy
audit's unstated claim: 7-, 11-, 13-, 17-, 19- and 23-fold stars tile nothing at k ≤ 2, but **16-fold
does** (4 star-bearing at k=1, 2 at k=2) — an order no shipped palette reaches.
⚑ Ring D=42 was interrupted mid-solve; it is the one that would separate 7-fold-with-triangles from the
D=28 result. Re-run before the sweep is called complete.

## The landing wall is live (2026-07-26, NOTES §"three geometry cells go live") — UNCOMMITTED

The Play, Hyperbolic and Spherical cells on `/` render the real /play canvases instead of baked
thumbnails, with /play's controls. Each is inert until clicked, so the page still scrolls under an
untouched card; the card's link moved from the whole frame to the caption block, since a drag inside
an anchor navigates on release (`CollectionCard.interactive`). New shared pieces:
`lib/hooks/useFlatCellPreview.ts` (extracted from the /theory preview card, now used by both),
`useCardActivation`, `useInViewMount`; `HyperbolicDevelopedCanvas` takes an optional per-instance
`input` so an embedded disk never steers /play's global controls. The landing's 9.9 MB fetch of
`hyperbolic-developed.json` is gone — the pool's 64 records are inlined at build time.
⚑ A client-side back-navigation from /play with Islamic mode on still renders the landing sphere as a
star pattern: `SphericalCanvas` reads look flags from the global store, as every thumbnail does.

## Knowledge model (read once, then follow it)

Two tiers. Do not mix them.

- **Ledgers — sacred: append-only, never trimmed, ONE writer per file.** The natural-language
  history the thesis (`../../thesis/chapters/journey.tex`) is written from. Rotate to
  `archive/<name>-YYYY-MM.md` when large (rotation loses nothing).
  - `DEVELOPMENT_NOTES.md` — CC's session-by-session narrative (code/algorithm).
  - `../../resources/research/TA_LOG.md` — TA's chronological ledger (theory/proofs); topical
    detail in the sibling `resources/research/*.md` notes.
  - `SYNC.md` — CC⇄TA handoff log. Entries **3–6 lines**: what landed + commit + ledger link.
    Full pre-2026-06 history in `archive/SYNC-2026-06.md`.
- **Cache — this file.** Current state only. Overwrite freely.

## The hexagonal grid lands: {6,3} edge systems and 3-colorings (2026-07-25, NOTES §98) — UNCOMMITTED

★★ **The Euclidean decoration shelves now cover all three regular grids.** The honeycomb is a lattice with
a two-point basis, not a lattice (inside ℤ + ℤω only (a + b) mod 3 ∈ {0,1} are hexagon corners), so the
per-coset bitmask has nothing to index and the grid takes the **ts patch path** instead: one `GRIDS` row
per decoder plus `is_patch_grid()` in place of three `grid == "ts"` tests. **72,039 certificates, 0 develop
failures**, every k reproducing Marek's counts — edges 36,062 (k≤9), colorings 23,977 (19,975 surjective,
k≤8, no k=2 row: all twelve k=2 certificates use ≤2 colors). Anchor = the digon-free slice, exactly 1
certificate, the plain {6,3} tiling. Regressions hold: square edges `BIJECTION` 1420/1420, ts 3-colorings
byte-identical. New words on this board: **polyhex** beside polyomino / polyiamond / polyform.
⚑ **First lazy shards on the Euclidean decoration shelves** (`loadFreedrawShardsForK` /
`loadColorsShardsForK`, composable-shard shape). Eager = edges k≤6 + colorings k≤5 (4.9 MB); lazy = edges
k7/8/9 and colorings k6/7/8 (123.6 MB). **`public/` 522 → 676 MB** — dropping `hex-solutions-k9.json`
alone returns 58 MB and costs one array entry. Both corpora ship as `candidate`.

## Marek's 2026-07-25 drop: 4 new hyperbolic color bases in, 2 hexagon corpora NOW DONE (NOTES §96, §98)

★★ **The colors class goes from 2 hyperbolic bases to 6.** `hexagons_edges.zip` + `07-25_colors.zip`
extracted to `materials/corpora/` (six corpora, 127,584 certificates; Marek's own `results_2026-07-25.txt`
k-counts reproduce exactly from the certificate files). Shipped {8,3} {5,4} {6,4} {4,5}: four rows in
`develop_hyp_colors.BASES` were the whole decoder change, since `alphabet()` already solves ℓ from (p, q).
67,545 certificates decoded in 74 s, **0 develop failures**, 46,548 surjective colorings, every k Marek
solved. 2.6 MB eager + 29.8 MB lazy (`public/hyperbolic-colors/` 16 → 47 MB). `HYP_COLORS_BASES` drives
the loader, /library k-chips and /play deep links, so the app change is 4 rows there + 4 labels in
`catalogue-list-panel.tsx`. Verified in the running app at `hc45-1`, `hc64-2`, `hc83-5`, the lazy
`hc45-2` deep link, and /library `geo=hyperbolic&dec=colorings&k=4` (1,424 cards = 512 + 906 + 6). ⚑ {5,4}
starts at k=2 on purpose: three colors need ≥2 colored vertex classes there.
✓ **The two hexagon corpora are no longer parked** — decoded and shipped the same day; see the section
above. The hunch recorded here (steps embed in ℤ + ℤω like `TR_STEP`) was right about the embedding and
wrong about the consequence: `emit_pattern` demands every coset be a vertex, and a third of them are not.
⚑ **This work is UNCOMMITTED**, in the same shared tree as the mixed-shelf merge below.

## The 30/150 rhombus: 12 new mixed families, 71 → 83 (2026-07-25, NOTES §97) — UNCOMMITTED

★★ **AL was right and I was wrong.** One palette line (`cx4-30.150`, angles [2,10,2,10]) takes the k=1
mixed export from 19 families to 33 — **12 net new** after two turn out congruent to shipped ones. My
objection (α ∈ (0°,60°) is a proven range, so the rhombus is already in there) confused the *validity* of a
found family with the *discoverability* of one: families are recognised from DISCRETE seeds on the D=24 grid,
so a topology whose only discrete realisation sits at an unrepresented α is unreachable. Visible in the data
— 11 of the 12 have α ∈ (0°,60°), and the pre-existing 4-gon seeds (60/120, 75/105) both sit outside it.
Base arm reproduced the shipped 19 **byte-identical**, so the delta is clean. Shipped: 83 entries (k=1
15 → 27), each re-verified through the app's own `evaluateParamCell` (Σ area == |det| at 5 α samples).
`scripts/stabilize-family-ids.mjs` keeps shipped ids and default α stable across the re-export.
⚑ `maxValence=8` is an **incomplete** regime here (twelve 30° rhombus corners = a real 360° vertex a
valence-8 word cannot express) ⇒ **12 is a lower bound**. k=2 not run with the rhombus. 45/135 and 15/165
still unseeded. No new JOINs — the 12 are self-contained arcs.
⚑ **Provenance bug:** `make PALETTE=isotoxal-star-z24` does not reproduce the shipped tables —
`EU_PRUNE_OVERLAP=1` is never set by the Makefile, so a rebuild silently yields 285,899 vertexdefs against
the shipped 34,329. The flag belongs in the palette JSON.
⚑ **UNCOMMITTED, and blocked on the merge pass**: the rebuilt `public/reference-atlas-mixed.json` carries
`segments`, which only the uncommitted `lib/utils/paramCell.ts` understands. Commit the merge sources first.

## Decoration axis shipped (2026-07-25, NOTES §95)

★★ **The shelf now says what kind of thing each row is.** `Decoration = tilings | edges | colorings` sits
between geometry and tile class, present in all three geometries — a second segmented row on /play, a "Kind"
chip wall on /library. It deletes two workarounds for the same missing axis: /library's non-Euclidean class
relabeling (`NONEUC_CLASS_LABEL`) and the geometry-as-tile-class conflation behind /play's `single` collapse.
Derived from `tileClassOf`, so no atlas JSON was rebuilt. Euclidean reads 10,384 tilings / 112,499 edge
patterns / 226,337 colorings; hyperbolic 28,453 / 13,703 / 3,424 — all nine cells populated, which is the
evidence the axes are orthogonal. Islamic stays under Tilings (its 192 entries are tessellations; the
strapwork is an overlay), though it is the one shelf of the eight that is transcribed, not enumerated.
Old `class=freedraw` / `class=colors` links promote to `dec=edges` / `dec=colorings`.
Spec: `superpowers/specs/2026-07-25-decoration-axis-design.md`.
⚑ Next: fold the shape axis itself onto the period `p` (TILE_TAXONOMY §9), which is the other half of §3.

## Six entries were one 2-parameter family: the coupled families land, 87 → 83 (2026-07-26, NOTES §103)

★★ **AL, on k2-45/k2-46/k2-50: "the same tiling, just with a different angle for the rhombus and the star."**
Right, and it is SIX entries: `{k2-45, k2-46, k2-47, k2-49, k2-50, k2-57}` are one 2-parameter family. All
three records already said **flexdim 2, P 1, separable False** — the exporter gives a species its own slider
only when it flexes ALONE, and here they are coupled (t = r + s − 8 in 15° units, two free and the third
determined), so it develops one direction: a 1-D line through whichever grid member it started from, keyed
as its own family because the pinned angle enters the key. Developing the coupled family directly (the
exporter's own `develop_multi`, qeff from the full null-space basis) puts k2-50's seed at δ=(−1,−2) of
k2-45's family with Σarea = |det| = 8.929405237 — identical to nine decimals, isometry-confirmed.
**12 coupled records → 5 families**, 9 of which shipped. The four slice lines sit at 6-star angles {6,5,4,2}
units, exactly the palette's `{6*6, 6*5, 6*4, 6*2}`; the gap at `6*3` (45°) tiles, as do half-integer values.
So this is §102 one dimension up and it is an UNDERCOUNT, not redundancy: a 2-D continuum shown as four lines.
**Shipped (AL chose the 2-D pad):** mixed 87 → **83**, five entries with a real 2-parameter cell and a
polytope region. Axes are species-aligned, so k2-45's read "rhombus" and "3-pointed star". Old links keep
working — each absorbed slice carries its seat AND the direction its slider pointed, derived from the
shipped record. `components/param-region-pad.tsx` draws the polygon; `clampToRegion` projects any outside
point back in, so the pointer cannot reach an uncertified cell (verified by driving it).
⚑ The region model first doubled star vertex counts (a 3-pointed star IS a hexagon), letting an angle reach
300° where 240° is the maximum — the tests caught it via a self-intersecting tile. Corrected: V ↦ 24 − 48/V.
⚑ Next: same measurement on the isotoxal shelf; the Command-drag scrub does not yet clamp to the polytope.

## The α ranges were truncated: 41 mixed families widened, 3,015° of new sweep (2026-07-25, NOTES §102)

★★ **The exporter clipped every family where a tile's SPECIES changed, not where the tiling stopped.** AL,
from `/play` on k2-01: "nothing prevents the rhombus from shrinking even more and the triangle from becoming
a concave star. Eventually, when the rhombus disappears at 0°, they would become the star tiling k2-14."
All of it holds — the cell keeps tiling below 30° (covering multiplicity 1 on 300/300 samples), the rhombus
reaches zero area at exactly α=0, and that limit is congruent to shipped `ctrnact-star-k2-14` by explicit
isometry (139/139 cloud points). k2-01 now runs **(0°, 180°)** instead of (30°, 150°).
Census `scripts/scan-family-ranges.py`: **41 of 98 mixed families truncated, 3,015° gross** (2,235° net of
folded replay); every true range ends at a tile COLLAPSE on both sides. **18 of the 41** have no on-palette
grid configuration in the new arc, so the solver cannot supply it under another id — those tilings were
absent from the atlas outright. Blockers are palette gaps: `cx4-15.165` (18 families), `cx4-30.150` (13),
`cx4-45.135` (9), stars `3*45`, `4*75`, `6*15`. `isotoxal-star-z24` has cx4 at only 60.120/75.105 and 15 of
~33 grid-legal star species.
**This retires the merge machinery for concavity cuts.** All 6 shipped merges were the analytic continuation
of their own primary, so widening absorbs each partner as a plain duplicate: **0 merges, 11 aliases, same 87
entries, no segments** — one analytic cell, no seam, no pose, no star-flag unification. `segments` stays in
the code for a genuine branch point (AL's k2-56 case), where the branches are NOT one analytic arc.
Also found: **12 folded sliders** (6 rotation, 6 reflection) where α and c−α are the same tiling. Kept at
full sweep per AL, with the centre marked as a tick on the slider (`foldCentreDeg`).
⚑ **Two of my own primitives were wrong** and both are fixed: the radial patch fingerprint is only
NECESSARY for congruence (now confirmed by explicit isometry in both censuses — a false positive there
DELETES a tiling), and that isometry anchored on the first largest tile, which fails when a cell has several
largest-tile orbits (k2-05 has 9). The duplicate scan's family-label and equal-length prefilters are also
gone: a widened family carries a different label on each side of the cut.
⚑ Next: the isotoxal shelf (3,527 entries) has the same defect at ~36× scale, and its continuations carry
star tiles a convex-only shelf cannot express — AL deferred it as a taxonomy question. A prior session's
`scripts/probe-concave-extension.ts` independently agrees: 4 of 14 isotoxal k=1 families extend, k1-01 by
+119.8°. Then push widening upstream into `export_combined_families.py`, and re-measure the 2-parameter
census with both fixes.

## Mixed shelf merged (2026-07-25, NOTES §92–§94) — SUPERSEDED by §102 above

★★ **79 mixed entries → 71, each a single continuous sweep** (counts pre-rhombus; the shelf is 83 after
the 30/150 re-export above, still with the same 6 merged arcs). AL spotted that k2-58/k2-59 are two halves
of one deformation, cut where the flexing tile's alternating vertex crosses 180° (concave star ↔ convex
2n-gon). Census `scripts/scan-family-joins.py`: 6 mergeable arcs (all clean 2-paths) + 2 α-reversal
duplicates. Merge criterion is AL's — the branch that continues the family is the one with the SAME
rigid/flexing tile partition; congruence of the limit tiling alone is not enough (3 branches meet at the
k2-58 limit). Merged slider = `theta` (the flexing tile's alternating angle, join at 180°) on 3 arcs,
`sweep` (cumulative angle) on 3 where several orbits straighten from different sides. Seam pose and star
flags are baked at build time so nothing jumps or changes colour at the join.
**Committed on `feat/subrosa-editor`: the merge SOURCES only** — `paramCell.ts` (`segments`), the scanner,
the builder, the alias resolver + table, the slider label, the spec and the test. This is what §97 above was
blocked on. Deliberately NOT in that commit: `public/reference-atlas-mixed.json` and
`experiments/results/mixed-atlas-build.log`, which now carry the 30/150 rhombus re-export and belong with
it — at the merge commit the shipped shelf is still HEAD's unsegmented 79, which the segment-aware evaluator
reads unchanged. Spec: `superpowers/specs/2026-07-25-mixed-family-merge-design.md`.
⚑ Next: same sweep on the isotoxal/composable/scaled shelves, then move the merge upstream into
`export_combined_families.py` so the searcher emits merged families directly.

## Frontier (2026-07-23) — the hyperbolic shelf on exact identity

- ★★★ **SHIPPED: 28,453 hyperbolic tilings on /library + /play** (was 59 this morning, 6345 midday;
  AL "Add them ALL" 2026-07-23, NOTES §83). Union of every COMPLETED (k,p,v) sweep box; 12,168 k=1 +
  16,285 k=2; 14,106 per-pixel / 14,347 2D-path. NOT enumerated: the five timeout cells (k1-p8v8,
  k2-{p5v8,p6v7,p7v6,p8v6}) and all k≥3. Ghost-card /library bug = 12 duplicate exporter ids →
  fixed + `tests/atlas-id-unique.test.ts`.
  Identity/k = canonical minimal Delaney–Dress symbol from the block darts at the forced ℓ
  (`tools/ctrnact-oracle/dsymbol_from_darts.py`), validated by the Euclidean collapse
  11→10 / 24→20 = A068599 run through the SAME code at l=0. 59 legacy ids preserved; variants
  numbered per figure; k exact (1555 k=1, 4790 k=2). Scope stated in NOTES §82: k=1 {3..8}·v≤6,
  k=2 {3,4,6}·v≤6, regulars to v8. Renderability = stamped metadata (3265 per-pixel, 3080 on the
  2D path — float64 rim cap, not math).
- ★★ **(k,p,v) sweep filling** `experiments/results/hyp-sweep/` (AL directive): per-cell COMPLETE
  enumerations with counts by true k, tiling lists, timings; 900 s cap, resumable. Display layer
  (per-k tables, count/time-vs-k curves) pending sweep completion.
- Gates: `pnpm vitest run tests/hyperbolic-*.test.ts` (sampled suites + stamp honesty); the stamp
  script re-runs after every export. Known-failing on clean HEAD (NOT shelf): hue-ring,
  figure-emitters, playUrlState, dsym-generator, star-general-path, islamic-gate, oracle-symmetry×2.

## Frontier (2026-07-11) — the weight-law program

- ★★★ **k=3 CANDIDATE STAGE (C2) CLOSED at the proven pool** (2026-07-11; wording corrected
  2026-07-16, CC). Proof-anchored SMALLK_PROVEN=1 run certified three ways, all 61 / 303 raw
  cells / **0 ⚑**: serial probe (digest `6ef92456`), scout ×2 byte-identical (digest `7f2f4160`,
  = stability ×2). Per-tiling oracle bijection PASS (61/61 both ways, t3007 present, CB-4
  differential 242+1830 clean). Correction vs the 07-11 claim "61 no longer rest on the oracle":
  the proven W-pool (SMALLK_W_BOUND v2) reaches every k=3 period by theorem, so the LATTICE leg
  is oracle-free, but the SEEDING legs (C1/C3) ran the fast path (blanket-fan proven mode is
  future work O2, PeriodSolver.ts:728), so the counts keep their per-tiling oracle anchor.
  The blanket-fan re-run is the named step to a fully theorem-certified k=3; thesis §8.5 states
  this boundary exactly. Frozen artifact `.scout-cache/k3-proven-accepted-7f2f4160092c7ff3.ndjson`;
  SYNC 2026-07-11 + 2026-07-16. Open (benign): probe-vs-scout digest gap is
  representative-selection (raw-min-key vs primitive-reduced), same partition.
- ★★ **Small-k weight theorem PROVEN + REFEREED (3 agents, no fatal): max W = 5, 6, 7 at
  k = 1, 2, 3 EXACT**, per-branch proven pool radii (hex 6/8/10 via census+shells, square
  3/6/7, hol ≤ 4 via thm:weight generators 7/15/23 + joins). `docs/SMALLK_W_BOUND.md` (v2)
  + appendix PDF + artifacts `experiments/results/smallk-*`. **Consumed by the pipeline**:
  `SMALLK_PROVEN=1` mode (PeriodSolver poolConfig) is the proof-anchored k≤3 regime — full W(23)
  generator pool, per-branch census area boxes, solved axes by theorem, block-cap fail-fast throw.
- ★★ **pgg law proven for width-2 (Thms A/B/C, refereed)**: W = 2k + 2⌊(k−1)/3⌋ exact,
  attained ∀k ≥ 2; global-max-for-k≥4 claim is measured (k ≤ 13) + partially proven.
  `docs/WEIGHT_CEILING_PROOF.md` + appendix PDF.
- ★ **The no-caveats program has a DAG** (`docs/WEIGHT_PROOF_DAG.md`, 10 nodes, critical
  path D1→D6→D10). Landed 2026-07-10: **D1 slab engine incr. 1a** (width-2 T/S/H world
  machine-reproduced; `tools/slab-engine/engine.py`); **D3 consolidation REFEREED** — two
  bands CLOSED vs the pgg law via c₀-bypass word climbs (λ₁ = 1: W ≤ 2k; λ₁ = √3 hex:
  W ≤ 2k), one blocker (write E2-v2); **D2 ≡ E4-A′ ≡ 3.1(d)** identified (one finite check
  gates 378 tilings + unconditionalizes Thms A/C — engine incr. 1b closes it); **D6-snub
  re-scoped honestly** (0.966-forcing refuted, 829 domino vertices in-catalogue; route =
  row-word classification via engine incr. 2). Ledgers: SYNC 2026-07-10 entries ×5,
  `resources/research/th10-D3-consolidation-2026-07-10.md`, TA_LOG.
- Star lane (parked, scoped 2026-07-10): Myers anatomy + parametrization analysis done in
  conversation; W-machinery splits universal/family-modular; free-α families need TH-8
  regardless. No new artifacts beyond `experiments/results/smallk-*` siblings.

## Frontier (2026-06-10 evening — previous)

- ★★ **k ≤ 2 THEOREM-CERTIFIED, oracle-independent** (B1 + canonical augmentation + lem:ddrealize +
  lem:ddrealizer realizer + lem:corona; per-tiling torus match both directions). NOTES §27.
- ★★ **k = 3 RE-CERTIFIED PER-TILING, end-to-end CLOSED** (2026-06-10): the old certified digest
  `eb34499d5fba3457` was per-tiling WRONG (canceling duplicate + missing t3007 — NOTES §28); both
  defects fixed (§29), full no-cap re-sweep 449/449 seeds → **new anchor `99919f42a7b58e76`/61**,
  per-tiling oracle bijection PASSED ×2 (`recert-oracle-match.ts`); DB: old run de-certified, recert
  run `52d0cb2e` certified; figures snapshot/orbits/oracle-map regenerated → **92/92**; k=3 gallery
  FINAL incl. t3007.pdf. NOTES §31. ★ **Stability ×2 PASSED** (fresh sweep reproduced
  `99919f42a7b58e76`/61 byte-identical, 449/449, 0 timeouts —
  `experiments/results/k3-stability-regression-0d6c96b-2026-06-10.log`) — single-run residue closed;
  also the k=3 batch acceptance for the CB landings below.
- ★ **Review batch CB-2/7/8 LANDED, digest-neutral** (k≤2 byte-identical post-merge, `b81e823`):
  CB-2 Surd.sign provable error-bound filter (`216302b` — the fuzz test found a REAL wrong-sign at
  coefficient height ~2⁵⁶: the old 1e-6 gate was unsound in fact, not just in principle; NOTES §30);
  CB-7 primitivity-rejection guard + CB-8 tuned-pool regime banner/reach counting (`eefa6ac`,
  diagnostics-only; NOTES §32). **§32.2 Finding 2 SIGNED OFF by TA 2026-06-10** (sound; see
  `../resources/research/cb7-finding2-signoff-2026-06-10.md`); **all 3 sign-off asks LANDED** on
  `fix/cb7-finding2-followups` @ `d433b95` (counter + loud star-ladder truncation + docstring;
  NOTES §33) — **MERGED `9674c95`** after k≤2 probe re-check byte-identical on d433b95
  (`cb7-followups-probes-d433b95-2026-06-10.log`). (CB-9 push ✓ 2026-06-10.)
- ★ **Review batch CB-5/CB-4/CB-6 LANDED on `fix/cb5-cb4-cb6` @ `74e03a9` — ALL CB items now
  closed** (NOTES §35): CB-5 N≠24 throw (`983b8e3`); CB-4 always-on equivalence guard + standing
  import-disjoint congruence differential wired into the recert harness (`942da53`); CB-6 cull
  R_P+maxCircum (`46b0f79`). **The CB-4 guard fired on first contact with the k=3 artifact** —
  `reducedClassKey`'s float-window reduction was NOT class-canonical on skewed bases (direction-
  dependent false negatives; completeness, never soundness; certified 61 unaffected — lucky third
  rep). Fixed exact (`c802989`). Acceptance: k≤2 probes byte-identical ×2, suite 327/327, recert
  ★ PASS 61/61 + differential 0/2131 mismatches (`cb456-probes-*`, `k3-recert-...-18-22.log`).
  **MERGED to master 2026-06-11** (NOTES §35); the fresh k=3 batch-acceptance sweep ran under OP-1/2/3
  below (449/449, recert 61/61). ⚑ TA: thesis §19.6 congruence narrative gains the §35 sibling caveat.
- ★ **OP-1/2/3 LANDED, `feat/op123-sound-levers` @ `cf1908e`** (off master `0291e83`; NOTES §35) —
  the three sound levers in the mandated order. OP-1 prop:typeprune P2+V<k (k≤2 byte-identical; k=3
  re-baselined `99919f42a7b58e76`→`b5c622070cff8b4`, raw 362→302 = duplicate-cert cut). OP-2 census +
  counters (digest byte-identical; ⚑ branch-enum memoization is orbifold-lane, DEFERRED). OP-3 stage 1
  oblique-only grid-orbit reduction per lem:orbitdedup (fills CONSERVED raw=302; k=3 re-baselined
  `11ee1b1d582811d1`/61). All three: **61/61 per-tiling bijection** (t3007 in, 0 orphans/dupes).
  ★ **OP-9 Σ-vs-distinct table exists** (oblique 17.4×, ALL 20.6×; post-OP-3 oblique work-items 12.0×
  down). ✓ **R1 RESOLVED** (`1aa1c84`, AL-directed) — the second `reducedClassKey` float-tie false-NEG
  (t3019, 1:4.73 skinny cell), surfaced by OP-1's sound P2, is fixed at the source: exact (u,v)-coord
  reduction, no float window. Digest-neutral (k≤2 byte-identical, k=3 recert 61/61 with the exact-witness
  fallback now DORMANT). No leg-1 congruence caveat remains for the regular family; CB-4 disjoint in-file.
  F3b banners 76→0 post-OP-3 (A/B discharge abandoned ~50h; discharged on census=0 + the bijection).
  **MERGED to master 2026-06-11 (NOTES §38, op123 merge `7a19b6a`)** — master keeps its EQUIVALENT exact
  `surdFloor` reducedClassKey (op123's t3019 fixture passes on it; R2 witness redundant). Fresh no-cap
  sweep 449/449 → recert ★ 61/61, digest `11ee1b1d582811d1`/61, differential 0/2071.
- **DG-1 verdict stands:** proven-config lattice run INFEASIBLE even at k=1 (≈1,370 yr) ⇒ thesis
  honest-rewrite (TX option (b)) merged; the measurement is itself a thesis result. NOTES §25.
- Orbifold: correct-but-gated (NOTES §23.9). Star: 4(j) spike certified k=1 exact; ST-1 conventions
  CLOSED in thesis master. Seed-anchored D-D dead by mechanism (NOTES §26).
- ★ **ST-2 + ST-3(1+3) + ST-9 MERGED to master** (2026-06-11, NOTES §36, digest-neutral; ★ TA oracle
  spot-check PASS 43/43 `d8fd260`): Myers-2009 k=2 oracle (43 records, 34 in-ring, pins 36/40/42);
  productive star-fill positively covered via 4(i) + mutation check; honest run-matrix + §24 retitle.
  ⚑ **4(i) is measured OUTSIDE the tuned pool ⇒ tuned dentreg ceiling 12/13 Fig-4 tilings**.
- ★ **TH-4 / TH-13 star tables MERGED to master** (NOTES §37): d_max(envelope) = 9 exact ⇒ δ ≤ 18k,
  F ≤ 42k; TH-13 19/8/5 + single-variant regular-filler rider — constants INPUT, discharge is TA's.
- ★ **star-fill suite-gate MERGED**: heavy 4(i) test behind `RUN_STAR_FILL=1` (was OOMing default
  `pnpm test`). Final full suite 40/40 files, 386 passed, 1 skipped, 0 OOM.
- Orbifold: correct-but-gated (NOTES §23.9), branch `feat/c4-pool-bypass` PARKED. Star: 4(j) spike
  certified k=1 exact; ST-1 closed + TH-3 star theory landed (TA). Seed-anchored D-D dead by
  mechanism (NOTES §26).

## Thesis state

- **Thesis master = `7d76b58`** (ff-merged 2026-06-10 late, AL-directed; 85pp clean post-merge,
  0 undefined refs). Contains, as scoped commits: TH-1 octagon lemma (`8595b7d`), results
  restructure + prose swap (`ece66b0`), ST-1 star conventions closed (`cefccc6`), TH-9
  lem:orbitdedup (`ae61853`), D-D bound closed — lem:flagsharp δ≤12k−2 tight (`efe6d6c`), TH-3
  star quotient repair (`7d76b58`). Resources ledger at `9b0638e` (incl. the exact-δ script/data
  for the certified 92). Detail: TA_LOG (2026-06-10).
- **TH-2/C1-Part-B DISCHARGED** (2026-06-10 late): fill completeness is a lemma, not an assumption
  — `lem:fillreach` + `rem:fillreach`, prop:fanseed restated; branch `th2-fillreach-2026-06-10` @
  `8c0a39d` (87pp clean, 0 undefined refs), pending AL review/merge. Resources at `24451c0`.
  ✓ Both CC work orders from the audit LANDED (`c8bc258`, NOTES §34): buildBlock `min(60,·)` index
  cap asserted per candidate (⚑ + `diag.blockIndexCapTruncated`; sweeps must assert 0) and
  maxCellPolys default = max(20k+24, 24k); k≤2 probes byte-identical, F3 flags silent on the
  certified record. Detail: `../../resources/research/fill-completeness-lemma-TH2-2026-06-10.md`.

## Live NEXT — one per party

See `docs/NEXT.md` (the single curated source — duplicated nowhere else).

## Repo state (re-verify on read — this section goes stale fastest)

- **master = `82c89f1` (suite-gate merge) + doc-cache commits on top** (2026-06-11 wind-down —
  **NOT pushed**, ~47 ahead of origin/master). Linear
  chain on top of the prior `0bfbd0f`: ST merge (`f4c0973`), th4-th13 merge (`22f16b4`), op123 merge
  (`7a19b6a`) + AL ST-3 spot-check (`d8fd260`) + TA SEAT DENTS entry (`a54fa4f`) + op123 evidence
  (`7e6716b`), star-fill suite-gate merge (`82c89f1`). Each batch digest-gated; full suite 40/40 files,
  386 pass / 1 skip / 0 OOM.
- **k=3 anchor RE-BASELINED `99919f42a7b58e76` → `11ee1b1d582811d1`/61** (OP-3 orbit-reduced reps; recert
  ★ 61/61 per-tiling bijection, t3007 in). Artifact `.scout-cache/k3_3.4.6.12_cap0.ndjson`.
  ⚑ Old k=3 resume caches INVALID (seed indices shifted) — always fresh.
- **Open branches: master + 2 PARKED** — `feat/c1-proven-seeding` (merged ref, **8 uncommitted WIP files**
  in its worktree — AL keep/discard call) and `feat/c4-pool-bypass` (orbifold, parked). Detached worktree
  `op123-op2-sweep` (15 uncommitted scratch files) left untouched.
- Review work-orders: `docs/review-2026-06-09/` (CB code items ALL closed; ST-2/3/9 + TH-4/13 done).
- Supabase: k=3 run `52d0cb2e` certified (61) — ⚑ reflects the OLD `99919f42` digest; a re-cert DB
  refresh for the new `11ee1b1d` anchor is a follow-up (not done in the wind-down).
- **Reference (Oracle) shelf now serves k=8–10** (branch `feat/reference-atlas-k8-10`): per-k lazy
  shards `public/reference-atlas-k{8,9,10}.json` (2850/5960/11866 tilings, ~15/34/73 MB), fetched
  on demand when that k is selected. Čtrnáct, `reproduced` (display-only, never certified). Base
  atlas + render (24/page) unchanged. Spec/plan under `docs/superpowers/`.

## Ledger index

`DEVELOPMENT_NOTES.md` (CC narrative) · `SYNC.md` (handoff) + `archive/` (rotated history) ·
`../../resources/research/TA_LOG.md` (TA narrative) + `resources/research/*.md` (topical) ·
`../../thesis/chapters/journey.tex` (the sink the ledgers feed).
