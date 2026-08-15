# Optimising `eu_solver.cpp` — nine fixes, 6.2× on top of a 400× (2026-08-06/07)

Reference for the optimisation pass on the Čtrnáct solver's search loop. Every fix is local: no
mathematics changed, no search semantics changed, and every catalog is byte-identical under
`catalog_digest.py`. Benchmarks are single core, `star24full`, `EU_NCBUDGET=1e9` (uncapped), user
seconds, interleaved reps on the same machine.

**Read this before optimising anything else here.** The recurring lesson is at the bottom and it cost
four wrong predictions.

## Results

| | k=2 (s) | step | note |
|---|---|---|---|
| pre-fix | ~25,000–57,000 | | never measured single-core; see caveat |
| fixes 1+2 | 103.5 | ~400× | |
| + fix 3 | 91.5 | 1.13× | (type, rep) buckets |
| + fix 4 | 79.1 | 1.16× | incremental `checkpart` |
| + fix 5 | 50.1 | 1.58× | `writecycle` stamp array |
| + fix 6 | 49.0 | 1.02× | generation stamp |
| + fix 7b | 35.6 | 1.38× | integer labels |
| + fix 8 | 23.8 | 1.50× | no `push_back` in the hot path |
| + fix 9 | 16.6 | 1.43× | filter the second call site |

**6.2× from fixes 3–9.** k=1 goes 10.05 s → 0.081 s (124×) at fix 4 and stays flat after. Regular
palette k≤6: 0.65 s → 0.19 s (3.4×).

⚑ The pre-fix k=2 figure is the sum of 200 shard wall-times from a pooled run measured while a
runaway `duetexpertd` held a core for four hours. Independent measurement put that contention at
2.4×, hence the range. Nobody has run the unfixed solver single-core at k=2 on a quiet box; it is
hours.

## Correctness gates

Every fix must reproduce all three, order-insensitively (`catalog_digest.py`, NOT `shasum` — block
order inside a family file is not stable across shard counts):

| catalog | digest | blocks |
|---|---|---|
| star24full k=1 | `cc1a4e57bde39378` | 44 (50 raw) |
| star24full k=2 | `0b6cb12bb7f5f797` | 118 (146 raw) |
| regular k≤6 | `884968dca36a6c41` | 1247 |

Plus `make check-regular`, the load-bearing guard.

A stronger check than digests, available while instrumenting: **`checkpart` pass count**. It is 90,459
at k=1 for the baseline and for every fix. The filters only ever remove candidates, so if the number
that succeed never moves, nothing that would have passed was skipped.

---

## Fix 1 — don't rescan the alphabet in order to skip it

Once `kcnt == maxnum` only noncounting types can be added — 304 of 60,927 in star24full — but the loop
walked all 60,927 to `continue` past the rest. **99.6% of all loop trips were pure skip** (8.13e9 of
8.16e9 at k=1).

```cpp
// startup
for (int i = 0; i < (int)mainlist.size(); i++)
    if (!mainlist[i].counting) { has_noncounting = true; NC_IDX.push_back(i); }

// extend(): when the k budget is spent, walk NC_IDX instead of [vertype[0], symbolcount)
const bool nc_only = !canK;
const int gstart = nc_only
    ? (int)(std::lower_bound(NC_IDX.begin(), NC_IDX.end(), slist.vertype[0]) - NC_IDX.begin())
    : slist.vertype[0];
```

`NC_IDX` is ascending, so the same types are visited in the same order — emission order is unchanged,
which is why digests match rather than merely counts.

**2.14× at k=1.** 267× fewer loop trips for 2.1× — the skipped iterations were nearly free.

## Fix 2 — index candidates by corner class

`checkpart` walks a face across a glue `(x,y)` and demands
`lvert[rneig[y]] ∈ {NEXT,PREV}[lvert[x]]` in both directions. Two O(1) class equalities, knowable
before the vertex exists — but the solver was discovering them by building the vertex, gluing it,
walking every face, and throwing it away.

```cpp
static inline int cand_key(int A, int B, bool mir) { return (A * NCLS + B) * 2 + (mir ? 1 : 0); }

// startup: bucket every (type, rep) by the classes at the rep and at its right neighbour
for (int gr = 0; gr < (int)mainlist.size(); gr++)
    for (int rrep : mainlist[gr].reps) {
        int A = mainlist[gr].lvert[rrep];
        int B = mainlist[gr].lvert[mainlist[gr].rneig[rrep]];
        bool mir = (mainlist[gr].mirro[rrep] == rrep);
        CAND[cand_key(A, B, mir)].push_back(...);
    }

// extend(): one lookup replaces the scan
const int key = cand_key(CLASS_NEXT[slist.lvert[slist.rneig[firstfree]]],
                         CLASS_NEXT[slist.lvert[firstfree]], mirrored);
```

⚑ The unique-key lookup is sound only when `PREV == NEXT` and `NEXT` is an involution, which makes the
admissible `(A,B)` pair unique. `checkpart`'s *first* step accepts either direction, so a palette
breaking that needs the 4-bucket union. The code checks at startup and sets `BUCKET_OK = false`,
falling back to the full scan.

**55× at k=1** — the exception to the lesson below, because what it removed was expensive.

## Fix 3 — bucket (type, rep), not type

Fix 2 admitted a whole type if *any* of its ~12 reps matched, then tried them all. Measured:
6,691,818 reps iterated against 724,811 that can match — **89.2% waste**.

```cpp
struct CandEnt { int gr; int rrep; };
static std::vector<std::vector<CandEnt> > CAND, CAND_NC;

while (gidx < gend) {
    const int gr = (*pool)[gidx].gr;
    ... budget filter; skip the whole run of this gr if it fails ...
    ... materialise gr once ...
    while (gidx < gend && (*pool)[gidx].gr == gr) {     // only its matching reps
        const int rrep = (*pool)[gidx].rrep; gidx++;
        ...
    }
    ... teardown ...
}
```

**1.13×.** Predicted 9× from the waste ratio. The rejected reps were being killed cheaply by
`checkpart`'s early exit.

## Fix 4 — incremental `checkpart`

The parent configuration already passed, and gluing one edge can only change the faces whose walk
reaches it. The forward step is `free → glue[rneig[free]]`, so the starts that reach a changed
position `x` are found by stepping backwards from `lneig[x]`.

```cpp
static bool checkpart_inc(configuration const& conf, const int* changed, int nchanged) {
    for (int t = 0; t < nchanged; t++) {
        const int x = changed[t];
        if (x < 0) continue;
        const int start = conf.lneig[x];
        int free = start;
        for (;;) {
            if (!checkface(conf, free)) return false;
            const int prev = conf.glue[free];
            if (prev == -1) break;
            free = conf.lneig[prev];
            if (free == start) break;        // closed cycle: all its starts already checked
        }
    }
    return true;
}
```

Call sites pass the four positions the glue changed:

```cpp
const int chg2[4] = { firstfree, i,
                      mirrored ? -1 : newconf2.mirro[firstfree],
                      mirrored ? -1 : newconf2.mirro[i] };
if (checkpart_inc(newconf2, chg2, 4)) { ... }
```

**1.16× at star k=2 but 1.35× at regular k≤6** — the gain scales with configuration size, so it grows
with k.

## Fix 5 — `writecycle`'s seen-set was O(darts²)

`writecycle` runs once per node (102.7M times at k=2) to compute `mincycle`, which picks the next dart
to glue. Its "already visited" set was a `std::vector<int>` searched linearly inside a loop over every
dart, plus a fresh heap allocation per node.

```cpp
// before
std::vector<int> smet = {};
if (std::find(smet.begin(), smet.end(), cy) == smet.end()) { ... smet.push_back(left); }

// after
static std::vector<char> smet_stamp;
if ((int)smet_stamp.size() < NDARTS) smet_stamp.resize(NDARTS);
std::fill(smet_stamp.begin(), smet_stamp.begin() + NDARTS, 0);
if (!smet_stamp[cy]) { ... smet_stamp[left] = 1; }
```

**1.54×** — and this is bookkeeping, not search. Also in this fix: `edgelabel` took its base string by
value (1.8e9 copies at k=2); `const&` was worth only **1.03×**.

⚑ Only patch `writecycle`. Two other functions (`writeconway`, `writecyclefinal`) share the `smet`
pattern and are output-only.

## Fix 6 — generation stamp

Removes the per-call `std::fill` (3.1e9 writes at k=2) and the per-dart `std::string mainst = ""`
(3.1e9 constructions).

```cpp
static std::vector<unsigned> smet_stamp;
static unsigned smet_gen = 0;
++smet_gen;                                   // no clear
if (smet_stamp[cy] != smet_gen) { ... smet_stamp[left] = smet_gen; }
```

**1.02×.** Both were already nearly free.

## Fix 7b — labels as packed integers

`edgelabel` still *built* a string per dart per materialisation — concatenation plus
`std::to_string`, ~1.8e9 times at k=2. Double-call measurement: **15 s of a 50 s run, 30%**.

```cpp
struct configuration { std::vector<int> label; /* packed (base id, tile) */ ... };

static std::vector<std::vector<int> > LBASE_OF;      // [type][dart] -> interned base id, built ONCE
static inline int label_code(int base_id, int tile) { return base_id * 4096 + tile; }
static inline bool label_star(int code) { return LBASE_STAR[code / 4096] != 0; }
static std::string label_str(int code) { return edgelabel(LBASE[code / 4096], code % 4096); }

// hot path
newconf.label.push_back(label_code(LBASE_OF[gr][gg], newconf.num));
if (label_star(slist.label[firstfree])) { ... }      // was label[firstfree][0] == '*'
```

**1.38×.**

⚑ **The first attempt was 26% SLOWER** (50 → 63 s): the interning `std::map` lookup was in the hot
loop, so every materialisation did a red-black-tree descent with string comparison — more expensive
than the string it replaced. Intern once at startup into `LBASE_OF`.

## Fix 8 — no `push_back` in the hot path

6 appends per dart × ~12 darts × 147M materialisations = **10.6e9 capacity-checked appends**.

```cpp
const vertexdef& VD = mainlist[gr];
const int symbollength = (int)VD.rneig.size();
const int newsz = l + symbollength;
newconf.rneig.resize(newsz); newconf.lneig.resize(newsz); newconf.mirro.resize(newsz);
newconf.lvert.resize(newsz); newconf.label.resize(newsz); newconf.glue.resize(newsz);
int* RN = newconf.rneig.data(); /* ... five more ... */
const int* srn = VD.rneig.data(); /* ... */
for (int gg = 0; gg < symbollength; gg++) {
    const int d = l + gg;
    RN[d] = l + srn[gg]; LN[d] = l + sln[gg]; MI[d] = l + smi[gg];
    LV[d] = slv[gg];     LB[d] = label_code(sbo[gg], tilenum); GL[d] = -1;
}
```

Capacity persists across the DFS because teardown shrinks with `resize()`, so the grow almost never
reallocates. **1.50×.**

## Fix 9 — the second call site had no filter at all

Instrumenting showed `checkpart_inc` called **2,484,356,059 times** at k=2, far more than the
candidate loop explains. There are TWO call sites; fixes 2 and 3 only filtered the add-a-vertex one.
The other — gluing `firstfree` to an existing free dart, looped over every dart of every node — had no
test whatsoever.

```cpp
const int a_cls = slist.lvert[firstfree];                       // loop-invariant
const int b_cls = slist.lvert[slist.rneig[firstfree]];
const int want_B = BUCKET_OK ? CLASS_NEXT[a_cls] : -1;
for (int i = 0; i < (int)slist.rneig.size(); i++) {
    if (slist.glue[i] == -1) {
        bool mirroredi = slist.mirro[i] == i;
        if (mirrored == mirroredi) {
            if (BUCKET_OK && (slist.lvert[slist.rneig[i]] != want_B ||
                              CLASS_NEXT[slist.lvert[i]] != b_cls)) continue;
```

**1.43×.** Same two equalities as fix 2, applied to the site that was overlooked for a whole day.

---

## Measured and rejected — do not retry these

**Memoisation / hashing of DFS states.** Fingerprinted all 102,747,186 nodes on (vertype, glue) in a
2^27 open-addressed table: `distinct=102,700,438  repeats=0`. **Zero repeats.** The search is a tree,
not a DAG — the min-type-root invariant plus the deterministic most-constrained-edge choice of
`firstfree` give every state exactly one path. There is nothing to cache.

**The completeness scan.** `std::find(glue, -1)` runs 102,687,377 times but averages **1.66
iterations** before short-circuiting. A maintained free-dart counter saves nothing.

**Incremental `writecycle`.** Calling it twice per node (it is idempotent) added 5 s to a 50 s run, so
it is ~10% of runtime; perfect elimination caps at **1.11×**, against union-find with rollback.

**The non-adjacency lemma as a search filter.** Two valence-2 vertices cannot be adjacent (proved
2026-08-06, from `24/n_A + 24/n_B = 0` being unsatisfiable). Instrumented across the whole k=2 search:
the solver tries that pairing **zero times** out of 1.8e9 rep attempts. Fix 2 already enforces it
implicitly. The lemma's value is in the §4.4 dent-budget bound, not in the search.

## Technique: measuring a component without a profiler

Call it twice and take the difference. Works for anything pure or idempotent:

```cpp
{ volatile bool sink_ = checkpart_inc(newconf2, chg2, 4); (void)sink_; }   // volatile stops folding
if (checkpart_inc(newconf2, chg2, 4)) { ... }
```

`writecycle` is idempotent, so a bare second call suffices. Take the **minimum** across reps — this
machine's single-core throughput swings 2.4× with background load, and one measurement had the
double-work build coming out faster than the single.

## The lesson, which cost four wrong predictions

**Counting wasted work tells you nothing about what it costs.**

| fix | work removed | actual gain |
|---|---|---|
| 1 | 99.6% of loop trips | 2.1× |
| 3 | 89% of rep attempts | 1.13× |
| 6 | 3.1e9 fills + 3.1e9 string ctors | 1.02× |
| — | completeness scan | not worth doing |

Every one of those removals was cheap work: a predicted branch, an early-exit comparison, a
sequential write. The wins came from removing *expensive* work — building a vertex and walking every
face (fix 2), allocating and linearly searching (fix 5), constructing strings (fix 7b), capacity-checked
appends (fix 8), billions of unfiltered calls (fix 9).

Measure what the work COSTS, not how much of it there is.

## What is left

- Co-locate `lvert` and `glue` in one array: the face walk reads both at the same index, so this
  halves cache lines in the hottest loop. Expected ~1.1×, against a broad refactor.
- Symbolic α is the only large idea remaining, and it changes what the search enumerates rather than
  how fast: collapse `6*1 … 6*7` into one species with a free parameter, cutting the alphabet ~7× and
  making families first-class output instead of snapshots reassembled afterwards by `family_flex.py`.

---

## Fixes 10-13: the alphabet was 96% impossible (2026-08-07)

Everything above optimises how the search runs. These change what it searches. AL's question was
whether the star alphabet has the analogue of the six regular vertex configurations that satisfy the
angle equation but tile nothing. It does — 58,555 of 60,927.

**Fix 10 — arc consistency.** A dart with an empty candidate bucket can never be glued, so its type
can never appear in any tiling at any k. Fixpoint. 60,927 -> 13,316; **9.8x** at k=2.

**Fix 11 — face cycle.** Every dart in a complete tiling lies on a CLOSED face, so it must lie on a
cycle of the face-successor digraph `x -> glue[rneig[x]]`. The digraph is unmaterialisable
(dart -> every class-compatible dart) but factors through the class key, giving 2 edges per dart;
Tarjan SCC over 767,266 nodes. 13,316 -> 5,656; **3.5x** more.

**Fix 12 — face LENGTH, the one that mattered.** `checkface` requires a closed face to satisfy
`count % p == 0 && L % count == 0`, so a length-5 cycle around a triangle is not a face. Two facts make
the exact test cheap. The digraph decomposes by `CLASS_NEXT` orbit (derived, then measured: zero
cross-orbit steps, 48 components, largest is the triangle with 25,363 darts and allowed lengths {1,3}).
And the test collapses to the key level:

> dart `x` alive ⟺ ∃c with `c|L`, `c%p==0`, and `tkey(x)` reachable from `Q(rneig(x))` in EXACTLY
> `c-1` steps of the key digraph `R(K) = { Q(rneig(f)) : f ∈ S(K) }`.

~16k key-nodes against 751k darts, decomposing by orbit — bitset reachability on a few hundred nodes
per component. Whole fixpoint: **0.05 s**. 5,656 -> 2,372; **3.3x** more.

**Fix 13 — pair filter, forward and reverse.** The type-level test asks whether SOME successor closes a
dart's face. The pair test asks which ones do, and a gluing constrains two faces because it is
symmetric: `glue[e]=f` also means `glue[f]=e`.

```cpp
const int px = slist.lneig[firstfree];
const int tk_x = cand_key(slist.lvert[px], slist.lvert[slist.rneig[px]], slist.mirro[px] == px);
const int rf   = slist.rneig[firstfree];
const int qf_x = cand_key(CLASS_NEXT[slist.lvert[slist.rneig[rf]]],
                          CLASS_NEXT[slist.lvert[rf]], slist.mirro[rf] == rf);
...
if (pair_ok(tk_x, e.qf) && pair_ok(e.tkrev, qf_x))   // two bit lookups, before materialisation
```

Forward **2.8x** at k=3, reverse a further **2.2x**. Both keys on the candidate side (`qf`, `tkrev`)
are precomputed into `CandEnt`; both on the configuration side are loop-invariant per node. No hash in
the hot loop — that is what made fix 7's first attempt 26% slower.

⚑ **`Q(e)` is the key required of whatever is glued TO `e`.** So `successor(x) = glue[rneig[x]]` carries
key `Q(rneig[x])`, not `Q(x)`. Feeding the reverse condition `Q(firstfree)` is off by one dart, and
since consecutive darts of a vertex can sit on different tiles the two keys land in different orbits —
the k=3 catalog collapsed from 287 blocks to 60. Loud, not silent, which is the one mercy.

### star24full, single core, user seconds

| | k=2 | k=3 |
|---|---|---|
| no filter (`EU_NOFILTER=1`) | 17.09 | ~4,700 (est) |
| + fix 10 arc consistency | 1.63 | ~480 (est) |
| + fix 11 face cycle | 0.49 | 48.5 |
| + fix 12 face length | 0.15 | 7.6 |
| + fix 13 pair (fwd) | 0.13 | 2.71 |
| + fix 13 pair (rev) | **0.12** | **1.25** |
| perfect oracle (254 types) | 0.06 | 0.30 |

**142x at k=2.** k=3 star24full went from 152 s wall / 9 cores to 2 s.

### Per palette

star24full 60,927 -> 2,372. isotoxal-star-z24 34,329 -> 14,966. star24 5,739 -> 1,384.
regular 44 -> 44, spherical 125 -> 125, hyperbolic 2,699 -> 2,699 — nothing dies where nothing should,
which is the best evidence the test is not trigger-happy. Inert on girih / composite-* : the key
identity needs `CLASS_PREV == CLASS_NEXT` with NEXT an involution (`BUCKET_OK`), and those have p > 2.

### Gates

`check-regular` PASS (byte-identical vs golden). star24full `cc1a4e57bde39378`/44,
`0b6cb12bb7f5f797`/118, `de09102dc86ded53`/287. girih `305fcd18ffad74b2`/156 and composite-convex
`96e4d8f860145cdc`/288 unchanged. `EU_NOFILTER=1` reproduces the unfiltered search exactly.

### The dent budget was removed at the same time

`EU_NCBUDGET` defaulted to 8; the k<=3 catalog contains tilings with exactly 8 dent-fill vertices and
the search explores up to 12. The default sat on the observed maximum. Uncapped refused zero times and
gave the identical catalog, so it is gone, along with `ncbudget_hits`, `ncbudget_blind` and the
"COMPLETENESS NOT CERTIFIED" warning. Replaced by a tripwire reporting the largest dent count seen.
Justification is the non-adjacency lemma (two 2-valent vertices cannot be adjacent), so dents cannot
chain; there is still no formal bound, which is exactly why a tripwire beats a guess.

### What is left

k=3 is 1.25 s against a 0.30 s perfect oracle — ~4x, down from 26x before fix 13. The gap grows with k.
The next rung is the FULL corona (all faces at a vertex closing simultaneously with shared
neighbours); fix 13's reverse condition is only the two-face piece of it, and the full version is the
first that needs real search rather than reachability algebra.

### Corona: built, measured, NOT landed (2026-08-07)

The last rung of static filtering. A vertex must close ALL its faces at once with one consistent choice
of neighbours; since the face at corner `(x, rneig[x])` begins with the gluing of `rneig[x]` and ends
with the gluing of `x`, the darts of a vertex form a CYCLE of binary constraints — a cycle CSP,
solvable exactly by boolean matrix product plus a trace test, with values collapsed from darts (mean
domain 159) to `(tkey(lneig f), Q(rneig f))` key pairs (mean 56).

Corner consistency alone kills 0 — and not because the degenerate face lengths absorb everything:
c>=3 key reachability satisfies 12,411 of 22,169 corners, c=2 saves 9,050, c=1 only 708, and nothing is
unsatisfiable. The full cycle CSP kills **12** types, 2,372 -> 2,360, exact over every type, in 0.06 s.

Real, and worth nothing. The corona costs a FIXED amount at startup but saves a PROPORTIONAL amount of
search, so a wash at k=3 could still pay at k=4 — AL asked exactly this. Measured both, interleaved:

| single core | fixed | k=3 | k=4 |
|---|---|---|---|
| without | 0.04 | 1.21 | 25.38 |
| with | 0.10 | 1.26 | 25.49 |

Net of the 0.06 s fixed cost the search is unchanged at k=3 (1.17 -> 1.16) and at k=4 (25.34 -> 25.39),
inside noise both times. The 12 types barely seed any tree, and the benefit does not grow with k.
Catalogs identical. Kept in `scratchpad/vc-ceiling/eu_solver_corona.cpp`.

⚑ Do not compare TOTALS when a change has a fixed setup cost and a proportional benefit — measure the
fixed part separately, then test at two values of k. My first pass called this "net negative" from a
startup figure that was wrong by 3x, and single-shot k=4 numbers (24.79 vs 25.70) were pure noise.

**This closes static filtering.** The residual k=3 gap to a perfect oracle is mostly unreachable in
principle: the oracle mask is the types used at k<=3, which is k-DEPENDENT, and a type first appearing
at k=7 is real and may not be deleted by any k-independent test. Next axis is dynamic propagation
(the same face-closure algebra applied to the PARTIAL configuration during search) or symbolic alpha.

### star24full k=4, and why removing the dent budget was load-bearing

**k=4 = 391.** Full catalog 44 / 74 / 169 / 391, **678 total**, digest `0d6c89a535a16ad8`, **25.4 s
single core**, no cap of any kind.

The k=4 search explores up to 17 dent-fill vertices, and the shipped catalog contains 5 tilings with
10 dents, 2 with 11 and 3 with 12. The removed `EU_NCBUDGET` capped dents at 8. **Running k=4 with the
old default would have shipped 668 tilings instead of 678** and reported completeness, behind a warning
that fires on every star run and is therefore ignored. The removal was not tidying.

### Where the face filter actually pays: every ring palette (2026-08-07)

The star24full numbers (142x at k=2) are not the ceiling. Swept D=14…46:

| palette | D | alphabet -> live | dead | measured |
|---|---|---|---|---|
| ring42 | 2·3·7 | 192,687 -> 1,030 | 99.5% | **k<=2: 97.06 s -> 0.17 s, 571x** |
| ring18 | 2·3² | 3,839 -> 331 | 91.4% | **k<=3: 17.1 s -> 0.03 s, ~560x** |
| ring20 | 4·5 | 1,667 -> 49 | 97.1% | k<=3: 0.17 s -> 0.00 s |
| ring28 | 4·7 | 2,261 -> 14 | 99.4% | — |
| ring16 | 2⁴ | 396 -> 40 | 89.9% | — |
| ring14/22/26/34/38/46 | 2·prime | -> 0 | 100% | no tilings exist |
| star24full | 24 | 60,927 -> 2,372 | 96.1% | k=2: 17.09 s -> 0.12 s, 142x |
| regular / spherical / hyperbolic | — | unchanged | 0% | none |

Catalogs identical in every case. ring42 carries the largest alphabet in the repo, three times
star24full's, and is now tractable at k=2 in 0.17 s.

**Six rings have zero live types and provably no tilings** (filtered and unfiltered both emit nothing).
All are D = 2·prime with prime >= 7: `n | D` then admits only p-gons and 2p-gons, so no triangle, square
or hexagon exists and no vertex closes. A ring supports tilings only when D has a factor of 3 or 4. The
filter derives that from face closure alone.

The rule of thumb this settles: the filter pays in proportion to how loose the palette GENERATOR is.
Broad closure rules (every corner angle an integer unit) manufacture huge numbers of angle-valid but
untileable vertex figures; hand-built or geometrically tight palettes (regular, spherical, hyperbolic)
have none to remove.

⚑ **`timeout` does not exist on macOS.** Two verification runs used `env … timeout 300 <solver>`, never
executed the solver, and reported 0 blocks — which read as "no tilings exist" for six palettes and for
ring42. Do not use it in gate scripts here.

## The dynamic face-closure filter — the next axis, landed (2026-08-07)

Static filtering was declared finished (see the corona note). It was, at the TYPE level. The next axis
is the same face-closure algebra applied to the PARTIAL configuration during search, and it is worth
more than every static rung after the first.

`checkface` walks a face and, when it runs off an unglued edge, returns `count <= L`. That throws the
count away. A face that has already walked `count` darts can only close at an admissible `c > count`,
and the remaining chain must be realizable — which is exactly the key reachability the static filter
already computes. With the walk started at dart `i` and open at `rfree`:

> the branch is dead unless `tkey(i)` is reachable from `Q(rfree)` in exactly `c - count` key steps,
> for some admissible `c` (`c | L`, `c % p == 0`).

`acc[src][dst]` has bit `b` set iff `dst ∈ Reach_{b-1}(src)`, so the whole test is two shifts and an AND:

```cpp
static inline bool dyn_can_close(configuration const& conf, int i, int rfree, int count) {
    const int tk_i = cand_key(conf.lvert[i], conf.lvert[conf.rneig[i]], conf.mirro[i] == i);
    const int rr   = conf.rneig[rfree];
    const int q_r  = cand_key(CLASS_NEXT[conf.lvert[rr]], CLASS_NEXT[conf.lvert[rfree]],
                              conf.mirro[rfree] == rfree);
    const int o = DYN_KORB[tk_i];
    if (o < 0 || DYN_KORB[q_r] != o) return true;          // unknown -> never reject
    const unsigned long long m = DYN_ACC[o][(size_t)DYN_LOC[q_r] * DYN_N[o] + DYN_LOC[tk_i]];
    return count < 63 && ((m << (count - 1)) & DYN_ALLOWED[o]) != 0ULL;
}
```

This is information the static filter CANNOT have: preprocessing must assume every possible `count`.

**Measured, single core, interleaved reps, catalogs identical:**

| k | without | with | speedup |
|---|---|---|---|
| 3 | 1.39 / 1.40 | 0.80 / 0.80 | 1.75x |
| 4 | 28.84 / 29.98 | 8.21 / 8.29 | **3.5x** |

**The gain grows with k**, which is what the corona failed to do and why this one is worth landing.
Neutral on shallow searches (regular k<=6 0.18 -> 0.17, ring42 k<=2 0.19 -> 0.20) — the tables cost a
little and there is nothing to prune.

⚑ **The first version was UNSOUND and the catalog caught it instantly**: 445 raw blocks collapsed to 22.
Off-by-one. Closing at total length `c` needs `tkey(i) ∈ Reach_{c-count}(q_r)`, i.e. acc bit
`c-count+1`, not `c-count`. The check that pins it: with `count=1`, closing at `c=2` requires
`tkey(i) ∈ R(q_r) = Reach_1`, where the wrong formula demanded `Reach_0` (plain equality). Always test a
dynamic prune against the raw block count before the digest — the collapse is obvious, a digest change
is not.

Gates: star24full k=1 `cc1a4e57bde39378`/44, k=2 `0b6cb12bb7f5f797`/118, k=3 `de09102dc86ded53`/287,
k=4 `0d6c89a535a16ad8`/678; regular k<=6 `884968dca36a6c41`/1247 with `make check-regular` PASS;
ring18 101 and ring42 65 unchanged. Disable with `EU_NODYN=1`.

## star24full k=5 = 771

**44 / 74 / 169 / 391 / 771, total 1,449**, digest `e4cebd1a796cd3f3`, **46.2 s single core**, no cap of
any kind (the search explores up to 20 dent-fill vertices). The k<=4 prefix matches the certified
catalog exactly.

## star24full: the depth ladder

| k | tilings | x prev | 1 core | x prev |
|---|---|---|---|---|
| 1 | 44 | — | — | — |
| 2 | 74 | 1.68 | 0.13 s | — |
| 3 | 169 | 2.28 | 0.97 s | 7.5 |
| 4 | 391 | 2.31 | 8.44 s | 8.7 |
| 5 | 771 | 1.97 | 46.2 s | 5.5 |
| 6 | 1570 | 2.04 | 198 s | 4.3 |
| 7 | 3204 | 2.04 | 1109 CPU-s / 222 s wall on 9 cores | 3.73 |
| 8 | 6212 | 1.94 | 3482 CPU-s / 805 s wall on 9 cores (depth-1) | ~2.9 |
| 9 | 12076 | 1.94 | 11060 CPU-s / 1494 s wall on 9 cores (**depth-2**) | — |

**Digests (all uncapped, `EU_NCBUDGET=99`):**

| k<= | total | digest |
|---|---|---|
| 1 | 44 | `cc1a4e57bde39378` |
| 2 | 118 | `0b6cb12bb7f5f797` |
| 3 | 287 | `de09102dc86ded53` |
| 4 | 678 | `0d6c89a535a16ad8` |
| 5 | 1449 | `e4cebd1a796cd3f3` |
| 6 | 3019 | `2075e59e380a2cce` |
| 7 | 6223 | `aa2cff7bd10c919f` |
| 8 | 12435 | `b397d8220bb29cea` |
| 9 | 24511 | `3489713bb0d31c0a` (depth-2; see below) |

Regular gate: `884968dca36a6c41` / 1247, `make check-regular` PASS.

**Cross-shard-count reproduction, k<=7.** The k=8 run used 400 shards where the k=7 run used 200.
`catalog_digest.py --diff` over the two k<=7 catalogs: IDENTICAL, 6223 blocks, `aa2cff7bd10c919f`.
This is the strongest regression evidence the pipeline has — the same catalog out of a different
decomposition. It only works with the order-insensitive digest; `shasum` reports a difference that is
not one, because sharding changes the order blocks are written in, never the set.

The k=6 search explores up to 24 dent-fill vertices and k=7 more still, so `EU_NCBUDGET=8` would have
been badly wrong at depth — the budget removal is load-bearing, not tidying.

⚑ The k=7 and k=8 CPU-second figures come from the pooled runner and are inflated by 1-second
shard-timer granularity over 200 and 400 shards; they are NOT directly comparable to the single-core
column above them.

**The parallel floor is a fixed FRACTION, and more shards do not lower it.** k=7 on 200 shards:
slowest shard 218 s of 1109 total, 19.7%. k=8 on 400 shards: 803 s of 4140, 19.4%. Doubling the
decomposition bought nothing, because `initex()` splits on the first vertex type only and one
first-type subtree dominates — no number of shards can cut inside it. Expect ~20% of serial time at
every k from here, so at k=9 the floor alone is around 40 minutes.
**Depth-2 sharding landed 2026-08-07 and does move it.** `EU_SHARD_D2=<f>` splits `EU_SHARD_N` two
ways: `N/D2` root slices (which first types a shard walks) and `D2` branch slices per root (which of
that root's level-1 branches it descends), so root-level work is duplicated D2-fold instead of
N-fold. `D2=1` reproduces the old partition byte-identically; `main()` refuses a run where D2 does
not divide N, since a remainder would leave root slices unwalked.

Floor falls from ~20% to 5-7%. Measured at N=360 on 9 slots — k=6 45.3→32.1 s, k=7 217.3→138.5 s
(1.57x), and k=9 ran in production at a 6.7% floor.

⚑ **The gain is bounded by floor × slots and the floor saturates near 20%**, so ~1.8x is the ceiling
on a 10-core box, and unlike the filters it does NOT compound per level. The ceiling scales with core
count, so this pays off far better on a cluster than here.
⚑ **Depth-2 changes the catalog TEXT, not the tiling set.** The printed orbit order is DFS insertion
order and the pruner keeps the first-seen representative, so splitting inside a root changes which
branch arrives first. Proof the set is unchanged: at k=4 the union of a sequential and a depth-2 run
(2600 raw blocks) prunes back to exactly 678; at k=9 the k≤8 prefix matches the depth-1 k=8 catalog
on the order-insensitive multiset. Because the atlas keys ids, the family fold and `cells_index` by
vertype STRING, depth-2 is safe for a NEW k but re-running a SHIPPED k would move those keys.

Full write-up: `experiments/results/depth2-sharding-2026-08-07.log`.

Two things this table says. **Tiling counts double per k and the ratio is stable** (1.94–2.31), so the
answer set is well behaved. **The TIME ratio is falling** — 8.7, 5.5, 4.3, 3.73 — because the filters
bite harder the deeper the search goes: the dynamic test has more accumulated `count` to work with at
depth. That falling ratio is what makes k=9 reachable at all.
That is the opposite of the usual combinatorial blow-up and is what makes k=8+ plausible.

For scale: this morning k=2 alone cost ~15.8 CPU-hours; the whole k<=6 catalog is now 3.3 minutes.

## Fix 14 — the 4-bucket union: the filter stack works on period-p palettes (2026-08-08)

Everything above was gated on `BUCKET_OK`, true only when `CLASS_PREV == CLASS_NEXT` and `NEXT` is an
involution, i.e. only when every tile has period ≤ 2. One period-3 tile in a palette turned off the
face filter, the pair filter, the dynamic filter and the candidate index together, and the search fell
back to scanning every vertex type at every node. That is why composite-convex, composite-decomp and
the scaled palettes had all stalled at k ≤ 3 while stars reached k=9.

The identity the index needs, derived without assuming the involution: gluing free dart `e` to
candidate `f` crosses the new glue in both directions, and `checkface` accepts `CLASS_NEXT` or
`CLASS_PREV` on its first step, so with `a = lvert[e]`, `b = lvert[rneig[e]]`,

    lvert[rneig[f]] in {NEXT, PREV}[a]      and      lvert[f] in {NEXT, PREV}[b]

which is four admissible `(A, B)` pairs, four buckets, and their union is the pool. Under `BUCKET_OK`
the alternatives coincide, `qkeys()` returns one key, and this is exactly the old single bucket — which
is why `check-regular` stays byte-identical and star24full k≤4 reproduces old node-for-node.

The union is a NECESSARY-condition relaxation: `checkface` also locks direction after its first step
and the union forgets that, so it admits candidates `checkpart_inc` then rejects. It costs work and
cannot lose a tiling. The same relaxation generalizes the three filters — their successor digraph gets
1-4 edges per dart instead of 1, and more reachability means fewer kills, which is the safe direction.
`dyn_can_close` and the pair filter take the disjunction over the key set.

⚑ **The gain is the candidate index, not the filters.** On composite-convex at k=2 the node count falls
only 21% while wall time falls 18×: the old path scanned all 18,969 types per node, the new one reads
at most four buckets. The static face filter kills ZERO types on every period-p palette measured,
against 96% on star24full — these palettes simply have few impossible vertex types, and the relaxation
weakens the filter further. Do not expect the star ladder's compounding here.

⚑ **A latent filter bug, now guarded.** The per-orbit reachability indexed successors through a global
`loc[]` without re-checking the orbit, justified by "measured: zero cross-orbit steps". A cross-orbit
edge would corrupt the reachability, and since reduced reachability KILLS types, that direction loses
tilings. It now counts them and disables the filters rather than filtering on a corrupted graph.

Gates: `check-regular` PASS byte-identical; star24full k≤4 identical (2,959,612 nodes, digest
`053f2de0b6a19393`); composite-convex k≤2 pruned back to **288**, the golden that exposed the dynamic
filter deleting 141 of 288 in the first place.

Full write-up: `experiments/results/4bucket-union-2026-08-08.md`.
