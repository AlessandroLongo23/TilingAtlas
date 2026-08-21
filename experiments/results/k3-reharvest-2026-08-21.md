# The k=3 output had 34 non-convex solids nobody harvested — 2026-08-21

Follow-on to `deltahedra-fix-2026-08-20.md`. AL asked one question that turned out to be the whole
session: *"why are you so confident that the solids we generated for each k are not all that there are
to be found and we have some missing ones?"*

The honest answer was that I had been hand-waving, and the real answer is worse than the guess.

## The measurement that settled it

All 34 shipped non-convex records sat at **k=2**. None at k=1, none at k=3. The k=1 gap is expected and
fine: a one-orbit non-convex regular-faced solid is a non-convex uniform polyhedron, and those 57 are
already on the star shelf. The k=3 gap is not fine.

```
sph-k3/euclid-k3.json — 68 realized records
  24  convex, clean            harvested, became the 19 new Johnson solids
  14  coplanar-degenerate      correctly dropped
  30  genuinely reflex         NEVER HARVESTED
```

`gen_johnson_k3.py` line 134 filtered to `convex and not coplanarNeighbour` and discarded everything
else. Thirty-seven reflex records (30 by the strict count above, 37 counting those with a coplanar
neighbour, which the k=2 harvest also shipped) had been developed, were sitting on disk, and no code
path had ever looked at them.

**35 of the 37 were congruent to nothing the k=2 sweep produced.** No new search was needed — the
geometry was already computed. The shelf was missing about as many solids as it had.

## What shipped: 34 → 68

One of the 35 turned out not to be a solid at all, which is the second finding.

| | |
|---|---|
| k=2 reflex, distinct, not on the star shelf | 34 |
| k=3 reflex, distinct, not congruent to a k=2 one | 35 |
| of those, pinched (χ = 1) and rejected | 1 |
| **shipped** | **68** — 40 self-intersecting, 28 embedded |

## ⚑ Euler is part of validity, and develop_euclid was not checking it

Every block develops **twice** (34 distinct ids, 68 records at k=3 — two realizations each). One block's
second realization sent two vertices of a 14-vertex map to the *same point*. The flood fill merged them,
V dropped to 13, and χ went to 1.

`mapOK` still said true, and it was right to on its own terms: it checks `2·|E| == darts`,
`Σ|ring| == darts`, and that every ring has the length its face type says. Every one of those is about
the map's **combinatorics**, which a bad realization leaves completely untouched — no edge and no face
changed, only the vertex identification did. The solid touches itself at a point and is not a
polyhedron.

It shipped as far as `lib/squaring/smith.test.ts`, which caught it on V − E + F. That test exists because
someone previously thought to check Euler on the shelf; without it this would have gone out.

`res["mapOK"] = res["mapOK"] and res["euler"] == 2` now, and the harvests filter on it too so the cell
files already on disk do not need a 14-minute re-derivation. **Every other record across k=1, k=2 and
k=3 has χ = 2**, so the gate drops exactly that one.

## Two labels the new data proved wrong, both the same mistake

`hasSphereView` returned false for the whole `ncx-` prefix, on the written grounds that *"NOT ONE of
them has a circumsphere"*. True of the 34 the k=2 sweep produced. False the moment 34 more arrived:
`ncx-7-15-10-a` has one, and the prefix rule denied it a view of a sphere it actually has.

The shelf label read **"No circumsphere"**, which then described 67 of 68. And the k rows under it read
**"k = 2 Johnson"** — a Johnson solid is by definition *convex*, so the non-convex shelf must not borrow
the word at any k.

> A property measured across a partial corpus is not a property of the shelf.

Now: `NCX_INSCRIBED` names the exceptions and the test recomputes both directions from the vertices; the
shelf is **"Regular polygons"**, the non-convex half of the same face-type split the convex side makes;
its k rows are bare orbit counts.

## Ids are permalinks, so they are frozen

Appending a search can turn a signature that was unique into one that is not: k=3 brought two more
7/15/10 solids, and a naive regeneration would have renamed the shipped `ncx-7-15-10` to
`ncx-7-15-10-a`. Every shipped id is matched back by **congruence** and reused verbatim; only genuinely
new solids are allocated. Rebuilding from the k=2 cells alone reproduces the shipped 34 ids exactly,
which is the gate.

Two artefacts became regenerable in the process. `gen_nonconvex_shelf.py --emit` writes the whole of
`lib/render/nonconvexSolids.ts` instead of a fragment to splice by hand, and the new
`scripts/build-nonconvex-shelf.mjs` does the same for the atlas rows, which went in by hand the first
time. Rebuilding the atlas rows reproduced all 34 shipped records byte for byte — which is how I know
the note text was reconstructed correctly and not approximately.

## What the shelf is complete FOR

It shipped 68 solids with no statement of scope, which is the "partial corpus presented as a catalogue"
failure the project notes call a data-integrity bug. Three bounds:

- **Orbits** — k ≤ 3, which is only how deep the search has been run.
- **Faces** — regular {3,4,5,6,8,10}-gons, the spherical palette. Not a restriction on the convex half:
  a Johnson solid's faces are exactly those six. A real one here.
- **⚑ Vertices** — every vertex has POSITIVE ANGULAR DEFECT, angles summing to strictly under 360°.
  This is the bound that matters. The engine's closure test is positive-defect, which is what forces the
  glued map onto a sphere by discrete Gauss-Bonnet, so a **saddle** vertex (angles past 360°, paid for
  by defect elsewhere, total still 720°) is not something the search misses; it is outside what the
  search enumerates. Non-convex regular-faced solids with a saddle vertex exist and none of them can be
  here. Measured on the shipped shelf: worst valence 5 against the palette cap of 6, worst vertex angle
  sum 354°. The cap does not bind; the defect rule does.

**Within those bounds it is complete, and that is measured.** Across k = 1, 2 and 3 every block the
pruner kept was either realized or rejected for a mathematical reason:

| k | blocks in | realized | non-realizable | reasons |
|---|---|---|---|---|
| 1 | 28 | 30 | 0 | |
| 2 | 141 | 68 | 106 | 106 no dihedral solution |
| 3 | 460 | 68 | 426 | 422 no dihedral solution, 4 degenerate dihedral (flat edge) |

No numerical failure, no non-convergence, no node cap. Nothing dropped for being expensive.

⚑ **That evidence nearly did not exist.** `develop_euclid` writes a per-run report bucketing every
non-realization by reason, and `run_develop_sharded.py` left all eight of them unread in its scratch
directory — so the sharded k=3 run produced no account of what did not realize, which is the entire
basis for a completeness claim. A block rejected for "no dihedral solution" is a fact about the map; one
that failed to converge is a gap; without the merged report the two are indistinguishable. The k=3 table
above was recovered from `sph-k3/euclid-k3.json.shards/report-w*.txt`, which were still on disk. Merged
automatically now.

The same driver said nothing at all between "1798 blocks over 8 workers" and "done" while each worker
wrote its own count and ETA to a file nobody read. It logs the slowest worker's ETA every 30 s now.

## Provenance: how the shelf got each record

`discoverer` answers who first described the solid (Theaetetus, Archimedes, Kepler, Johnson 1966). It
cannot tell you whether the engine derived a record or whether someone typed in coordinates, and
"62 of the 92 Johnson solids" quietly means fifty found by search and twelve built by gyrating a parent.

| | | |
|---|---|---|
| searched | 118 | the solve → prune → develop pipeline produced it |
| constructed | 12 | built by operating on a parent, because no search of ours reaches k = 27, 29 |
| tabulated | 28 | classical closed-form coordinates |

Measured, not asserted: `annotate_derivation.py` decides "searched" by congruence against every realized
develop record, so a solid moves to "searched" the moment a run finds it, and never the other way. The
12 it reported came out exactly the gyrate/diminished families — the measurement agreeing with the story
rather than being told it.

## The test suite was failing a lottery

Two or three files timed out on every full run and *which* ones varied, which is the signature of
contention. This machine has 10 logical cores but only 4 performance ones; the default file parallelism
puts every CPU-bound suite on the fast cores at once.

`maxWorkers: 6` is the fix; the timeout is only the backstop. Raising the timeout **alone** made it
worse, measurably: `star-general-path` used to die at 60 s and free its worker, and giving it room to
finish let it hold one for 150 s and starve two others instead.

Full suite after: **2811 passed, 0 failed, 196 s** against 222 s before — fewer workers, less time, the
diagnosis confirming itself.
