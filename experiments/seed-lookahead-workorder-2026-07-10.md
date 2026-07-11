# Seed forced-collapse lookahead — measurement scout (2026-07-10)

**Owner: CC. Requested by AL (idea + by-eye evidence in
`experiments/results/seeds-k3-grid-2026-07-10.pdf`, seed [33]). Status: OPEN.
Measurement only — no proven-path semantics change.**

**One-liner:** quantify how many emitted seeds are *locally dead* — killable by bounded unit
propagation (forced-collapse lookahead) on the frontier — before deciding whether a seed-level
prune or a fill-level entropy check earns a place in the pipeline.

## 0. Context — what exists, what's new

Depth-0 entropy checking already exists: `SeedBuilder` forward-checks every open vertex during BFS
expansion (entropy 0 ⇒ prune, `SeedBuilder.ts` `expandNode`) and again at emission
(`passesFinalVertexCheck`). So every *emitted* seed has entropy ≥ 1 on its whole frontier — which is
why the k=3 grid PDF shows no visible dead vertices. The fill (`PeriodSolver.torusFill`) has NO
entropy logic: nearest-origin vertex selection, contradictions only as angular over-fill or
disallowed surrounded VC. NOTES §43 names "earlier CONTRADICTION detection in the DFS (constraint
propagation / lookahead)" as the unaddressed lever for the dead-end tail class.

New here: depth-n propagation. Collapse entropy-1 (forced) vertices — each forced completion is
implied by the patch, so a contradiction reached through forced moves only kills the seed for every
lattice at once. Soundness rests on the completion enumeration being exhaustive (the t3007/NOTES §29
precedent is the cautionary tale), which is why the scout reuses the SAME enumerator as the
historical forward check (`SeedBuilder.enumerateVertexCompletions`, refactored out of
`canAnyVCFitAtVertex`, gated behavior-identical on the emitted seed lists k=1/2/3).

The n-cap is mandatory: forced collapse can propagate forever (the settled octagon lemma — one
octagon forces the whole 4.8.8 tiling deterministically).

## 1. The scout

`scripts/seed-lookahead-scout.ts` — per emitted seed, loop:

1. Frontier = `computeAvailableVertices`. Surrounded vertices: emerging VC (heading-ordered — §29)
   must be in the set, else KILL; allowed ⇒ *promote* to a placed VC (zero-tile forced move).
2. Open vertices: entropy via `enumerateVertexCompletions(max=2)` — distinctness by ADDED polygon
   set. 0 ⇒ KILL. 1 ⇒ forced candidate.
3. No kill: collapse the canonical forced vertex (nearest-origin, exact-key tiebreak), budget-capped
   (default 16 collapses); stop at an all-entropy≥2 wall or budget or per-seed time cap (⚑, counted
   separately, never a kill).

Verdict per seed: killed@depth / survived (wall | budget | timecap), collapses, promotions, ms.
CSV + synchronous log per CLAUDE.md.

## 2. Soundness gates (in the scout) — CORE-containment semantics (corrected 2026-07-10)

**The scout's claim is CORE-deadness**: no plane tiling contains the seed's *rigid core* (the
specific k-VC adjacency SeedBuilder emitted). `PeriodSolver.solve()` ALSO emits cells seeded from
each VC's single-vertex **fan** on lattices too small to hold the core (§13.4 fallback,
`PeriodSolver.ts` `fanCoreSets`) — those cells need not contain the core. First-run lesson: the
naive gate ("killed seed has artifact cells ⇒ failure") accused 4 kills; decoding showed all their
cells have |det| < core area (fan-path with certainty) and none contain the core mod Λ. The kills
stand; the gate was measuring the wrong claim.

- `ARTIFACT=<resume ndjson>`: a kill is refuted ONLY by an artifact cell that CONTAINS the killed
  seed's core mod Λ (float lattice-membership on centroids). Fan-path-only cells are logged as
  info. (k=3: `.scout-cache/k3_3.4.6.12_cap0.ndjson`, idx-aligned — same deterministic seed order
  as scout-worker/probe-pipeline; idx-range checked, cross-check voided on mismatch.)
- `VERIFY_KILLED=1` (k≤2): run the real `PeriodSolver.solve()` on every killed seed — no emitted
  cell may contain the core. Timeout with 0 cells = INCONCLUSIVE, never PASS.

**Consequence for any future prune (binding):** a core-dead seed's fills cannot simply be skipped
wholesale — its FAN fills produce real certified tilings (seeds 48/50/126/128 at k=3 prove it).
Sound prune semantics are one of: (a) skip only the CORE-seeded fills of a killed seed, keep the
fan path; or (b) skip the whole seed only when a same-set sibling survives (fans depend only on VC
types and candidate lattices only on the polygon multiset, so siblings run identical fan fills —
observed: idx 48 and 50 emit byte-identical fan cell sets). Either way this is a completeness
knob: flag + ⚑ + digest/bijection acceptance before any default.

## 3. Deliverables

- Kill fraction per k ∈ {2, 3} + kill-depth histogram (kills within ≤ 1/2/4/8/16 collapses).
- Scout cost (per-seed ms) — must be negligible vs the per-seed solve cost it would save.
- Soundness: k=2 zero-emission verification result; k=3 artifact cross-check result.
- Honest verdict: does the killed-seed share justify a `SEED_LOOKAHEAD=n` flag in the pipeline
  (Exp-B-style digest acceptance), or is the fill-level entropy check (gap-arithmetic + ring-match
  in `analyze`) the better home for the idea? Prediction on record: kill fraction real but modest;
  the k=3 wall (3⁶ closure-storms + per-lattice dead-ends) is mostly LIVE seeds, untouchable at
  seed level.

## 4. Guardrails

- The refactor (`enumerateVertexCompletions`) must be behavior-identical: emitted seed lists
  k=1 (15), k=2 (40), k=3/{3,4,6,12} (449) byte-identical pre/post (gate artifacts in the session
  scratchpad), `pnpm build` clean, seed-touching tests green.
- Scout kills change NOTHING downstream today. Any future pipeline flag is a completeness knob:
  default off, ⚑ banner when on, digest/bijection acceptance before any default flip.
- Time caps in the scout are survivorship, not kills — a capped seed is reported survived/timecap.
