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

## REVISION 2026-07-09b: draw the primitive PARALLELOGRAM, not the Wigner–Seitz cell

User follow-up after the first ship: the Wigner–Seitz cell for a **hexagonal** lattice is a 120°
**hexagon**, but Wikipedia's "cell structure" diagram always draws the primitive **parallelogram** (for
hexagonal that's the 60°/120° **rhombus**). The user wants the parallelogram for every group. Also:
symmetry-elements view must not colour the tiles; rotation glyphs must match Wikipedia (2-fold magenta
diamond, 3-fold red triangle, 4-fold amber square, 6-fold blue hexagon); centres + axes must be replicated
across the whole viewport (not one cell) and land on the rendered tiling.

**Cell.** `cellPolygon` is now the **corner-anchored** primitive parallelogram `[a, a+c1, a+c1+c2, a+c2]`
(the max-symmetry centre at a VERTEX, so the FD-tiling chambers align with the cell edges instead of being
split by them). Hexagonal → 60° rhombus, rectangular → rectangle, square → square, oblique → parallelogram.
cm/cmm keep the mirror-aligned rhombus (also a parallelogram). The WS cell survives only as the *internal*
source of correct FD copies.

**Subdivision.** Cut the anchor-centred WS cell into correct FD copies (kaleidoscope / wedges, as before —
the WS cell has the point-group symmetry about its centre, so this is exact), then **re-tile** those copies
into the displayed parallelogram by clipping every lattice translate to it (`retileIntoCell`). Since the WS
copies tile the plane under Λ, clipping the plane-tiling to the parallelogram partitions it exactly. p1 (whole
cell) and p2 (two 2-fold-related halves via a lattice-aligned mid-cut) are built natively for clean pieces.
A chamber straddling a cell edge splits into edge-aligned pieces, so the piece count can exceed `order` for
mirror-misaligned hexagonal reflection groups (p3m1/p31m) — still area-exact with a whole FD emphasized.

Result on the 92 certified k≤3 tilings: **FD-outside-cell 0/92**, **area-exact subdivision 92/92**,
**p6m 34/34 draws the equal-edge 60° rhombus with 12 whole triangles**, cm/cmm rhombus 25/28.

**Overlay (`canvas-overlays.ts`).** `drawSymmetryElements(p5, data, view)` inverts the canvas transform to
the visible world AABB and replicates every centre + axis by the lattice basis across it (deduped, capped at
80/axis). Glyphs per the Wikipedia legend above. `canvas.tsx` draws tiles via `drawTilingPlain` (monochrome)
whenever the symmetry-elements toggle is on, reserving colour for the axes/centres.

---

## SHIPPED APPROACH (cell shape superseded by the revision above): cut a symmetry-centred cell

The "orbit a pre-built FD" idea below was prototyped and abandoned — orbiting `buildFD`'s FD fans around
the anchor into a Wigner–Seitz region that does not fill a parallelogram, so the FD kept poking out
(measured 23/92 still outside; the whole point was to fix that). The shipped method instead **cuts a cell
that is centred on the anchor**, so the copies are literally pieces of the cell and the FD is inside by
construction. Prototyped to **92/92 area-exact** on the certified catalogue before porting.

Algorithm (`buildSubdivision` in `WallpaperSymmetry.ts`):
1. **anchor** = the centre of maximal site symmetry: highest rotation order, then most mirror lines
   through it.
2. **cell polygon** (all centred on the anchor, matching Wikipedia's cell per lattice):
   - oblique p1/p2 → parallelogram `[c1,c2]`; cm/cmm → mirror-aligned rhombus `(A±B)/2`; everything else →
     the **Wigner–Seitz cell** of the lattice (= rectangle for rectangular, square for square, 120°
     hexagon for hexagonal). WS is a box clipped by the perpendicular bisectors of nearby lattice vectors.
3. **cut directions** through the anchor: if the mirror directions through the anchor form a clean
   kaleidoscope (`2·count === order`) use them; otherwise `order/2` equally-spaced lines (rotation-only /
   non-symmorphic), aligned to a mirror when one exists.
4. **subdivision** = cut the cell polygon by those full lines through the anchor → exactly `order` equal
   sectors. `subdivision[0]` is the emphasized FD. Self-checked area-exact; on the (never-hit on the
   catalogue) failure, keep the `buildFD` fallback FD and draw no subdivision.

Result on the 92 certified k≤3 tilings: **FD-outside-cell 0/92** (was 57), **subdivision exact 92/92**,
**cm/cmm rhombus 25/28** (3 fall back to the WS cell where the perpendicular lattice period is absent —
still correct, just a hexagon). `SymmetryData` gains `cellPolygon: Vec2[]` (the drawn cell) and
`subdivision: Vec2[][]`; `cell` stays the lattice basis (axis length + area). Gate:
`scripts/validate-fd-subdivision.ts`.

---

## (Historical, superseded) orbit-of-FD prototype notes

A prototype over all 92 certified tilings settled the algorithm empirically. Two corrections to the
approach below, and one honest limitation:

1. **Generators must be the ANCHOR's site symmetry only** (rotations about the anchor + mirrors through
   the anchor) **+ all glides** — NOT rotations about every center / every mirror. Using all centers
   over-generates (cmm 5/4, p6m 14/12, p4m 9/8) because copies from non-anchor centers reduce to
   overlapping extras.
2. **Reject any candidate whose centroid lies inside an already-accepted copy** (point-in-polygon), and
   cap strictly at `order`. This enforces a disjoint tiling and removes the remaining over-generation.

This got 88/92 but never filled the parallelogram (FD still outside for 23/92) and left p3/p6 as a
single-FD fallback — which is why it was replaced by the cut-the-cell method above.

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
