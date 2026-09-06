# Marek's 2026-08-29 drop — ingest

Twelve archives out of `materials/solvers/to_sort/`, filed into the geometry/decoration leaves and
recorded in `MANIFEST.tsv`; `levels.txt` went to `materials/writeups/`. Eleven of the twelve reached a
shelf the same day. Developers: `develop_hyp_edges.py`, `develop_sph_edges.py`, `develop_freedraw.py`.

## Result: 460,612 certificates, 0 develop failures

| board | shelf | certs | developed | failed | census |
|---|---|---|---|---|---|
| 33337 (3^4.7) | hyperbolic-edges | 7 | 7 | 0 | matches; 359,104 more at k=7 not in the zip |
| 33346 (3^3.4.6) | hyperbolic-edges | 20,394 | 20,394 | 0 | none shipped |
| 33355 (3^3.5^2) | hyperbolic-edges | 91,772 | 91,772 | 0 | none shipped |
| 33356 (3^3.5.6) | hyperbolic-edges | 30,817 | 30,817 | 0 | none shipped |
| 33445 (3^2.4^2.5) | hyperbolic-edges | 78,911 | 78,911 | 0 | none shipped |
| 33446 (3^2.4^2.6) | hyperbolic-edges | 9,181 | 9,181 | 0 | none shipped |
| 34444 (3.4^4) | hyperbolic-edges | 24,388 | 24,388 | 0 | none shipped |
| 333334 (3^5.4) | hyperbolic-edges | 26,825 | 26,825 | 0 | none shipped |
| 4412 (4.4.12) | spherical-edges | 109,437 | 109,437 | 0 | reproduced EXACTLY, k=1..24 |
| 4436 (3.4.6.4) | freedraw | 18,992 | 18,992 | 0 | none shipped |
| 488 (4.8.8) | freedraw | 71,331 | 71,331 | 0 | reproduced EXACTLY, k=1..10 |

**Everything ships.** `e33355-k5` (90,387 tilings) and `e33445-k5` (78,019) were briefly held back on
their packed size, 82 and 78 MB. That was the wrong measure — see the 2026-08-31 section below.

## What the drop changed about the model

**An id here is a vertex COMBINATION, not one board.** 33346, 33355, 33356, 33445 and 33446 each carry
several cyclic configurations of their multiset — 33445 has four (3.3.4.4.5, 3.4.3.4.5, 3.4.4.3.5,
3.3.4.5.4) — and a SINGLE certificate mixes them, so the underlying board is not uniform. That is level
4 ("Combination") on Marek's ladder, which is why `levels.txt` came in the same drop. Nothing downstream
needed changing: `develop_hyp_edges` reads `config` only as a multiset, for the forced ℓ and one angle
unit per distinct face. Only the shelf label had to change, to name the combination.

## The two Euclidean grids were data rows, not new machinery

Both are one `GRIDS` row in `develop_freedraw.py`. 3.4.6.4 stays on the 12-direction ring (60/90/120° =
2/3/4 in 30° units, closing at 12). 4.8.8 was the blocked one, because 135° is not a multiple of 30°;
it takes `"ring": 8`, the ℤ[ζ₈] ring `sch244` already introduced, where A4=2 and A8=3 close at 8. Both
are patch grids: 6 and 4 vertices per unit cell, so neither vertex set is a lattice.

Three independent checks, not just "no exception":
  * unit-cell area against the sum of regular-polygon face areas — 4.8.8 gives 5.82845 vs 5.82843 with
    one square and one octagon; 3.4.6.4 gives 6.46411 vs 6.46410 with 2 triangles, 3 squares, 1 hexagon;
  * the digon-free slice (nothing drawn = the bare underlying tiling) came back exactly once per k;
  * 4.8.8's per-k counts reproduce its census exactly.

## Two bugs found, both real

**The freedraw driver parsed the census as a certificate.** `solution_list.txt` is a `.txt` beside the
certificates, and a bare `*.txt` sweep decoded its header into a block with an empty `rneig`; the run
died on an `IndexError` 18,000 certificates in. Both hyperbolic drivers already gated on the certificate
filename; `develop_freedraw.py` now does too (`CERT_FILE`).

**The octagon was excluded from `REGULAR_KINDS`.** The exclusion was correct — on a triangle/square
grid 135° is not a non-negative combination of 60° and 90°, so no octagon can appear — but the 4.8.8
board is not one of those grids, and its octagons are base faces. `classifyRegular` returned null for
every one, so the undecorated truncated square tiling, an Archimedean tiling, reported
`allRegular: false`. Fixed by adding 8; measured before (`n=[4,null]`) and after (`n=[4,8]`,
`allRegular=true`, and exactly one of the five k=1 patterns all-regular, which is the bare board).

## Not ingested

`abcdtest` (264 boards, 1,177,806 certs) and `1247_1_0612` (29,623), both `hyperbolic/tilings`. The
existing `develop_ai1.develop_cert` develops abcd boards unchanged — 87,179 certificates over five
boards, 0 failures — so what is missing is a driver and a shipping policy, not geometry. Detail in
`materials/solvers/README.md`.


# 2026-08-31 — the withheld slices ship, and what page weight actually costs

**The omission was measured against the wrong number.** I sized the two big slices by their bytes on
disk. What a viewer waits for is the wire, and these are dart arrays — thousands of small repeated
integers, which is the best case there is for a compressor. Measured against `next start`:

| slice | on disk | over the wire (gzip) | fetch |
|---|---|---|---|
| `e33355-k5` | 82.4 MB | 8.9 MB | 0.98 s |
| `e33445-k5` | 77.6 MB | 8.0 MB | 0.86 s |
| `e33356-k5` | 30.8 MB | 3.3 MB | 0.35 s |
| `488-solutions-k10` | 25.2 MB | 1.6 MB | — |
| `reference-atlas-hyperbolic` (ships today) | 17.7 MB | 0.4 MB | — |

Both are now on the shelf as lazy shards. A 10-17x ratio means disk size says almost nothing about
what a page costs, and every size judgement in the board tables should be read as a wire figure.

One trap worth recording: a HEAD request to the Next server returns the UNCOMPRESSED `Content-Length`
and no `Content-Encoding`, which reads exactly like a server that does not compress. It does — on GET.
Check with `curl -o /dev/null -w '%{size_download}'`, never with `curl -I`.

## The real cost is HEAP, not bytes, and it was a fan-out

`scripts/measure-page-load.mjs` against the production server, before any change:

| page | requests | wire | heap | blocking |
|---|---|---|---|---|
| `/library` | 14 | 0.9 MB | 58 MB | 0.01 s |
| `+ ?geo=hyperbolic&dec=edges` | 210 | 3.7 MB | 125 MB | 0.65 s |
| `+ &k=5` | 226 | 29.0 MB | **527 MB** | 0.87 s |

Picking a k chip fetched that k's shard from EVERY base at once, because
`hypEdgesLazyShardsForK(k)` returns all of them and the effect looped over the lot. 29 MB of wire is
under a second; 527 MB of heap is what kills a tab, and the object graph runs 3-6x its source text.

Fix: when a board chip is selected, fetch only that board's shard. A reader looking at one board was
never going to look at the other twenty-three. With no board selected the fan-out is unchanged, because
the unfiltered count has to be the true one.

| page | requests | wire | heap | blocking |
|---|---|---|---|---|
| `k=5`, board `hyp-33355` (the biggest slice) | 217 | 13.2 MB | 273 MB | 0.21 s |
| `k=5`, board `hyp-4455` (a small one) | 217 | 5.2 MB | 159 MB | 0.07 s |

Heap halves on the worst board and blocking time drops 4x; cost now tracks the board being read.

## What is still open

**Request count.** 217 requests for one board is the EAGER fan-out — one fetch per (base, eager k) —
and it is the wall `abcdtest` will hit: 247 more boards would add hundreds of requests before anything
is displayed. The mechanism to fix it already exists and was built for this exact circularity:
`public/atlas-manifest.json` (`lib/services/atlasManifest.ts`) declares counts per tier so a row can be
drawn before its records exist, and clicking it is what fetches them. Today it covers only the four
Euclidean tiers. Extending it to the board shelves would collapse the eager fan-out to ONE request.

**No eviction.** `heShardCache` is a Map that never releases, so heap accumulates across k switches
within a session. An LRU bound would cap it.

# 2026-08-31 (second) — abcdtest lands whole: 247 boards, 1,177,806 tilings

Developed with `develop_ai1.py --board <id>`, which is a GENERALIZATION and not a second script: the
old `board_of(n)` became a `Board` class, `Board.family(n)` carrying ai1's {3, 4, n, 2n} alphabet and
`Board.abcd(id)` deriving the alphabet from the board's own figure. Everything downstream — block
builder, H² develop, patch checker, dart emitter — is untouched. Guard: re-developing the shipped `hp7`
k=1/4/5 slices through the refactor comes back BYTE-IDENTICAL.

**1,177,806 certificates, 247 boards, zero develop failures.**

| | |
|---|---|
| boards with certificates | 247 |
| tilings | 1,177,806 |
| develop failures | 0 |
| packed JSON | 703 MB |
| **stored on disk (gzipped)** | **48 MB** (6.9%) |
| cost to `/library` at rest | **zero requests, zero bytes** |

## Three things the corpus itself taught us

**Two ids are not what they say.** `5677`'s certificates are 5.5.6.7, not the 5.6.7.7 its digits spell,
so the ℓ solved from the id does not close them. The developer now reads the figure from the
CERTIFICATES (`figure_in`) and treats the id as a name only — which is also what keeps shard filenames
at what Marek called them. Nothing had silently developed at a wrong ℓ: `vtable_variants_hyp` asserts
every figure's angle sum divides 2π, so 5677 failed loudly. It failed too loudly, though — the raise
escaped `develop_cert` and took all 7,650 of that board's tilings with it, so a build failure is now a
counted per-certificate failure instead of a lost board.

**`4aab` (4.10.10.11) is an empty directory in the drop.** Not our omission; ask Marek.

**17 ids are not hyperbolic** (angle sum ≤ 2π) and are refused rather than developed into something
they are not — 14 spherical, 3 Euclidean, 27 certificates between them. `3711` is among them: it is the
3-valent 3.7.11 at 335.8°, which corrects the earlier note calling it hyperbolic.

## How 1.18M tilings cost the page nothing

Three mechanisms, two of which already existed:

1. **The board chips are static.** `BOARD_FAMILIES` is derived from the TS board tables, not from
   loaded records, so 247 rows appear with no fetch. This is why the `atlas-manifest.json` extension I
   had proposed turned out to be unnecessary — the circularity it solves does not exist for boards.
2. **Every abcd slice is lazy** (`eagerKs: []`). One eager k per board would have been 247 requests
   before anything displayed. A board's shards load when that board is opened.
3. **The shards are gzipped on disk.** `public/` is tracked in git; 703 MB would have doubled the repo.
   The wire is identical either way, so this costs a viewer nothing.

Measured on `next start`, `/library?geo=hyperbolic&dec=tilings`: **117 requests, 2.1 MB, 111 MB heap**
with all 247 boards present — unchanged from before they existed. Opening board `hpq-4568` adds two
requests and 0.13 MB, and shows its 2,602 tilings in 3 families.

## Two bugs the browser caught that the tests did not

**`fetchHypPolyShard` called `res.json()` directly**, bypassing the gzip-aware reader, and its
`catch { return [] }` swallowed the parse error — so the board fetched its shard with a 200 and rendered
"No tilings match the current filters". Every shard read now goes through `readAtlas`.

**`scripts/measure-page-load.mjs` matched `/\.json(\?|$)/`**, so a page that had just fetched gzipped
shards reported having fetched nothing. Fixed; every measurement above is post-fix.

# 2026-08-31 (third) — the ai1/ai2 budget tails ship; the whole shelf is now untruncated

The abcd work exposed that the boards ALREADY on this shelf were budget-truncated: 64 k slices across
19 boards, shipped under `--budget` 4,000 (ai1) and 15,000 (ai2). That is the same omission the new
directive forbids, predating it. Re-developed with no budget.

| | before | after |
|---|---|---|
| boards | 24 | **271** |
| tilings | 60,400 | **2,191,775** |
| dropped k slices | 64 | **0** |
| on disk | 74 MB | **106 MB** |

1,013,969 ai1/ai2 certificates re-developed, **zero failures**, no BUDGET line in any report. 36x the
tilings for 1.4x the disk, because every shard on the shelf is now stored gzipped — 1,617 MB of packed
JSON in 110 MB. `/library?geo=hyperbolic&dec=tilings` costs 117 requests / 2.0 MB / 117 MB heap, which
is what it cost when the shelf held 60,400.

Board 3.4.13.4 at k=26 — one of the dropped slices — now shows 10,956 tilings in 2 families.

Two things that only showed up here:

* `develop_ai2.py` exists and I nearly ran the ai2 boards through `develop_ai1.py --n`, which would have
  developed them against the 3.4.n.4 alphabet {3, 4, n, 2n} instead of {3, n}. Caught before any output
  was written. The two families share a shelf and a record shape but NOT a developer.
* The shard tests were guarded by `existsSync("public/hyperbolic-poly/hp7-k1.json")`, a literal path.
  Moving the shelf to `.json.gz` turned that guard false and skipped 9 tests silently, reporting green.
  The guard now goes through `hypPolyShardUrl`.
