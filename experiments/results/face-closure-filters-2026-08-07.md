# Static VC filters: 60,927 -> 2,372, and star24full k=4 in 25 s (2026-08-07)

Follow-on to `dead-vertex-configs-2026-08-07.md`. Three filters, each strictly stronger than the last,
all sound, all k-independent, all computed once at startup in under a second.

| filter | live types | k=2 user s | k=3 user s (1 core) | k=3 wall (9 cores) |
|---|---|---|---|---|
| none (`EU_NOFILTER=1`) | 60,927 | 17.09 | ~4,700 (est) | ~25 min (est) |
| arc consistency | 13,316 | 1.63 | ~480 (est) | 152 s |
| + face cycle | 5,656 | 0.49 | 48.5 | 18 s |
| + face LENGTH | 2,372 | 0.15 | 7.6 | 3 s |
| + PAIR filter (forward face) | 2,372 | 0.13 | 2.71 | — |
| + REVERSE face | 2,372 | **0.12** | **1.25** | 2 s |
| perfect oracle (unreachable) | 254 | 0.06 | 0.30 | — |

**142x at k=2, ~3,800x at k=3 against the estimated unfiltered baseline.** Every catalog
byte-identical throughout.

**LANDED** in `tools/ctrnact-oracle/eu_solver.cpp` (2026-08-07). The filter is unconditional, runs in
~0.05 s at startup, self-reports (`face filter: 2372 of 60927 vertex types can occur in a tiling`),
and is disabled by `EU_NOFILTER=1` and on palettes where the bucket key is not a sound identity.

⚑ The k=3 single-core column is measured except where marked. Do NOT use the pooled runner's
"shard seconds total" for this: it times each shard with 1-second `date` granularity, and with 200
mostly-sub-second shards the rounding inflates the sum badly (it reported 25 s where the true
single-core cost is 7.6 s). Wall-clock from the pool is fine; CPU-seconds from it are not.

## The three filters

**1. Arc consistency (previous note).** A dart with an empty candidate bucket can never be glued, so
its type can never appear. Fixpoint. 60,927 -> 13,316.

**2. Face cycle.** In a complete tiling every dart lies on a CLOSED face, so every dart must lie on a
cycle in the face-successor digraph `x -> glue[rneig[x]]`. Materialising that digraph is hopeless
(dart -> every class-compatible dart), but it factors through the class key — the successors of `x`
depend only on `qkey(rneig[x])`, and each dart has exactly one target key — so routing through
key-nodes gives 2 edges per dart. Tarjan SCC over 767,266 nodes; kill darts not in a nontrivial
component; kill a type if any dart dies; fixpoint (3 rounds). 13,316 -> 5,656.

**3. Face length — the one that mattered.** `checkface` demands more than "a cycle": a closed face
satisfies `count % p == 0 && L % count == 0`. The cycle test accepts a length-5 cycle around a
triangle. Two structural facts make the exact test cheap:

*The digraph decomposes.* The bucket condition IS `lvert[rneig[f]] == NEXT[lvert[e]]`, so the
successor's expect-class is exactly `CLASS_NEXT` of the current one. The graph therefore splits into
one component per `CLASS_NEXT` orbit, with `L` and `p` constant on each. Measured: **zero cross-orbit
steps**, 48 components. The largest is the triangle — L=3, p=1, 25,363 darts (42% of all live darts),
allowed lengths `{1,3}` only.

*The test collapses to the key level.* `successors(x) = S(Q(x))`, so a closed walk
`x -> f1 -> ... -> f_{c-1} -> x` forces the key chain `Q(x) = tkey(f1) -> Q(f1) = tkey(f2) -> ... ->
Q(f_{c-1}) = tkey(x)`. Hence:

> dart `x` is alive  ⟺  ∃ c with `c | L(x)`, `c % p(x) == 0`, and `tkey(x)` reachable from `Q(x)` in
> **exactly** `c-1` steps of the key digraph `R(K) = { Q(f) : f ∈ S(K) }`.

`R` has ~16k nodes against 751k darts and decomposes by orbit, so this is bitset reachability on a few
hundred nodes per component. **The whole fixpoint runs in 0.05 s.** 5,656 -> 2,372 in 5 rounds.

```cpp
for (int t = 0; t <= L; t++) {                    // cur = Reach_t, bitset rows over the orbit's keys
    int c = t + 1;
    if (c <= L && c % P == 0 && L % c == 0) record(c);
    if (t == L) break;
    nxt.assign((size_t)n * W, 0ULL);
    for (int i = 0; i < n; i++)
      for (int j = 0; j < n; j++)
        if (cur[(size_t)i*W + j/64] >> (j%64) & 1ULL)
          for (size_t e = 0; e < R[keys[o][j]].size(); e++) {
              int d = loc[R[keys[o][j]][e]];
              if (d >= 0) nxt[(size_t)i*W + d/64] |= 1ULL << (d%64);
          }
    cur.swap(nxt);
}
```

## Per palette

| palette | alphabet | AC | + face cycle | + length |
|---|---|---|---|---|
| star24full | 60,927 | 13,316 | 5,656 | **2,372** |
| isotoxal-star-z24 | 34,329 | 31,137 | — | **14,966** |
| star24 | 5,739 | 3,097 | — | **1,384** |
| regular | 44 | 44 | 44 | **44** |
| spherical | 125 | 125 | 125 | **125** |
| hyperbolic | 2,699 | 2,699 | 2,699 | **2,699** |

Regular, spherical and hyperbolic lose nothing, which is the right answer — the regular alphabet is 14
species and all 14 tile — and is the best evidence the test is not trigger-happy.

⚑ Does not apply to girih / composite-* : the bucket key needs `CLASS_PREV == CLASS_NEXT` with NEXT an
involution (`BUCKET_OK`), and those palettes have p > 2. They need the 4-bucket-union form.

## Gates

| gate | result |
|---|---|
| star24full k=1, full alphabet vs filtered | `cc1a4e57bde39378`, 44 blocks — identical |
| star24full k=2, **full alphabet** vs filtered | `0b6cb12bb7f5f797`, 118 blocks — identical |
| star24full k=3, AC-masked vs face vs length | `de09102dc86ded53`, 287 blocks — identical |
| regular k<=6, unfiltered vs filtered | `884968dca36a6c41`, 1247 blocks — identical |
| all 254 types used in the k<=3 catalog survive | 0 killed |
| nesting | len-live ⊂ face-live ⊂ AC-live |

**Certification chain, stated honestly.** k<=2 is gated against the FULL 60,927-type alphabet. k=3 is
gated only against the AC-masked run — the full-alphabet k=3 gate was started and killed at 25/200
shards, so at k=3 the filters rest on the soundness argument plus containment of every used type.

## k=3 star24full, cap-free certified

**44 / 74 / 169, total 287**, digest `de09102dc86ded53`. `EU_NCBUDGET` at 8, 9 and 99 all give the
identical catalog and B=99 raises no warning at all, so the noncounting cap cuts nothing at k<=3.
No external cross-check exists — no star24full corpus is shipped, and the isotoxal reference atlases
are a different palette. Marek's solver at k=3 on the 15° grid would be the real independent check.

## A bug worth recording

The first pair-level probe reported 99.2% pruned with 20,920 of 22,169 darts orphaned. That is
impossible — `lenscan` had just certified every one of those darts has a closing successor — and the
cause was recording the reachability mask only at allowed `c` while querying bit `c-1`, which is
generally not itself allowed. Fixed by recording at every step. The cross-check that caught it
(pair-alive must agree with lenscan for every dart) is now an assertion in the probe and reports 0.

## 4. Pair-level candidate filtering — built and measured

`lenscan` kills a dart when NO successor closes its face. The finer question is which INDIVIDUAL
successors do. Gluing `firstfree` to `f` fixes `successor(x) = f` for `x = lneig[firstfree]`, so:

> pair `(x,f)` is alive ⟺ `tkey(x)` is reachable from `Q(f)` in exactly `c-2` steps, some allowed `c`.

Both keys are known before the vertex is materialised — `tkey(x)` is loop-invariant per node, and
`Q(f)` is a static property of the candidate, precomputed into `CandEnt`. So the filter is a single
bit lookup in a `(tkey(x), Q(f))` bitmap, with no hash in the hot loop (the mistake that made fix 7's
first attempt 26% slower). It prunes 63.5% of the candidate slots the loop actually walks
(3,052,417 -> 1,113,756, measured over orbit reps to match `CAND`).

```cpp
const int px = slist.lneig[firstfree];
const int tk_x = cand_key(slist.lvert[px], slist.lvert[slist.rneig[px]], slist.mirro[px] == px);
while (gidx < gend) {
    const int gr = (*pool)[gidx].gr;
    {   // does ANY rep of this type survive? if not, skip materialisation entirely
        bool any = false;
        for (int q = gidx; q < gend && (*pool)[q].gr == gr; q++)
            if (pair_ok(tk_x, (*pool)[q].qf)) { any = true; break; }
        if (!any) { while (gidx < gend && (*pool)[gidx].gr == gr) gidx++; continue; }
    }
```

**Worth 1.15x at k=2 and 2.8x at k=3** (7.47/7.67 -> 2.73/2.69 s, interleaved reps), same 445 raw
blocks. Gates: k=3 `de09102dc86ded53` (287), regular k<=6 `884968dca36a6c41` (1247, 10/20/61/151/332/673).

The gain grows with k, which is the useful part — 63.5% removal bought 1.15x where the search is
shallow and 2.8x where it is deep, because what it removes is a full vertex materialisation plus
`checkpart_inc`, and deeper nodes carry more of both.

## 5. Reverse-face condition — the first corona coupling

Gluing is symmetric: `glue[e] = f` also means `glue[f] = e`. So one gluing fixes the first step of TWO
faces, and only one of them was being checked. The second is the face through `lneig(f)`, whose first
step is `firstfree`:

> `tkey(lneig(f))` must be reachable from `Q(rneig(firstfree))` in exactly `c-2` steps.

`tkey(lneig(f))` is static per candidate (precomputed into `CandEnt`), `Q(rneig(firstfree))` is
loop-invariant per node. One more bit lookup. **Worth 2.2x at k=3** (2.73 -> 1.25 s), catalog
unchanged.

⚑ **The dart matters and I got it wrong first.** `Q(e)` is the key required of whatever is glued TO
`e`, so `successor(x) = glue[rneig[x]]` carries key `Q(rneig[x])`. Feeding the condition `Q(firstfree)`
instead of `Q(rneig[firstfree])` is off by one dart, and because consecutive darts of a vertex can sit
on different tiles, the two keys land in DIFFERENT `CLASS_NEXT` orbits — so nearly every lookup returns
0 and the catalog collapsed to 60 blocks of 287. A wrong filter here fails loudly, not silently, which
is the one merciful thing about it.

This is the cheapest piece of the corona and not the whole thing: it couples two faces through a single
gluing. The full corona — all faces at a vertex closing simultaneously with shared neighbours — is
still open and is the first rung that needs real search instead of reachability algebra.

## 6. The full corona — built, measured, NOT landed

The corona is the last rung of static filtering: a vertex must close ALL its faces simultaneously with
one consistent choice of neighbours. The face at corner `(x, rneig[x])` begins with the gluing of
`rneig[x]` and ends with the gluing of `x`, so **the darts of a vertex form a cycle of binary
constraints** — a cycle CSP, one variable per dart, solvable exactly by boolean matrix product and a
trace test. Values collapse from darts (mean domain 159) to `(a,b) = (tkey(lneig f), Q(rneig f))` key
pairs (mean 56, max 486).

Two levels were measured.

**Corner consistency** (is each corner individually satisfiable): **kills 0**. The branch breakdown
explains why, and it is not what I expected — the degenerate face lengths are not doing the work:

| corner satisfied by | count |
|---|---|
| c = 1 (face `x -> x`) | 708 |
| c = 2 (face `x -> f1 -> x`) | 9,050 |
| c >= 3 key reachability | 12,411 |
| **unsatisfiable** | **0** |

**Full cycle CSP** (is there ONE consistent assignment around the whole vertex): **kills 12**, 2,372 ->
2,360, exact over every type with nothing hitting the cost cap, in 0.17 s.

So the cyclic coupling is real — 12 vertex types are provably impossible for a reason no per-face or
per-pair test can see. It is also worth nothing, and AL asked the right question about why: the corona
costs a FIXED amount at startup but should save a PROPORTIONAL amount of search, so a wash at k=3 could
still win at k=4. Measured both, single core, interleaved reps:

| | fixed cost | k=3 total | k=4 total |
|---|---|---|---|
| without corona | 0.04 | 1.21 | 25.38 (25.37 / 25.28 / 25.49) |
| with corona | 0.10 | 1.26 | 25.49 (25.56 / 25.37 / 25.54) |

The fixed cost is 0.06 s. Subtract it and the SEARCH is unchanged at k=3 (1.17 -> 1.16) and unchanged
at k=4 (25.34 -> 25.39) — inside noise both times. **The benefit does not scale with k**, because those
12 types barely seed any tree. Catalogs identical (`de09102dc86ded53`/287, `0d6c89a535a16ad8`/678).

⚑ My first reading compared TOTALS at k=3 only and called it "net negative" from a 0.17 s startup
figure that was wrong. Measuring the fixed cost separately and then going to k=4 is what actually
answers the question. Single-shot k=4 numbers (24.79 vs 25.70) were pure noise; only the interleaved
reps are usable.

Kept in `scratchpad/vc-ceiling/eu_solver_corona.cpp`, not landed.

## Why static filtering is now finished

The remaining k=3 gap is 1.25 s against a 0.30 s oracle, and **most of it is unreachable by any sound
static filter**. The oracle mask is the 254 types that appear at k<=3 — a k-DEPENDENT set. A type that
first appears in a tiling at k=7 is genuinely realizable and no k-independent test may delete it. The
corona result is the evidence: an exact test for "can this vertex be surrounded at all" finds only 12
more impossible types out of 2,372, so the survivors are essentially all real.

The corona measurement is the evidence for this: an exact test for "can this vertex be surrounded at
all" finds only 12 more impossible types out of 2,372, and deleting them changes the search by nothing
measurable at k=3 OR k=4. The survivors are essentially all real.

Further gains must change axis:
- **Dynamic propagation.** Every filter here is static. The same face-closure algebra applied to the
  PARTIAL configuration during search asks a much stronger question — not "can this type occur" but
  "can it occur given what is already placed". That is maintaining arc consistency rather than
  preprocessing it, and it is where the CSP literature says the remaining factor lives.
- **Symbolic alpha**, still the one idea that changes what is enumerated instead of how fast.

## Remaining headroom

k=3 is now 2.71 s single-core against a 0.30 s perfect oracle — **9x left**, down from 26x before the
pair filter. At k=2 it is 0.13 vs 0.06, about 2x. The gap grows with k, so static filtering is still
not exhausted, but each rung is getting smaller.

The next rung is the corona: `lenscan` and the pair filter both treat each face independently, while a
real vertex must close ALL its faces simultaneously with shared neighbours. That is the test AL
originally described, and it is the first one that needs actual search rather than reachability
algebra.

## The dent budget is gone (2026-08-07)

`EU_NCBUDGET` capped noncounting (dent-fill) vertices at 8 by default. Removed, because the k<=3
star24full catalog contains tilings with **exactly 8** dent-fill vertices — the default sat ON the
observed maximum — and the search explores up to **12** in intermediate configurations. One more dent
in a real tiling and it would have dropped it silently, behind a warning that fires on every star run
and therefore gets ignored.

It was safe to remove because uncapped (B=99) refused ZERO times and produced the identical catalog at
k<=3, which makes uncapped ≡ B=99 there. The structural reason is the non-adjacency lemma: two 2-valent
vertices cannot be adjacent (AL's curvature argument, 2026-08-06), so dents cannot chain and their
number is bounded by the counting structure. We have no formal bound, so the cap is replaced by a
tripwire — the solver reports the largest dent-fill count it saw rather than refusing to exceed a guess.

`ncbudget_hits`, `ncbudget_blind`, the "COMPLETENESS NOT CERTIFIED" warning and the budget-fixpoint
ritual are all gone, as is the dead warning-grep in `run-oracle-pool.sh` / `run-oracle-parallel.sh`.
`EU_NCBUDGET` is now inert.

## Status

**Landed** in `tools/ctrnact-oracle/eu_solver.cpp`, 958 -> 1,178 lines. Gates on the final state:
`check-regular` PASS (byte-identical vs golden, 10/20/61/151/332/673); star24full
`cc1a4e57bde39378`/44, `0b6cb12bb7f5f797`/118, `de09102dc86ded53`/287; girih `305fcd18ffad74b2`/156
and composite-convex `96e4d8f860145cdc`/288 unchanged (filter correctly inert there);
`EU_NOFILTER=1` reproduces the unfiltered search at 17.09 s with the same digest. `pnpm build` clean
(its 2 warnings are a pre-existing dynamic `readFile` glob in `updates/page.tsx`).

Pre-landing backup: `scratchpad/landing2/eu_solver.cpp.before-face-filters`.

k=4 star24full is now the obvious next run — k=3 costs 1.25 s single-core. Parked at AL's instruction
until the filter work stops improving.

## star24full k=4, and the budget removal was load-bearing

**k=4 = 391 tilings.** Full catalog 44 / 74 / 169 / 391, **678 total**, digest `0d6c89a535a16ad8`,
**25.4 s single core** — no cap of any kind. Identical with and without the corona filter.

The dent tripwire reports the k=4 search exploring up to **17** dent-fill vertices, and the shipped
catalog itself contains tilings with far more than the old cap allowed:

| dents | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tilings | 398 | 84 | 82 | 40 | 22 | 19 | 6 | 10 | 7 | 5 | 2 | 3 |

`EU_NCBUDGET` capped dents at 8. **10 of the 678 tilings exceed it.** Running k=4 with this morning's
default would have shipped 668 and called it complete, behind a warning that fires on every star run
and is therefore ignored. Removing the budget was not tidying — it was the difference between a
complete k=4 catalog and a silently short one.

No external cross-check exists for k=4 either. Marek's solver on the 15° grid remains the only
independent check available for any of these counts.
