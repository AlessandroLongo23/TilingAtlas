# Islamic geometric tilings — families, tile sets, and how they meet our engine

> Research note (CC), 2026-07-18. Source for the `/theory` Islamic page and the atlas "Islamic" category.
> Primary reference: Jay Bonner, *Islamic Geometric Patterns: Their Historical Development and Traditional
> Methods of Construction* (Springer, 2017; foreword by Roger Penrose, Ch. 4 by Craig S. Kaplan). Copy at
> `../resources/papers/Islamic geometric patterns - their historical development - Jay Bonner.pdf`
> (printed page N ≈ PDF page N + 22).

## Why this note exists

The atlas catalogues tilings by regular polygons (regular, star, convex-irregular, isotoxal, …). Islamic
geometric ornament rests on a different object: an **underlying tessellation** — often by *non-regular*
tiles — that is then decorated with interlacing star "strapwork." Bonner calls the decoration method the
**polygonal technique**; it is the same thing as Hankin's **polygons-in-contact (PIC)** and Kaplan's
template method. The tessellations are worth cataloguing *in their own right*, before any strapwork, and
that is what the atlas's Islamic category does. The strapwork is our existing "Islamic construction"
(`Polygon.calculateIslamicSegments`), offered as an optional overlay.

Two axes structure the field, and they are independent:

- **Design systems** — the *tile set* (which prototiles the tessellation is built from). Bonner names
  five systematic kits plus nonsystematic and dual-level work. This is our category's sub-facet axis.
- **Pattern families** — how the strap lines cross each tile edge. Bonner: **acute**, **median**,
  **obtuse** (three angular openings at the edge midpoint) and **two-point** (two crossings per edge).
  In our construction these are the `islamicAngle` and `islamicIntersectionCount` parameters — so one
  underlying tessellation yields four classical pattern characters from the same geometry.

## The construction underneath everything: Hankin's polygons-in-contact

Hankin (1925, *The Drawing of Geometric Patterns in Saracenic Art*) observed that a star pattern is
generated from a hidden polygonal tiling: at the **midpoint of every tile edge**, emit two rays making a
chosen **contact angle θ** with the edge; extend each ray until it meets a ray from a neighbouring edge;
discard the tiling. The single angle θ sets the whole design's character — small θ gives sharp "acute"
stars, θ near 90° gives "obtuse" ones. Kaplan (Taprats; "Islamic Star Patterns from Polygons in
Contact," 2005) formalised this as two decoupled choices — pick a tiling, then place a PIC motif in each
tile — and added rosettes, interlacing, and extensions (parquet deformations, substitution/non-periodic,
hyperbolic). Bonner's book is the historical-methods counterpart to Kaplan's algorithmic one.

## The families

Angles below are the tessellation's characteristic turning angle; the cyclotomic field is what exact
arithmetic would need to place the vertices, and it is what decides whether our engine's geometry stage
(`develop`, ζ₂₄-only) can render an engine-enumerated example.

### 1. System of regular polygons (Bonner §3.1.1)
Modules: regular **triangle, square, hexagon, dodecagon** on the three regular grids plus the eight
Archimedean, twelve 2-uniform, and four 3-uniform tessellations. Angular openings 30°/45°/60°/90°/120°/135°.
Field **ℤ[ζ₁₂] ⊂ ℤ[ζ₂₄]**. Earliest and most widespread; 3-, 4-, 6-, and 12-fold stars.
**Atlas note:** these *are* our existing regular/Archimedean tilings — the Islamic category re-presents a
few under the strapwork framing rather than enumerating anything new.

### 2. Fourfold system A (Bonner §3.1.3, Fig. 130)
Nine modules: a large octagon, a small octagon, a square, a pentagon, a large and a small hexagon, a
triangle, a trapezoid, a rhombus — only the square and the two octagons are regular. Three edge lengths,
short:long = **1:√2**. Openings: acute 45°, median 90°, obtuse 135°, two-point 45°/135°.
Field **ℤ[ζ₈] ⊂ ℤ[ζ₂₄]**. 8- and 16-point stars. The most geographically widespread family — Mamluk
Egypt/Syria, Nasrid Alhambra, and general use. **Engine-reachable now** (develops in ζ₂₄).

### 3. Fourfold system B (Bonner §3.1.4, Fig. 169)
Five primary modules: an octagon, a pentagon, and two hexagon varieties (plus a rhombus and interstitial
regions). The pentagon derives from two octagons or from a 16-gon. Two edge lengths. Openings: acute 45°,
median ≈70.53°, obtuse 112.5°. Field **ℤ[ζ₁₆]** (needs ζ₄₈ alongside our ζ₂₄). Dual of the 4.8²
semiregular tessellation. Research-grade for the engine (22.5° is outside ζ₂₄; the median angle is not a
clean root-of-unity direction).

### 4. Fivefold / girih system (Bonner §3.1.5)
The richest system and the heartland of Persian/Ilkhanid/Timurid ornament. Fundamental module: the
**decagon**. Kit: decagon, pentagon, **concave hexagon (bowtie)**, **elongated hexagon / bobbin**, **wide
rhombus**, **thin rhombus**, long hexagon, trapezoid, plus larger conjoined ("fused") decagons — Kepler's
"monsters." Two edge lengths in **golden-ratio (φ)** proportion. Openings: acute 36°, median 72°,
obtuse 108°, two-point 36°/144°. Field **ℤ[ζ₂₀]** (36° = 2π/10).

The **girih tiles** of Lu & Steinhardt (*Science*, 2007) are the canonical five-tile equilateral subset —
all edges equal, all angles multiples of 36°:

| Tile (Persian name) | Shape | Interior angles |
|---|---|---|
| Decagon (*tabl*) | regular 10-gon | 144° ×10 |
| Pentagon (*pange*) | regular 5-gon | 108° ×5 |
| Elongated hexagon / bobbin (*shesh band*) | convex hexagon | 72°, 144°, 144°, 72°, 144°, 144° |
| Bowtie (*sormeh dan*) | non-convex hexagon | 72°, 72°, 216°, 72°, 72°, 216° |
| Rhombus (*torange*) | rhombus | 72°, 108°, 72°, 108° |

Each edge carries two strap lines meeting the edge at its midpoint at **54° (3π/10)** — equivalently the
straps cross one another at 72°/108° (the two phrasings appear interchangeably in the literature; reconcile
against a primary figure before quoting a single number). Because every tile shares this edge decoration,
the straps join continuously across the whole tiling. Lu & Steinhardt derived their set from **panel 28 of
the Topkapı Scroll** (Timurid Iran, late 15th/early 16th c.) and the **Darb-i Imam shrine, Isfahan (1453)**.
**Engine status:** the `star20` palette (D=20) already *solves+prunes* fivefold combinatorics, so counts
are obtainable now; rendering an engine result needs a ζ₂₀ extension to `develop`.

### 5. Sevenfold system (Bonner §3.1.14)
A limited kit around the **tetradecagon (14-gon) and heptagon** with interstitial polygons; produces 7-
and 14-point stars. Field **ℤ[ζ₂₈]**. Rare — Bonner includes essentially every historical example he
knows. Research-grade for the engine.

### 6. Nonsystematic / bespoke (Bonner §3.2)
One-off polygonal tessellations built for a single design, organised by repeat unit (isometric, orthogonal,
rectangular, hexagonal, radial) and by whether they carry one or several regions of local symmetry. This
is where the high-order and mixed-order stars live — 9-, 11-, 13-fold and combinations. Ilkhanid/Timurid
"additive" patterns.

### 7. Dual-level / self-similar (Bonner §3.3, Types A–D)
Near-quasicrystalline multilevel designs: a coarse pattern whose cells are themselves filled with a finer
version of the same system. This is the locus of the **quasicrystal dispute**: Lu & Steinhardt (2007) read
the Darb-i Imam tiling as evidence of Penrose-like quasiperiodicity anticipated by ~500 years; Bonner
(2017) and Peter Cromwell (*The Search for Quasiperiodicity in Islamic 5-fold Ornament*) argue the
historical examples are governed by ordinary translation symmetry. **Present this as contested, not
settled** — both papers are in `../resources/papers/`.

## Historical and regional threads (cite by name)

- **Abbasid, 9th–10th c.** — simplest three- and fourfold work (6- and 8-point stars): ibn Tulun mosque,
  Cairo (876–79); Kairouan minbar (c. 856). Roots in Byzantine/Sassanian/Coptic ornament.
- **Seljuk, 11th–13th c. (Anatolia/Persia)** — the leap in complexity; sophisticated 10-point patterns in
  brick and stucco (Gerd Schneider's catalogue is Bonner's key source).
- **Persian Ilkhanid/Timurid, 13th–16th c.** — the fivefold/girih heartland and the dual-level designs;
  Darb-i Imam (1453), Friday Mosque Isfahan, Shah-i Zinda and Gur-e Amir (Samarkand), the Topkapı Scroll.
- **Nasrid al-Andalus, 13th–15th c.** — the Alhambra; fourfold and sixfold work, many of the 17 wallpaper
  groups; Mudéjar continuation at the Seville Alcázar.
- **Mamluk, 13th–16th c. (Egypt/Syria)** — bold geometric medallions, including rare 16-point designs.
- **Mughal India, 16th–18th c.** — cleaner, precisely proportioned patterns; rare 14-point work; jali screens.

## Engine enumeration on the girih kit (2026-07-18)

We ran the Čtrnáct engine on the girih tile set (`tools/ctrnact-oracle/alphabets/palettes/girih.json`,
D=20): regular decagon + pentagon plus three composite tiles (rhombus, bobbin, and the non-convex bowtie
with a 216° reflex corner). Distinct k-uniform tilings the kit admits:

| k | Combinatorial | Vertex-overlap-filtered |
|---|---|---|
| 1 | 18   | 18  |
| 2 | 138  | 130 |
| 3 | 685  | 645 |
| 4 | 3653 | —   |

One engine edit was needed: `gen_alphabet.py`'s `min_len` gate now admits valence-2 vertices for palettes
with a reflex composite tile, so the bowtie's 216° notch filled by a single decagon corner
(216° + 144° = 360°) is not dropped. Gated on reflex composites only, so `make check-regular` stays
byte-identical (regular = 10/20/61/151/332/673, verified).

The result independently reproduces the geometry: at k=1 **no decagon or pentagon appears** (they cannot
tile vertex-transitively — 10-fold is non-crystallographic); the decagon first shows up at **k=2**, in the
decagon+bowtie family.

**These are now rendered and in the atlas.** `tools/ctrnact-oracle/develop_girih.py` — a self-contained
float developer for arbitrary D (the C++ `eu_develop` is ℤ[ζ₁₂]-only) — reconstructs each tiling's geometry;
all 4494 k≤4 tilings develop with the area certificate passing.

Developing exposed that **the raw pruned counts over-count**: 908 of the 4494 are non-primitive supercells
(a translation symmetry finer than their cell — the tiling repeats inside the fundamental domain), so their
k is mislabeled (an 8-bobbin supercell of a k=1 tiling reads as k=4). This is a side effect of the
`min_len=2` valence-2 admission the reflex bowtie needs; the regular palette is unaffected (still A068599).
`scripts/build-islamic-atlas.ts` drops the supercells, then deduplicates the primitives by (k, tile
multiset, cell area) and re-validates each through the coverage checker. The girih kit forms **185 distinct
primitive tilings** — **4/23/55/103 at k=1/2/3/4**. Three of the four k=1 tilings (the single-tile bobbin,
wide rhombus, and bowtie) are geometrically identical to the hand-curated fivefold entries, so a
congruence-invariant fingerprint (k, sorted tile areas, |det Λ|) drops those three from the engine import to
avoid listing the same tiling twice — **182 engine tilings ship** (1/23/55/103) alongside the 10 curated,
for **192 Islamic tilings** total. They carry `source:"islamic"`, `islamicSystem:"fivefold"`,
`discoverer:"Čtrnáct engine"`, and include the classic decagon-and-bowtie ring-of-ten-stars hand-curation
could not reach. So the true distinct-tiling count is the primitive count (185 for k≤4), not the raw pruned
count (18/138/685/3653). Caveats:
combinatorial candidates developed to float geometry (area- and coverage-verified, not exact-geometry
certified); no external reference count; periodic k-uniform tilings, not the famous aperiodic designs. Full
detail in `experiments/results/girih-enumeration-2026-07-18.md`.

## Cyclotomic reach — engine summary

| Family | Angle | Field | `star*`/develop status |
|---|---|---|---|
| Regular system | 30°/45°/60°/90°/120°/135° | ℤ[ζ₁₂] ⊂ ℤ[ζ₂₄] | already the atlas; nothing new |
| Fourfold A | 45° | ℤ[ζ₈] ⊂ ℤ[ζ₂₄] | solve + develop now → new tilings |
| Fourfold B | 22.5°, ≈70.53° | ℤ[ζ₁₆] (ζ₄₈) | research-grade |
| Fivefold / girih | 36° | ℤ[ζ₂₀] | `star20` solves+prunes; develop needs ζ₂₀ |
| Sevenfold | 360/7° | ℤ[ζ₂₈] | research-grade |

The curated atlas category is decoupled from all of this: it hand-encodes tessellations as explicit-vertex
translational cells (float coordinates), so every family — fivefold included — renders now, and the engine
enumeration is a separate research track.

## Atlas coverage (v1) — what shipped, what's deferred, and why

The curated category (`scripts/build-islamic-atlas.ts` → `public/reference-atlas-islamic.json`) ships nine
validated tessellations across five families. Every entry passes `validateTiling` (Σ tile area = |det Λ|
plus exactly-once point coverage) — nothing ships that doesn't provably tile.

- **Regular system** — 3.4.6.4, 4.6.12, 3.12.12, 3.6.3.6 (reused from the certified atlas; six- and
  twelve-point stars under the construction).
- **Fourfold A** — 4.8.8 octagon-and-square (the eight-point khatam star).
- **Fourfold B** — a 22.5°-grid parallelohexagon (representative of the system's angular signature).
- **Fivefold** — the girih bobbin and the wide rhombus (torange), both tiling by translation.
- **Sevenfold** — a 180/7-grid parallelohexagon.

Deferred, with reasons (do not fake these — a wrong tiling is worse than an absent one):

- **Iconic multi-decagon girih tilings — CLOSED via the engine (2026-07-18).** Regular decagons cannot
  share edges on any crystallographic lattice (10-fold is non-crystallographic), so these were the gap the
  hand-curation could not reach. The Čtrnáct engine + `develop_girih.py` now enumerate and render them; 185
  distinct primitive fivefold girih tilings (k≤4, incl. the decagon-and-bowtie ring-of-ten-stars), of which
  182 ship (three k=1 tilings coincide with the curated bobbin/rhombus/bowtie and are dropped) under
  `islamicSystem:"fivefold"`, `discoverer:"Čtrnáct engine"`. See the engine-enumeration section above.
- **Nonsystematic / bespoke.** Often radial and non-periodic (a large central star), which the atlas's
  translational-cell format cannot represent without a different render path.
- **Dual-level / self-similar.** Needs large hierarchical supercells; a faithful example is substantial
  hand-authoring. A contrived "representative" would misrepresent the family.

## A/B/C plain fill (verified 2026-07-18)

The plain fill 3-colours the construction arrangement: **A** = star-body cells (any cell holding a
centroid or tip marker) → the source tile's hue; **B** and **C** = the two background classes. The split
is a bipartite 2-colouring of the arrangement faces over shared edges — the parity the A cells occupy is
**C** (the small edge-centre diamonds), the other parity is **B** (the side fields). Implemented in
`colorFacesAbc` (`lib/utils/islamicArrangement.ts`), drawn by `Tiling.drawIslamicStarFill`; the two shared
background classes are hues (`islamicFillHueB`/`islamicFillHueC`), picked by hue rings and rendered at the
tile palette's locked S/L (HSL 100%/80%) so a fill is always a tile-palette colour — they apply at draw
time, so recolouring never rebuilds geometry.

Why the split needs the edge offset: at **Edge Offset 0** the two rays on an edge share one origin, so
there is no diamond — C is empty and the fill degrades to A + B (two-tone). At **Edge Offset > 0** the
origins separate and open a diamond at each edge centre; because the tiling is edge-to-edge, each diamond
is two triangles across the shared edge, both C. This matches the two-point family (Bonner/Kaplan δ).

Verification (diagnostic over pooled real `calculateIslamicSegments` output): the arrangement is bipartite
and A is confined to a single parity on squares (4⁴), triangles (3⁶), hexagons (6³) and 4.8.8 at edge
offsets 0–0.6 and contact angles 30/45/60°. Not yet verified for genuinely star-shaped tiles (dent/tip)
or k≥2 multi-orbit tilings — `colorFacesAbc` returns `degenerate = true` if A ever straddles both parities
in a component, and the renderer then paints all background as B (two-tone) rather than mis-colour.

## Sources

- Jay Bonner, *Islamic Geometric Patterns* (Springer, 2017). ISBN 978-1-4419-0216-0.
- E. H. Hankin, *The Drawing of Geometric Patterns in Saracenic Art* (Memoirs of the Archaeological Survey
  of India 15, 1925). PDF in `../resources/papers/`.
- Peter J. Lu & Paul J. Steinhardt, "Decagonal and Quasi-Crystalline Tilings in Medieval Islamic
  Architecture," *Science* 315 (2007) 1106–1110.
- Peter R. Cromwell, "The Search for Quasiperiodicity in Islamic 5-fold Ornament," *Math. Intelligencer*
  31 (2009). PDF in `../resources/papers/`.
- Craig S. Kaplan, "Islamic Star Patterns from Polygons in Contact" (Graphics Interface, 2005); PhD
  dissertation, ch. 3. Software: Taprats.
- B. Lynn Bodner, "Hankin's 'Polygons in Contact' Grid Method," Bridges 2008.
- Branko Grünbaum & G. C. Shephard, *Tilings and Patterns* (1987) — the regular/Archimedean grids.
