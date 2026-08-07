# 78% of the star24full alphabet can never appear in a tiling (2026-08-07)

AL's idea: for regular polygons only 15 of the 21 angle-valid vertex configurations occur in a
tiling. If the star alphabet has the same kind of dead weight, test for it once and start the search
from a smaller set.

The idea is right. Measured on star24full: **47,611 of 60,927 vertex types (78.1%) are provably dead**,
and deleting them makes k=2 **9.8x faster** with a byte-identical catalog.

## Two corrections to the premise first

**The regular palette has no dead weight in our code, so it is the one case this cannot help.**
`tables/regular` holds 44 vertexdefs = 14 species (symmetry variants share a species), and all 14 occur
in tilings. The 21 -> 15 reduction already happened, but by TILE restriction, not by any test: the
palette is {3,4,6,12} (the 12-direction decision, CLAUDE.md), and every one of the six dead species
needs a polygon that is not in it — 3.7.42 (7, 42), 3.8.24 (8, 24), 3.9.18 (9, 18), 3.10.15 (10, 15),
4.5.20 (5, 20), 5.5.10 (5, 10). The 15th, 4.8.8, is the octagon case excluded by the same decision, so
14 is the correct count. Death scan on regular: **0 killed of 44**, as predicted.

**Level-1 filtering already runs at alphabet-generation time.** `gen_alphabet.py` applies the proven
point-adjacency lemma (no two star-point corners cyclically adjacent), `forbidden_adjacent_pairs` (any
ordered corner-class pair whose PLACED tiles collide as a bare 2-corner fan — the computed
generalisation of that lemma), and `EU_PRUNE_OVERLAP` on whole words. So the 60,927 are already the
survivors of "this vertex figure is geometrically valid standing alone". The idea below is the next
level: can it be SURROUNDED.

## The death certificate, which is cheaper than the corona test

The corona test AL described — place the vertex, expand, look for gaps — is a bounded search per type.
There is a cheaper sound condition that needs no search at all, and it reuses the fix-2 index already
in the solver.

`checkpart` demands, across a glue (x, y), that `lvert[rneig[y]] == CLASS_NEXT[lvert[x]]` in both
directions. Fix 2 turned that into a lookup: every (type, rep) is bucketed by (class at the rep, class
at the rep's right neighbour, mirroredness), and a free dart looks up one key. **The bucket ranges over
the entire alphabet**, and it also covers the glue-to-an-already-placed-vertex case, because that
vertex has a type too — its dart is Aut-equivalent to one of its type's reps, which carries the same
triple. In a complete tiling every dart is glued. Therefore:

> If any dart of type T has an EMPTY candidate bucket, T cannot appear in any tiling, at any k, in any
> geometry. Dart d could never be glued to anything.

Killing T empties more buckets, so iterate to fixpoint. That is arc consistency over the gluing
relation, and it runs in about a second.

```cpp
// EXPERIMENT — arc-consistency death scan.
static void deadscan() {
    const int N = (int)mainlist.size();
    std::vector<char> live(N, 1);
    int nlive = N;
    for (int round = 1;; round++) {
        std::vector<int> bcount(CAND.size(), 0);
        for (size_t b = 0; b < CAND.size(); b++)
            for (size_t j = 0; j < CAND[b].size(); j++)
                if (live[CAND[b][j].gr]) bcount[b]++;
        int killed = 0;
        for (int T = 0; T < N; T++) {
            if (!live[T]) continue;
            const vertexdef& V = mainlist[T];
            for (size_t g = 0; g < V.rneig.size(); g++) {
                int A = CLASS_NEXT[V.lvert[V.rneig[g]]];
                int B = CLASS_NEXT[V.lvert[g]];
                bool mir = (V.mirro[g] == (int)g);
                if (bcount[cand_key(A, B, mir)] == 0) { live[T] = 0; killed++; nlive--; break; }
            }
        }
        if (!killed) break;
    }
}
```

## How much dies, per palette

| palette | alphabet | live | killed | rounds |
|---|---|---|---|---|
| star24full | 60,927 | 13,316 | **78.1%** | 3 (47,247 + 362 + 2) |
| star24 | 5,739 | 3,097 | **46.0%** | 2 |
| isotoxal-star-z24 | 34,329 | 31,137 | 9.3% | 2 |
| regular | 44 | 44 | 0 | — |
| spherical | 125 | 125 | 0 | — |
| hyperbolic | 2,699 | 2,699 | 0 | — |

The fixpoint earns its keep: rounds 2 and 3 kill 364 more types that round 1 could not see.

⚑ **Not applicable to girih / composite-convex / composite-decomp as written.** The bucket key is only
sound when `CLASS_PREV == CLASS_NEXT` and NEXT is an involution (`BUCKET_OK`); those palettes have
p > 2 and fail it, `CAND` is never built, and this probe segfaults on them. They need the 4-bucket-union
form. That is a limitation of the probe, not a statement about those alphabets.

## Payoff, star24full, single core, user seconds

| k | full alphabet | AC-pruned | speedup | digest | blocks |
|---|---|---|---|---|---|
| 1 | 0.07 | 0.03 | 2.3x | `cc1a4e57bde39378` both | 44 |
| 2 | 15.90 | **1.63** | **9.8x** | `0b6cb12bb7f5f797` both | 118 |

Digests are the landed certificates from the nine-fix stack, so the catalog is unchanged. Stronger
than the digest: all 156 types that reach the k=2 catalog survive the scan (checked by index; an
earlier `comm` said 155 were killed and that was a shell error — `sort -n` breaks `comm`'s
lexicographic merge, and the correct set comparison gives 0).

Cumulative: k=2 star24full has gone from ~15.8 CPU-hours to **1.63 s** across the nine fixes plus this.

## The ceiling, and what is left

Masking the alphabet down to exactly the 156 types that reach the k=2 catalog — a perfect oracle no
static test could beat — runs k=2 in **0.06 s, 265x**. So arc consistency captures 9.8x of a 265x
ceiling.

The gap is exactly the level AL described. A type can pass arc consistency (every dart has SOME
possible partner) and still be impossible, because the partners cannot be chosen consistently all the
way around. Closing one incident FACE is the next sound test and it is bounded: `checkface` requires a
closed cycle to satisfy `count % p == 0 && L % count == 0`, so the face has at most L vertices, and the
class arithmetic constrains almost every step. Per-face-independent feasibility is a small search per
type; the full corona (all faces of a vertex simultaneously) is the expensive version and should only
follow if the cheap one leaves something on the table.

The 265x ceiling is measured at k=2 and is NOT achievable — it includes types that are alive but only
appear at higher k, which no k-independent test may remove. It bounds the opportunity, nothing more.

## Next

1. Land `deadscan()` as an unconditional startup pass, not an env flag. It costs ~1 s, it is sound, and
   `make check-regular` must stay byte-identical (regular kills nothing, so it will).
2. Generalise it to the `BUCKET_OK == false` palettes via the 4-bucket union.
3. Add the per-face closure test on top of the surviving 13,316.
4. k=3 star24full was killed at 90/200 shards on a 15–25 CPU-hour projection. At 9.8x on top of the
   4.8x from fixes 5–9, it should now be under half an hour of CPU. Worth running as the real gate:
   two digests at k<=2 is thin evidence for a filter claimed to hold at all k.
