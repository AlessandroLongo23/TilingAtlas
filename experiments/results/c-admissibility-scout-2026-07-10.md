# C-admissibility scout — 2026-07-10

Condition under test: C(Λ,S) = divisor-constrained orbit-class feasibility (per-orbit V_i | hol(Λ), full support, exact area). Candidates are the REAL post-P0/post-OP-3 lists. Fills native (USE_NATIVE_FILL=1).

Building k=3 seeds for {3,4,6,12} …
Built 449 seeds in 130.0s
Sampled 8/184 distinct seed names (stride 23).

## Seed 1/8: [3,3,3,3,3,3;3,3,3,3,6;3,3,3,3,6]
candidates=69 C-rejected=27 (39%) | fill=55.4s, on C-rejected=46.8s (85%) | hol2: 0/0 rejected, hol4: 18/39 rejected, hol8: 0/0 rejected, hol12: 9/30 rejected
SOUNDNESS violations (C-rejected but productive): 0 | mirror-vs-solve productive mismatches: 1
progress 1/8, elapsed 1.9m, ETA 13.0m (seed took 111.6s)

## Seed 2/8: [3,3,3,3,3,3;3,3,4,3,4;3,3,4,12]
candidates=80 C-rejected=36 (45%) | fill=0.1s, on C-rejected=0.1s (50%) | hol2: 0/0 rejected, hol4: 0/0 rejected, hol8: 3/3 rejected, hol12: 33/77 rejected
SOUNDNESS violations (C-rejected but productive): 0 | mirror-vs-solve productive mismatches: 0
progress 2/8, elapsed 1.9m, ETA 5.6m (seed took 0.3s)

## Seed 3/8: [3,3,3,3,6;3,3,3,4,4;3,4,6,4]
candidates=412 C-rejected=311 (75%) | fill=0.9s, on C-rejected=0.6s (68%) | hol2: 0/0 rejected, hol4: 216/282 rejected, hol8: 0/0 rejected, hol12: 95/130 rejected
SOUNDNESS violations (C-rejected but productive): 0 | mirror-vs-solve productive mismatches: 0
progress 3/8, elapsed 1.9m, ETA 3.2m (seed took 4.2s)

## Seed 4/8: [3,3,3,3,6;3,6,3,6;3,3,3,3,6]
candidates=79 C-rejected=21 (27%) | fill=2.2s, on C-rejected=0.1s (4%) | hol2: 0/1 rejected, hol4: 15/48 rejected, hol8: 0/0 rejected, hol12: 6/30 rejected
SOUNDNESS violations (C-rejected but productive): 0 | mirror-vs-solve productive mismatches: 0
progress 4/8, elapsed 2.0m, ETA 2.0m (seed took 5.0s)

## Seed 5/8: [3,3,3,4,4;3,4,4,6;3,3,6,6]
candidates=313 C-rejected=152 (49%) | fill=1.7s, on C-rejected=0.7s (43%) | hol2: 0/28 rejected, hol4: 48/150 rejected, hol8: 0/0 rejected, hol12: 104/135 rejected
SOUNDNESS violations (C-rejected but productive): 0 | mirror-vs-solve productive mismatches: 0
progress 5/8, elapsed 2.2m, ETA 1.3m (seed took 7.2s)

## Seed 6/8: [3,3,4,3,4;3,4,4,6;3,3,6,6]
candidates=313 C-rejected=152 (49%) | fill=1.5s, on C-rejected=0.6s (42%) | hol2: 0/28 rejected, hol4: 48/150 rejected, hol8: 0/0 rejected, hol12: 104/135 rejected
SOUNDNESS violations (C-rejected but productive): 0 | mirror-vs-solve productive mismatches: 0
progress 6/8, elapsed 2.3m, ETA 0.8m (seed took 6.8s)

## Seed 7/8: [3,12,12;3,3,12,4;3,3,4,12]
candidates=33 C-rejected=3 (9%) | fill=0.0s, on C-rejected=0.0s (19%) | hol2: 0/0 rejected, hol4: 0/18 rejected, hol8: 3/15 rejected, hol12: 0/0 rejected
SOUNDNESS violations (C-rejected but productive): 0 | mirror-vs-solve productive mismatches: 0
progress 7/8, elapsed 2.4m, ETA 0.3m (seed took 0.3s)

## Seed 8/8: [3,12,12;3,4,3,12;3,4,6,4]
candidates=12 C-rejected=0 (0%) | fill=0.1s, on C-rejected=0.0s (0%) | hol2: 0/0 rejected, hol4: 0/0 rejected, hol8: 0/0 rejected, hol12: 0/12 rejected
SOUNDNESS violations (C-rejected but productive): 0 | mirror-vs-solve productive mismatches: 1
progress 8/8, elapsed 2.4m, ETA 0.0m (seed took 0.4s)

# TOTALS
candidates=1311, C-rejected=702 (53.5%)
fill time=61.9s, on C-rejected lattices=48.9s (79.0%)
soundness violations=0 (MUST be 0), mirror mismatches=2 (should be 0)

# Post-run analysis (Fable, same session)

- **The 2 mirror-vs-solve mismatches are explained and benign**: both are `mirrorRaw=1, solveRaw=0`
  on **C-KEPT** lattices (hard seed det≈13.86 hex; seed-8 det≈36.19 hex). Cause: `solve()` dedups
  raw cells cross-lattice via `seenCanonical` BEFORE `onRawCell`, so a cell already found on an
  earlier lattice never fires the hook; the mirror fills each lattice independently. No bearing on
  soundness (and both rows are C=1 anyway).
- **The top 9 fill-time sinks are all C-rejected and all empty in BOTH paths**: hex (hol=12)
  lattices with det ≈ 31.2–33.8 on the hard seed, 4.5–6.0 s EACH — the "explores deep and closes
  into nothing" fills of the §49 profile. The divisor condition kills them without running the DFS:
  their exact areas are only realizable with some per-orbit class count V_i ∉ {1,2,3,4,6,12}.
- **Headline**: 0/1311 soundness violations; 53.5% of post-P0 candidates C-rejected; **79.0% of
  total native fill time (85% on the profiled hard seed) sits on C-rejected lattices** — killable
  by a hash lookup before the fill, before any in-fill P3 effect on the survivors.
- ⚠ CSV format note: this run's CSV used `;` as separator while seed names contain `;` — parse with
  the first 3 `;`-fields joined as the name (k=3), or re-run (the script now writes tab-separated).
  The md summary above is computed in-process and unaffected.
