# Hyperbolic Islamic A/B/C in the fold shader (retiring the mesh)

Date: 2026-07-19. Supersedes the mesh renderer from `2026-07-18-hyperbolic-islamic-strapwork-design.md`
for regular {p,q}.

## Problem

The Islamic hyperbolic view was drawn by an explicit finite Klein mesh (`hyperbolic-islamic-canvas.tsx`
+ `hyperbolicIslamicPatch.ts`) so it could reuse the flat `colorFacesAbc` arrangement code. That detour
is the root cause of four visible defects versus the fold-shader tiling (`hyperbolicShader.ts`):

1. no per-tile radial dimming (the mesh flat-fills each class),
2. straps render as straight Poincaré chords, not geodesic arcs (the arrangement is built in Klein),
3. tiles run out at the rim (the mesh is a finite `PATCH_LAYERS`-deep patch),
4. the CPU face-coloring mislabels at some angles (e.g. 77°) when straps nearly coincide.

All four are symptoms of "forward-rasterized finite Klein mesh" vs "per-pixel infinite exact fold."

## Key insight — A/B/C is a crossing parity

`colorFacesAbc` (islamicArrangement.ts) is a bipartite 2-coloring of the strap arrangement: A = the
face holding a tile-centre/tip marker (the star body), C = A's parity, B = the other parity. So the
class of a point is the parity of strap segments crossed on any path from the tile centre O:

- 0 crossings → A (star body, tile hue)
- odd        → B (side field)
- even > 0   → C (edge diamond, only present once edge offset > 0)

The fold shader already reduces every pixel to the central tile, which collapses **every** tile's star
body onto the one at O. So after folding, the only 0-crossing face is the central star — no marker
lookup, no component bookkeeping, no `degenerate` special-case (that only fires for star/dent/k≥2
tiles; regular {p,q} is clean). The whole classifier is one loop counting `[O, z]` × strap crossings.

## Design

CPU (per p,q,slider-angle,offset,count — not per frame): build the central tile's rosette straps in
its own Poincaré frame (origin = O). Reuse `buildRegularPatch(p,q,0)[0]` → `constructTileStraps(tile,
islamicNormalAngleFromSlider(slider), offset, count)`, which already returns the 2·p Poincaré segments.
Pass them as `uStrapA[i]`/`uStrapB[i]`, `uStrapCount = 2p` (≤ MAX_STRAP = 32 ⇒ p ≤ 16; larger p caps).

Shader (`HYPERBOLIC_FRAG`, regular path uNTiles==1), after the fold gives `z` in the central-tile frame:

- Fill: `k = parity of crossings of segment [origin, z] against each strap chord`; and `isA = (crossings
  == 0)`. Colour: A ⇒ `hsb2rgb(hue) * dim` (same dimming as the tiling), B ⇒ `uIslamicB`, C ⇒
  `uIslamicC`, each with the existing rim fade. Crossing test: standard origin-segment vs chord
  orientation test; refine to the exact geodesic `sideGeo` + arc-span test if chord slivers show.
- Stroke: min segment-distance to the same 2·p straps (drop the upper-half `uStrapReflect` fold; the
  full tile-frame set needs no reflection). Keeps the existing width/AA/cap machinery.

Routing: point regular {p,q} Islamic back at `HyperbolicCanvas` (the fold view) in `_play-client.tsx`;
retire `hyperbolic-islamic-canvas.tsx` + `hyperbolicIslamicPatch.ts` once confirmed (keep
`constructTileStraps`/`buildRegularPatch` — reused for the shader strap data — move them if the mesh
module is deleted).

## Uniform + snub — tag the straps by tile (2026-07-19 follow-up, landed)

The same classifier extends to uniform/snub, but the fundamental domain now holds SEVERAL tile types (p-gon
at O, q-gon at V, a third at E; snub adds interior triangles), each with its own star at its own centre. The
crossing count for tile X must only see X's straps — pooling every tile's straps into one list (what the old
`uniformStrapSegments` did) corrupts the parity and paints a single-hue blob over the whole disk (the bug the
user caught on omnitruncated tr-{7,3}). Locally every tile is identical; the tag is what keeps them independent.

Data: `uniformIslamicData` / `snubIslamicData` (hyperbolic.ts) return the tiles' `centers` + `hues` and the
straps with each `.tile` tagged to its tile index. The shader gets `uStrapTile[]`, `uTileCentre[]`,
`uTileHueA[]`, `uTileCount`. Fill: loop the tiles, `crossFromTile(centre_j, z, j) == 0` ⇒ that tile's A star
(its hue); regular (one tile) keeps the B/C parity split; several tile types ⇒ background is one tone (B), the
global 2-colouring being ambiguous across tile types (colorFacesAbc's degenerate collapse). MAX_STRAP 32 /
MAX_TILES 6 (snub uses 5). Verified: regular unchanged, rr/t/tr/r-{7,3} + {5,4} render distinct per-tile
stars with dimming + arcs + full rim, snub clean (p-gon stars + tiny triangle stars, no blob).

## Verification

Playwright on {7,3}/{8,3}/{4,5} at slider 0/30/45/77/90: (1) dimming matches the tiling, (2) straps are
curved arcs, (3) fill reaches the rim, (4) 77° fill correct, (5) angle 0 == plain tiling, (6) overlays
the {p,q} tiling at the same scale. Compare A/B/C against the retired mesh at a few angles as a cross-check.
