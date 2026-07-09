# Fundamental-domain subdivision + correct cell shape for the symmetry overlay

Date: 2026-07-09
Author: CC
Status: design approved, pre-plan

## Problem

Two defects in the Play symmetry overlay (`drawFundamentalDomain` / `analyzeSymmetry`):

1. **The fundamental domain (FD) sits outside the drawn cell.** Measured across the 92 certified k≤3
   tilings: p6m 30/34, cmm 21/28, pmm 3/10, p4m 2/3, p3m1 1/1 have ≥1 FD vertex outside the drawn cell
   parallelogram. Cause: `buildFD` anchors the FD (a reflection triangle or `fractionParallelogram`) at a
   rotation center and it extends in ±c1/±c2, but the cell is drawn only in the +c1,+c2 quadrant from that
   same anchor (`drawFundamentalDomain`, `components/canvas-overlays.ts`).

2. **cm/cmm draw an oblique parallelogram, not a rhombus.** Every cmm tiling in the catalogue draws a cell
   with `|c1|/|c2|` ≈ 0.25–0.52 at 82–105° — an oblique parallelogram, never a rhombus. NOT a
   misclassification: cmm's lattice is centered-rectangular, and for an elongated rectangle the *shortest*
   basis (what `gaussReduceExact` returns, and what the cell is drawn from) is genuinely oblique. Example:
   lattice with a length-1 vector at 0° and length-1.932 vectors at ±75°, mirrors at 0°/90° — a centered
   rectangle 1×3.73, correctly cmm, but its shortest basis is the oblique (1.0@0°, 1.932@105°) pair rather
   than the mirror-aligned rhombus.

The user wants: the FD always inside the cell, the cell subdivided into all its FD copies (highlighted),
and cm/cmm drawn as a rhombus — matching the Wikipedia "Wallpaper group" page.

## Reference: Wikipedia conventions (per the "Wallpaper group" page)

Each group is drawn with its symmetry-aligned **primitive** cell, FD = **1/(point-group order)** of the
cell:

| lattice | groups | cell shape | drawn correctly today? |
|---|---|---|---|
| oblique | p1, p2 | parallelogram | yes (Gauss-reduced primitive) |
| rectangular | pm, pg, pmm, pmg, pgg | rectangle | yes (reduced basis is already 90°) |
| square | p4, p4m, p4g | square | yes (ratio 1.0, 90°) |
| hexagonal | p3, p3m1, p31m, p6, p6m | 120° rhombus | yes (ratio 1.0, 120°) |
| centered rectangular | cm, cmm | **rhombus** | **NO — draws the oblique shortest basis** |

Rotation glyphs (lens/triangle/square/hexagon for 2/3/4/6-fold), solid mirror lines, and dashed glide
lines — already implemented in `canvas-overlays.ts` — already match Wikipedia. Those stay unchanged.

Conclusion: the only cell-shape fix needed is cm/cmm → rhombus. The subdivision is new for all groups.

## Goal and scope

Make the FD overlay draw the symmetry-aligned primitive cell subdivided into all `order` fundamental-
domain copies (outlines), with the base FD filled, and fix the cm/cmm cell to the mirror-aligned rhombus.
The base FD becomes one of the tiling copies, so it is inside the cell by construction.

In scope: `lib/classes/symmetry/WallpaperSymmetry.ts` (cell-shape fix for cm/cmm; generate the
subdivision), `lib/classes/symmetry/types.ts` (`SymmetryData.subdivision`), `components/canvas-overlays.ts`
(draw the copies).

Out of scope: group classification (correct), the reference atlas, any exact-arithmetic change. This is
RENDER geometry — float, like the rest of `SymmetryData` (which is float by design; exactness is upstream).

## Data model

`SymmetryData` gains one field:

```ts
subdivision: Vec2[][]; // the `pointGroupOrder` fundamental-domain copies tiling the drawn cell, CCW.
                       // subdivision[0] === fd (the emphasized base copy). Each is a closed polygon.
```

`fd`, `cell` keep their meaning. `cellOrigin` changes: the drawn cell is **centered on the FD's anchor**
(the max-symmetry rotation center the FD fans around), i.e. `cellOrigin = anchor − (c1 + c2)/2`, so the
`order` copies fan around the anchor and fill the cell without any copy straddling a cell edge (the
current bug is precisely that the cell was cornered at the anchor while the FD fanned around it). For
cm/cmm, `cell` becomes the rhombus basis (below); for every other group `cell` is unchanged.

## Component 1: cm/cmm rhombus cell

In `analyzeSymmetry`, after computing `axes` and `group`, if `group ∈ {cm, cmm}` replace the drawn cell
basis with the mirror-aligned rhombus:

1. Collect the mirror directions. cmm has two perpendicular families; cm has one mirror family (+ glides).
   Take the mirror direction `dθ`; the perpendicular conventional axis is `dθ+90°`.
2. `A` = shortest nonzero lattice vector parallel to `dθ`; `B` = shortest nonzero lattice vector parallel
   to `dθ+90°`. (Enumerate small integer combos `i·c1 + j·c2`, |i|,|j| ≤ 4; a lattice vector along a mirror
   always exists because the mirror maps the lattice to itself. `parallel` = |cross(v, d)| < 1e-6·|v|.)
3. The centered-rectangular primitive rhombus basis is `r1 = (A+B)/2`, `r2 = (A−B)/2`. Both are lattice
   vectors (the centering point is `(A+B)/2`) and `|r1| = |r2|` (since `A ⟂ B`), so this is the rhombus.
4. Sanity: `det(r1, r2)` must equal `det(c1, c2)` in magnitude (same primitive covolume). If the
   construction fails (no perpendicular lattice vector found, or covolume mismatch), fall back to the
   Gauss-reduced `c1, c2` and log once — never crash, never silently draw a wrong-area cell.

Set `cell = [r1, r2]` for cm/cmm; the subdivision (Component 2) then tiles this rhombus.

## Prototype findings (2026-07-09) — READ THIS; the naive algorithm was wrong

A prototype over all 92 certified tilings settled the algorithm empirically. Two corrections to the
approach below, and one honest limitation:

1. **Generators must be the ANCHOR's site symmetry only** (rotations about the anchor + mirrors through
   the anchor) **+ all glides** — NOT rotations about every center / every mirror. Using all centers
   over-generates (cmm 5/4, p6m 14/12, p4m 9/8) because copies from non-anchor centers reduce to
   overlapping extras.
2. **Reject any candidate whose centroid lies inside an already-accepted copy** (point-in-polygon), and
   cap strictly at `order`. This enforces a disjoint tiling and removes the remaining over-generation.

With both, **88/92 pass** the area-exact gate (13–14 of 17 groups). The holdout is the **pure-rotation
groups p3/p6** (no mirrors, no glides): `buildFD` returns a small quad near the n-fold center that is NOT
a rotation-compatible sector, so its `order` rotations overlap-reject to 3–5 copies. Fixing that is a
`buildFD` change (reconstruct the FD as an `order`-fold sector for pure-rotation groups) and is deferred.

**Therefore the shipped design is SELF-VERIFYING:** compute the subdivision, check per tiling that it
tiles exactly (`copies.length === order` AND `Σarea ≈ cellArea`); if yes, expose it in `subdivision`; if
no (p3/p6 today), set `subdivision = [fd]` (just the base FD) so the overlay never draws a wrong/partial
subdivision. The cm/cmm rhombus cell and the anchor-centered cell (FD-inside) apply to ALL groups
regardless. p3/p6 full subdivision is a fast-follow.

## Component 2: FD subdivision (all groups)

Add `buildSubdivision(fd, anchor, cell, centers, axes, order)` returning `Vec2[][]` (self-verified; see
findings above — anchor-site-symmetry + glides, overlap-reject, strict cap, then the tiles-exactly check).

The `order` FD copies tiling one cell are the images of the base FD under the point group (space group mod
translations). Generate them by orbit-closure over the tiling's own isometries, each reduced back into the
base cell:

Generators (float isometries acting on a polygon = map each vertex):
- **rotation**: for each `Center {z, order: n}`, rotation by `k·2π/n` about `z`, `k = 1..n−1`.
- **mirror**: for each `Axis {p, d, kind:'mirror'}`, reflection across the line through `p` along `d`.
- **glide**: for each `Axis {p, d, kind:'glide'}`, reflection across the line THEN translation by `g`,
  where `g = ½ · (shortest nonzero lattice vector parallel to d)`. (The `Axis` type carries no glide
  vector; reconstruct it from the lattice. This is what makes pg/pgg/pmg/p4g — which have no point with
  full site symmetry — produce their copies.)

Closure — reduce each image to the copy NEAREST the anchor (not `floor` into `[0,1)`, which straddles),
so the collected copies cluster around the anchor and fill the anchor-centered cell:
```
reduceToAnchor(poly): let (α,β) = lattice coords of (centroid(poly) − anchor); translate poly by
                      −(round(α)·c1 + round(β)·c2). Puts the centroid within the anchor-centered cell.
key(poly): centroid rounded to 1e-4 (dedup key)
copies = [fd]; seen = {key(fd)}; queue = [fd]
while queue not empty and copies.length < order:
  p = queue.shift()
  for g in generators:
    q = reduceToAnchor(g(p))
    if key(q) not in seen: seen.add(key(q)); copies.push(q); queue.push(q)
return copies   // subdivision[0] === fd, the emphasized copy
```

Rationale: the anchor is a symmetry point; its site-symmetry copies fan around it symmetrically, and
`reduceToAnchor` pulls translation-related images to the nearest anchor-cell, so the `order` copies fill
`[cellOrigin, +c1, +c2]` (which is centered on the anchor) with no straddling. `fd` (already inside that
cell for a correctly-anchored FD) is `subdivision[0]`.

### Non-symmorphic groups (the hard part)

pg, pgg, pmg, p4g have glides and no full-site-symmetry point, so the glide generator is required; a
pure-reflection-only closure would miss copies or place them off by the half-translation. The glide-vector
reconstruction (½ shortest lattice period along the axis) is the crux and gets the most verification.

### Fallback if orbit-closure proves unreliable for a group

If a group cannot be made to yield exactly `order` non-straddling copies via orbit-closure (float or
structural), the deterministic fallback is to **cut the cell by its symmetry lines**: clip the cell
parallelogram successively by each mirror/glide axis and each rotation-derived cut, producing the FD-copy
regions directly (this is literally how Wikipedia's diagrams are drawn). The area-exact gate (below)
decides per group whether orbit-closure suffices or the cut path is needed; either way the acceptance bar
is identical.

## Component 3: rendering

`drawFundamentalDomain` (`components/canvas-overlays.ts`): keep the cell outline and the filled base FD;
add the subdivision copies as thin outlines. Draw order: cell outline (neutral), subdivision copy outlines
(faint orange, `strokeWeight ≈ 0.02`, no fill), then the base FD (translucent yellow fill + orange edge,
as today) on top so it reads as the emphasized domain.

```ts
// after the cell outline, before the filled FD:
p5.noFill();
p5.stroke(28, 60, 90);
p5.strokeWeight(0.02);
for (const copy of data.subdivision) polygon(p5, copy);
// then the existing filled base-FD block
```

## Acceptance criteria

1. **Tiling exactness (the gate):** for every one of the 92 certified k≤3 tilings, the subdivision has
   exactly `pointGroupOrder` copies, their areas sum to the cell area (within 1e-3·cellArea), and they are
   pairwise non-overlapping (centroids distinct; total area = cell area is the practical check). A
   validation script over all 92 (grouped by wallpaper group) prints per-group pass/fail; 0 fail required.
   Extra rigor: run the same over a sample of the 2720 oracle seed cells (all-k), since p6m/cmm appear
   heavily there.
2. **FD inside the cell:** every vertex of `subdivision[0]` (= `fd`) lies within the drawn cell (the check
   that currently fails for 57/92). After the fix, 0 tilings have an out-of-cell FD.
3. **cm/cmm rhombus:** every cm/cmm tiling draws a cell with `|c1| = |c2|` (ratio within 1e-6). No cmm
   draws an oblique parallelogram.
4. **No regression:** `wallpaper-symmetry-catalogue.test.ts` still passes (group ∈ 17, orbifold, FD area).
   `pnpm build` clean.
5. **Visual (manual):** on the ctrnact k=7 tiling and a cmm example, the overlay shows the cell subdivided
   into outlined FD copies with one filled, matching the Wikipedia diagram for that group.

## Risks

- **Non-symmorphic copy generation** (glides): the main risk. Mitigation: acceptance criterion 1 is a hard
  per-group area-exact gate; pg/pgg/pmg/p4g are explicitly in the 92 and must pass.
- **Float robustness of orbit-closure** (dedup tolerance, mod-lattice reduction on centroids near a cell
  boundary): reduce by centroid (interior point, not a vertex on the boundary), 1e-4 dedup key. If a group
  yields ≠ `order` copies, that is a caught bug (criterion 1), not a silent wrong render.
- **cm has no catalogue example** (only cmm appears in k≤3): verify the cm rhombus path on an oracle cell
  or a constructed case so the one-mirror-family branch isn't untested.
