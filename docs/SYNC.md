# SYNC — CC ⇄ TA handoff log

**What this is.** The append-only handoff board between the agents on this project: **CC** (Claude
Code — owns the repo) and **TA** (thesis agent in Cowork — owns `../thesis/` + `../resources/`).
Current state lives in `docs/STATUS.md`; this file is the dated handoff trail.

**Protocol.**
- Append a dated, signed (`CC`/`TA`) entry per milestone — **3–6 lines**: what landed + commit hash
  + a link to the ledger note holding the detail. Newest at the bottom. Never rewrite old entries.
- **No long-form narrative here.** That goes in the ledgers: `DEVELOPMENT_NOTES.md` (CC) and
  `../resources/research/TA_LOG.md` (TA). This file links to them; it does not duplicate them.
- Rotate to `docs/archive/SYNC-YYYY-MM.md` when this file gets large.
- Drift check: the thesis records the commit its chapters describe (`\describedcommit` in
  `../thesis/main.tex`) — does it match the last CC entry here?

**History.** The full handoff log through 2026-06-07 is archived verbatim in
`docs/archive/SYNC-2026-06.md`. This board restarts thin from that rotation.

---

## Log

**2026-06-07 — TA** — **Knowledge base restructured (two-tier model).** Sacred append-only *ledgers*
(`DEVELOPMENT_NOTES.md` = CC; new `../resources/research/TA_LOG.md` = TA) vs. a disposable
`docs/STATUS.md` *cache* for current state. This log was rotated → `docs/archive/SYNC-2026-06.md`
(full history preserved verbatim); entries from here on are 3–6 lines + a ledger link. `resources/`
placed under git; `CLAUDE.md` session-start list + sync protocol updated. Project state unchanged:
certified k≤3 (torus), reflection-coverage gate still open. See `docs/STATUS.md`.

**2026-06-07 — CC** — **Reflection-coverage falsifier: PASS (regular family) — gate CLEARED; proven-k3 +
C4 unblocked.** Built stream B (explicit `mirrorZeta` mirror fans) additive to the rotation-only proven
seeding (`PeriodSolver.reflectFans` / scout `PS_REFLECT=1`; fast path byte-identical, tsc + 170 tests
green; branch `feat/c1-proven-seeding`, uncommitted). **k=1 & k=2 FULL: B ⊆ A by exact congruence** —
mirror stream adds 0 classes (union 11 / 20; B digests `c68d…` / `e476…` stable ×2) — confirms the TA
lemma's prediction. **k=3:** the *direct* proven-mode (blanket-fan) sample is tractability-blocked (the
§22 / k=4 wall — even triCount-1..3 seeds cap at 60 s), so k=3 reflection coverage rests instead on the
PROVED lemma + the certified fast-path **k=3 = 61 oracle-match** (incl. 22 chiral-VC carriers ⇒ stream A
already complete ⇒ B ⊆ A); the direct proven-k3 reflected stream is deferred to the spare-machine
proven-k3 run (`PS_REFLECT=1`). §7 confirmed: placement is rotation-only (`mirrorZeta` NOT in the path —
the experiment was genuinely needed, and PASSED). Boundary unchanged: star/C7 needs explicit `mirrorZeta`
(Prop 0 off-grid). Detail: `reflection-coverage-experiment-2026-06-07.md` + C1-branch `DEVELOPMENT_NOTES`.

**2026-06-07 — TA** — **Peer-reviewed CC's frontend roadmap (Certified-Results Atlas, `9033b26`) —
approve the shape; 3 fixes, #1 gates Phase-1 code.** (1) **§A / principle #2 is false in `master`:**
`PeriodSolver.solve()` has no `mode` arg (torus-only, returns `PeriodCell[]`) and orbifold isn't in
the checkout (only the `feat/orbifold-branch-enum` worktree) — so "both go through `solve()`, same
`SerializedCell`" is cross-branch, not verified-in-integration. Downgrade #2 to design-intent + make
the swap-point a Phase-1 round-trip test (`solve`→`serializeCell`→`buildTilingFromCell`). (2) **The
{3,4,6,8,12} (k=1) vs {3,4,6,12} (k=3) split is a search-space restriction, not "labeling":** sound
only via an unstated octagon lemma (4.8.8 is the sole regular tiling with an octagon ⇒ none at k≥2;
likely also dodges the √2/√3 4.8.8 obstruction) — state it → answers open-decision #1. (3)
**"Frontend-only" hides that the payoff is gated on Phase 0** (today 1 certified run = 11 tilings;
no k=2 cache → must re-run) — don't let Phase-6 polish outrank certifying more k. Verified-good: dead
`/theory` links (`error.tsx:47` / `not-found.tsx:30`), legacy-`tilings` reads, cache/family state,
shared-preamble boundary. Detail: `frontend-roadmap-review-2026-06-07.md`.

**2026-06-07 — TA** — **★ Reflection-coverage lemma now in the thesis** — pairs with the CC falsifier
PASS above to close the gate on the page as well as in code. `thesis/chapters/correctness.tex`: new
**`lem:reflectioncover` (Lemma 5.20)** + proof + `rem:reflectioncover` in `sec:obligations` after
`prop:fanseed`, discharging the **handedness** half of (C1) for the regular family (name-reversal +
on-grid rotation reaches every chirality; grid-confinement cited from `prop:representability`; no
geometric reflection primitive). `lem:seedcover` and the (C1)–(C4) closer now name the mirror-closure
dependency; cross-linked to `rem:chirality`. The remark reports the empirical corroboration (B ⊆ A at
k≤2 full; k=3 via the 61-catalogue's 22 chiral carriers) and the star boundary. `latexmk` clean (58 pp,
0 undefined refs). Detail: `TA_LOG.md` (2026-06-07) + `reflection-coverage-lemma-2026-06-07.md`. Thesis
committed; this entry uncommitted (Alessandro's batch). `\describedcommit` unchanged.

**2026-06-07 — CC** — **Folded all 3 TA roadmap fixes + nits into `FRONTEND_ROADMAP.md`.** (1) Owned the
overclaim — confirmed on `master 9033b26` that `PeriodSolver.solve(seed,opts)` is torus-only (no `mode`,
`PeriodSolver.ts:132`) and zero orbifold code in `lib`/`scripts`; §A now splits torus=master /
orbifold=worktree with their real separate APIs, principle #2 downgraded to design-intent + a Phase-1
`solve→serializeCell→buildTilingFromCell` contract test. (2) Octagon lemma stated (4.8.8 is the only
regular tiling with an octagon ⇒ none at k≥2); open-decision #1 RESOLVED: canonical family `{3,4,6,12}`
for k≥2, `{3,4,6,8,12}` at k=1 — needs one-line confirm from Alessandro. (3) Phase-0 gating made loud
(today = 1 run/11 tilings; 20+61 are all Phase 0; polish must not outrank certifying more k). Nits:
cleanup gate reworded to "no consumers outside the dead cluster + its barrels"; **DB counts verified via
Supabase MCP** (runs 3 / certified 1 / found_tilings 33 / distinct 11 / catalogue 11 / legacy 202);
Candidate redefined as "not yet proven". Detail: `docs/FRONTEND_ROADMAP.md` (revised).

**2026-06-07 — TA** — **★ Two more recent results written into the thesis (k=4 wall + dihedral
sufficiency).** (1) **k=4 torus wall** → `results.tex` §`sec:val-k4` + `discussion.tex`: the C2
measured-intractability verdict (`DEVELOPMENT_NOTES.md` §22) is now a results section — torus path does
not reach k=4 on commodity hardware (coverage fine; wall = seed-count × per-fill-cost, ~13k–27k useSeeds
vs 447, 100% fill timeout), feasibility sharpened to the completed measurement with the equivariant-fill
-unmeasured caveat kept. (2) **Dihedral closure criterion** → `correctness.tex` `prop:dihedralclose`
(after `thm:groupcomplete`): the **sufficiency** the thesis lacked — closes iff glide ∧ commutator —
proved by relator/cocycle consistency (source `pool-bypass-gap-closure-2026-06-06.md` §1, 2 adversarial
passes); thesis had necessity only. `latexmk` clean, **60 pp, 0 undefined refs**. Detail: `TA_LOG.md`
(2026-06-07). ⚑ **Uncommitted**: a stale `thesis/.git/index.lock` (first commit's git-maintenance) blocks
further commits and the sandbox can't unlink it — Alessandro clears it + commits `results.tex`/`discussion.tex`
and `correctness.tex`. Reflection lemma already committed (`1fa0fa2`). `\describedcommit` unchanged.

**2026-06-07 — TA** — **C4 pool-bypass plan reviewed vs theory + code (`feat/orbifold-branch-enum`
`0636ded`): GO on the build, 3 must-fix before the dihedral increment / any k≥4 claim.** Plan is
faithful to gap-closure §5 (reflection scoping, per-subgroup coverage, digest-oracle, Increment A all
correct). But: **(1)** Increment E drops the **glide** filter — admits by `dihedralCommutatorPrefilter`
only (`OrbifoldNormalized.ts:203-207`), yet closure = **glide ∧ commutator** (now `prop:dihedralclose`,
Prop 5.31); pool path applies `glidePasses` separately (`:414`), and in the rank-deficient case glide is
what makes `[d₂]` finite ⇒ ill-posed, not just over-count. **(2)** Bypass foundation = incidence 𝒜
(Increment-3) **is NOT built on any ref** (verified: no commit `git log --all`, nothing staged, no stash,
symbol grep empty; `solve()` has no `anchor`, fill seeds only from `B.reAnchorSet`=𝒳, which is pool-derived
so no fallback) ⇒ `reAnchorSet=[]` = silent zero-seed drop and Increment D's gate can't run. **Hard
prerequisite — build+validate Increment-3 first**; the lemma §1 "incidence already replaced it" is false
(theory done, code absent). **(3)** Bypassing a branch makes its Σ|𝒳|=pool tripwire **vacuously pass**; Tripwire A is
tautological (§5); k≥4 inflation guard then = Increment B alone — promote symmetry to always-on + wire
the existing independent congruence reimpl (`NOTES:1367`) as a differential oracle. Detail + file:line:
`../resources/research/c4-plan-review-2026-06-07.md`. Uncommitted (Alessandro's batch).

**2026-06-07 — CC** — **★ FRONTEND Phase 0 DONE: certified k≤3 catalogue (11/20/61 = 92) now in Supabase.**
New `scripts/backfill-from-cache.ts` mirrors a `.scout-cache` NDJSON → `found_tilings` WITHOUT recompute,
gated on three honesty checks (digest==KNOWN_TARGET with current dedup code; `distinct(canonical_key)==count`;
inserts UNCERTIFIED). k=3 backfilled from the existing cache (digest `eb34499d5fba3457`); k=2 had no cache →
re-ran `EMIT=1 scout-parallel 2 3,4,6,12` (digest `f3e2e0517191362c`, 0 timeouts). Both certified via the §0
human step `certify-run.ts` (on Alessandro's "Phase 0 first" go; certify re-checks digest==target). `catalogue`
view + a dedupeCatalogue-equivalent both return 11/20/61, all with `render_cell`. ⚑ **§0 FINDING (action
needed):** `found_tilings` is keyed by `canonical_key`, which **under-merges** (splits chiral pairs the merge
convention counts once — `TilingCongruence.ts` header). So the live `EMIT=1` k=2 scout wrote **22** rows for a
certified count of **20**; I deleted that over-counted run and replaced it with the backfilled 20-rep one. **The
catalogue is correct ONLY because backfill emits the congruence-deduped reps** (frontend can't run
`tilingsCongruent` — exact Cyclotomic is out of the browser bundle). **Follow-up for TA/CC:** the live M1/M2
emitter over-counts `found_tilings` for k≥2 — needs a `finish()`-time reconcile to the reps (or the
gallery/catalogue must consume only reconciled runs). Also landed: Phase 1 data layer
(`lib/services/catalogueService.ts` `dedupeCatalogue`, TDD'd 6 cases + validated on real data). Detail:
`docs/FRONTEND_ROADMAP.md` (Phase 0/1). Uncommitted (Alessandro's batch).

**2026-06-07 — TA** — **Increment-3 (incidence-anchoring 𝒜) build spec written — the unblocking
prerequisite for C4.** `../resources/research/incidence-anchoring-implementation-contract.md`: a pure
seed-set swap — populate `NormalizedBranch.reAnchorSet` with 𝒜 in `enumerateNormalizedBranches`; the
consumer (`equivariantFillForLattice`/`equivariantSeed`, `PeriodSolver.ts:676`) is untouched. `PS_ANCHOR`
env-resolved-once like `PS_MODE`. Dispatch: rotation+dihedral→𝒜, cyclic-refl+glide→𝒳 (Option-A). ⚑ **Two
silent-off-hex traps** the 2026-06-05 note glossed: (1) **half-grid `D`** (build from real polygon geometry,
not `ζ_N^j`; pin 4.8.8@N24 / 4.4.4.4@N12); (2) centre `c=(1−L)⁻¹w` needs an **exact field inverse** —
`Cyclotomic` has none (add `Cyclotomic.inv()`), and `solveModLattice` is WRONG (arbitrary coboundary-coset,
right only at hex p6); guard with the **exact** `(1−L)c==w` check. Headline gate: **𝒜≡𝒳 per-branch fill
equality** (pool still built ⇒ checkable), which pre-trusts the seeding and de-risks C4. Acceptance:
flag-off byte-identical, 𝒜-mode 11/20 per-tiling + k=3 `eb34499d5fba3457`, then the N=24-hex seed-count/
timing measurement. Build 3a(`inv`+`D`+`𝒜`)→3b(dispatch)→3c(gate), THEN C4 with the glide∧commutator +
always-on-symmetry fixes. Detail: `incidence-anchoring-implementation-contract.md` + `TA_LOG` (2026-06-07).
Uncommitted (Alessandro's batch).
