# de Bruijn multigrid constructor — design

Status: approved to build (live phason editor). Author: CC, 2026-07-25.

## Goal

An interactive constructor in the atlas for **quasiperiodic rhombic tilings via de Bruijn's
multigrid (dual) method** — the *projection*-side counterpart to the Sub Rosa *substitution*
generator. One method builds Penrose (n=5, 10-fold), Ammann–Beenker (n=4, 8-fold), the 12-fold
tiling (n=6), and every 2n-fold rhombic quasicrystal, from a set of grid offsets the user drags.

The centre of the experience is the **phason editor**: expose the n grid offsets γⱼ as sliders;
dragging one slides a whole grid family, and the tiling reconfigures live through local **phason
flips**. This is "a way of constructing them" made manipulable.

## The method (de Bruijn, 1981)

Take **n grid directions** eⱼ = (cos πj/n, sin πj/n), j = 0…n−1, and **n real offsets** γⱼ. Grid
family j is the parallel lines `z·eⱼ + γⱼ = k`, k ∈ ℤ. Where a line of family i crosses a line of
family j, the dual tiling places a **rhombus** with edges e_i and e_j (interior angle π|i−j|/n).
So: line intersections ↔ rhombi; open grid meshes ↔ tiling vertices.

- **Symmetry & prototiles.** n directions ⇒ 2n-fold rhombic tiling with ⌊n/2⌋ rhomb shapes,
  labelled `protoId = min(|i−j|, n−|i−j|)` — the SAME labelling, hues, and shapes as Sub Rosa n
  (n=4 → square + 45° rhomb; n=5 → Penrose thin + thick; n=6 → three rhombs incl. a square).
- **Any offsets give a valid tiling.** de Bruijn's theorem: for generic (regular) offsets the dual
  is an edge-to-edge rhombic tiling of the plane. `Σγⱼ ∈ ℤ` selects the Penrose local-isomorphism
  class; other sums give "generalized Penrose". We don't enforce matching rules — every offset set
  is a legal rhombic tiling, which is exactly what a free editor wants.

## Why there is no new arithmetic (unlike Sub Rosa)

A rhombus corner is a mesh vertex `V(K) = Σⱼ Kⱼ·eⱼ` where **K ∈ ℤⁿ is the integer index vector**
(Kⱼ = number of family-j lines crossed to reach that mesh). K is the *exact* identity of a vertex —
two rhombi share a corner iff they share K — so topology (edge-to-edge, no overlap) is integer
equality, no tolerance. Positions are the float sum `Σ Kⱼ eⱼ` computed by ONE canonical function
`vertexPos(K)` (fixed loop order), so shared corners are bit-identical ⇒ no cracks in the render.

Result: **integer K for correctness, float for display; no `CyclotomicRing`, no Φ table entries,
any n works.** (Sub Rosa needed exact ζ₄ₙ because it *composes* to great depth; the multigrid is a
single-pass construction per frame, so float positions never accumulate error.)

## Construction algorithm (one patch)

Given `{ n, offsets γ, radius R }`:

1. For each pair `i < j` and each integer pair `(a, b)` with the lines in range
   (`a ∈ [⌈γᵢ−R⌉, ⌊γᵢ+R⌋]`, likewise b), solve the 2×2 for the intersection point `p`
   (`z·eᵢ = a−γᵢ`, `z·eⱼ = b−γⱼ`; det = sin(π(j−i)/n) ≠ 0). Skip if `|p| > R`.
2. Base index `Kₘ = ⌊p·eₘ + γₘ⌋` for every `m ∉ {i,j}`. The four meshes around `p` set
   `(Kᵢ,Kⱼ) ∈ {(a−1,b−1),(a,b−1),(a,b),(a−1,b)}`.
3. Emit a rhombus: corners `vertexPos(K)` for those four full-K vectors (in that order → a simple
   quad), `protoId = min(|i−j|, n−|i−j|)`, and the four K-string keys for the edge check.

Count ≈ πR²·Σ_{i<j}|sin π(j−i)/n|; R defaults so a patch is ~5–20k rhombi (capped). Enumerated
once per (n, offsets) change; pan/zoom are pure view transforms (no re-enumeration).

## Interaction (the phason editor)

Sidebar (mirrors the Sub Rosa layout):
- **n selector** — 4…10 (2n-fold: 8…20-fold). Wrapping chips, like Sub Rosa's.
- **Offset sliders** — one per γⱼ, range [0,1) (grids are periodic in k). Dragging one re-enumerates
  (a few ms) and the tiling flips live.
- **Presets** — *Symmetric* (equal γⱼ → the n-fold-symmetric star/sun tiling) and *Randomize*
  (seeded generic offsets). *Canonical* default = equally-spaced Σγ=0 (a clean Penrose at n=5).
- **Reset view**, tile-outline toggle (reused).

Render: the existing **`SubRosaGL`** batched renderer (it takes `{protoId, corners}`; imported here
as a shared rhombic renderer — a later rename to `rhombGL` is optional churn we skip now). HUES by
protoId, so Sub Rosa and the multigrid read as one visual system. Pan/zoom via the same
`{scale, ox, oy}` view model + handlers.

Route `app/(app)/multigrid/` (server `page.tsx` → client `_multigrid-client.tsx`, `force-static`),
one `nav.tsx` entry ("Multigrid", Snowflake icon). Dev hook `window.__multigrid` for Playwright
(setN / setOffset / preset / tileCount / edgeCheck).

## Validation

- **Vitest.** For n = 4,5,6,7 with the canonical offsets: the patch is edge-to-edge (every interior
  edge, keyed by the two integer-K vertex ids, used exactly twice; one boundary loop), every tile is
  a valid prototile (`protoId ∈ 1..⌊n/2⌋`), and areas match the rhomb areas `sin(π·protoId/n)`.
  n=5 must yield exactly the two Penrose rhombs (protoIds {1,2}); n=4 the square + 45° rhomb.
  Symmetric preset at n=5: the central patch has 10-fold rotational symmetry (vertex-set invariant
  under rotation by π/5 about the centre, up to the patch boundary).
- **Visual.** Playwright: Penrose (n=5) recognizable rhombus tiling; Ammann–Beenker (n=4) octagonal;
  a before/after of one offset drag showing the tiling changed (phason flip).
- `pnpm build` clean.

## Split-view (added 2026-07-25)

Shipped after the first cut. A "Split view" toggle (default on) splits the canvas into two panels:
left = the n grid-line families in z-space (2D canvas, each family colour-coded, own pan/zoom);
right = the dual rhombic tiling (the GL view). A thin overlay canvas on each panel draws the
**duality link**: hovering a rhombus lights its two source lines and their crossing in the grid, and
hovering near a crossing lights the corresponding rhombus in the tiling — the crossing↔rhombus
correspondence made interactive. Powered by two fields added to `MgTile` (`site` = the crossing point
in z-space, `fams` = the family pair). Lookup is a linear scan over the ~11k tiles per mouse-move.

## Non-goals (first cut)

The mesh↔vertex link (the subtler dual half); the 3D cut-and-project / window visualization;
Penrose matching-rule enforcement or arrow decorations; de-duplicating against the Sub Rosa shelf
(the same tilings via a different method is the point); persistence/gallery; n ≥ 11 (patch size, not
math). Renaming `SubRosaGL` → a neutral `rhombGL` (reuse as-is for now).
