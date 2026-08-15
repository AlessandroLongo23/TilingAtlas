# Period-p shelf — state, tools, and the intrinsic-parametrization spec

Handoff document, 2026-08-09. Written to be read cold. Nothing in this work is committed.

Companion records: `docs/period-quotient-2026-08-09.md` (the quotient session),
`docs/DEVELOPMENT_NOTES.md` 2026-08-09 (3)–(8), `docs/SYNC.md` (17)–(22).

**The implementation plan for §6 is `docs/period-intrinsic-plan-2026-08-09.md`**, with three numbers
measured after this file was written: the Newton continuation converges on 470 of 470 entries, the
dimensions survive a move off the anchor (only 12 lose any), and the shelf holds 427 distinct maps, so the
"large further collapse" §6.3 step 6 predicts is at most 43 entries.

---

## 1. The standing goal (AL, 2026-08-09)

> I want every tiling to appear only once, under a unique name convention: if it's truly rigid, no
> parameter, otherwise the snapshots must not appear on their own: all instances must be gathered under
> the same parametric tiling, with the full parameter sweep into concave territory.
>
> At this stage it's still fine if we don't have all of them, if the alphabet is too big, and use similar
> logic to the "only one concave at a time". The important thing is that the results we show on the shelf
> are correct and don't present the errors I have raised.

Correctness of what ships outranks coverage. Two halves: **one appearance per tiling** (done, §3) and
**every non-rigid tiling carries its full parameter sweep** (NOT done, §6 is the spec for it).

---

## 2. What ships right now

`public/reference-atlas-period.json` + shards `-k3/-k4/-k5/-k6`. **470 entries.**

| k | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| entries | 1 | 67 | 283 | 81 | 22 | 16 |

223 parametric (carry `paramCell`), 247 rigid (do not). 393 show a reflex corner at their default; 212 of
the 223 parametric reach the concave regime somewhere in range; widest interior angle at a default 300°.

**Naming.** Every entry is `period-k{k}-{nnn}`, numbered within its MEASURED k, parametric entries first.
`legacyId` holds the producer's original id. Parametric versus rigid is `paramCell` present or absent and
is deliberately not in the name. Survivors carry `absorbs` plus a note naming the sub-loci they contain.

**Provenance of the content:** the concrete grid export (convex period-3, k≤2), the period-QUOTIENT search
(k=3), and the concave quotient sweep (63 productive concave species, k≤3).

---

## 3. The one-appearance rule, and how it is enforced

`scripts/shelf-dedup.py`, called by `build-period-atlas.ts` at the end of every build. The build FAILS if
it errors. It runs on the written shelf, downstream of every producer, so a tier added later cannot skip it.

The test is `tools/ctrnact-oracle/tiling_key.py`: a tiling's combinatorial map is constant along its family
and fixes the ambient corner-angle space; a family is an affine SUBSPACE of that space and a rigid tiling is
a POINT in it. So same-tiling is subspace equality, one-value-of-a-family is point-in-subspace, and a
redundant family is containment. Only maximal entries survive.

Why the two pre-existing mechanisms cannot express this, both worth remembering:

- exact ℤ[ζ₂₄] congruence merges IDENTICAL tilings, and two points of one curve are not identical;
- `memberIds` absorption only reaches snapshots the family exporter itself grouped.

**Verification:** re-running it on its own output drops 0 and renames 0. That idempotence is the invariant,
and it is worth more than the counts.

---

## 4. Tools, and the gate each one has to clear

Run every gate after touching the corresponding file. All live in `tools/ctrnact-oracle/` unless noted.

| tool | what it decides | gate | cost |
|---|---|---|---|
| `vertex_orbits.py` | k, from a developed cell | `--gate 6`: reproduces Galebach's published k on all **1,248** tilings at k=1..6 | 17 min (`--gate 3` is 4 s) |
| `tiling_key.py` | family identity: canonical dart map + affine subspace | `--gate 6`: 1,248 distinct tilings → **1,248 distinct keys** | 55 s |
| `intrinsic_freedom.py` | a tiling's TRUE parameter count, palette-independent | `--gate`: no entry may measure LESS than its shipped P | ~4 min on 470 |
| `scripts/shelf-dedup.py` | the one-appearance rule | idempotent: second pass drops 0 | ~1 min on 470 |
| `make check-regular` | any alphabet/engine edit | byte-identical catalogs vs golden | seconds |

⚑ Two lessons paid for in this session, both worth keeping in mind when adding a gate:

- **An injective function is not a correct one.** The first `tiling_key` passed its 1,248-distinct-keys
  gate while its map was malformed. What caught it was asserting the STRUCTURE: α must be a fixed-point-free
  involution, and it was not.
- **A dimension computed from a system the tiling does not satisfy is a number about nothing.** The first
  `intrinsic_freedom` used the cycles of α∘σ for vertices instead of σ∘α; on concave tilings they summed to
  300/330/390/450. `freedom()` now self-checks the residual and refuses to report when it exceeds 1e-6.

---

## 5. How to rebuild the shelf from scratch

```
# 1. concrete convex families (k≤2), with measured k
cd tools/ctrnact-oracle
python3 export_period_families.py --tables tables/equi3-cx-z24 \
  --catalog 1:tables/_work/rebuild-equi3-cx-z24-k2/out/pruned \
  --catalog 2:tables/_work/rebuild-equi3-cx-z24-k2/out/pruned \
  --palette equi3-cx-z24 --cells ../../experiments/period-oracle/ctrnact-period3-k{k}.cells.json \
  --true-k --out ../../experiments/period-oracle/ctrnact-period-families.cells.json \
  --log ../../experiments/results/period-families-export.log

# 2. quotient families at k=3  (already built; inputs in tables/_work/q-e3-k3)
python3 export_quotient_families.py --tables tables/equi3q-cx-z24 \
  --catalog 3:tables/_work/q-e3-k3/out/pruned --id-prefix period-quotient \
  --out ../../experiments/period-oracle/ctrnact-quotient-families-k3-generic.cells.json \
  --log ../../experiments/results/quotient-families-k3-generic-2026-08-09.log
python3 ../../scripts/cross-tier-dedup.py --shelf ../../public/reference-atlas-period.json \
  --candidate ../../experiments/period-oracle/ctrnact-quotient-families-k3-generic.cells.json \
  --log ../../experiments/results/cross-tier-dedup-2026-08-09.log \
  --json ../../experiments/period-oracle/quotient-k3-dedup.json

# 3. concave families — the sweep scripts are in the session scratchpad, see §7 to re-create
#    output already merged at experiments/period-oracle/ctrnact-period3-concave-families.cells.json

# 4. build (runs shelf-dedup.py itself and fails if it errors)
cd ../.. && pnpm tsx scripts/build-period-atlas.ts
pnpm build
```

`lib/services/referenceAtlas.ts` must list every shard k in `PERIOD_SHARD_KS` (currently `[3, 4, 5, 6]`)
or the tail is fetched and never shown.

---

## 6. THE SPEC: intrinsic parametrization

### 6.1 The problem, measured

Every P the shelf reports is palette-relative. `flex_model` counts the null space over the ALPHABET's
corner classes, so a tile the alphabet calls `6` is a constant. The quotient is worse in one respect: its
corner classes are (shape, position), so every `e3-6` in a solution carries the SAME angles, and a tiling
with two differently-shaped hexagons needs two independent hexagon shapes. The alphabet offers exactly two
(`e3-6` and its mirror). Measured on the shipped quotient tier: 141 of 168 entries use one period shape, 27
use a shape and its mirror, none uses more.

`intrinsic_freedom.py` asks the question the palette cannot, from the developed cell alone:

```
variables    one angle per dart — every corner of every tile in the primitive cell
per TILE     its L angles sum to (L−2)·180                                [1 linear]
per TILE     the unit-edge boundary closes: Σ exp(i·φⱼ) = 0               [2 nonlinear]
per VERTEX   the incident angles sum to 360                               [1 linear]
dimension    = #darts − rank(Jacobian)
```

**Result on the 470 shipped entries: only 10 are intrinsically rigid. 237 ship with no parameter and have
between 1 and 19.**

| intrinsic dim | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 13 | 14 | 16 | 19 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| entries shipping RIGID | 56 | 29 | 46 | 27 | 26 | 6 | 21 | 5 | 8 | 5 | 5 | 1 | 1 | 1 |

`period-k3-271` (AL's example, legacy `period-quotient-rigid-k3-023`) is dim **4**. The largest,
`period-k3-141`, is dim 19: 6 tiles (two triangles, three 12-gons, an 18-gon), 60 corner angles, 42 rows of
rank 41. Large equilateral polygons are floppy on their own — a unit-edge 12-gon has 12 − 1 − 2 = 9 shape
parameters, an 18-gon has 15 — and the vertex conditions couple them without removing them.

Confirmed to integrate, not just linearise: stepping 2° along a null direction and running Newton back onto
the constraint variety converges to residual ~1e-13 with angles genuinely moved and still in range.

### 6.2 The architecture change

**The palette's job ends at discovery.** It finds WHICH tilings exist. Parameters come from the tiling's own
map. Any palette is a restriction, so chasing this with shape-multiplicity indices in the quotient alphabet
is fighting the wrong battle — it would raise the ceiling without removing it.

### 6.3 Algorithm

For each shelf entry, starting from its developed cell:

1. **Map and base point.** `tiling_key.build_map` gives (labels, σ, α, reps, ps, darts). Base angles are the
   corner angles of the cell. Self-check: residual of the full system < 1e-6, else refuse.
2. **Tangent space.** Null space of the Jacobian at the base point, dimension d (`intrinsic_freedom.freedom`).
   Orthonormalise; that basis is the parameter axes.
3. **Continuation.** For a parameter vector t, set a = a₀ + Σ tⱼ·vⱼ, then Newton-project back onto F(a) = 0
   using the least-norm correction (working code is in the session transcript; it converges in a handful of
   iterations at |t| ≈ 2°). This defines a(t) on a neighbourhood of 0.
4. **Development.** From a(t) and the map, walk the tiles: each tile's boundary from its angles with unit
   edges, then glue across α. Two lattice generators come out as the holonomy of two independent loops. This
   is the numeric analogue of `coupled_flex.develop_multi`, which is symbolic and only handles the linear case.
5. **Range.** Per axis, walk outward until the tiling stops being embedded, using the existing health tests in
   `scripts/scan-family-ranges.py` (area certificate, tile simplicity, orientation with the anchor's sign,
   covering test at the boundary). This is a REQUIRED step, not a refinement: dimension counts angle freedom
   only, and a dim-19 entry may overlap almost immediately.
6. **Re-dedup.** Re-run `shelf-dedup.py`. With full parameter spaces, expect a large further collapse — many
   of the 470 are almost certainly special points of the same large family.

### 6.4 The one open decision: the cell format

`paramCell` today is an exact Laurent polynomial in δ, evaluated by `lib/utils/paramCell.ts:evaluateParamCell`
and mirrored in `scripts/scan-family-ranges.py:ev`. That works because the current families are LINEAR in the
angles: closure is free for a period-p tile with n ≥ 2 repeats, which is the insight the whole period-p
exporter rests on. Intrinsic freedom lets those hexagons take non-period-3 words, where closure is a genuine
nonlinear constraint, so a(t) is not affine and the symbolic form cannot represent it.

Three options, no decision made:

| option | how | cost | risk |
|---|---|---|---|
| A. numeric paramCell | ship the map + base angles + tangent basis; the client runs Newton per slider move | small file, exact on the variety | Newton in the render loop; needs a TS port of the solver |
| B. sampled + interpolated | precompute a grid of a(t) and interpolate | no client solver | file size explodes with d; interpolation drifts off the variety |
| C. hybrid | symbolic where the family IS linear (the current tiers), numeric only where it is not | preserves everything shipped today | two formats to maintain |

C is the least disruptive and A is the most honest. Both need a `paramCell.kind` discriminator and a matching
branch in `evaluateParamCell`, `scan-family-ranges.py`, `range-plan.ts` and the UI slider code.

⚑ Sliders with d = 19 also need a UI answer. The shelf currently renders one slider per axis.

### 6.5 Acceptance

- `intrinsic_freedom.py --gate` still PASSES (no entry measures less than it ships).
- Every entry that was rigid-but-not (237 of them) either carries a parameter or is documented as
  unparametrizable with a reason.
- `shelf-dedup.py` is idempotent on the result.
- The 10 intrinsically rigid entries still ship with no parameter.
- Spot check: `period-k3-271` renders with a slider that squeezes the regular hexagon while the irregular one
  compensates, which is the behaviour AL described three times.

---

## 7. Gaps, in priority order

1. **Intrinsic parametrization** (§6). 237 entries mislabelled rigid.
2. **One concave species at a time.** The concave sweep builds one palette per concave tile, so it reaches
   every tiling using AT MOST ONE concave species. Tilings mixing two different concave tiles are unreachable
   and are not counted. 63 of 348 concave species are productive; ~2,000 pairs among them is the second stage,
   affordable at ~4 s per palette. Sweep scripts were written to the session scratchpad and are not in the
   repo; re-create from `mkpal.py` + `run-oracle.sh` + `export_quotient_families.py --max-angle 23`.
3. **k=3 completeness unverified.** The concrete cross-check was killed unfinished at 195 min. The k=3 tier is
   a lower bound and every entry's note says so. k≤2 is verified block-for-block (0 of 614 lost).
4. **Concave palette ceiling.** The full concave palette is not buildable: 1.4e40 vertex words against the
   convex palette's 1.6e7; even forcing every corner ≥ 60° leaves 1.6e11. One tile at a time is 246,712 words,
   66× SMALLER than the shipped palette. Any future widening has to keep that shape.
5. ⚑ **OPEN, unrelated to this shelf.** With `?k=4` the freedraw sch244 shard loads
   (`FREEDRAW_SCH244_LAZY_KS = [4]`) and after it merges the library shows 0 tilings for ANY class.
   Reproducible at k=4 and k=6, not at k=3 or k=5, in the production build. Not diagnosed. The shard fetch
   itself is fine and the entries do reach `tilings` state.

---

## 8. Changed files, uncommitted

**New:** `tools/ctrnact-oracle/{vertex_orbits,tiling_key,intrinsic_freedom}.py`,
`scripts/{shelf-dedup,cross-tier-dedup}.py`,
`experiments/period-oracle/ctrnact-period3-concave-families.cells.json`, this file.

**Modified:** `tools/ctrnact-oracle/{export_quotient_families,export_period_families,quotient_feasible}.py`
(generic seeding, `--max-angle`, `--true-k`, `build_system` extraction),
`tools/ctrnact-oracle/alphabets/enum_period_tiles.py` (`--allow-degenerate`),
`scripts/build-period-atlas.ts` (concave INPUTS withheld, quotient tiers with optional per-tier dedup,
shelf-dedup invocation), `components/reference-shelf.tsx` (lazy-shard guard, period k chips),
`lib/services/referenceAtlas.ts` (`PERIOD_SHARD_KS`),
`lib/classes/algorithm/composable/canonicalTilingKey.ts` (domain-limit note), `public/reference-atlas-period*.json`.

**Two fixes worth not losing** in `components/reference-shelf.tsx`: the base atlas load does `setTilings(d)`,
a REPLACE, so a lazy shard merged before it is clobbered and never retried — that had been hiding
`/library?class=isotoxal&k=3` entirely, 0 of its 523 tilings. And `kValuesForClass`/`kChips` never listed
`PERIOD_SHARD_KS`, so period k chips vanished and deep links resolved to an empty shelf.
