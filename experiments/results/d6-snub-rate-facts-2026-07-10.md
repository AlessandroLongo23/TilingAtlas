# D6-snub machine facts (2026-07-10, TA-lane) — the rate shortcut is dead; the word route is on

Sweep of all snub-grid vertex direction sets (15°-offset grid, gaps {60,90}, exact):
**29 sets = 24 strong (best up-edge sin ≥ sin75° ≈ 0.966) + 5 weak (best = sin45°), 0 below
√2/2** (re-confirms V7d). Weak-LANDING sets (containing 225° or 315°, i.e. reachable by a
weak climbing step) that lack a strong up-edge: **4, and every one contains an
adjacent-square (90°,90°) corner** — a tilted-square DOMINO.

Catalogue reality check (`figures/data/ctrnact.json`, λ₁² = 2+√3 exactly): **181 snub-band
tilings (k = 1..11), vertex species 3.3.4.3.4 (830×) and 3.3.3.4.4 (829×)** — the domino
vertices are real and everywhere from k = 2 up. So weak chains ride finite square strips;
"0.966-forcing" is refuted.

Two traps dodged (recorded so nobody re-falls):
1. The domino does NOT overlap its u-translate: support width 3/√2 ≈ 2.121 > λ₁ ≈ 1.932 is
   NOT an overlap criterion (u ∉ int(P−P): the 45°-frame components are (1.366, 1.366),
   and 1.366 > 1 fails the short axis) — the review's E-4 lesson, nearly repeated live.
2. An infinite square strip forces a 45°-direction period (else infinitely many vertex
   classes), which is LEGAL — the strip is not excluded by lattice arithmetic alone.

The route that remains (and the one the data endorses): the snub band is a two-letter
layered family — the catalogue ids are literally words (`02_34-5d_5f`, `03_34-5d2_5f`,
`04_34-5d2_5f2`, ...). Plan: E2/E3-style row classification on the 2cos15°-cylinder (row
types realizing the two species), then an exact word climb with pinned constants (the same
c₀-bypass as consolidation corollaries C1/C2). Discovery + completeness tool: slab-engine
increment 2 (15°-offset frame). Ledgered in `th10-D3-consolidation-2026-07-10.md` §3.2
(corrected) and `docs/WEIGHT_PROOF_DAG.md` (D6).
