# Reference atlas k=8–10 shards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Reference (Oracle) shelf on `/library` to k=8, 9, 10 by emitting per-k rendered-geometry shards that load on demand.

**Architecture:** A build-script phase reconstructs k=8/9/10 from `figures/data/ctrnact.json` into separate `public/reference-atlas-k{8,9,10}.json` files. The base `reference-atlas.json` (k≤7) is untouched. `ReferenceShelf` fetches a shard only when its k is selected in the filter, merges it into the working set, and reuses the existing filter → sort → paginate path (24 cards/page, so render is already bounded).

**Tech Stack:** Next 16 / React 19, TypeScript, Vitest, exact-arithmetic cell reconstruction (`scripts/oracle-match.ts`), `pnpm tsx` build script.

---

## Spec

See `docs/superpowers/specs/2026-07-11-reference-atlas-k8-10-shards-design.md`.

## File structure

- `lib/services/referenceAtlas.ts` — add `loadReferenceAtlasShard(k)` (per-k lazy fetch + cache), sibling to `loadReferenceAtlas()`.
- `tests/referenceAtlasShard.test.ts` — new; unit-tests the shard loader (URL + per-k cache + error).
- `scripts/build-reference-atlas.ts` — generalize `buildCtrnact()` → `buildCtrnactAtK(k)`; add `writeHigherKShards()` that emits `public/reference-atlas-k{8,9,10}.json`.
- `components/reference-shelf.tsx` — extend `K_OPTIONS` to `[1..10]`; add shard state + on-demand load effect + merge + loading affordance + hint.
- `public/reference-atlas-k8.json`, `-k9.json`, `-k10.json` — generated build output (not hand-edited).

---

## Task 1: Isolated worktree off current HEAD

**Files:** none (git only).

Reason: the current branch `feat/wallpaper-symmetry` carries a large unrelated WIP tree. This work is a separate topic and must not entangle with it. NOTE: branch off **HEAD, not master** — master is 116 commits behind and lacks the entire reference-atlas feature (build script, shelf, service, base atlas, and the `figures/data/ctrnact.json` build input all live on this branch). A worktree off HEAD carries every committed dependency; the uncommitted WIP stays behind in the main working dir.

- [ ] **Step 1: Create a clean worktree off the current committed HEAD**

Run:
```bash
git worktree add ../TilingAtlas-atlas-k8-10 -b feat/reference-atlas-k8-10 HEAD
```
Expected: new worktree dir created, branch `feat/reference-atlas-k8-10` checked out from the current HEAD (all reference-atlas code + `ctrnact.json` present). Do all subsequent work in `../TilingAtlas-atlas-k8-10`.

- [ ] **Step 2: Install + baseline build**

Run: `cd ../TilingAtlas-atlas-k8-10 && pnpm install && pnpm build`
Expected: clean build (the pre-existing baseline compiles).

---

## Task 2: `loadReferenceAtlasShard` service function (TDD)

**Files:**
- Modify: `lib/services/referenceAtlas.ts` (append after `loadReferenceAtlas`, ~line 105)
- Test: `tests/referenceAtlasShard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/referenceAtlasShard.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { loadReferenceAtlasShard } from "@/lib/services/referenceAtlas";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

const sample: ReferenceTiling[] = [
  {
    id: "ctrnact-08_stub",
    source: "ctrnact",
    k: 8,
    family: "3.4.6",
    renderCell: { cellPolygons: [], basis: [] } as unknown as ReferenceTiling["renderCell"],
    discoverer: "Marek Čtrnáct",
    certification: "reproduced",
  },
];

afterEach(() => vi.unstubAllGlobals());

describe("loadReferenceAtlasShard", () => {
  it("fetches /reference-atlas-k{k}.json and caches per-k (one fetch for repeat calls)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(sample) });
    vi.stubGlobal("fetch", fetchMock);

    const first = await loadReferenceAtlasShard(8);
    const second = await loadReferenceAtlasShard(8);

    expect(first).toEqual(sample);
    expect(second).toBe(first); // cache hit returns the same reference
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/reference-atlas-k8.json");
  });

  it("rejects and does not cache on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve([]) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadReferenceAtlasShard(9)).rejects.toThrow("reference-atlas-k9.json: HTTP 404");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/referenceAtlasShard.test.ts`
Expected: FAIL — `loadReferenceAtlasShard` is not exported.

- [ ] **Step 3: Implement `loadReferenceAtlasShard`**

Append to `lib/services/referenceAtlas.ts` (after the existing `loadReferenceAtlas`):
```ts
// Per-k lazy shards for the higher-k Čtrnáct atlas (k≥8, generated by scripts/build-reference-atlas.ts
// into public/reference-atlas-k{k}.json). Fetched only when that k is selected in the shelf filter, so
// a heavy shard (k=10 ≈ tens of MB) never loads unless the user opens it. Cached per-k across the session.
const shardCache = new Map<number, ReferenceTiling[]>();
const shardInflight = new Map<number, Promise<ReferenceTiling[]>>();

export async function loadReferenceAtlasShard(k: number): Promise<ReferenceTiling[]> {
  const cached = shardCache.get(k);
  if (cached) return cached;
  const existing = shardInflight.get(k);
  if (existing) return existing;
  const p = fetch(`/reference-atlas-k${k}.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`reference-atlas-k${k}.json: HTTP ${res.status}`);
      return res.json() as Promise<ReferenceTiling[]>;
    })
    .then((data) => {
      shardCache.set(k, data);
      shardInflight.delete(k);
      return data;
    })
    .catch((err) => {
      shardInflight.delete(k);
      throw err;
    });
  shardInflight.set(k, p);
  return p;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/referenceAtlasShard.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/services/referenceAtlas.ts tests/referenceAtlasShard.test.ts
git commit -m "feat(atlas): loadReferenceAtlasShard — per-k lazy shard fetch"
```

---

## Task 3: Build script emits k=8–10 shards

**Files:**
- Modify: `scripts/build-reference-atlas.ts` (`buildCtrnact` at line 293; `main` at line 526–539)

This is a data-build script (heavy exact-arithmetic reconstruction, file side effects), so it is verified by running it and asserting the output, not by a unit test.

- [ ] **Step 1: Generalize `buildCtrnact` to `buildCtrnactAtK(k)`**

Replace the whole `buildCtrnact()` function (lines 293–336) with:
```ts
const CTRNACT_TARGETS: Record<number, number> = { 7: 1472, 8: 2850, 9: 5960, 10: 11866 };

function buildCtrnactAtK(k: number): ReferenceTiling[] {
	const dsPath = path.join(ROOT, 'figures', 'data', 'ctrnact.json');
	if (!fs.existsSync(dsPath)) {
		log(`(no figures/data/ctrnact.json — skipping k=${k})\n`);
		return [];
	}
	const ds = JSON.parse(fs.readFileSync(dsPath, 'utf8')) as {
		tilings: { id: string; k: number; T1?: number[]; T2?: number[]; Seed?: number[][] }[];
	};
	const out: ReferenceTiling[] = [];
	const skips: { id: string; reason: string }[] = [];
	let total = 0;
	let done = 0;
	for (const t of ds.tilings) {
		if (t.k !== k) continue;
		total++;
		if (!t.T1 || !t.T2 || !t.Seed) {
			skips.push({ id: t.id, reason: 'no geometry in ctrnact.json' });
			continue;
		}
		const rec = reconstructOracleCell(t.id, { T1: t.T1, T2: t.T2, Seed: t.Seed });
		if (!('cell' in rec)) {
			skips.push({ id: t.id, reason: rec.error });
			continue;
		}
		out.push({
			id: t.id,
			source: 'ctrnact',
			k,
			family: familyLabel(rec.cell),
			renderCell: cellToRenderData(rec.cell),
			exactSource: { kind: 'seed', T1: t.T1, T2: t.T2, Seed: t.Seed },
		});
		if (++done % 500 === 0) log(`    …k=${k}: ${done} reconstructed`);
	}
	const target = CTRNACT_TARGETS[k];
	const flag = out.length === target && total === target ? '✓' : '⚑';
	log(`  k=${k}: ${out.length}/${total} reconstructed (target ${target ?? '?'})  ${flag}`);
	if (skips.length === 0) log('  no skips ✓');
	else {
		log(`  ⚑ ${skips.length} SKIP(s):`);
		for (const s of skips.slice(0, 15)) log(`      ✗ ${s.id}: ${s.reason}`);
	}
	return out;
}
```

- [ ] **Step 2: Add the shard-writer function**

Immediately after `buildCtrnactAtK`, add:
```ts
// Phase 3b — the higher-k Čtrnáct tiers (k=8..10) as SEPARATE lazy-loaded shards, so the base
// reference-atlas.json stays k≤7 and small. Each shard is stamped with discoverer + certification
// (same attribution main() applies to the base atlas) and written sorted by id. Reproduced, never
// certified. k=10 is the heaviest (~tens of MB) — logged loud so the payload is never a surprise.
function writeHigherKShards(): void {
	log('=== Phase 3b: higher-k Čtrnáct shards (k=8..10, lazy-loaded on demand) ===');
	for (const k of [8, 9, 10]) {
		const entries = buildCtrnactAtK(k);
		for (const t of entries) {
			const a = attribute(t);
			t.discoverer = a.discoverer;
			t.certification = a.certification;
		}
		entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		const outPath = path.join(ROOT, 'public', `reference-atlas-k${k}.json`);
		fs.writeFileSync(outPath, JSON.stringify(entries, null, 0) + '\n');
		const bytes = fs.statSync(outPath).size;
		log(`  → ${path.relative(ROOT, outPath)}  (${entries.length} tilings, ${(bytes / 1e6).toFixed(1)} MB)`);
	}
	log('');
}
```

- [ ] **Step 3: Update `main()` call sites**

In `main()`, replace the Phase-3 call (line 532):
```ts
	if (!argv.includes('--no-ctrnact')) atlas.push(...buildCtrnactAtK(7));
	else log('(--no-ctrnact: skipping Phase 3)\n');
```
Then, after the base file is written (`fs.writeFileSync(OUT_PATH, ...)` at line 556) and before the `byK` summary block, add:
```ts
	if (!argv.includes('--no-ctrnact') && !argv.includes('--no-shards')) writeHigherKShards();
	else log('(--no-shards or --no-ctrnact: skipping Phase 3b higher-k shards)\n');
```

- [ ] **Step 4: Update the stale Phase-3 header comment**

Change the comment block above `buildCtrnactAtK` (was lines 287–292, starting `// Phase 3 — Marek Čtrnáct k=7`) so its last sentence reads:
```ts
// geometry set lives in that file). k=7 ships in the base atlas; k=8..10 ship as separate lazy shards
// (Phase 3b). An UNPROVEN exhaustive search: display-only, never certified.
```

- [ ] **Step 5: Run the build to produce the shards**

Run: `pnpm tsx scripts/build-reference-atlas.ts --no-stars`
Expected: log shows `Phase 3b` with three `→ public/reference-atlas-k{8,9,10}.json` lines, each flagged `✓`, `no skips ✓`. (`--no-stars` skips the slow star phases; Galebach + k=7 + Phase 3b still run.)

- [ ] **Step 6: Assert shard counts**

Run:
```bash
node -e 'for(const k of [8,9,10]){const a=require(`./public/reference-atlas-k${k}.json`);const want={8:2850,9:5960,10:11866}[k];console.log(`k=${k}: ${a.length} (expect ${want})`, a.length===want?"OK":"MISMATCH");}'
```
Expected: three `OK` lines.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-reference-atlas.ts public/reference-atlas-k8.json public/reference-atlas-k9.json public/reference-atlas-k10.json
git commit -m "feat(atlas): emit k=8-10 Ctrnact shards from build-reference-atlas"
```

---

## Task 4: Wire on-demand shards into ReferenceShelf

**Files:**
- Modify: `components/reference-shelf.tsx` (`K_OPTIONS` line 23; `ReferenceShelf` body lines 42–244)

- [ ] **Step 1: Extend the k options and import the shard loader**

Change line 23:
```ts
const K_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
```
In the import from `@/lib/services/referenceAtlas` (lines 12–16), add `loadReferenceAtlasShard`:
```ts
import {
	loadReferenceAtlas,
	loadReferenceAtlasShard,
	matchesReferenceFilters,
	type ReferenceTiling,
	type ReferenceFilter,
} from "@/lib/services/referenceAtlas";
```

- [ ] **Step 2: Add shard state**

After the existing `const [tilings, setTilings] = ...` state declarations (after line 54), add:
```ts
	const [shards, setShards] = useState<Map<number, ReferenceTiling[]>>(new Map());
	const [loadingShards, setLoadingShards] = useState<Set<number>>(new Set());
	const [shardErrors, setShardErrors] = useState<Map<number, string>>(new Map());
```

- [ ] **Step 3: Add the on-demand load effect**

After the existing `useEffect(() => { setCurrentPage(1); }, [filters]);` (line 66–68), add:
```ts
	// Fetch a k≥8 shard the first time that k is selected. k≤7 lives in the base atlas already.
	useEffect(() => {
		const wanted = (filters.kValues ?? []).filter((k) => k >= 8);
		for (const k of wanted) {
			if (shards.has(k) || loadingShards.has(k) || shardErrors.has(k)) continue;
			setLoadingShards((s) => new Set(s).add(k));
			loadReferenceAtlasShard(k)
				.then((data) => setShards((m) => new Map(m).set(k, data)))
				.catch((e) =>
					setShardErrors((m) => new Map(m).set(k, e instanceof Error ? e.message : String(e))),
				)
				.finally(() =>
					setLoadingShards((s) => {
						const n = new Set(s);
						n.delete(k);
						return n;
					}),
				);
		}
	}, [filters.kValues, shards, loadingShards, shardErrors]);
```

- [ ] **Step 4: Merge shards into the working set**

Replace the `filtered` memo (lines 92–97) with a merged source:
```ts
	const allTilings = useMemo(() => {
		if (!tilings) return null;
		const extra: ReferenceTiling[] = [];
		for (const list of shards.values()) extra.push(...list);
		return extra.length ? [...tilings, ...extra] : tilings;
	}, [tilings, shards]);

	const filtered = useMemo(() => {
		if (!allTilings) return [];
		return allTilings
			.filter((t) => matchesReferenceFilters(t, filters))
			.sort((a, b) => a.k - b.k || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	}, [allTilings, filters]);
```

- [ ] **Step 5: Add a loading indicator by the count + an on-demand hint**

Replace the count pill block (lines 189–191) with one that also shows shard loading/errors:
```ts
						<span className="text-xs px-2 py-0.5 rounded-full bg-surface-overlay border border-line text-fg-muted">
							{filtered.length} tilings
						</span>
						{loadingShards.size > 0 ? (
							<span className="flex items-center gap-1.5 text-xs text-fg-muted">
								<Loader2 size={12} className="animate-spin text-sky-400" />
								loading k={[...loadingShards].sort((a, b) => a - b).join(", ")}…
							</span>
						) : null}
						{shardErrors.size > 0 ? (
							<span className="text-xs text-danger">
								failed to load k={[...shardErrors.keys()].sort((a, b) => a - b).join(", ")}
							</span>
						) : null}
```
Then, directly under the `Vertex count (k)` `ButtonGroup` (after line 139, inside that `SidebarSection`), add the hint:
```ts
							<p className="mt-1.5 text-[10px] text-fg-disabled">k ≥ 8 loads on demand.</p>
```

- [ ] **Step 6: Update the file header comment (k range)**

Change the comment at lines 19–22 so the first sentence reads:
```ts
// The unified Tiling Library: one display-only atlas of every tiling (regular k=1..7 in the base file,
// k=8..10 lazy-loaded per-k shards, + stars), fetched from public/reference-atlas*.json.
```

- [ ] **Step 7: Typecheck + build**

Run: `pnpm build`
Expected: compiles clean, no type errors or lint warnings.

- [ ] **Step 8: Commit**

```bash
git add components/reference-shelf.tsx
git commit -m "feat(atlas): lazy k=8-10 shards in the Reference shelf (on-demand + merge)"
```

---

## Task 5: End-to-end verification

**Files:** none (verification + docs).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all files pass (including the new `referenceAtlasShard.test.ts`), no OOM.

- [ ] **Step 2: Manual e2e in the dev app**

Run: `pnpm dev`, open `/library`, switch to `Reference (Oracle)`.
Verify, in order:
- Default view shows k≤7 only; no k=8/9/10 shard is fetched (check the Network tab — no `reference-atlas-k*.json` requests yet).
- Select k=8 in the filter → one `reference-atlas-k8.json` request fires, the "loading k=8…" indicator shows, then 2,850 tilings paginate at 24/page and cards render.
- Select k=9, then k=10 → each shard fetches exactly once; re-selecting a loaded k does not refetch.
- The count pill matches the selected totals; the certification badge on the cards reads reproduced-style (not certified).

- [ ] **Step 3: Update STATUS cache**

In `docs/STATUS.md`, under the repo-state section, add a one-line note that the Reference shelf now serves k=8–10 via lazy per-k shards (display-only, reproduced). Keep it to one line (this file is the disposable cache).

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(atlas): note k=8-10 lazy shards on the Reference shelf"
```

- [ ] **Step 5: Finish the branch**

Use superpowers:finishing-a-development-branch to decide merge/PR/cleanup.

---

## Self-review notes

- Spec coverage: data pipeline (Task 3), lazy loading model (Task 2 + Task 4 Step 3–4), UI/K-filter (Task 4 Step 1/5/6), payload honesty + completeness logging (Task 3 Step 1–2 target/skip flags; Task 4 Step 5 loading/error surface), testing (Task 2, Task 5). All covered.
- Type consistency: `loadReferenceAtlasShard(k: number): Promise<ReferenceTiling[]>` defined in Task 2, imported/used in Task 4. `buildCtrnactAtK(k)` defined and called (7 in main, 8/9/10 in `writeHigherKShards`) in Task 3. `attribute()`, `familyLabel`, `cellToRenderData`, `reconstructOracleCell` are existing symbols reused with their current signatures.
- Out of scope confirmed unchanged: certified shelf, /play picker, proof pipeline, k≥11.
