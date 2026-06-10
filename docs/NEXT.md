# NEXT — one live action per party

Hand-curated, one line each. This is the *only* part of `pnpm status` that isn't derived — keep it to a
single line per party and update it when a baton passes. Everything else (`pnpm status`) is computed fresh.

- **CC** — **CB-5/CB-4/CB-6 LANDED (`fix/cb5-cb4-cb6` @ `74e03a9`, NOTES §34) — ALL review code items closed; the CB-4 guard caught a real reducedClassKey non-canonicality on first contact, fixed exact (`c802989`)**. Acceptance green (k≤2 byte-identical ×2; recert 61/61 + differential 0/2131) — awaiting AL: merge go + fresh k=3 sweep scheduling. Then: **OP-1→2→3 (TH-9 ✓)** — honour rem:orbitdedup's 3 constraints (exact orbit ID, blanket/coset rotations, orbit-aware CB-7 guard), then OP-9 re-measure.
- **TA** — **MERGED to thesis master (ff): master = `7d76b58`** — TH-1 + restructure + ST-1 + TH-9 + D-D bound + TH-3, scoped commits, 85pp clean post-merge; resources `9b0638e`. Remaining by value: TH-2/C1-Part-B; star lane waits on CC (TH-4 d_max, TH-13).
- **Alessandro (decision)** — **theorem-certified k=3 via D-D?** Sweep = δ≤34 ≈ 10¹²±1 nodes ≈ days on 8 cores with a parallelized generator (see `dd-size-bound-sharpened-2026-06-10.md`). If GO → CC: parallel subtree dispatch + δ≤28 calibration run + M2 realizer on survivors.
- **Alessandro** — one open call: TH-10 in-thesis vs future-work. (CB-9 push: done, AL-approved.)
