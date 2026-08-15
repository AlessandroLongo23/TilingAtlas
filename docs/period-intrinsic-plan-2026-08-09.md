# Implementation plan — intrinsic parametrization of the period-p shelf

Companion to `docs/period-intrinsic-spec-2026-08-09.md` (the spec; read §6 first). This is the how, the
order, the gates, and the two things only AL can decide.

Written 2026-08-09 after measuring the three numbers the plan turns on. Nothing committed.

**Built the same day.** What landed, and the eight things that had to be got right along the way, is
`docs/DEVELOPMENT_NOTES.md` 2026-08-09 (12). Four deltas from the plan below, all in the same direction:

- §2.2's coordinate choice held, and needed three repairs it did not anticipate — the dimension has to be
  read at a generic point, independence has to hold at the anchor too, and an axis valid to first order
  can still be a dead slider at a singular anchor.
- §6.4's cell format went the way §2.2 recommended (numeric, corner-angle coordinates), and the joint
  region is checked in the BROWSER rather than certified offline, which §3 already argued for.
- The range walk needed four guards the four standard health tests do not provide: angles bounded off 0
  and 360, the canonical key at the endpoint, a reduced lattice basis, and a bound on patch size.
- §2.1 and §2.2's open questions were answered the way this file recommends. k stays measured at the
  anchor, so all 470 labels are unchanged.

---

## 1. What I measured before planning, and what it changed

Three probes, both logged: `experiments/results/period-map-census-2026-08-09.log` and
`period-generic-dim-2026-08-09.log`.

**The continuation works on the whole shelf, not just on the one entry the spec tried it on.** Walking
off each entry's anchor along a random null direction (largest angle moved 2°) and Newton-projecting back
onto F(a) = 0 converged on **470 of 470** entries, three rounds each, every residual under 1e-11, zero
failures. Total cost for the shelf, including four SVDs per entry: 8 seconds. This was the biggest
unknown in the spec and it is now closed: the machinery in §6.3 steps 1 to 3 is not a sketch, it runs.

**The dimensions are real, not an artifact of every anchor being a symmetric point.** That was the
obvious way for the "1 to 19 parameters" headline to be wrong: a period-p angle word is a special
configuration, the Jacobian could be losing rank there, and the count would be inflated. It is not. Only
**12 of 470** lose any dimension when moved to a generic point, the worst dropping 7 → 5, and the two
histograms are nearly identical:

| dim | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 13 | 14 | 16 | 19 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| at the anchor | 10 | 90 | 78 | 86 | 63 | 45 | 20 | 30 | 7 | 16 | 9 | 3 | 9 | 2 | 1 | 1 |
| at a generic point | 10 | 92 | 77 | 88 | 62 | 46 | 19 | 29 | 6 | 16 | 9 | 3 | 9 | 2 | 1 | 1 |

Median 3, total 1,800 axes across the shelf. The 10 intrinsically rigid entries stay rigid under the
walk, 237 still ship rigid with at least one parameter, and 0 measure less than they ship.

**The shelf does not collapse the way the spec expected.** §6.3 step 6 says "expect a large further
collapse". Measured: the 470 entries carry **427 distinct combinatorial maps** — 388 maps with one entry,
35 with two, 4 with three. Since the intrinsic constraint variety depends only on the map, that caps the
merge at 43 entries, not hundreds. Two riders: keys were taken at each entry's anchor, and taking them at
a generic point can only merge more (a symmetric anchor has a finer translation lattice and keys as a
different, smaller map), so 43 is a floor. And every one of the 427 map classes holds a single k value,
so no merge crosses a k boundary and the shelf's k structure survives untouched.

**One thing I expected to be free is not.** I derived dim = E − 2F + 1 from the row/dependency count and
checked it against the measurement: it disagrees on 272 of 470 and goes negative on 82, so it is simply
false. The closure rows lose rank in ways the count does not see. Dimension has to be measured from the
Jacobian every time; there is no combinatorial shortcut to lean on and no cheap invariant to gate against.

---

## 2. Two decisions, both AL's, both cheap to state and expensive to get wrong

### 2.1 What the shelf is about, once the anchors can move

The period-p shelf's membership predicate is "uses an equilateral polygon whose interior-angle word has
period p ≥ 3". Intrinsic freedom dissolves it: the deformation AL described for period-k3-271 turns the
regular hexagon into a non-regular equilateral hexagon, and nothing stops a period-3 hexagon deforming to
a hexagon with no angle-word period at all. The generic member of one of these families is an equilateral
tiling with no period structure whatsoever.

~~**Recommendation: evaluate the predicate at the ANCHOR and let the sweep leave the period-p locus.**~~

⚑ **WRONG, and AL overruled it the moment he saw it on screen** (2026-08-09, on `period-k3-066`):

> by varying the parameters, the polygons are not period = 3 anymore. They become fully irregular. You
> overparametrized it. The degrees of freedom should never go over the period constraint.

He is right and the argument I made for the opposite does not survive contact with the pictures. A shelf
whose defining predicate is the angle word's period cannot ship sliders that destroy it: three of that
entry's five handles were corners of quadrilaterals moving independently, which makes them neither squares
nor period-3 anything. "Anchored at a period-p point" describes a catalogue of equilateral tilings, not
this one.

**The rule is: the angle word's period is a CONSTRAINT of the system, not a property of the anchor.** One
linear row per corner, a_j = a_{j+q}, with q = p where p divides the tile's side count and q = 1 otherwise.
A hexagon or a dodecagon gets (a, b, c) repeated; a square or an octagon gets nothing and stays regular.
AL's original case still works and now works for the right reason: a regular hexagon is the a = b = c point
of that same period-3 freedom, so it squeezes while the irregular one compensates, and neither leaves the
tile class. Implemented in `intrinsic_family.face_periods`.

**Corollary, and this one is load-bearing: k stays measured at the anchor.** The current rule is "a
family's k is the count at a generic parameter, because orbits merge on the coincidence locus and never
split". Carried over to intrinsic families it would be a disaster: the dim-19 entry `period-k3-141` has 24
vertices in its primitive cell, so its generic member has k up to 24, and the shelf's k=1..6 organisation
evaporates. The current defaults are already generic *for their palette family* (that is what
`stamp_records` fixed), so freezing k at the anchor keeps all 470 labels exactly as they ship and changes
nothing downstream. The note can report the generic k alongside.

### 2.2 What the slider panel does with 19 axes

`ParamSliderPanel` renders one row per axis. 1,800 axes over 470 entries is a median of 3, which is what
ships today, but the tail is real: 26 entries have 9 or more.

**Recommendation: make the coordinates CORNER ANGLES, not abstract null-space directions.** Instead of
orthonormalising the null space and calling the axes δ₁…δ₁₉, choose d darts whose angles are free
(column-pivoted QR on the Jacobian picks them) and let each slider be literally "the angle at this corner
of this tile". Three things fall out of that choice:

- The parametrization becomes a genuine function of the slider values, not a path-dependent one. This is
  the difference between a chart and a walk, and §3.2 below is where it matters most.
- Each slider has a name a reader can act on ("the 150° corner of the hexagon") and a corner the canvas
  can highlight on hover.
- AL's own description of the defect is in these coordinates: "the regular hexagon can be squeezed and
  the irregular morph to accommodate for it" is one corner angle moving with the rest following.

For the tail, group the rows by tile and collapse groups beyond the first when d > 4. Open question I
have no good answer to: whether a 19-slider entry should instead expose a curated subset. I would ship all
of them and see whether it is actually unusable before hiding anything.

---

## 3. The work, in six phases

Each phase ends at a gate that runs on all 470 entries. A phase that cannot pass its gate does not
proceed, because every later phase reads its output.

### Phase 1 — `tools/ctrnact-oracle/intrinsic_family.py`: the chart

Promote the probe into a module. It already contains, working: `system()` (map → tile cycles, vertex
cycles, base angles), `residual()`, `jacobian()`, `project()` (Newton, least-norm via `lstsq`), `dim_at()`
(rank by SVD with the singular-value gap reported).

New in this phase:

1. **Coordinate selection.** Column-pivoted QR on J; the non-pivot columns are the free darts. Break ties
   toward corners on distinct tiles and away from corners the base point holds at 60° or 90°, so the
   sliders spread over the tiling instead of clustering on one polygon.
2. **`chart(t)`.** Solve F(a) = 0 with the d free angles pinned at t, by appending the d rows e_{dⱼ} to J
   and Newton-ing from a warm start. Locally unique by the implicit function theorem, path-independent,
   which the tangent-step formulation in the spec is not.
3. **Re-pivot on failure.** Far from the anchor a free set can stop being free (the chart degenerates).
   Detect it as a rank drop in the augmented system and either re-pivot or declare the ray finished. This
   is a real case, not a defensive nicety; it is the mechanism by which a slider range ends for a reason
   that is not geometric.

Gate: for all 470, `chart` reproduces the anchor to 1e-12 and converges at ±2° on every axis
independently. Cost is known from the probe: a few ms per entry.

### Phase 2 — `tools/ctrnact-oracle/develop_map.py`: angles back to geometry

Given (map, angles), place every face and recover the cell. BFS over α from a seed face, one placement
per face of the primitive quotient; the two lattice generators come from the holonomy of two independent
dual loops, computed once at the anchor and shipped as dart sequences so the client walk is a fixed
straight-line computation with no search in it. `coupled_flex.develop_multi` is the symbolic precedent for
the same BFS.

⚑ One indexing hazard, found while reading `intrinsic_freedom.freedom`. Its closure recursion advances the
edge direction by (180 − a_j) *after* emitting edge j, which attributes dart j's angle to the far end of
edge j, while `angle_at(v, j)` is the angle at the near end. The closure equation is unaffected, because
Σ exp(iφ) is a sum over the whole cyclic set and the two conventions differ by a cyclic shift of it — which
is why the self-check passes on all 470. Development is not a sum and will come out rotated or reflected
if the convention is taken from `freedom` instead of from `angle_at`. Take it from `angle_at` and prove it
with the gate.

Gate (the make-or-break one): at the anchor, the developed cell must have the same `tiling_key` as the
shipped `renderCell`, pass `health()`, and satisfy the area certificate |Σ tile areas − det(basis)| < 1e-9.
On all 470. If this gate fails on a subset, that subset is where the whole approach stops, and it stops
loudly.

### Phase 3 — ranges

Per axis, walk outward from the anchor holding the other coordinates, `chart` + `develop` + `health` at
each step, coarse 2° steps, bisect at the break, cap at ±180°. This is `scan-family-ranges.py:extend`
with a different evaluator, and the four health tests carry over unchanged (area certificate, tile
simplicity, orientation against the anchor's sign, covering at the boundary).

Budget: 1,800 axes × 2 rays × ~60 steps ≈ 216,000 chart-and-develop solves, order 10 to 30 minutes for
the shelf. Log with progress and ETA per `CLAUDE.md`.

**The joint region is not certified offline and should not pretend to be.** A d-dimensional box built from
per-axis rays is not a proof for interior points, and for d = 19 nothing exhaustive is affordable. The
honest structure: per-axis intervals scanned with the others at the anchor, plus a **runtime health check
in the client** — the area certificate plus simplicity plus orientation, on 8 polygons and 40 darts at the
median, which is microseconds. If a requested tuple fails, walk back along the segment toward the anchor
until it passes, which is exactly `clampToRegion`'s existing strategy. That is a stronger claim than the
current shelf makes, not a weaker one: every frame drawn is certified at the point being drawn, rather
than trusted because it fell inside a box someone certified earlier.

Axes whose certified travel is under ~1° are sliders that do nothing; drop them from `params`, keep them
in the map, and log the count.

### Phase 4 — the shipped format and the TS runtime

`ParametricCellData` gains a `kind` discriminator. Absent means today's Laurent path, byte-identical, which
is what every isotoxal, mixed and star entry keeps. `kind: "intrinsic"` carries:

```
map:      { sigma: int[], alpha: int[] }          // D ≤ 126, median 40
angles0:  number[]                                 // the anchor, degrees
freeDarts: int[]                                   // the d coordinates
place:    int[]                                    // face placement order (spanning tree of the dual)
loops:    [int[], int[]]                           // the two dual loops giving the basis
params:   [{ name, dart, alpha0Deg, alphaRangeDegOpen, defaultAlphaDeg, tile }]
```

Median ~700 bytes, worst ~2 KB, against a median 2.7 KB and worst 11.8 KB for the Laurent cells they
replace, so the shelf gets smaller while covering more of the space.

`lib/utils/intrinsicCell.ts`: residual, Jacobian, Newton (dense QR with column pivoting; 126×123 worst
case is well inside a slider's budget), development, health. `evaluateParamCell` branches on `kind` and
everything else is untouched.

**Period entries move to intrinsic wholesale.** Keeping a Laurent cell alongside would mean two
representations of one family, which is the defect this whole exercise exists to remove. The proof that
the Laurent form carried ("proven to tile for every tuple in the region") is replaced by the per-frame
certificate above.

Gates: a TS↔Python parity test in the style of `paramCell.test.ts`, sampling entries × parameter tuples
and requiring agreement to 1e-9 (`scan-family-ranges.py:ev` mirroring `evalTerms` is the precedent);
`scripts/measure-alpha-fps.mjs` on a d ≥ 9 entry to confirm dragging holds frame rate; `pnpm build`.

### Phase 5 — re-dedup, naming, and what happens to the merged entries

Take the map key at a GENERIC point (perturb, project, develop, key), not at the anchor, for the reason in
§1: a symmetric anchor keys as a smaller map than its own family. Group by that key.

Within a group, two anchors sharing a map are the same tiling only if they are connected **through
embedded tilings**. The variety can be reducible and the embedded locus disconnected, so test it: path
between the two anchors in free-angle coordinates, `chart` + `health` at each step. Path healthy → merge.
Path blocked → keep both and record that they share a map and lie in different components, which is a fact
worth showing rather than a failure.

Survivors carry `anchors`: every absorbed entry as a named parameter tuple, with its old id. Nothing is
lost, the UI can offer a chip that jumps the sliders to it, and the answer to "where did period-k3-082 go"
is on the page instead of in a log. This replaces `absorbs` for the intrinsic tier.

Gates: `shelf-dedup.py` idempotent on the result; `intrinsic_freedom.py --gate` still PASSes; the 10
intrinsically rigid entries still ship with no `paramCell`.

### Phase 6 — UI

Slider rows named by corner, grouped by tile, collapsed past the first group when d > 4. Corner highlight
on the canvas on hover, which needs the dart→vertex correspondence Phase 2 already computes. Anchor chips
from Phase 5. The 2-D `ParamRegionPad` still applies at d = 2 and should keep it.

---

## 4. Risks, in the order I expect them to bite

1. **The Phase 2 development gate fails on a subset.** Most likely cause is the indexing convention above
   or a non-edge-to-edge configuration. Mitigated by all 470 having built a map successfully with α a
   fixed-point-free involution, which is most of the same requirement.
2. **Charts degenerate mid-ray**, ending slider ranges early for algebraic reasons that look geometric.
   Phase 1.3 detects it; the risk is that it happens often enough to make ranges look arbitrary. Log every
   occurrence and report the count.
3. **A slider that does nothing visible.** A dim-19 entry has 19 axes and probably a handful that move the
   picture. Range filtering in Phase 3 removes the truly stuck ones; the rest is a UI judgement.
4. **Float error in the client certificate.** The area certificate at 1e-9 on a warm-started Newton
   solution needs the tolerance chosen against measured residuals, not assumed. Take it from the Phase 3
   scan's distribution.
5. **Scope drift into the other shelves.** The isotoxal and mixed shelves have the same palette-relative P
   and the same defect. They are out of scope here and should stay out until the period shelf ships.

---

## 5. What this re-prioritises in the spec's gap list

Gap 2 (concave pairs, ~2,000 palettes) partly dissolves. A tiling using two different concave species is
unreachable by the one-species-at-a-time sweep, but if it is deformation-connected to an anchor already on
the shelf, the intrinsic sliders reach it without any new search. How much of gap 2 that covers is
measurable once Phase 3 has the ranges: count the reachable tilings whose tiles include two concave
species. Worth doing before spending the ~2,000 palette runs.

Gap 3 (k=3 completeness) and gap 5 (the `?k=4` freedraw bug that blanks the library) are untouched by any
of this. Gap 5 is a live shipping bug and is independent work.

---

## 6. Order, and what each phase unblocks

Phases 1 and 2 are the core; nothing else can start without them, and Phase 1 is largely written already
in the probe. Phase 2 is the one that can fail. Phases 3 and 4 are independent of each other once 2 is
green and can be interleaved. Phase 5 needs 2 and 3. Phase 6 needs 4 and 5.

The decisions in §2 block Phase 3 (which anchor the ranges are measured from) and Phase 6, so they want
answering before Phase 3 starts, and not before Phase 1.
