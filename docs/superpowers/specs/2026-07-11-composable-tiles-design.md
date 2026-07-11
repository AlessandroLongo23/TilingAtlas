# Composable tiles: a palette-agnosticism demo for the Čtrnáct engine

Date: 2026-07-11
Status: design approved (AL, brainstorm), spec under review
Author: CC

## Goal

Add a new tile family to the Čtrnáct combinatorial engine (`tools/ctrnact-oracle/`): the
**composable tiles** — convex, unit-edge polygons assembled by gluing unit regular {3,4,6,12}
polygons edge-to-edge. Generate the *complete finite* family, build a palette that carries the
regular tiles plus all composites, run the solver at k=1 with no stars, and report the
combinatorial catalog and counts. Along the way, emit per-family size tables (tiles, corner
classes, vertex configurations).

The concrete demonstration: the engine is **palette-agnostic** — a new tile family drops in as
data plus one bounded generalization of the corner-class machinery, with no change to the search.

## What this is NOT (read before touching the completeness claim)

This is an **illustrative demo, not a completeness target**, exactly as scoped in
`docs/thesis-pivot-ctrnact-2026-07-10.md:109-113`. Two facts must stay loud in every artifact:

1. **Decomposition ambiguity.** With regular tiles *and* composites in one palette, a single
   geometric tiling is representable many ways — a rhombus tiling is a triangle tiling with the
   shared edges erased. The engine will emit those as distinct tilings with distinct k. So the
   k=1 *count here is not an "all and only" count* and must never be compared to A068599 or fed
   into the exhaustiveness argument. It is a count of tilings *over this palette's tile alphabet*.
2. **No external oracle.** Unlike regular (Galebach/Soto-Sánchez) or stars (Myers), there is no
   independent enumeration to check against. Correctness here means: the engine ran a new palette,
   the regular gate stayed byte-identical, and the outputs are internally consistent.

## The family

### Definition

A **composable tile** is a polygon P such that:

- P is convex.
- Every edge of P has unit length.
- P is an edge-to-edge union of two or more unit regular polygons drawn from {3, 4, 6, 12}.
- P is counted up to congruence, **mirror images merged** (consistent with the settled chirality
  decision, NOTES §12.8).
- P is **not** congruent to a bare regular {3,4,6,12} tile — those are the "regular" set already.

Because each boundary vertex of P is a convex corner whose interior angle is a sum of regular
corner angles (60/90/120/150) staying below 180° and on the 30° grid, **every interior angle of P
lies in {60, 90, 120, 150}**. All angles are multiples of 30°, so the whole family lives in
ℤ[ζ₁₂] (D = 12). No ring or develop change is needed.

### Finiteness (why the family is a finite set)

Interior angles are in {60,90,120,150}, so exterior angles are in {30,60,90,120}. Exterior angles
sum to 360°, and the smallest is 30°, so **P has at most 12 edges**. For each side count n ≤ 12 the
cyclic angle-words over a 4-letter alphabet are finite; unit edges plus a fixed angle sequence make
each shape rigid, so only finitely many words close into a polygon. Dedup by congruence ⇒ the
family is finite.

### Generation (constructive gluing)

Primary method, chosen because everything it emits is dissectable *by construction* and it reuses
the existing exact geometry (`lib/classes/Cyclotomic.ts`, `lib/classes/polygons/Polygon.ts`):

1. Seed a worklist with each single regular {3,4,6,12} tile placed at an exact anchor.
2. BFS: for each shape, for each boundary edge, glue a unit regular {3,4,6,12} tile across that
   edge (exact ℤ[ζ₁₂] placement). Reject a gluing that overlaps existing tiles (exact test).
3. Canonicalize each resulting union by an **exact ℤ[ζ₁₂] congruence key** (translation-, rotation-,
   reflection-invariant) and dedup.
4. Bound the search by a tile-count cap K and the ≤12-side rule; K is set above the largest tile
   the family can contain (a convex unit ≤12-gon's area over the unit-triangle area, ~30 as a safe
   ceiling) and confirmed by the measurement gate below.
5. Collect the unions whose outer boundary is a convex polygon, drop bare regulars, dedup, and
   read off each tile's cyclic interior-angle word (in D=12 units) plus a stable name.

**Completeness argument.** Any composable tile P is, by definition, a union of regular tiles glued
edge-to-edge; the adjacency graph of that dissection is connected, so its tiles admit an ordering
where each is edge-adjacent to the union of its predecessors. The BFS adds exactly one
edge-adjacent regular tile per step, so it reaches P. Intermediate unions need not be convex; only
collected results are. Hence the BFS, run to the K/side bound with shape-dedup, yields **every**
composable tile.

**Optional independent cross-check (validation, not core).** Enumerate all closing unit angle-words
over {60,90,120,150} up to side count 12 (a small, exactly-checkable superset), and confirm the
gluing result equals the dissectable subset. Kept out of the critical path; run if we want a second
witness for the completeness claim.

### Risk on this half

BFS *breadth* over non-convex intermediates can be large. Mitigation is the measurement gate: the
generator prints its worklist peak, distinct-shape count, and result count before anything
downstream runs. If breadth is unreasonable at the needed K, fall back to boundary-enumeration +
per-candidate dissectability fill-check (same result set, different cost profile).

## Engine generalization (the p > 2 lift)

The vertex-figure side is already general: `enum_configs` + the doubled-dart folding in
`gen_alphabet.py` handle arbitrary-length vertex words (that is how 3.4.6.4 works). The only
restriction is the per-tile *boundary* successor map, asserted `p ≤ 2` at
`gen_alphabet.py:60`. Composite boundaries are period-p for arbitrary p.

### `gen_alphabet.py`

- Add a `composite` tile kind. Its spec carries the cyclic interior-angle word (in D-units). Reduce
  that word to its fundamental rotation period p; emit p **corner classes**, one per position in the
  fundamental block, with the correct `units`. `L` = full boundary length, `p` = fundamental period.
- Emit a **`CLASS_PREV`** table alongside `CLASS_NEXT` (`next_class` gains a `prev_class` sibling
  computing position `(pos - 1) mod p`).
- Remove the `assert self.p <= 2`.
- Composite corner classes have `is_point = False`, so the star point-adjacency lemma in
  `enum_configs` does not fire (correct — composites have no dent-fill points). `min_len` stays 3
  (no stars ⇒ no 2-corner noncounting vertices).
- Composites use the non-pinned systematic naming path (like `star24`), not the legacy matcher.

### `eu_solver.cpp` — `checkpart` direction-locking

`checkpart` (`eu_solver.cpp:239-277`) walks each face and advances the expected class by
`CLASS_NEXT` every step. A mirror-placed tile traverses its boundary in reverse; for p ≤ 2 the
successor is its own inverse, so the code cannot tell, but for p > 2 forward ≠ backward.

Fix: at the **first** corner-to-corner step of a face, read the observed next class. If it equals
`CLASS_NEXT[expect]`, lock forward; if it equals `CLASS_PREV[expect]`, lock backward; otherwise the
face is invalid. Walk the rest with the locked successor. This is sound — a placed tile has one
physical orientation, so the first step determines it — and it degenerates exactly to today's
behavior when `CLASS_NEXT == CLASS_PREV` (p ≤ 2), which the regular gate then confirms
byte-for-byte.

### `eu_pruner.cpp`

Verify whether the pruner's canonicalization walks tile boundaries (and thus also needs
`CLASS_PREV`). If it does, apply the same direction-locking; if not, no change. This verification
is a task in the plan, not an assumption here.

## The palette

`tools/ctrnact-oracle/alphabets/palettes/composite12.json`:

- `name: "composite12"`, `D: 12`, `pinnedLegacy: false`.
- `tiles`: the regular {3,4,6,12} entries (`kind:"regular"`, same as `regular.json`) followed by
  every composite from the generator (`kind:"composite"`, each with its angle-word and name).
- Optional `maxValence` left unset unless the measurement gate says the vertex-config enumeration
  needs a cap; if a cap is imposed it is logged loudly as a knob, per the completeness-knob rule.

The tile list is emitted by the generator, so the palette is a generated artifact plus a small hand
header. Regular tiles are listed first so the file reads regular-then-composite.

## Measurement tables (the size report + the gate)

Emitted by the generator and by a thin instrumentation pass over `enum_configs`, written to
`experiments/results/`:

**Table A — family breakdown** (family = grouping by side count n):

| n | # composite tiles | # corner classes (Σ period p) |
|---|---|---|
| 3,4,6,12 (regular) | ... | ... |
| 4 | ... | ... |
| 5 | ... | ... |
| ... up to 12 | ... | ... |
| **total** | ... | ... |

**Table B — alphabet growth** (how the vertex-configuration count grows as families are added):

| palette | # corner classes | # vertex configurations | # vertexdef entries |
|---|---|---|---|
| regular only | ... | ... | ... |
| regular + n=4 | ... | ... | ... |
| regular + n≤5 | ... | ... | ... |
| ... | ... | ... | ... |
| regular + all composites | ... | ... | ... |

Table B is the **gate**: we read these numbers before committing to the full `gen_alphabet.py`
build and solve. "Vertex configurations" = distinct cyclic corner-class words summing to D from
`enum_configs`; "vertexdef entries" = folded site-symmetry variants (the actual alphabet the solver
loads). If either explodes past what is tractable, we decide the mitigation (valence cap, family
subset) explicitly and log it — never a silent hang or silent drop.

## The run

```sh
cd tools/ctrnact-oracle && make PALETTE=composite12   # regenerate tables + build eu_solver.composite12
PALETTE=composite12 ./run-oracle.sh 1                 # solve + prune at k=1, develop skipped
```

- Non-regular palette ⇒ `run-oracle.sh` skips develop; we take the combinatorial catalog and count
  only (matches the approved "combinatorial catalog + counts" depth).
- `EU_NCBUDGET` is inert (no stars, no noncounting types); `has_noncounting` stays false.
- Log synchronously to `experiments/results/composable-k1-2026-07-11.log` with progress/ETA per the
  experiments convention, the two tables above, the final k=1 count, and a header stating the
  decomposition-ambiguity caveat and the demo (non-completeness) framing.

## Correctness guards

- `make check-regular` must stay **byte-identical**. This is the load-bearing check: it proves the
  p > 2 generalization and the `checkpart` direction-locking did not disturb the regular alphabet or
  the regular catalog. Run it before and after the engine edits.
- The generator's own certificates (`certs.txt`: `lneig∘rneig=id`, `mirro` involution, free Aut
  action, `reps` transversal) must pass for every composite entry, same as star24.
- Generator self-consistency: every emitted composite tile's angle-word sums to (n-2)·180°, closes
  in ℤ[ζ₁₂], and is convex; reject and report any that do not.

## Out of scope

- Geometry/develop for composites (no coordinates, no rendered tilings). Deferred.
- App/atlas UI integration (no TS `Polygon` subclass, no atlas cards). Deferred.
- k > 1. This spec targets k=1 only.
- Any use of composable counts in the exhaustiveness claim.

## Success criteria

1. The generator emits the complete composable family with a stated finiteness/completeness
   argument, plus Table A.
2. `gen_alphabet.py` builds the `composite12` alphabet with no `p ≤ 2` assert, certificates
   passing, and Table B recorded.
3. `make check-regular` is byte-identical after all engine edits.
4. `PALETTE=composite12 ./run-oracle.sh 1` completes and produces a k=1 combinatorial catalog +
   count, logged with the caveat header and both tables.
5. If any completeness knob (valence cap, family subset) was turned to make the run tractable, it is
   logged loudly with what it could drop.
