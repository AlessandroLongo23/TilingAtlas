# Islamic star-fill: marker-based cell coloring

Status: approved design, pre-implementation. Date: 2026-07-11.

## Goal

Fill the cells of the Islamic line construction for star tilings. The lines already close correctly
(`Polygon.calculateIslamicSegments`, the growing-line construction). What is missing is the fill: the
plane is divided by the red construction lines into cells, and each cell needs a color.

Coloring by cell shape (congruence) fails, because the same shape appears in structurally different
places, and because star tiles pass through phases where the construction connects different regions
as the angle changes. The fill is therefore keyed to what a cell *contains*, not what shape it is.

## Trigger

The fill method is chosen per tiling:

- The tiling contains at least one star tile (`isStar`) → new marker fill, applied to the whole tiling
  (regular tiles inside it contribute only a centroid marker).
- No star tiles → keep the existing regular fill (`Tiling.drawIslamicVertexRegions`). Unchanged.

This avoids a per-cell ownership rule for cells that straddle a star tile and a regular tile, which is
the common case in the Myers star tilings.

## Marker points

Each tile seeds a set of typed, angle-independent marker points. A cell is colored by the
highest-priority marker inside it.

- centroid → green, priority 1 (wins over everything).
- each dent (reflex vertex) → yellow, priority 2. Nudged a small step toward the centroid so it never
  lands exactly on a construction line.
- each tip point → blue, priority 3. The tip point of a convex vertex `v_k` is the intersection of the
  two inward edge-normal lines through the halfways of the two edges meeting at `v_k` (edge `k-1` and
  edge `k`). For a convex vertex this point sits just inside the tile near `v_k`.

Convex vs reflex is decided by the turn sign at each vertex (cross product of the incoming and outgoing
edge, relative to the tile's winding), equivalently `this.angles`.

Regular tiles: every vertex is convex and all edge-normals pass through the centroid, so every tip
point equals the centroid. After dedup a regular tile contributes only the centroid (green). This is
why regular-only tilings look sparse under this scheme and keep the old fill instead.

Markers from all tiles are collected and deduplicated by quantized location; on a collision the
highest-priority type is kept.

Priority order is `centroid > dent > tip`. Per the construction, a cell holding two or more markers
always holds the centroid, so the only real conflict is centroid-vs-other and centroid wins. The full
order is defined anyway as a safe fallback (see guards).

## Pipeline

Pure geometry, computed once per `(tiling identity, angle)` and cached; not recomputed per frame.

1. Collect the construction segments from every tile (`calculateIslamicSegments`).
2. Build the planar graph:
   - Merge coincident endpoints (quantized). Shared edge midpoints become one degree-4 vertex.
   - Split any segment at a vertex lying on its interior (T-junction). Repeat until stable.
   - No transversal-crossing pass is needed: drawn segments never cross transversally (a ray always
     stops on contact), so the only vertices are endpoints, midpoint crossings, and T-junctions.
3. Trace faces with half-edge traversal (at each vertex, the next half-edge is the most-clockwise turn
   from the reverse direction). Each half-edge belongs to exactly one face.
4. Drop the unbounded outer face (opposite orientation / largest area). Discard degenerate faces
   (area below tolerance).
5. Color: for each face, find the markers inside it (ray-cast point-in-polygon, correct for non-convex
   faces) and take the highest-priority marker's color. A face with no marker is left unfilled.

## Rendering

In the Islamic render path, for a star-containing tiling:

- Fill the colored faces first.
- Draw the white construction lines on top as the cell borders (the existing `showIslamicLines`).
- Do not draw the gray base tiling; unfilled faces show the canvas background.

Colors (initial defaults, one place, easy to promote to config later): dent = a gold/yellow hue,
tip = a blue hue, centroid = a green hue, matching the marker identities in the sketches. Whether
these become three config sliders is the one open item to confirm at spec review.

## Caching and performance

Face extraction and coloring are cached keyed by the tiling identity plus the rounded angle, and
recomputed only when either changes (including on slider drag, one recompute per distinct angle). The
draw loop reuses the cached faces every frame.

## Error handling and guards

- A ray with no partner already warns and is skipped (existing behavior in `calculateIslamicSegments`).
- A face holding a dent and a tip but no centroid violates the centroid-always-present claim: log it
  once and fall back to `dent > tip`, never silently mispaint.
- Degenerate or sub-tolerance faces are skipped.
- Quantization tolerance matches the existing render code (`QUANT = 1e5`).

## Modules and boundaries

- `lib/utils/islamicArrangement.ts` (new, pure, no p5, no store):
  - `extractFaces(segments): Face[]` — planar arrangement to bounded faces.
  - `colorFaces(faces, markers): { face, hue }[]` — marker containment plus priority.
- `Polygon.islamicMarkers(): Marker[]` — centroid + dents + tip points for one tile.
- `Tiling.drawIslamicStarFill(ctx)` — orchestrates the cached pipeline and renders; dispatched from
  `Tiling.show` when the tiling has star tiles.

## Testing

- `extractFaces` on known inputs: a single square's construction at a fixed angle → known face count;
  a lone degree-4 crossing → four faces; the outer face is dropped.
- Markers and coloring on a 4-star at two angles: assert the centroid face is green, a dent face
  yellow, a tip face blue, and that at a merging angle the merged face is green (centroid wins).
- The existing closure test stays green.

## Out of scope

- Interlaced strapwork (over/under weave).
- Redesigning the regular-tiling fill (kept as is).
- Promoting the three colors to config sliders (trivial follow-up if wanted).
