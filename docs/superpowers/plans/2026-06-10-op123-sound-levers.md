# OP-1 / OP-2 / OP-3 Sound-Levers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the mandated OP-1 → OP-2 → OP-3 sequence from `docs/review-2026-06-09/04-optimizations.md` on the live torus path, each with its own digest-disciplined acceptance, producing the OP-9 measurement inputs. Expected k=3 wall-clock delta is modest (fills are conserved); the deliverable is the OP-9 reconciliation inputs and the corrected k=4 verdict basis, not a speedup — the Task 10 closeout docs must not claim a speed win the measurements won't support.

**Architecture:** Three serialized changes to `lib/classes/algorithm/PeriodSolver.ts` (+`LatticeEnumerator` helpers): (OP-1) the theorem-backed prop:typeprune closed-cell filter + V<k gate short-circuit at the torus-fill accept site; (OP-2, honest torus scope) digest-neutral instrumentation — Σ work-items vs distinct lattices per holohedry class (the OP-9 feed) + candidate-cache counters + a pool sub-cache — the branch-enum memoization half is orbifold-lane-only (not on master) and is recorded as deferred-with-reason; (OP-3, stage 1) grid-isometry orbit dedup of **oblique (hol=2) candidates only** with explicit rotation/reflection seed coverage per `lem:orbitdedup`, honouring all three `rem:orbitdedup` constraints. The oblique-only staging reconciles TH-9's acceptance (byte-identical k≤2, `03-theory-obligations.md:350`) with OP-3's re-baseline acceptance (`04-optimizations.md:153`): at k≤2 the oracle has 0 oblique tilings, so the reduction provably cannot change the final catalogue there.

**Tech Stack:** TypeScript (Next 16 repo, but all changes are server/CLI-side), Vitest, `pnpm tsx` script harnesses, exact arithmetic via `Cyclotomic`/`Surd`.

---

## Non-negotiable doctrine (applies to every task)

- **After every code change:** `pnpm build` must pass (CLAUDE.md workflow rule). `pnpm tsc --noEmit` for fast iteration, but build before claiming done.
- **Digest discipline** (04-optimizations.md header): decisive-path changes are verified against the certified digests. Acceptance commands:
  - k=1 probe: `pnpm tsx scripts/probe-pipeline.ts 1` → must print `COMPOSITION digest=6f9ca9cf2d16c75f count=11` (~1 min)
  - k=2 probe: `pnpm tsx scripts/probe-pipeline.ts 2` → must print `COMPOSITION digest=f3e2e0517191362c count=20` (~10 min)
  - k=3 certified sweep: `pnpm tsx scripts/scout-parallel.ts 3 3,4,6,12 0 8 fresh` → 449/449 seeds, **0 timeouts**, count=61; baseline digest `99919f42a7b58e76` (~2h05m on 8 workers)
  - k=3 per-tiling oracle: `pnpm tsx scripts/recert-oracle-match.ts` (reads `.scout-cache/k3_3.4.6.12_cap0.ndjson`) → `★ PASS — 61/61 per-tiling bijection` (~11 min)
- **Expected digest outcomes** (verify, never assume; any UNEXPECTED change = loud stop, investigate before proceeding):
  - OP-1: k≤2 byte-identical expected (no strict-subset-support cell can pass the k-gate at k≤2 — all 20 two-uniform tilings have 2 distinct VC types, so occurring ⊊ allowed ⇒ gate-rejected/primitivity-rejected anyway). k=3 digest MAY legitimately change (22 of the 61 tilings have only 2 distinct types; P2 kills their cross-seed duplicate certifications, which can change the min-canonicalKey class representative). If it changes: one-time re-baseline commit containing BOTH the new digest AND the 61/61 oracle PASS log.
  - OP-2: byte-identical at ALL k (pure instrumentation/memoization). Any change = bug.
  - OP-3 stage 1: k≤2 byte-identical REQUIRED (TH-9 acceptance: a changed k≤2 digest = loud stop). k=3 digest MAY change (the 2 oblique tilings t3046/t3055 may be emitted as different fundamental-domain representations); same re-baseline procedure.
- **Sweeps:** log synchronously to `experiments/results/<name>-<date>.log` (CLAUDE.md experiments doctrine: progress + ETA, human-readable — `tee` the scout output). Run ONE sweep at a time; the machine is shared with a parallel CC session (CB lane) — announce in chat before starting each ~2h sweep. **Priority rule (AL 2026-06-10): if the D-D k=3 GO lands while this lane runs, the D-D sweep owns the machine — these acceptance sweeps queue behind it. Implementation tasks are unaffected.**
- **F3 loud-cap sweep watch (rider, AL 2026-06-10):** the buildBlock index-cap assertion and the maxCellPolys ≥ 24k default are ALREADY on master (`b8fc197`, lem:fillreach F3a/F3b — verified, do NOT re-implement). Every acceptance sweep in this plan doubles as their empirical verification: after each sweep, `grep -c "INCOMPLETE-REGION (block index cap)\|INCOMPLETE-REGION (maxCellPolys)" <sweep log>` — expected **0** (TA-measured worst requirement 16/19/23 at k=1/2/3 vs cap 60). Any emission = loud stop, report immediately before proceeding.
- **Ledgers:** per-OP acceptance = one SYNC entry (3–6 lines, signed CC) + a DEVELOPMENT_NOTES section entry (next free §number; §33 is taken). STATUS/NEXT updated at the end. Never edit `../thesis/` or `../resources/` (TA-owned).
- **Do not commit this plan file** (it is session tooling; the ledgers carry history).
- **Star seeds:** every new prune/reduction in this plan is gated OFF for star seeds (`ctx.starTiles.length > 0` / `seedHasStar`) — P0/P1 doctrine, rem:orbitdedup scope note (star transfer needs rem:starhandedness, TH-13 open).

## File map

- Modify: `lib/classes/algorithm/PeriodSolver.ts` — OP-1 (accept site + certificate out-param + diag), OP-2 (census callback + cache counters), OP-3 (orbit-aware seeding + CB-7 guard)
- Modify: `lib/classes/algorithm/LatticeEnumerator.ts` — OP-2 pool sub-cache; OP-3 orbit-grouping helper (exports `gridImageBasis`, `groupIntoGridOrbits`)
- Create: `scripts/lattice-census.ts` — OP-2 aggregation (Σ vs distinct per holohedry, the OP-9 table input)
- Modify: `scripts/probe-pipeline.ts`, `scripts/scout-worker.ts` — wire the census callback behind `PS_LATTICE_CENSUS=1`
- Test: `tests/period-solver.test.ts` (extend), `tests/lattice-enumerator.test.ts` (extend), `tests/lattice-orbit-dedup.test.ts` (new)
- Docs: `docs/review-2026-06-09/04-optimizations.md` status column; `docs/DEVELOPMENT_NOTES.md` (new §); `docs/SYNC.md` (append-only); `docs/STATUS.md`, `docs/NEXT.md` (cache, final)

---

### Task 0: Worktree + baseline verification

**Files:** none (setup)

- [ ] **Step 0.1: Create the isolated worktree off master**

```bash
git -C /Users/alessandro/Desktop/University/Thesis/TilingAtlas worktree add \
  ~/.config/superpowers/worktrees/TilingAtlas/op123-sound-levers -b feat/op123-sound-levers master
cd ~/.config/superpowers/worktrees/TilingAtlas/op123-sound-levers
pnpm install
```

(Worktree lives OUTSIDE the repo ⇒ no vitest glob leakage into the main checkout. The main checkout stays on `feat/m2-realizer` with the other session's uncommitted docs — do not touch it.)

- [ ] **Step 0.2: Baseline build + targeted tests**

```bash
pnpm build
pnpm vitest run tests/period-solver.test.ts tests/lattice-enumerator.test.ts tests/tiling-congruence.test.ts
```

Expected: build clean, tests pass. If `pnpm build` fails on a fresh master worktree, STOP — report, don't fix unrelated breakage here.

- [ ] **Step 0.3: Baseline k=1 probe (sanity, ~1 min)**

```bash
pnpm tsx scripts/probe-pipeline.ts 1 2>&1 | tee experiments/results/op123-baseline-k1-$(date +%F).log
```

Expected: `COMPOSITION digest=6f9ca9cf2d16c75f count=11`.

---

## OP-1 — prop:typeprune closed-cell filter + V<k closure check

Spec: `04-optimizations.md` §OP-1. Proof: `../thesis/chapters/correctness.tex:731-751` (prop:typeprune, two-sided). The mid-fill half is explicitly DEFERRED (spec item 3). Do NOT touch the gate's 7×7 window/radii (spec item 5).

### Task 1: Certificate occurring-type collection

**Files:**
- Modify: `lib/classes/algorithm/PeriodSolver.ts` (`isCompleteTiling`, ~line 1074)
- Test: `tests/period-solver.test.ts`

- [ ] **Step 1.1: Write the failing test**

Append to `tests/period-solver.test.ts` (mirror its existing imports/seed-build conventions — it already builds k=1/k=2 seeds and calls `solve`):

```ts
describe('OP-1 prop:typeprune', () => {
  it('isCompleteTiling reports the occurring VC-name set via the out-param', () => {
    // Use any k=1 seed that emits (e.g. the 3.3.3.3.3.3 seed from the existing k=1 suite setup).
    // Drive solve() with onRawCell to grab a certified cell, then re-certify via
    // certifyExternalCell-style ctx and assert the collected set is non-empty and ⊆ allowed.
    // (Exact wiring: reuse the test file's existing seed fixtures; the assertion that matters:)
    //   const occ = new Set<string>();
    //   solver['isCompleteTiling'](cell.cellPolygons, ctx, occ);   // private access via index — match file conventions
    //   expect(occ.size).toBeGreaterThan(0);
    //   for (const n of occ) expect(ctx.allowed.has(n)).toBe(true);
  });
});
```

If the existing test file has no reusable ctx fixture, instead test through the public path: run `solve` on a k=2 seed whose allowed set contains `3,3,3,3,3,3` plus a second VC and assert `diag.p2Skipped > 0` after Task 2 (then this step's test is folded into Task 2's test — acceptable; keep ONE failing test driving the implementation).

- [ ] **Step 1.2: Run it, verify failure** — `pnpm vitest run tests/period-solver.test.ts` → FAIL (param doesn't exist / counter undefined).

- [ ] **Step 1.3: Implement the out-param**

In `isCompleteTiling` (PeriodSolver.ts:1074):

```ts
isCompleteTiling(reps: Polygon[], ctx: FillCtx, occurringOut?: Set<string>): boolean {
```

and at the t≥3 vertex-judgement site (after `const name = canonicalVCName(this.vcRingNames(v, polys));`, line ~1115):

```ts
			const name = canonicalVCName(this.vcRingNames(v, polys));
			if (!ctx.allowed.has(name)) return false;
			occurringOut?.add(name);
```

No other change. `certifyExternalCell` (line 1063) is untouched — optional param defaults preserve its behavior.

Soundness note for the commit message: every Λ-vertex-class has a representative within `judgeR = cellDiam + 0.5` of the origin (one full cell), and the certificate judges all of them — so the collected set is the COMPLETE occurring type set of the periodic tiling, not a sample.

- [ ] **Step 1.4: Build + test** — `pnpm build && pnpm vitest run tests/period-solver.test.ts` → PASS.

- [ ] **Step 1.5: Commit** — `git commit -m "feat(solver): OP-1 prep — isCompleteTiling optionally reports the occurring VC-name set"`

### Task 2: P2 closed-cell filter + V<k short-circuit at the accept site

**Files:**
- Modify: `lib/classes/algorithm/PeriodSolver.ts` (`PeriodSolverDiag` ~221, `emptyDiag` ~1428, `torusFill` accept site ~913-921)
- Test: `tests/period-solver.test.ts`

- [ ] **Step 2.1: Write the failing test**

```ts
it('P2 discards strict-subset-support closed cells before primitivity (pure-3⁶ supercells in a multi-VC k=2 seed)', () => {
  // Pick a k=2 seed whose VC set includes 3,3,3,3,3,3 (the live Finding-2 witness class:
  // pure-triangle 1-uniform supercell completions inside multi-VC k=2 seeds).
  // Reuse the existing k=2 seed-build fixture from this file; find a seed with
  // '3,3,3,3,3,3' among allowed names and a second distinct VC.
  const { cells, diag } = new PeriodSolver(2).solve(seed, { maxMs: 120000 });
  expect(diag.p2Skipped).toBeGreaterThan(0);          // the filter fired
  expect(cells.length).toBe(EXPECTED_CELLS_FOR_SEED); // emitted catalogue for this seed unchanged
                                                      // (pin EXPECTED from a pre-change run of the same seed)
});
it('V<k short-circuit counts in vBelowKSkipped and never drops a k-orbit cell', () => {
  // k=2 on a seed known to produce closed 1-vertex-class cells (any seed emitting supercell
  // candidates works); assert diag.vBelowKSkipped >= 0 and emitted cells unchanged vs pinned count.
});
```

Before writing assertions, run the chosen seed on UNCHANGED code and pin `EXPECTED_CELLS_FOR_SEED` + which diag counters fire (this is the honest way to pin behavior-preservation).

- [ ] **Step 2.2: Run, verify failure** (`p2Skipped` not on the diag type).

- [ ] **Step 2.3: Implement**

(a) `PeriodSolverDiag` additions (after `p1Pruned`):

```ts
	p2Skipped: number; // OP-1 prop:typeprune closed-cell half: certified cells discarded because their occurring VC-type set ⊊ the seed's allowed set (licensed two-sided by prop:typeprune; recovery routes through prop:fanseed — rem:fastpath caveat inherited)
	vBelowKSkipped: number; // OP-1 V<k half: closed cells with vertex-class count V < k — orbits ≤ V < k, gate-rejected without invoking KUniformityChecker
```

(b) `emptyDiag()` gains `p2Skipped: 0, vBelowKSkipped: 0`.

(c) The accept site in `torusFill` (currently line ~919):

```ts
			if (!analysis.openVertex) {
				// No open vertex within a full cell ⇒ torus closed. Certify, then OP-1 (prop:typeprune,
				// correctness.tex:731-751): (i) V<k ⇒ orbits ≤ V < k, the gate would reject — skip the
				// 7×7 exact symmetry search; (ii) occurring VC-type set ⊊ allowed ⇒ the cell does not
				// realize this seed's orbit-VC multiset — it is another seed's tiling (two-sided), discard
				// without gate or primitivity scan. Both OFF for star seeds (P0/P1 doctrine: vReps
				// over-counts star dents — sound but conservative — and TH-13 is open). Then reject
				// supercells (CB-7 guard unchanged).
				const occ: Set<string> | undefined = skipP1 ? undefined : new Set<string>();
				if (this.isCompleteTiling(reps, ctx, occ)) {
					if (occ !== undefined && vReps.length < this.k) { diag.vBelowKSkipped++; continue; }
					if (occ !== undefined && occ.size !== ctx.allowed.size) { diag.p2Skipped++; continue; }
					if (this.isPrimitive(reps, ctx, memo, diag)) results.push(reps);
				}
				continue;
			}
```

Notes locked during design — keep them true in code review:
- `skipP1` (already `ctx.starTiles.length > 0`) doubles as the star gate for P2 — same predicate, same doctrine; do not invent a second flag.
- The equality test is `occ.size === ctx.allowed.size`: the certificate already enforced `occ ⊆ allowed` (it returns false on any disallowed name), so size equality ⟺ set equality. Both sides use `canonicalVCName` (mirror-merged canonical names) — same namespace by construction.
- ORDER: V<k first (free — `vReps.length` is on the DFS stack), then P2 (O(1) size compare), then `isPrimitive` (O(reps²·translate) — the expensive one). P2-discarded pure-3⁶ supercells now never reach the CB-7 guard: `supercellRejected`/`primitivityGuardAreaSuppressed` counts will DROP at k=2 — that is expected and must be mentioned in the commit message (diagnostics shift, not silent loss: the discard is theorem-licensed upstream of the guard).
- k=1 is provably a no-op (|allowed| = 1, occ non-empty ⊆ allowed ⇒ equality; V ≥ 1 = k).
- `ctx.allowed` is the SEED's full VC set even on the fan-seeding path (built once in `solve` before the lattice loop) — correct: prop:typeprune compares against the seed's multiset support, regardless of which fan seeded the fill.

- [ ] **Step 2.4: Build + full test file** — `pnpm build && pnpm vitest run tests/period-solver.test.ts` → PASS.

- [ ] **Step 2.5: k≤2 digest probes**

```bash
pnpm tsx scripts/probe-pipeline.ts 1 2>&1 | tee experiments/results/op1-probes-k1-$(date +%F).log
pnpm tsx scripts/probe-pipeline.ts 2 2>&1 | tee experiments/results/op1-probes-k2-$(date +%F).log
```

Expected: `6f9ca9cf2d16c75f count=11` and `f3e2e0517191362c count=20` byte-identical (see doctrine block for why). If k=2 differs: STOP — that means a strict-subset-support cell was passing the gate at k=2, which contradicts the catalogue's known type structure; investigate before any further step.

- [ ] **Step 2.6: Commit** — `git commit -m "feat(solver): OP-1 prop:typeprune — closed-cell type-support filter + V<k gate short-circuit (k≤2 probes byte-identical)"` (include the probe digests in the body).

### Task 3: OP-1 k=3 acceptance sweep (+ re-baseline if the digest moves)

**Files:** none (measurement); possibly `docs/` re-baseline notes

- [ ] **Step 3.1: Announce in chat, then run the certified sweep** (one sweep at a time on this machine):

```bash
pnpm tsx scripts/scout-parallel.ts 3 3,4,6,12 0 8 fresh 2>&1 | tee experiments/results/op1-k3-sweep-$(date +%F).log
```

Expected: 449/449, **0 timeouts**, `count=61`. Record the digest and the Σ rawCells (baseline: 362 raw / digest `99919f42a7b58e76`). rawCells should DROP (that's the point); also record total wall-clock vs the 7428 s baseline.

Then the F3 loud-cap watch (applies identically after the Task 6.2 and Task 9.1 sweeps):

```bash
grep -c "INCOMPLETE-REGION (block index cap)\|INCOMPLETE-REGION (maxCellPolys)" experiments/results/op1-k3-sweep-*.log
```

Expected: `0`. Non-zero = loud stop, report immediately.

- [ ] **Step 3.2: Per-tiling oracle bijection**

```bash
pnpm tsx scripts/recert-oracle-match.ts 2>&1 | tee experiments/results/op1-k3-oracle-$(date +%F).log
```

Expected: `★ PASS — 61/61 per-tiling bijection, t3007 present, no duplicates`. This is the acceptance — NOT the digest.

- [ ] **Step 3.3: If digest ≠ `99919f42a7b58e76`:** one re-baseline commit containing (i) the new digest recorded in DEVELOPMENT_NOTES (new §) + SYNC entry, (ii) the oracle PASS log path, (iii) the explicit sentence "per-seed raw emissions changed by design (OP-1); catalogue-level per-tiling oracle equality is the acceptance — never a silent baseline swap". If the digest is UNCHANGED, record that instead (it means no P2-killed duplicate was a class representative).

- [ ] **Step 3.4: SYNC entry (3–6 lines, signed CC)** — OP-1 landed: what, commit hash, probe digests, k=3 sweep digest + 61/61 oracle PASS, pointer to the NOTES §.

---

## OP-2 — honest torus-path scope: OP-9 instrumentation + cache counters + pool sub-cache

Spec: `04-optimizations.md` §OP-2. **Scope ruling (record verbatim in NOTES):** the named memoization target (`enumerateNormalizedBranches` per `latticeKey`) exists only in the unmerged orbifold worktree — there is no per-(seed,lattice) branch-enum on master's torus path, and the candidate stage is already cached per `(N, vcSig, k, regime)` at a measured 0.024 s / 0.04% of k=3 runtime (NOTES §15.3). Implementing a torus-side "lattice-first inversion" would conflict with the scout's seed-unit parallelism for no measured payoff and could not be digest-verified as pure memoization. The implementable OP-2 content on master = (a) the diag instrumentation OP-9 step 1 requires (Σ work items AND distinct lattices per holohedry class — "Never publish a Σ without its distinct companion again"), (b) candidateCache hit/miss counters, (c) a byte-identical pool sub-cache. The branch-enum memoization itself is DEFERRED to the orbifold lane with this reason recorded — not silently dropped.

### Task 4: Pool sub-cache + cache counters

**Files:**
- Modify: `lib/classes/algorithm/PeriodSolver.ts` (`candidateLattices` ~495-737, `candidateCache` ~134)
- Test: `tests/period-solver.test.ts`

- [ ] **Step 4.1: Failing test** — assert the new counters exist and behave:

```ts
it('candidateCache exposes hit/miss counters and the pool sub-cache is shared across vcSigs', () => {
  // Solve two k=1 seeds with the same polySizes but different VC sets; assert
  // candidateCacheStats().misses >= 2 (different vcSig) and poolCacheStats().hits >= 1
  // (same (N, polySizes, k, regime) pool reused).
});
```

- [ ] **Step 4.2: Implement**

(a) Module-level, next to `candidateCache`:

```ts
/** OP-2 instrumentation: candidate-stage cache effectiveness (Σ-vs-distinct is the OP-9 feed). */
const cacheStats = { candHits: 0, candMisses: 0, poolHits: 0, poolMisses: 0 };
export function candidateStageCacheStats(): Readonly<typeof cacheStats> { return cacheStats; }
/** Pool sub-cache: `shortVectorPool` depends only on (ring.N, dirs, poolSteps, poolLmax, monotone) —
 *  shared across every vcSig with the same tile sizes. Cached arrays are NEVER mutated downstream
 *  (filter/map create new arrays) — verified at introduction; keep it that way. */
const poolCache = new Map<string, ReturnType<typeof shortVectorPool>>();
```

(b) In `candidateLattices`: bump `candHits`/`candMisses` at the existing `cached` check (line ~523-524); replace the direct pool construction (line ~565) with:

```ts
		const poolKey = `${ring.N}:${polySizes.join(',')}:${poolSteps}:${poolLmax}:1`;
		let pool = poolCache.get(poolKey);
		if (pool) { cacheStats.poolHits++; } else {
			cacheStats.poolMisses++;
			pool = shortVectorPool(ring, poolSteps, poolLmax, dirs, /* monotone */ true);
			poolCache.set(poolKey, pool);
		}
```

(`dirs` is a pure function of `(ring, polySizes)` — fold it into the key via `polySizes`; do NOT key on the array identity.)

- [ ] **Step 4.3: Build + tests + commit** — `pnpm build && pnpm vitest run tests/period-solver.test.ts`; commit `perf(solver): OP-2 — pool sub-cache + candidate-cache counters (byte-identical by construction)`.

### Task 5: Lattice census (Σ vs distinct per holohedry) + aggregator

**Files:**
- Modify: `lib/classes/algorithm/PeriodSolver.ts` (`PeriodSolverOptions`, `solve`)
- Modify: `scripts/probe-pipeline.ts`, `scripts/scout-worker.ts`
- Create: `scripts/lattice-census.ts`
- Test: `tests/period-solver.test.ts`

- [ ] **Step 5.1: Failing test** — `onCandidateLattices` callback fires with per-lattice `{ key, hol }`:

```ts
it('solve reports the per-seed candidate lattice census via onCandidateLattices', () => {
  let seen: { key: string; hol: number }[] | null = null;
  new PeriodSolver(1).solve(seed, { maxMs: 30000, onCandidateLattices: (l) => { seen = l; } });
  expect(seen).not.toBeNull();
  expect(seen!.length).toBeGreaterThan(0);
  expect(new Set(seen!.map((x) => x.hol)).size).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 5.2: Implement the callback (NO `node:fs` in lib code — PeriodSolver may reach the browser via the lab console):**

`PeriodSolverOptions` gains:

```ts
	/** OP-2/OP-9 census hook: called once per solve with the post-P0 candidate list
	 *  (latticeKey + holohedry per lattice). Σ over seeds = work items; set-union of keys =
	 *  distinct lattices. Instrumentation only — never affects the solve. */
	onCandidateLattices?: (lattices: { key: string; hol: number }[]) => void;
```

In `solve`, right after the `candidateLattices` call + diag construction:

```ts
		opts.onCandidateLattices?.(lattices.map(([lu, lv]) => ({ key: latticeKey(lu, lv), hol: holohedry(lu, lv) })));
```

- [ ] **Step 5.3: Wire scripts behind `PS_LATTICE_CENSUS=1`**

`scripts/scout-worker.ts` (and `probe-pipeline.ts` identically): when `process.env.PS_LATTICE_CENSUS === '1'`, append one NDJSON line per solve to `.scout-cache/lattice-census-k${k}.${process.pid}.ndjson`:

```ts
const censusStream = process.env.PS_LATTICE_CENSUS === '1'
  ? fs.createWriteStream(`.scout-cache/lattice-census-k${k}.${process.pid}.ndjson`, { flags: 'a' })
  : null;
// in the per-seed solve call:
const opts = { maxMs, onCandidateLattices: censusStream
  ? (l: { key: string; hol: number }[]) => censusStream.write(JSON.stringify({ seed: seed.name, k, lattices: l }) + '\n')
  : undefined };
```

(Per-PID files — workers append concurrently; the aggregator globs.)

- [ ] **Step 5.4: Create `scripts/lattice-census.ts`** — reads `.scout-cache/lattice-census-k<k>.*.ndjson`, prints the OP-9 table:

```ts
/* OP-2/OP-9: Σ (seed,lattice) work items vs DISTINCT lattices, per holohedry class.
 * Run after a sweep with PS_LATTICE_CENSUS=1:  pnpm tsx scripts/lattice-census.ts 3 */
import fs from 'node:fs';
const k = process.argv[2] ?? '3';
const files = fs.readdirSync('.scout-cache').filter((f) => f.startsWith(`lattice-census-k${k}.`));
const sigma = new Map<number, number>();          // hol -> Σ work items
const distinct = new Map<number, Set<string>>();  // hol -> distinct latticeKeys
let seeds = 0;
for (const f of files) for (const line of fs.readFileSync(`.scout-cache/${f}`, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const r = JSON.parse(line) as { seed: string; lattices: { key: string; hol: number }[] };
  seeds++;
  for (const { key, hol } of r.lattices) {
    sigma.set(hol, (sigma.get(hol) ?? 0) + 1);
    (distinct.get(hol) ?? distinct.set(hol, new Set()).get(hol)!).add(key);
  }
}
console.log(`k=${k}  seeds=${seeds}  (family from the sweep that produced the census)`);
console.log('hol | Σ work items | distinct lattices | multiplicity');
for (const hol of [...sigma.keys()].sort((a, b) => a - b)) {
  const s = sigma.get(hol)!, d = distinct.get(hol)!.size;
  console.log(`${String(hol).padStart(3)} | ${String(s).padStart(12)} | ${String(d).padStart(17)} | ${(s / d).toFixed(1)}×`);
}
const S = [...sigma.values()].reduce((a, b) => a + b, 0);
const D = new Set([...distinct.values()].flatMap((x) => [...x])).size;
console.log(`ALL | ${String(S).padStart(12)} | ${String(D).padStart(17)} | ${(S / D).toFixed(1)}×`);
```

- [ ] **Step 5.5: Build + tests + commit** — `perf(solver): OP-2 — per-seed lattice census hook + Σ-vs-distinct aggregator (OP-9 feed; digest-neutral)`.

### Task 6: OP-2 acceptance — byte-identical everywhere + the census run

- [ ] **Step 6.1: k≤2 probes** (commands as in Step 2.5, log names `op2-probes-*`). MUST be byte-identical (`6f9ca9cf2d16c75f` / `f3e2e0517191362c`) — OP-2 is in the must-be-neutral class; ANY change = bug = stop.

- [ ] **Step 6.2: k=3 sweep WITH census** (announce first; this doubles as OP-2's k=3 regression AND the OP-9 measurement):

```bash
PS_LATTICE_CENSUS=1 pnpm tsx scripts/scout-parallel.ts 3 3,4,6,12 0 8 fresh 2>&1 | tee experiments/results/op2-k3-sweep-census-$(date +%F).log
pnpm tsx scripts/lattice-census.ts 3 2>&1 | tee experiments/results/op2-k3-census-table-$(date +%F).log
pnpm tsx scripts/recert-oracle-match.ts 2>&1 | tee experiments/results/op2-k3-oracle-$(date +%F).log
```

Acceptance: digest byte-identical to the OP-1-era digest (Task 3 outcome), 61/61 oracle PASS, and the census table exists (expect oblique multiplicity in the ~17× ballpark of NOTES:1443/1522 — record the actual number; it is OP-9 input, and the OP-3 stage-1 sizing datum).

- [ ] **Step 6.3: SYNC entry** — OP-2 landed (torus scope), commit hash, byte-identical digests, the Σ-vs-distinct headline numbers, the deferred-with-reason ruling pointer (NOTES §).

---

## OP-3 (stage 1) — grid-isometry orbit dedup of OBLIQUE candidates + explicit rotation/reflection seeding

Spec: `04-optimizations.md` §OP-3; theory `lem:orbitdedup` + `rem:orbitdedup` (correctness.tex:1294/1346, TH-9 ✓). The three binding constraints:
1. **Exact orbit ID** — group only by exact `sameLattice(g·basis, rep)` over the ≤2N=48 maps g; latticeKey collision may SPLIT an orbit (sound) but must never MERGE one.
2. **Explicit rotation seeding** — for every deleted enumerated member gΛ, seed `g⁻¹(core)` on the kept representative (the lemma's bookkeeping swap; reflections consume `lem:reflectioncover` — regular family only).
3. **Orbit-aware CB-7 guard** — the primitivity guard's membership test ranges over the G-images of the witness closure.

**Stage-1 scope (record in NOTES):** hol=2 (oblique) candidates only — the dominant class (max orbit size ~12–24, 69% of post-P0 survivors at k≥3, the §23.9 wall driver) — which keeps k≤2 byte-identical (0 oblique tilings at k≤2; TH-9's acceptance gate). Extending to hol>2 classes (~4× on hexagonal) is stage 2, gated on the OP-9 re-measure showing it matters. The Stab(core) quotient form stays NOT BUILT per spec step 1 (measure first; the census + orbit-size logs are that measurement).

### Task 7: Exact G-orbit grouping helper

**Files:**
- Modify: `lib/classes/algorithm/LatticeEnumerator.ts` (new exports near `sameLattice`, ~line 540)
- Test: `tests/lattice-orbit-dedup.test.ts` (new)

- [ ] **Step 7.1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { CyclotomicRing, setActiveRing, Cyclotomic } from '@/classes/Cyclotomic';
import { gridImageBasis, groupIntoGridOrbits, latticeKey, sameLattice, holohedry } from '@/classes/algorithm/LatticeEnumerator';

// Build a few exact oblique bases in N=24 (e.g. u=1, v=2+ζ — any pair with hol()===2),
// plus their ζ^3-rotated and conjugated images, shuffled; assert:
it('groups a rotated/reflected oblique family into ONE orbit with the first-generated member as rep', () => {
  // input order = [Λ, ζ³Λ, conj(Λ)] → one group, rep = Λ, maps = [{rot:0,refl:false},{rot:3,...inverse...},{...}]
});
it('does NOT group two non-isometric same-area lattices', () => {
  // two oblique lattices with equal |det| but different Gram data → two orbits
});
it('seed maps invert correctly: applying the recorded map to the rep basis reproduces the member lattice', () => {
  // for each recorded member map g: sameLattice(g(repU), g(repV), memberU, memberV) === true
});
```

- [ ] **Step 7.2: Run → FAIL** (exports missing).

- [ ] **Step 7.3: Implement in `LatticeEnumerator.ts`**

```ts
/** One grid point-group element g ∈ G = {ζ^r, conj∘ζ^r} applied to a basis vector. */
export function gridImage(w: Cyclotomic, rot: number, refl: boolean): Cyclotomic {
	return refl ? w.conj().mulZeta(rot) : w.mulZeta(rot);
}
export function gridImageBasis(u: Cyclotomic, v: Cyclotomic, rot: number, refl: boolean): [Cyclotomic, Cyclotomic] {
	return [gridImage(u, rot, refl), gridImage(v, rot, refl)];
}

export type OrbitGroup = {
	/** index (into the input list) of the kept representative — the FIRST-generated member */
	repIdx: number;
	/** for every member (incl. the rep), the map g with g(Λ_rep) = Λ_member; seeding uses g⁻¹ */
	memberMaps: { idx: number; rot: number; refl: boolean }[];
};

/**
 * Partition lattices into grid point-group orbits — EXACT (rem:orbitdedup constraint 1): membership
 * is `sameLattice` over the ≤2N images of the candidate REP basis; key collisions are never trusted
 * to merge. Buckets by exact areaKey first (G-invariant) so the pairwise scan stays near-linear.
 * Input order is the enumeration order; the kept rep is the first-generated member (deterministic).
 */
export function groupIntoGridOrbits(lattices: [Cyclotomic, Cyclotomic][], N: number): OrbitGroup[] {
	const groups: OrbitGroup[] = [];
	const reps: { u: Cyclotomic; v: Cyclotomic; areaK: string; g: OrbitGroup }[] = [];
	for (let i = 0; i < lattices.length; i++) {
		const [u, v] = lattices[i];
		const areaK = areaKey(detSurd(u, v).abs());
		let placed = false;
		for (const r of reps) {
			if (r.areaK !== areaK) continue;
			// try every g: g(Λ_rep) = Λ_i ?
			for (let rot = 0; rot < N && !placed; rot++) {
				for (const refl of [false, true]) {
					const [gu, gv] = gridImageBasis(r.u, r.v, rot, refl);
					if (sameLattice(u, v, gu, gv)) { r.g.memberMaps.push({ idx: i, rot, refl }); placed = true; break; }
				}
			}
			if (placed) break;
		}
		if (!placed) {
			const g: OrbitGroup = { repIdx: i, memberMaps: [{ idx: i, rot: 0, refl: false }] };
			groups.push(g);
			reps.push({ u, v, areaK, g });
		}
	}
	return groups;
}
```

(`sameLattice(u, v, gu, gv)` = equal covolume + `gu, gv ∈ ⟨u,v⟩` — equal covolume + containment ⇒ equality, exact. `areaKey`/`detSurd` are already imported in this module.)

- [ ] **Step 7.4: Build + tests** → PASS. **Step 7.5: Commit** — `feat(lattice): OP-3 — exact grid point-group orbit grouping (rem:orbitdedup constraint 1)`.

### Task 8: Oblique orbit reduction in candidateLattices + rotated/reflected seeding in solve

**Files:**
- Modify: `lib/classes/algorithm/PeriodSolver.ts` (`candidateCache` type ~134, `candidateLattices` tail ~704-737, `solve` seeding ~389-423, `PeriodSolverDiag`)
- Test: `tests/period-solver.test.ts`, `tests/lattice-orbit-dedup.test.ts`

- [ ] **Step 8.1: Failing test**

```ts
it('OP-3: oblique candidates are reduced to one per G-orbit with seed maps; round/grid candidates untouched', () => {
  // k=3-style seed (or directly call the private candidateLattices via index access on a seed
  // with oblique candidates — any {3,4,6} multi-VC k=3 seed from the fixtures).
  // Assert: diag.orbitSkipped > 0; diag.candidateLattices < the pinned pre-change count for the
  // same seed; and for hol≠2 lattices seedMaps.length === 1 (identity only).
});
it('OP-3: k=1 emitted catalogue unchanged on a full probe-equivalent run', () => {
  // run the existing k=1 suite assertion (11 tilings) — unchanged.
});
```

Pin pre-change counts by running the chosen fixture seed on unchanged code first.

- [ ] **Step 8.2: Implement — candidate side**

(a) Cache/value shape: change the cached `lattices` to carry seed maps —

```ts
type CandidateLattice = { basis: [Cyclotomic, Cyclotomic]; seedMaps: { rot: number; refl: boolean }[] };
```

`candidateCache`'s value type and `candidateLattices`' return type swap `[Cyclotomic, Cyclotomic][]` → `CandidateLattice[]`. (Type-checker drives the call-site updates; `solve` is the only consumer.)

(b) At the tail of `candidateLattices`, AFTER the P0 filter builds `kept` (line ~716-722), replace the plain result with the stage-1 reduction (regular seeds only):

```ts
		// --- OP-3 stage 1 (lem:orbitdedup): reduce OBLIQUE candidates to one per grid-isometry orbit.
		// hol=2 only: the dominant class carries the maximal orbit (~12-24 images); round/grid classes
		// keep identity seeding (stage 2 is gated on the OP-9 re-measure). Star seeds: NOT licensed
		// (rem:orbitdedup scope — rem:starhandedness/TH-13 open) ⇒ skip reduction entirely.
		// Constraint 2 (explicit rotation seeding): for each deleted ENUMERATED member g·Λrep we seed
		// g⁻¹(core) on the rep — exactly the enumerated coverage, fills conserved (the lemma's
		// bookkeeping swap). Members never enumerated by the tuned pool were never filled before
		// either — the reduction neither adds nor drops coverage (pool-closure diagnostic below).
		let orbitSkipped = 0;
		let candidates: CandidateLattice[];
		if (seedHasStar) {
			candidates = kept.map((b) => ({ basis: b, seedMaps: [{ rot: 0, refl: false }] }));
		} else {
			const oblique: [Cyclotomic, Cyclotomic][] = [];
			const other: CandidateLattice[] = [];
			for (const b of kept) {
				if (holohedry(b[0], b[1]) === 2) oblique.push(b);
				else other.push({ basis: b, seedMaps: [{ rot: 0, refl: false }] });
			}
			const groups = groupIntoGridOrbits(oblique, ring.N);
			const reduced: CandidateLattice[] = groups.map((g) => ({
				basis: oblique[g.repIdx],
				// identity first (preserves the historical first fill), then the deleted members' maps
				seedMaps: g.memberMaps.map((m) => ({ rot: m.rot, refl: m.refl })),
			}));
			orbitSkipped = oblique.length - groups.length;
			// pool-closure diagnostic (OP-3 fix-spec step 3): an orbit whose enumerated size is below
			// the full coset count 2N/|StabG(Λ)| (=24 for generic oblique) means the tuned pool was not
			// G-closed there — informational, the tuned regime banner already owns the loudness.
			candidates = [...other, ...reduced];
			// preserve cheapest-first order (equal-area members collapse; re-sort by exact area)
			candidates.sort((a, b2) => detSurd(a.basis[0], a.basis[1]).abs().cmp(detSurd(b2.basis[0], b2.basis[1]).abs()));
		}
		const result = { lattices: candidates, p0Skipped, orbitSkipped, obliqueCandidates, obliqueTruncated, starLadderTruncated, allKeys: seen, areaKeys: new Set(areas.map(areaKey)) };
```

CRITICAL invariant: `allKeys` (= `seen`) is built during `push()` BEFORE any reduction ⇒ the CB-7 guard universe still contains every enumerated orbit member. Do not move that.

(c) `PeriodSolverDiag` gains `orbitSkipped: number` (+ `emptyDiag`), set from the cache result in `solve`.

- [ ] **Step 8.3: Implement — seeding side (in `solve`'s lattice loop, ~389-423)**

The loop now iterates `candidates`; per lattice, build the seed-state list as the g⁻¹-image of the EXISTING per-seed-selection logic, per map:

```ts
		const ZERO = Cyclotomic.ZERO(ring);
		// inside: for (const { basis: [u, v], seedMaps } of lattices) { ... after ctx built ...
			const seedSets: Polygon[][] = [];
			let anyOverflow = false;
			for (const m of seedMaps) {
				// g maps Λrep onto the deleted member; the member's (unrotated) fill corresponds on Λrep
				// to the g⁻¹-image of the core (lem:orbitdedup (i)). g⁻¹: rotation −rot; a reflection is
				// its own inverse (conj∘ζ^r ∘ conj∘ζ^r = id).
				const inv = m.refl ? m : { rot: ((ring.N - m.rot) % ring.N), refl: false };
				const mapCore = (ps: Polygon[]) => m.rot === 0 && !m.refl
					? ps // identity: reuse the original polygons — byte-identical fast path
					: ps.map((p) => p.transformedRigid(ZERO, inv.refl, 0, inv.refl ? m.rot /* see note */ : inv.rot, ZERO, 'full'));
				const core = mapCore(corePolys);
				const overflows = fanCoreSets.length > 0 && ctx.cellArea < totalCoreArea - 1e-9 &&
					this.footprintArea(core, ctx) > ctx.cellArea + 1e-6;
				if (overflows) { anyOverflow = true; for (const fan of fanCoreSets) seedSets.push(mapCore(fan)); }
				else seedSets.push(core);
			}
			if (anyOverflow) diag.fanLattices++;
			const dedupSeeds = seedSets.length > 1;
```

**⚠ Inverse-of-reflection (BLOCKING ACCEPTANCE GATE — AL amendment 2026-06-10):** for `g = conj∘ζ^r` derive the inverse against `transformedRigid`'s convention (`reflect=true ⇒ conj(z−o)·ζ^{axisK+rotK}+o+t`) and do not trust the sketch above — trust the gate in Step 8.6. Rationale (why the digest gates cannot catch this): the oblique-only staging makes the k≤2 digest gate VACUOUS for this code path (zero oblique tilings at k≤2 ⇒ a broken rotation/reflection seeding swap passes it by construction), and the k=3 bijection may under-test `det g = −1` (if t3046/t3055 are reachable via rotation-only orbit members, the bijection passes with the reflection path latently broken — surfacing at k=4, in production).

The rest of the loop (seenInitial seed-state dedup, torusFill, accept) is unchanged — the existing `dedupSeeds` machinery (line ~410-419) already dedups identical initial states, which now also collapses rotated cores that coincide mod Λ.

- [ ] **Step 8.4: Constraint 3 — orbit-aware CB-7 guard**

In `supercellRejectionGuard` (line ~1222), replace the membership loop:

```ts
		if (closure !== null) {
			// rem:orbitdedup constraint 3: after the orbit reduction the primitive lattice may have been
			// enumerated only as a G-image of itself — range the membership test over the ≤2N grid
			// point-group images of the closure (identity first: the common pre-reduction hit).
			for (let rot = 0; rot < ctx.N; rot++) {
				for (const refl of [false, true]) {
					const [ga, gb] = gridImageBasis(closure[0], closure[1], rot, refl);
					for (const kk of latticeKeySet(ga, gb)) {
						if (ctx.candidateKeys.has(kk)) return; // primitive lattice (up to G) IS a candidate — sound discard
					}
				}
			}
			... // area-suppression branch unchanged
		}
```

(Rare path — runs only on supercell rejection; ≤48 × ≤56 key lookups. Import `gridImageBasis` from LatticeEnumerator.)

- [ ] **Step 8.5: Build + unit tests** — `pnpm build && pnpm vitest run tests/period-solver.test.ts tests/lattice-orbit-dedup.test.ts tests/congruence-primitive.test.ts` → PASS.

- [ ] **Step 8.6: Reflective seeding acceptance gate (BLOCKING — must pass before Task 9; the k≤2 probes of Step 8.7 do NOT substitute for it)**

The fixture set MUST include at least one map with `refl: true`, exercised through the REAL seeding path, with NON-EMPTY fill results (cellsCongruent over two empty result sets passes vacuously — that would reproduce the exact hole this gate closes):

1. Fixture construction: reconstruct t3046 (or t3055) via the oracle decode (`scripts/oracle-match.ts` exports — see `recert-oracle-match.ts` for the ring-discipline pattern); take its primitive oblique lattice Λ and the matching seed's core. For any true oblique Λ (hol=2), `conj(Λ)` is provably distinct from every rotation image (a coincidence `conj(Λ)=ζ^rΛ` would put the reflection `ζ^{-r}∘conj` in Stab_G(Λ), contradicting hol=2) — so the orbit group over `[Λ, conj(Λ)]` is GUARANTEED to carry a `refl: true` member map.
2. The assertion: fill Λ with `g⁻¹(core)` for the reflective g (through the Task 8.3 `mapCore` path, not a hand-rolled transform) and fill `gΛ` with `core` (unreduced path); assert BOTH result sets are non-empty and match as a bijection under `cellsCongruent` (each cell of one set congruent to exactly one cell of the other).
3. Form: a vitest test in `tests/lattice-orbit-dedup.test.ts` with a generous timeout (heavy-test convention — single-lattice oblique fills run seconds, not the 5s default); if oracle reconstruction is impractical inside vitest, fall back to a standalone gate script `scripts/verify-op3-reflective-seeding.ts` run as part of this step and logged to `experiments/results/op3-reflective-gate-$(date +%F).log` — same assertions, script form.
4. **If no reflective-map fixture exercising the seeding path can be constructed: STOP and report — do not proceed to Task 9.** (AL amendment, blocking.)

- [ ] **Step 8.7: k≤2 digest probes — TH-9's hard gate**

```bash
pnpm tsx scripts/probe-pipeline.ts 1 2>&1 | tee experiments/results/op3-probes-k1-$(date +%F).log
pnpm tsx scripts/probe-pipeline.ts 2 2>&1 | tee experiments/results/op3-probes-k2-$(date +%F).log
```

MUST print `6f9ca9cf2d16c75f count=11` / `f3e2e0517191362c count=20`. **A changed digest here = loud stop** (TH-9 acceptance, 03-theory-obligations.md:350) — do not rationalize it; find the cause. (Reminder: these probes are NOT evidence for the reflection path — Step 8.6 is.)

- [ ] **Step 8.8: Commit** — `feat(solver): OP-3 stage 1 — oblique grid-orbit lattice dedup + explicit rotation/reflection seeding (lem:orbitdedup; reflective gate + k≤2 probes green)` with the three constraints called out in the body.

### Task 9: OP-3 k=3 acceptance sweep

- [ ] **Step 9.1: Announce, then sweep + oracle (same commands as Task 3, log prefix `op3-`).** Acceptance: 449/449, 0 timeouts, count=61, `★ PASS — 61/61`; explicitly confirm in the oracle log that the two oblique-class tilings (t3046/t3055) matched. Record: digest (re-baseline procedure if moved — same as Task 3.3), Σ `orbitSkipped`, wall-clock delta vs the OP-2 sweep (THE stage-1 speedup datum for OP-9 — expect the candidate-count reduction on the oblique class, NOT a 17× wall-clock win; fills are conserved by design).

- [ ] **Step 9.2: SYNC entry** — OP-3 stage 1 landed: scope (oblique-only), constraints 1-3 honoured, commit, digests, oracle PASS, orbitSkipped + wall-clock numbers, stage-2/Stab(core) deferred-on-measurement pointer.

---

### Task 10: Docs closeout

**Files:** `docs/review-2026-06-09/04-optimizations.md`, `docs/DEVELOPMENT_NOTES.md`, `docs/STATUS.md`, `docs/NEXT.md`

- [ ] **Step 10.1: DEVELOPMENT_NOTES new §** (next free number): one subsection per OP — what landed, the measured numbers (probe/sweep digests, rawCells delta, census table, orbitSkipped, wall-clock), the OP-2 scope ruling verbatim, the OP-3 stage-1 scope + what stage 2 waits on, and the OP-1 diagnostics shift (supercellRejected drop at k=2). Failed attempts (if any) recorded with why.

- [ ] **Step 10.2: 04-optimizations.md status column:** OP-1 `[x] 2026-06-XX`; OP-2 `[x] 2026-06-XX (torus scope: instrumentation + pool cache; branch-enum memoization deferred to the orbifold lane — see NOTES §NN)`; OP-3 `[x] 2026-06-XX stage 1 (oblique-only; stage 2 + Stab-form gated on OP-9)`.

- [ ] **Step 10.3: NEXT.md CC line** → OP-9 re-measure is now unblocked with its inputs in hand (the census table + the reconciliation numbers); STATUS.md frontier updated. Run `pnpm docs:check` before committing docs.

- [ ] **Step 10.4: Final** — `pnpm build && pnpm test -- --exclude '**/.claude/worktrees/**'` green; merge decision back to Alessandro (the CB lane may have landed on master meanwhile — if `fix/cb5-cb4-cb6` merged, rebase/merge master into the branch and re-run the k≤2 probes before any merge; serialize with the other session via Alessandro).

---

## Self-review (done at write time)

- **Spec coverage:** OP-1 items 1 (Task 1-2), 2 (Task 2 V<k), 3 (deferred — recorded), 4 (star gate via skipP1; fast-path oracle pairing via Task 3), 5 (no gate-window change — nothing touches KUniformityChecker). OP-2 items 1 (pool sub-cache — the honest torus analogue; orbifold half deferred-with-reason), 2 (lattice-first inversion REJECTED for the torus path with the byte-identity argument recorded in the scope ruling), 3 (Task 5 census + Task 4 counters). OP-3 steps 1 (census + orbit-size data = the measurement; Stab-form NOT built), 2 (TH-9 ✓ — pre-existing), 3 (grid-orbit form, oblique stage; pool-closure diagnostic), 4 (orbitSkipped); constraints 1/2/3 each have a dedicated implementation site + test.
- **Known risk pinned to a BLOCKING gate (AL amendment 2026-06-10):** the reflection-inverse convention in Task 8.3 is gated by Step 8.6 — a mandatory `refl: true` fixture with non-empty fills and a cellsCongruent bijection, because the k≤2 digest gate is vacuous for the oblique-only path and the k=3 bijection may under-test det g = −1. No Task 9 without it.
- **AL riders verified, not re-implemented:** the buildBlock index-cap loud assertion and the maxCellPolys ≥ 24k default are already on master (`b8fc197`, lem:fillreach F3a/F3b); this plan's three sweeps double as their empirical verification (expected zero banner emissions).
- **Type consistency:** `CandidateLattice` introduced once (Task 8.2a) and consumed in `solve` only; diag fields `p2Skipped`/`vBelowKSkipped`/`orbitSkipped` added to both the type and `emptyDiag`; `onCandidateLattices` lives on `PeriodSolverOptions` (no `node:fs` in lib).
- **Digest expectations:** stated per-OP per-k with reasons, all "verify, don't assume".
