# Can STS find the Euclidean hollow tilings?

The question Marek raised on Discord (2026-08-17): self-intersecting stars in the plane need an extra
check, because the proof that STS output is a *single* covering of the plane fails once faces overlap.

The Atlas already has the answer set. `tools/hollow/` shipped **14 uniform hollow tilings**
(Grünbaum–Miller–Shephard, *Uniform Tilings with Hollow Tiles*, Coxeter Festschrift 1981) built by a
SEPARATE exact ℤ[ζ₂₄] engine, not by STS. So this is a rare thing in this project: a target set with a
published oracle AND an independent implementation to disagree with.

Test: can the Čtrnáct engine reproduce them?

Live log; newest at the bottom.

## The 14 targets

| id | config | density | κ | cells |
|---|---|---|---|---|
| `hollow-12-5_12-5_3-2` | 12/5.12/5.3/2 | −1 | 1 | 9 |
| `hollow-12-5_12_12-7_12-11` | 12/5.12.12/7.12/11 | 0 | 2 | 4 |
| `hollow-12-5_3_12-5_6-5` | 12/5.3.12/5.6/5 | −2 | 1 | 4 |
| `hollow-12-5_4_12-7_4-3` | 12/5.4.12/7.4/3 | 0 | 2 | 8 |
| `hollow-12_6-5_12-7` | 12.6/5.12/7 | 2 | 1 | 4 |
| `hollow-3-2_12_6_12` | 3/2.12.6.12 | 2 | 1 | 4 |
| `hollow-4_12_4-3_12-11` | 4.12.4/3.12/11 | 0 | 2 | 8 |
| `hollow-4_3-2_4_3-2_3-2` | 4.3/2.4.3/2.3/2 | 1 | 1 | 6 |
| `hollow-4_3-2_4_6-5` | 4.3/2.4.6/5 | −1 | 1 | 6 |
| `hollow-4_4_3-2_3-2_3-2` | 4.4.3/2.3/2.3/2 | 1 | 1 | 6 |
| `hollow-4_8-5_8-5` | 4.8/5.8/5 | 1 | 1 | 4 |
| `hollow-6_4-3_12-7` | 6.4/3.12/7 | 1 | 1 | 6 |
| `hollow-8-3_8_8-5_8-7` | 8/3.8.8/5.8/7 | 0 | 1 | 4 |
| `hollow-8_4-3_8-5` | 8.4/3.8/5 | 1 | 1 | 4 |

Three facts that matter and were not obvious before reading the data:

1. **Most of these tiles are RETROGRADE, not self-intersecting.** `3/2`, `4/3`, `6/5`, `8/7`, `12/11`
   are convex polygons traversed backwards; only `8/3`, `8/5`, `12/5`, `12/7` genuinely cross
   themselves. So the dominant new ingredient is the same face-orientation category the spherical run
   hit at U13, not the star face.
2. **Density is 0 and negative here.** The spherical certificate demanded an integer D ≥ 1. In the
   plane, 0 (prograde and retrograde winding cancel) and negative (the whole thing traversed the other
   way) are proper values. So the certificate has to be "integer and CONSTANT", not "positive integer".
3. **κ (vertex-figure multiplicity) is a second index beyond density**, and it is 2 for three of the
   14. The spherical developer has no analogue.

## Angles, and what the closure rule has to be

On the D=24 grid the corner of `{n/d}` is `(n−2d)·12/n` units, reflex-lifted into (0,24) when d > n/2:

| tile | 3 | 4 | 6 | 8 | 12 | 3/2 | 4/3 | 6/5 | 8/3 | 8/5 | 8/7 | 12/5 | 12/7 | 12/11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| units | 4 | 6 | 8 | 9 | 10 | 20 | 18 | 16 | 3 | 21 | 15 | 2 | 22 | 14 |

Every one of the 14 configs sums to 24, 48 or 72, i.e. `≡ 0 (mod 24)` with δ ∈ {1,2,3}. Checked all 14
by hand before writing any code. The existing `euclidean` closure demands `total == D` exactly, so it
can express only δ=1 and misses the rest by construction.

## The two changes STS needed

1. **`density-flat` closure** in `enum_configs`: accept `total > 0 and total % D == 0`, keep recursing
   to `D·maxdens`. The existing `euclidean` mode is the δ=1 special case, so this strictly extends it
   and δ=1 words come out unchanged. Unlike the spherical `density` mode there is no defect to solve
   away afterwards: Euclidean angles are rigid, so closure is an equality and the arithmetic is the
   whole test.
2. **Retrograde traversal in the `starpoly` kind.** The assert was `n > 2d ≥ 2`, which rejects every
   `d > n/2`. Relaxed to `n > d ≥ 1, n ≠ 2d`, and the corner angle is now reflex-lifted, `units =
   ((n−2d)·(D/2)/n) mod D`. On the sphere orientation was a develop-time flag invisible to the search;
   in the plane the angle itself differs (315° vs 45°), so prograde and retrograde are different corner
   classes and the search has to carry both.

About 15 lines. No change to the solver, the pruner, or the search.

## T1 — the alphabet

`hollow-eu`: D=24, 14 tiles ({3,4,6,8,12} prograde, {8/3} {12/5} self-intersecting, {3/2} {4/3} {6/5}
{8/5} {8/7} {12/7} {12/11} retrograde), maxValence 6, maxDensity 3.

**23,814 distinct vertex configurations, 24,953 alphabet entries.** All 14 published GMS
configurations are present:

```
FOUND 12/5.12/5.3/2       FOUND 12/5.12.12/7.12/11   FOUND 12/5.3.12/5.6/5
FOUND 12/5.4.12/7.4/3     FOUND 12.6/5.12/7          FOUND 3/2.12.6.12
FOUND 4.12.4/3.12/11      FOUND 4.3/2.4.3/2.3/2      FOUND 4.3/2.4.6/5
FOUND 4.4.3/2.3/2.3/2     FOUND 4.8/5.8/5            FOUND 6.4/3.12/7
FOUND 8/3.8.8/5.8/7       FOUND 8.4/3.8/5
=== 14 / 14 ===
```

⚑ A false negative of my own first: I checked the targets against `CLS` in the generated `tables.py`
and got 7/14. `CLS` is indexed by DART ORBIT, not by corner, so its rows are not vertex words at all.
The configuration lives in `STAB_SYMBOL`. Reading the wrong array made a clean result look like a
50% failure, and the raw `enum_configs` output (14/14) is what exposed it.

## T2 — the search

k=1 solve: 119,475 nodes, 3,141 admissible (tkey, Q(f)) pairs. Prune: **21,376 blocks kept**,
covering 10,808 distinct vertex configurations.

Every real tiling is there, and both halves of the check matter:

- **25 / 25 real uniform tilings have a k=1 block.** The 14 hollow ones and, as regression, all 11
  convex uniform Euclidean tilings (GMS table 1 is 25 entries, 11 convex + 14 hollow).
- **0 / 4 of the impossible species are admitted.** `3.3.4.12`, `3.3.6.6`, `3.4.3.12` and `3.4.4.6`
  close to exactly 360° and tile nothing; the STS pruner rejects all four, the same verdict
  `tools/hollow/` reaches. So the combinatorial engine is doing real discrimination here, not merely
  enumerating what closes.

## T3 — the control, and the actual size of Marek's gap

Same solver, same k, convex tiles only (`regular-z24`, which is a strict subset of `hollow-eu`):

```
  k=1 : 11        total kept: 11
```

**Eleven blocks for eleven uniform tilings, exactly.** In the convex world the pruner's output IS the
answer, one to one, with no geometric stage needed — which is precisely the single-covering theorem
Marek described. Add hollow tiles to the same search and it becomes 21,376 blocks for 25 tilings.

| palette | k=1 blocks | real uniform tilings | over-generation |
|---|---|---|---|
| `regular-z24` (convex) | 11 | 11 | **1.0×** |
| `hollow-eu` | 21,376 | 25 | **855×** |

That factor is the quantitative form of his objection. The soundness that makes STS's convex output
self-certifying does not survive self-intersecting faces, and the whole gap has to be closed
downstream, on geometry.

## T4 — how much a purely combinatorial rule can buy

`tools/hollow/cfg.py` carries one structural condition STS does not: going round a vertex, the edge
DIRECTIONS are the partial angle sums mod 24, and each edge carries exactly two faces, so every
direction is visited once — **the partial sums must be distinct mod D**.

Measured on the STS alphabet: **23,814 → 13,023, so 45.3% killed, and 0 of the 25 real tilings lost.**
Sound, cheap, five lines in `enum_configs`. It does not close the gap: 13,023 configurations still
stand against 25 answers, so the remaining two orders of magnitude are irreducibly geometric.

## Verdict

The SEARCH generalizes to the plane for about 15 lines, and it is not naive — it already kills the
four species that close but tile nothing. What does not generalize is the guarantee. STS's convex
output needs no geometric check because a k=1 map whose vertices close at 360° provably develops to a
single covering; once faces overlap, that theorem is gone and 855 of every 856 blocks are unproven.

The missing stage is exactly the one `tools/hollow/engine.py` already implements and it is not the
"finite covering" phrasing: for periodic output finiteness is automatic (finitely many faces per cell,
each of finite area). What has to be certified is
**a torus lattice** (accept only on a period certificate, never on a growth cap),
**an exact integer density** (signed face area per fundamental domain over the domain's area,
constant, and 0 and negative are legal values), and
**discreteness** (measured separations are bimodal: `4.8/3.8/7` gives √2−1 while a degenerate branch of
`4.6/5.12/5` gives 0.019 with 729 vertices inside r<3).

So the honest answer to "can STS generate the Euclidean hollow tilings" is: it generates all of them,
and it cannot yet tell you which 25 of its 21,376 answers they are.

---

# Part 2 — building the certificate and validating it at k=1

## The certifier

Not written from scratch: `tools/hollow/engine.py` already implements exactly the missing stage, and
it is already validated (it reproduces GMS 14 + the convex 11 and rejects the 4 impossible species).
`tools/hollow/certify_sts.py` wires it to a configuration list. Three-valued, and the distinction is
load-bearing: **TILING** = torus certificate AND exact integer areal density; **none** = every branch
reached a contradiction, a real rejection; **unresolved** = the node budget ran out, which is never a
rejection.

⚑ **Cost is wildly bimodal, and that decides the design.** On 25 random configurations,
`node_cap=200` settles 23 in 0.02 s each; `node_cap=1000` costs 26× the time and resolves none of the
remaining 2. A flat cap of 20,000 over the whole space projected to ~44 hours single-threaded. So the
driver runs a **cap ladder** — sweep everything at 200, keep the unresolved, escalate — which is sound
precisely because `grow` never accepts on a cap, so verdicts are cap-independent and the ladder
changes running time only. Plus a worker pool.

## Calibration on the 29 known answers

```
=== totals: 25 TILING | 4 rejected | 0 unresolved  (0s) ===
```

All 14 GMS hollow tilings and all 11 convex ones certify with the density the shipped shelf records
(+1, −1, −2, 0, +2 …), and `3.3.4.12`, `3.3.6.6`, `3.4.3.12`, `3.4.4.6` are rejected. At `node_cap=200`
alone. The certifier is correct and it is fast on real tilings; the cost is entirely in disproving
the junk.

## The k=1 validation — the number the whole thing turns on

All 23,814 configurations STS enumerates, run through the certificate. Rung 1 alone, `node_cap=200`,
8 workers:

```
... 23814/23814  tilings=25 rejected=22310 unresolved=1462   416s
```

**Exactly 25.** Checked by identity, not just by count:

```
certified: 25   known: 25
KNOWN BUT NOT CERTIFIED : none
CERTIFIED BUT UNPUBLISHED: none
```

Every one of the 14 GMS hollow tilings and all 11 convex ones, and nothing else. So the certificate
takes STS's Euclidean k=1 output from **23,814 candidates to the 25 real answers**, in seven minutes,
and it neither loses a real tiling nor invents one.

The seven apparent density disagreements against the shipped shelf (`12/7.12/7.3` reads +1 where the
shelf says −1, and six more) are all exact SIGN FLIPS, and that is the documented reversal symmetry,
not an error: `{n/d} → {n/(n−d)}` walks the same tiling backwards and sends the total from `24δ` to
`24(m−δ)`. The certifier reported whichever rotation it reached first. Sign-flip agreement on all
seven is itself a check — a real disagreement would not be antisymmetric.

⚑ **STS is not just sound here, it is complete.** The sweep certified the whole alphabet, not only the
configurations STS emitted blocks for. If any configuration STS had *skipped* certified as a tiling,
that would be an STS completeness bug. None did.

## The 1,462 that stayed undecided

Rung 1 leaves 1,462 configurations unresolved at `node_cap=200`. Rung 2 (`node_cap=2000`) ran 45
minutes on 8 workers without clearing them and was stopped: the tail is genuinely hard, and it was
starving the k=2 measurement. This does not threaten the result and the reason is structural —
`grow` never accepts on a budget, so an unresolved configuration can only ever turn into a **26th,
unpublished tiling**, never remove one of the 25. All 25 known answers are already certified.

Honest statement of the k=1 result, then: **25 certified tilings, 22,310 proven non-tilings, 1,462
undecided.** Not "exactly 25 and nothing else could be" — 25 found, 94% of the space provably dead,
6% still owed a verdict.

# Part 3 — what k=2 costs

## Measured, on a ladder of palettes

Same engine, same closure, same k. Only the tile count changes. Timed on this machine, with a
caveat: the 14-tile row shared the box with the certification workers and a foreign `eu_solver_rt`,
so its wall time is a lower bound on a quiet machine's.

| tiles | alphabet | k=1 blocks | k=2 blocks | k=2 solve | k=1 → k=2 |
|---|---|---|---|---|---|
| 4 (`hollow-eu-sq`) | 106 | 27 | 466 | 0.29 s | 17× |
| 6 (`hollow-eu-mid`) | 265 | 153 | 19,508 | 13.8 s | **127×** |
| 9 (`hollow-eu-oct`) | 2,006 | 2,177 | — | see below | — |
| 14 (`hollow-eu`) | 24,953 | 21,376 | — | >1 h 55 m, incomplete | — |

**The growth factor is itself growing**: adding two tiles took the k=1→k=2 multiplier from 17× to
127×. That is the shape of the problem — not a constant per-k cost like the spherical shelf's ×73,
but a multiplier that climbs with the alphabet.

⚑ A measurement of mine that was wrong and had to be redone: a first attempt at the 6-tile k=2 run
reported "0 bytes after 10 minutes", which read as a catastrophic slowdown. The compile had been
killed by the same timeout, so the solver binary never existed and the run measured nothing. Built
separately, the same solve finishes in **13.8 seconds**. A timeout around a compound command times
the compound, not the thing you meant.

## The blocker is not the solve

Even a finished k=2 solve produces output nobody can certify, because **the certificate that just
took 23,814 candidates to 25 is structurally k=1**. `engine.grow(cfg, kappa)` takes ONE
configuration: `options(v)` calls `alignments(cfg, kappa, known)`, `apply` reads
`placements(cfg, kappa)`, `seed_ids(cfg, kappa)` seeds from it, and `need = kappa * len(cfg)` is a
single global constant that `certify` and the completion test both key on.

A k=2 version needs a placement table over a LIST of configurations with each placement tagged by
which one it came from, a per-vertex `need`, and an orbit-consistency constraint so the result is
genuinely 2-uniform and not a k=1 tiling wearing two labels. That is a real piece of work, not a
parameter.

And then the harder problem: **there would be no way to validate it.** At k=1 the certifier could be
checked against GMS — 25/25, by identity. There is no published k=2 hollow classification to check a
k=2 certifier against. The k=1 sweep is what made this whole exercise trustworthy, and that footing
does not exist one k up.

## Verdict on k=2

**Not tractable, and the solve is the lesser of the two reasons.**

The solve alone: the full 14-tile k=2 search has run over 95 minutes of CPU without finishing, and the
growth factor climbing from 17× to 127× between a 4-tile and a 6-tile palette says the full-palette
k=2 candidate count is in the millions, against 21,376 at k=1.

The certification: there is no k=2 certifier, and building one leaves you with a certifier no oracle
can check. Every claim in Part 2 rests on being able to say 25/25 by identity against GMS. One k up,
that footing is gone.

What is worth doing instead, in order:

1. **Ship the k=1 result.** The 14 Euclidean hollow tilings are already on the shelf from
   `tools/hollow/`; what is new is that STS now reaches them too, and the certificate that separates
   them from 23,814 candidates is wired up and validated. That makes `certify_sts.py` a genuine
   regression oracle for the Euclidean density path, the role `check-regular` plays for the convex
   catalogue.
2. **Close the 1,462.** Bounded, useful, and it can only produce news: a 26th tiling would be an
   unpublished discovery, and clearing them all would upgrade the k=1 claim from "25 found" to "25
   and provably nothing else".
3. **The hyperbolic direction is cheaper than k=2 and better posed.** Marek's own example
   {n, n/2} for odd n ≥ 7, and its dual {n/2, n} which is the one that actually exercises a
   self-intersecting FACE, are k=1 families with a closed-form answer to check against. The
   `density-flat` closure written here has a `negative-defect` sibling already in the generator.

---

# Part 4 — scaled polygons on the sphere (2026-08-17, second question)

AL asked about the non-edge-to-edge figure from Adams et al., *The Rest of the Tilings of the Sphere
by Regular Polygons* (arXiv:2101.10743, DCG 2024): a pentagon-triangle "kaleidoscope" tiling where the
pentagon side is shorter than the triangle side.

**There is a complete classification, so this is another oracle**: 5 kaleidoscope + 15 two-hemisphere
CONTINUOUS families, plus 4 lunar, 5 sporadic, 5 composed and 1 magic-triangle tiling.

## The search side already works

`spherical-scaled` (D=120, positive-defect, {3,4,5} at side 1 and 2): **560 alphabet entries, 105
k=1 blocks**, no change to gen_alphabet at all — the `scaled` kind written for the Euclidean shelf
carries over, because on the sphere two unit arcs meeting at a flat 180° vertex ARE one geodesic of
twice the length, exactly as in the plane. 95 of the 179 distinct configurations carry a `~`, i.e. a
genuine T-junction, and they include pentagon/scale-2-triangle mixtures like
`(3s2,5)A, (3s2~1,3)A, (3s2~1,5)F` — the shape of the kaleidoscope family.

## The developer cannot realize them, and the reason is structural

`develop_sphere.alpha()` caches the interior angle **per face**, keyed on `lvert` alone. That is right
for a regular spherical polygon and wrong for a scaled one, whose corners alternate between the real
angle and a flat π. Supporting them needs a per-CORNER angle: `gen_alphabet` emitting scale and
boundary position beside `CLASS_L`/`CLASS_WIND`, `alpha()` reading the position, `interior_angle`
taking `scale·rho`, and the ρ bracket dropping to `2πd/(n·scale)`. Roughly 40–60 lines, plus keeping
scale-1 byte-identical so `check-star` still passes.

⚑ It used to die on `max() arg is an empty sequence` instead of saying any of that: `parse_configs`
matches only digits and underscores, so `3s2` parsed to nothing and every config came back empty. Now
it refuses loudly and names the limitation. `solve_rho_common` also treats an empty config list as
"not realizable" instead of raising.

## The real question is commensurability, and it is not a coding problem

STS's scaled model requires **every edge to be an integer multiple of one unit arc ρ**. The paper's
families are CONTINUOUS: the pentagon/triangle side ratio is a free real parameter sweeping an
interval, with the icosahedron at one end and the icosidodecahedron at the other. Commensurable ratios
are a countable subset of that interval, so at a generic member no unit exists and the tiling is
outside this engine's model by construction — not because the developer is unfinished.

What STS could reach is the commensurable slice: members where the ratio is exactly 2 (or 3, …) AND
the T-junctions land exactly at the subdivision points. Whether that slice is non-empty is the open
question, and the 40–60 line developer change is what would answer it. Both endpoints of the
pentagon-triangle family are already in the Atlas and are edge-to-edge, so they say nothing either way.
