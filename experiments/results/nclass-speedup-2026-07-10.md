# nClassify speedup + correctness log (2026-07-10)

Replacing the wallpaper classification hot path (`WallpaperSymmetry.analyzeSymmetry`, ζ₂₄ dim-8 BigInt,
blind 24-candidate isometry search) with a rank-4 machine-int classifier over ℤ[ω] (ω = ζ₁₂). Motivated
by the symclass cost (k=11: 32 ms/tiling, 806 s for 24,459 tilings). Steps measured one at a time.

Correctness gate: labels (latticeShape, group, orbifold) must equal the baseline `analyzeSymmetry` on the
full k≤11 catalogue (`figures/data/ctrnact.json`, 47,854 tilings). Harness: `scripts/nclass-bench.ts`.

## Bug found + fixed while building the gate (not a speed step)

The baseline mislabeled some **pmm → cmm** (and the cm/pm pair analogously). `analyzeSymmetry.reflections`
decides "is this glide essential" by bucketing each axis's perpendicular offset to 2 float decimals and
string-matching a glide's bucket against the mirror buckets. A trivial glide sitting exactly on a mirror
(offset ≈ 0) formatted as `"-0.00"` while the mirror formatted as `"0.00"` — a float-ε sign flip — so the
on-mirror glide escaped the dedup and was reported as essential, flipping pmm to cmm. The tell:
`rectangular|cmm`, which is impossible (cmm requires a *centered* = rhombic lattice).

Fix: cm/cmm vs pm/pmm/pmg is now decided by the EXACT Bravais lattice (centered=rhombic ⇒ cm/cmm), the
textbook centering criterion, in BOTH `analyzeSymmetry` and `nClassify` — no float glide test in the
mirror cases. hasGlide is kept only where there is no mirror (pgg/pg), where it is exact. Also normalized
the `-0.00` offset bucket. Wallpaper tests: 24/24 pass.

Impact on earlier work: the k≤11 symclass CSV and the "weight by wallpaper group" chart were built with
the buggy labels (some pmm counted as cmm) → both the cmm and pmm curves need regenerating. The "weight by
Bravais lattice" chart is unaffected (lattice-shape classification did not change).

## Step 0 — baseline (ζ₂₄ dim-8 BigInt, blind)

Per-tiling: ~14 ms (k≤7 mixed), ~11.6 ms (first 500 of k=11). This is the number to beat.

## Step 1 — int dim-4 ℤ[ω], blind enumeration, render-geometry dropped

Same candidate enumeration as the baseline (all rotation/reflection powers, per-seed origin search); only
the arithmetic moved to machine int and the fundamental-domain float geometry (~half of analyzeSymmetry,
render-only) was dropped. `lib/classes/symmetry/nClassify.ts`.

| sample | tilings | baseline ms/tiling | nClassify ms/tiling | speedup | A/B |
|---|---|---|---|---|---|
| k≤7 (ctrnact.json[:2000]) | 2000 | 13.98 | 0.261 | **53.6×** | 2000/2000 clean |
| k=11 (cells-k11[:500]) | 500 | 11.57 | 0.181 | **63.9×** | 500/500 clean |
| **full k≤11** | **47,854** | **30.51** | **0.526** | **58.0×** | **47,854/47,854 CLEAN** |

Step-1 verdict: byte-identical labels to the (bug-fixed) baseline on the entire k≤11 catalogue, 58× faster.
The full symclass pass drops from ~24 min (baseline) / 806 s (k=11 alone, original) to 25 s. `pnpm build` clean.

Counts regenerated from correct geometry: k=1..11 = 10/20/61/151/332/673/1472/2850/5960/11866/24459
(A068599 exact; fixes the prior k=8=2849, k=9=5959 undercount). Both weight charts re-rendered from these.

## Step 2 — star-stabilizer candidate pruning (Fable's N)   [pending]

## Step 3 — C++ int32 in the oracle   [pending]
