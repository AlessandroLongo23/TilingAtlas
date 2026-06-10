# TH-4 + TH-13 Star Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the CC-side finite exact computations for the star lane — the TH-4 d_max table (two independent routes, per-cell agreement gate) and the TH-13 γ-feasibility table — as engine modules + thin CLI scripts + pinned tests + committed logs.

**Architecture:** One computation engine in two library modules (`StarDmaxRoute2.ts` = independent engine with zero StarVC imports; `StarTables.ts` = Route 1 wrapper + agreement checks + TH-13 table), consumed by two thin CLI scripts (all `node:fs` there) and by pinned-constants tests. Published numbers are Route 2's; Route 1 agreement and the `fig3le1 == max(fig4, fig3eq1)` identity are hard gates.

**Tech Stack:** TypeScript, vitest, `pnpm tsx` scripts. Spec: `docs/superpowers/specs/2026-06-10-th4-th13-star-tables-design.md` — read it first; the premises P1–P4 and pinned constants there are normative.

**Worktree:** `~/.config/superpowers/worktrees/TilingAtlas/th4-th13-star-tables`, branch `feat/th4-th13-star-tables` off master@`0291e83`. Do NOT touch `lib/classes/algorithm/StarVC.ts` or `scripts/scout-star-inring.ts`.

**Hand-derived expectations (from spec review; if the engine disagrees with ANY of these, STOP and reconcile arithmetic before pinning — do not "fix" the test to match the code or vice versa without understanding which is wrong):**
- regular-only: fig4 = 6, fig3(=1) = 0 (empty stratum), fig3(≤1) = 6
- all-32 envelope fig4 = 9; dent-reg-19 envelope fig4 = 9; all-32 envelope fig3(=1) = 6
- every 𝓕(n,1) fig4 = 9; every 𝓕(n,2) fig4 = 8
- TH-13 verdict counts: 19 REGULAR-FILLABLE / 8 POINT-ONLY / 5 UNFILLABLE; UNFILLABLE set = {3\*@3, 4\*@5, 6\*@7, 8\*@8, 12\*@9} (the γ=11 variants)

---

### Task 1: Route 2 variant derivation (`StarDmaxRoute2.ts`, part 1)

**Files:**
- Create: `lib/classes/algorithm/StarDmaxRoute2.ts`
- Test: `tests/star-vc.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `tests/star-vc.test.ts` (imports go at the top of the file with the existing ones; the repo uses tabs):

```ts
import {
	r2AllVariants,
	r2DentRegVariants,
	r2Dmax,
	r2RegInteriorU,
	R2_STAR_NS,
} from "@/classes/algorithm/StarDmaxRoute2";
```

```ts
describe("TH-4 — Route 2 alphabet derivation (independent of StarVC; drift sentinel)", () => {
	const key = (v: { n: number; alphaU: number }) => `${v.n}*@${v.alphaU}`;
	it("derives the same 32-variant set as inRingStarVariants from the P3 formulas", () => {
		expect(r2AllVariants().map(key).sort()).toEqual(inRingStarVariants().map(key).sort());
	});
	it("derives the same dent-reg-19 subset as dentRegularFillableVariants", () => {
		expect(r2DentRegVariants().map(key).sort()).toEqual(dentRegularFillableVariants().map(key).sort());
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/star-vc.test.ts 2>&1 | tail -15`
Expected: FAIL — cannot resolve `@/classes/algorithm/StarDmaxRoute2`.

- [ ] **Step 3: Create the module** — `lib/classes/algorithm/StarDmaxRoute2.ts` (complete file; `r2Dmax` included here so the import list in Step 1 compiles — its tests come in Task 2):

```ts
/**
 * TH-4 Route 2 — the INDEPENDENT d_max engine.
 * Spec: docs/superpowers/specs/2026-06-10-th4-th13-star-tables-design.md.
 *
 * Computes d_max = the max vertex degree (= corner count t) over corner multisets that
 *   (a) sum to exactly 24 π/12-units (2π);
 *   (b) have t ≥ 3 (P4: def:tiling-vertex — a t=2 dent-fill is a non-vertex);
 *   (c) contain ≤ 1 dent (P1: two reflex corners sum > 2π);
 *   (d) have #points ≤ ⌊t/2⌋ (P2 in pigeonhole form ⟺ a cyclic arrangement with no two
 *       points adjacent exists).
 * Myers prune (iii) (≥1 star point — uniformity-only, TH-5) is used NOWHERE: point-free
 * multisets (pure-regular, dent-no-point) are inside the search space.
 *
 * INDEPENDENCE (mechanically greppable): this module imports NOTHING from StarVC.ts. The
 * alphabet is derived from the P3 formulas — regular interior (n−2)·12/n; points
 * 0 < α < 12(n−2)/n; dents β = 24 − 24/n − α — over the inherited in-ring scope
 * n ∈ {3,4,6,8,12}. ⚑ P3 is SCOPE, not derivation: if the star scope ever widens (n=24,
 * off-ring α) every constant computed here must be recomputed.
 *
 * Token-class collapse (soundness): constraints (a)–(d) depend only on each corner's
 * (kind, u) pair, never on which variant supplies it — so the search runs over collapsed
 * (kind, u) classes, keeping one representative label per class for the witness. Route
 * agreement (StarTables) checks this against the uncollapsed live enumerator.
 */

export const R2_STAR_NS = [3, 4, 6, 8, 12] as const; // P3: inherited C7/ST-1 scope, NOT derived

export type R2Variant = { n: number; alphaU: number };
export type R2Stratum = 'fig4' | 'fig3eq1' | 'fig3le1';
/** dmax = 0 ⇔ the stratum admits no valid vertex for this alphabet (witness then []). */
export type R2Cell = { dmax: number; witness: string[] };

export function r2RegInteriorU(n: number): number {
	return ((n - 2) * 12) / n;
}

/** All in-ring variants from the P3 formulas (NOT from inRingStarVariants — independence). */
export function r2AllVariants(): R2Variant[] {
	const out: R2Variant[] = [];
	for (const n of R2_STAR_NS) for (let a = 1; a < r2RegInteriorU(n); a++) out.push({ n, alphaU: a });
	return out;
}

/** The dent-regular-fillable subset, from the formulas: γ = 24/n + α ∈ {regular interiors}. */
export function r2DentRegVariants(): R2Variant[] {
	const regs = new Set(R2_STAR_NS.map(r2RegInteriorU));
	return r2AllVariants().filter(({ n, alphaU }) => regs.has(24 / n + alphaU));
}

type ClassTok = { kind: 'reg' | 'pt' | 'dent'; u: number; rep: string };

/** Collapse an alphabet to (kind, u) classes, one representative label per class. */
function classes(variants: R2Variant[], withDents: boolean): ClassTok[] {
	const seen = new Map<string, ClassTok>();
	const add = (kind: ClassTok['kind'], u: number, rep: string) => {
		const k = `${kind}@${u}`;
		if (!seen.has(k)) seen.set(k, { kind, u, rep });
	};
	for (const n of R2_STAR_NS) add('reg', r2RegInteriorU(n), String(n));
	for (const { n, alphaU } of variants) add('pt', alphaU, `${n}*p@${alphaU}`);
	if (withDents) {
		for (const { n, alphaU } of variants) {
			const beta = 24 - 24 / n - alphaU;
			add('dent', beta, `${n}*d@${beta}`);
		}
	}
	return [...seen.values()].sort((a, b) => a.u - b.u || a.kind.localeCompare(b.kind));
}

/**
 * Exact d_max for one family/envelope alphabet and stratum. Exhaustive DFS over class
 * multisets (non-decreasing class index = combinations with repetition). The only prune is
 * the capacity bound (every further token costs ≥ 1 unit), which cannot remove a feasible
 * higher-t completion.
 */
export function r2Dmax(variants: R2Variant[], stratum: R2Stratum): R2Cell {
	const withDents = stratum !== 'fig4';
	const alphabet = classes(variants, withDents);
	let best: R2Cell = { dmax: 0, witness: [] };
	const stack: ClassTok[] = [];

	const dfs = (fromIdx: number, sum: number, pts: number, dents: number) => {
		if (sum === 24) {
			const t = stack.length;
			if (t < 3) return; //                                (b) t ≥ 3
			if (pts > Math.floor(t / 2)) return; //              (d) P2 pigeonhole
			if (stratum === 'fig3eq1' && dents !== 1) return; // stratum gate
			if (t > best.dmax) best = { dmax: t, witness: stack.map((c) => c.rep) };
			return;
		}
		if (stack.length + (24 - sum) <= best.dmax) return; //   capacity prune (units ≥ 1)
		for (let i = fromIdx; i < alphabet.length; i++) {
			const c = alphabet[i];
			if (sum + c.u > 24) continue;
			if (c.kind === 'dent' && dents >= 1) continue; //    (c) P1: ≤ 1 dent
			stack.push(c);
			dfs(i, sum + c.u, pts + (c.kind === 'pt' ? 1 : 0), dents + (c.kind === 'dent' ? 1 : 0));
			stack.pop();
		}
	};
	dfs(0, 0, 0, 0);
	return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/star-vc.test.ts 2>&1 | tail -8`
Expected: PASS (10 tests: 8 baseline + 2 new).

- [ ] **Step 5: Commit**

```bash
git add lib/classes/algorithm/StarDmaxRoute2.ts tests/star-vc.test.ts
git commit -m "feat(th4): Route 2 independent d_max engine — P3 formula alphabet, zero StarVC imports"
```

---

### Task 2: Route 2 pinned d_max constants

**Files:**
- Test: `tests/star-vc.test.ts` (append; module already exists from Task 1)

- [ ] **Step 1: Write the (initially failing-or-passing) pinned tests** — these pin the hand-derived constants from the spec. Append:

```ts
describe("TH-4 — pinned d_max constants (hand-derived, spec 2026-06-10; mismatch = STOP and reconcile)", () => {
	it("regular-only: fig4 = 6 (3⁶), fig3(=1) = 0 (no dents in alphabet ⇒ empty stratum), fig3(≤1) = 6", () => {
		expect(r2Dmax([], "fig4")).toEqual({ dmax: 6, witness: ["3", "3", "3", "3", "3", "3"] });
		expect(r2Dmax([], "fig3eq1").dmax).toBe(0);
		expect(r2Dmax([], "fig3le1").dmax).toBe(6);
	});
	it("all-32 envelope fig4 = 9 (4 × α=1 points + 5 triangles; t=10 needs ≥ 5·1+5·4 = 25 > 24)", () => {
		expect(r2Dmax(r2AllVariants(), "fig4").dmax).toBe(9);
	});
	it("dent-reg-19 envelope fig4 = 9 (3*@1 and 8*@1 are in the 19)", () => {
		expect(r2Dmax(r2DentRegVariants(), "fig4").dmax).toBe(9);
	});
	it("all-32 envelope fig3(=1) = 6 (β=13 dent + 3 × α=1 points + 2 triangles; t=7 needs ≥ 13+3+12 = 28 > 24)", () => {
		expect(r2Dmax(r2AllVariants(), "fig3eq1").dmax).toBe(6);
	});
	it("every F(n,1) fig4 = 9 and every F(n,2) fig4 = 8 (points repeat within one variant)", () => {
		for (const n of R2_STAR_NS) {
			expect(r2Dmax([{ n, alphaU: 1 }], "fig4").dmax, `F(${n},1)`).toBe(9);
			expect(r2Dmax([{ n, alphaU: 2 }], "fig4").dmax, `F(${n},2)`).toBe(8);
		}
	});
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run tests/star-vc.test.ts 2>&1 | tail -8`
Expected: PASS. If any pinned value fails: **STOP — do not adjust the pin or the engine to force agreement.** Print the engine's witness for the failing cell (`console.log(r2Dmax(...))`), re-derive by hand, and resolve which side is wrong (use superpowers:systematic-debugging). The witness for `regular-only fig4` must be exactly six triangles — if the engine returns a different valid 6-multiset first, relax that one assertion to `.dmax === 6` plus a sum/length check, and note it in the commit message.

- [ ] **Step 3: Commit**

```bash
git add tests/star-vc.test.ts
git commit -m "test(th4): pin hand-derived d_max constants — envelopes 9, F(n,1)=9, F(n,2)=8, fig3(=1) envelope 6"
```

---

### Task 3: Route 1 wrapper + agreement gate (`StarTables.ts`, part 1)

**Files:**
- Create: `lib/classes/algorithm/StarTables.ts`
- Test: `tests/star-vc.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append (and extend the import block):

```ts
import {
	computeDmaxRow,
	dmaxRowSpecs,
	degree7FalsifierPresent,
	STRATA,
} from "@/classes/algorithm/StarTables";
```

```ts
describe("TH-4 — route agreement + identity invariant (cheap rows: regular-only + all 32 families)", () => {
	it("route1 == route2 per cell and fig3(≤1) == max(fig4, fig3(=1)) per row", () => {
		// Envelope rows (mixed alphabets) are agreement-checked by the script run — the
		// committed log is the artifact; the enumerator cost there is too high for CI.
		const cheap = dmaxRowSpecs().filter((s) => s.variants.length <= 1);
		expect(cheap.length).toBe(33); // regular-only + 32 families
		for (const spec of cheap) {
			const row = computeDmaxRow(spec.label, spec.variants);
			for (const s of STRATA) expect(row.cells[s].agree, `${spec.label}/${s}`).toBe(true);
			expect(row.identityOk, spec.label).toBe(true);
		}
	});
	it("the review's degree-7 falsifier vertex appears in the enumeration (sanity anchor, NOT the acceptance)", () => {
		expect(degree7FalsifierPresent()).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/star-vc.test.ts 2>&1 | tail -15`
Expected: FAIL — cannot resolve `@/classes/algorithm/StarTables`.

- [ ] **Step 3: Create the module** — `lib/classes/algorithm/StarTables.ts` (complete file; the TH-13 half is added in Task 4):

```ts
/**
 * TH-4/TH-13 table assembly.
 * Spec: docs/superpowers/specs/2026-06-10-th4-th13-star-tables-design.md.
 *
 * Route 1 = the live enumerator (StarVC.enumerateStarVCs — Myers prunes (i)/(ii) verbatim)
 * + EXHAUSTIVE point-free fold-backs, because the enumerator hard-codes prune (iii) at
 * StarVC.ts:134 (unconditionally — includeDents does not bypass it). Case split over all
 * (i)/(ii)-admissible vertices: point-carrying (enumerator) | pure-regular (computed below;
 * corners ≥ 4u ⇒ t ≤ 6) | dent-no-point (computed below; β ≥ 13 ⇒ ≤ 11u left ⇒ ≤ 2
 * regulars ⇒ t ≤ 3). Both fold-backs are COMPUTED per alphabet, never asserted.
 *
 * Route 2 = StarDmaxRoute2 (independent — P3 formula alphabet, zero StarVC imports).
 * The published number is Route 2's; per-cell route agreement and the
 * fig3le1 == max(fig4, fig3eq1) identity are hard gates (exit non-zero in the scripts).
 */
import {
	enumerateStarVCs,
	inRingStarVariants,
	dentRegularFillableVariants,
	regInteriorU,
	canonicalVCName,
	STAR_NS,
} from './StarVC';
import {
	r2AllVariants,
	r2DentRegVariants,
	r2Dmax,
	r2RegInteriorU,
	R2_STAR_NS,
	type R2Variant,
	type R2Stratum,
	type R2Cell,
} from './StarDmaxRoute2';

export const STRATA: R2Stratum[] = ['fig4', 'fig3eq1', 'fig3le1'];

const REG_US = [...STAR_NS].map(regInteriorU); // [4, 6, 8, 9, 10]

/** Exact max t over pure-regular multisets summing to 24 (t ≥ 3). Computed, not asserted (= 6, 3⁶). */
function pureRegularMax(): number {
	let best = 0;
	const dfs = (fromIdx: number, sum: number, count: number) => {
		if (sum === 24) {
			if (count >= 3 && count > best) best = count;
			return;
		}
		for (let i = fromIdx; i < REG_US.length; i++) {
			if (sum + REG_US[i] > 24) continue;
			dfs(i, sum + REG_US[i], count + 1);
		}
	};
	dfs(0, 0, 0);
	return best;
}

/** Exact max t over {one family dent} + regulars summing to 24 (t ≥ 3); 0 if none exists. */
function dentNoPointMax(variants: R2Variant[]): number {
	let best = 0;
	for (const { n, alphaU } of variants) {
		const beta = 24 - 24 / n - alphaU;
		const dfs = (fromIdx: number, sum: number, count: number) => {
			if (sum === 24) {
				if (count >= 3 && count > best) best = count;
				return;
			}
			for (let i = fromIdx; i < REG_US.length; i++) {
				if (sum + REG_US[i] > 24) continue;
				dfs(i, sum + REG_US[i], count + 1);
			}
		};
		dfs(0, beta, 1);
	}
	return best;
}

/** Route 1 d_max: live enumerator (point-carrying VCs) + the computed point-free fold-backs. */
export function route1Dmax(variants: R2Variant[], stratum: R2Stratum): number {
	const withDents = stratum !== 'fig4';
	let best = 0;
	for (const vc of enumerateStarVCs({ variants, includeDents: withDents })) {
		const dents = vc.tokens.filter((t) => t.kind === 'dent').length;
		if (stratum === 'fig3eq1' && dents !== 1) continue;
		if (vc.tokens.length > best) best = vc.tokens.length;
	}
	if (stratum !== 'fig3eq1') best = Math.max(best, pureRegularMax()); // point-free, dent-free
	if (withDents) best = Math.max(best, dentNoPointMax(variants)); //    point-free, one dent
	return best;
}

export type DmaxCellPair = { route1: number; route2: R2Cell; agree: boolean };
export type DmaxRow = {
	label: string;
	variants: R2Variant[];
	cells: Record<R2Stratum, DmaxCellPair>;
	/** Route 2 identity: fig3le1 == max(fig4, fig3eq1) — Fig-3(≤1) adds no information. */
	identityOk: boolean;
};

export function computeDmaxRow(label: string, variants: R2Variant[]): DmaxRow {
	const cells = {} as Record<R2Stratum, DmaxCellPair>;
	for (const s of STRATA) {
		const route2 = r2Dmax(variants, s);
		const route1 = route1Dmax(variants, s);
		cells[s] = { route1, route2, agree: route1 === route2.dmax };
	}
	const identityOk =
		cells.fig3le1.route2.dmax === Math.max(cells.fig4.route2.dmax, cells.fig3eq1.route2.dmax);
	return { label, variants, cells, identityOk };
}

/** Row order: regular-only sanity, the 32 families, then the two (expensive) envelopes. */
export function dmaxRowSpecs(): { label: string; variants: R2Variant[] }[] {
	return [
		{ label: 'regular-only', variants: [] },
		...r2AllVariants().map((v) => ({ label: `F(${v.n},${v.alphaU})`, variants: [v] })),
		{ label: 'envelope-dentreg-19', variants: r2DentRegVariants() },
		{ label: 'envelope-all-32', variants: r2AllVariants() },
	];
}

export function computeDmaxTable(
	onRow?: (row: DmaxRow, i: number, total: number) => void,
): { rows: DmaxRow[]; allChecksPass: boolean } {
	const specs = dmaxRowSpecs();
	const rows: DmaxRow[] = [];
	let ok = true;
	for (let i = 0; i < specs.length; i++) {
		const row = computeDmaxRow(specs[i].label, specs[i].variants);
		ok = ok && row.identityOk && STRATA.every((s) => row.cells[s].agree);
		rows.push(row);
		onRow?.(row, i, specs.length);
	}
	return { rows, allChecksPass: ok };
}

/**
 * The review's degree-7 falsifier [8*p@1, 3, 3, 3, 3*p@3, 3, 3] appears in the enumeration.
 * Restricting the alphabet to the two involved variants keeps this instant — enumerateStarVCs
 * over a superset alphabet only ADDS VCs, so presence here ⇒ presence in the all-32 run.
 */
export function degree7FalsifierPresent(): boolean {
	const name = canonicalVCName(['8*p@1', '3', '3', '3', '3*p@3', '3', '3']);
	const vcs = enumerateStarVCs({ variants: [{ n: 8, alphaU: 1 }, { n: 3, alphaU: 3 }] });
	return vcs.some((v) => v.name === name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/star-vc.test.ts 2>&1 | tail -8`
Expected: PASS. The agreement test is the heart of the deliverable — if any cheap row disagrees, **STOP** (systematic-debugging): print both values + the Route 2 witness for that cell; the likely suspects are the stratum filter (fig3eq1 vs ≤1) or the P2 pigeonhole form.

- [ ] **Step 5: Commit**

```bash
git add lib/classes/algorithm/StarTables.ts tests/star-vc.test.ts
git commit -m "feat(th4): Route 1 wrapper + computed point-free fold-backs + per-cell agreement gate"
```

---

### Task 4: TH-13 γ-feasibility table (`StarTables.ts`, part 2)

**Files:**
- Modify: `lib/classes/algorithm/StarTables.ts` (append)
- Test: `tests/star-vc.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append (extend the StarTables import with `computeDentFillTable`):

```ts
describe("TH-13 — dent-fill γ-feasibility table (computed, not asserted)", () => {
	const { rows, counts, crossChecksPass } = computeDentFillTable();
	it("cross-checks pass (19-count + set equality vs dentRegularFillableVariants, 32 rows, partition)", () => {
		expect(crossChecksPass).toBe(true);
	});
	it("verdict counts: 19 REGULAR-FILLABLE / 8 POINT-ONLY / 5 UNFILLABLE", () => {
		expect(counts["REGULAR-FILLABLE"]).toBe(19);
		expect(counts["POINT-ONLY"]).toBe(8);
		expect(counts["UNFILLABLE"]).toBe(5);
	});
	it("UNFILLABLE = exactly the five γ=11 (α-max) variants — provably Fig-4-absent", () => {
		const unf = rows.filter((r) => r.verdict === "UNFILLABLE").map((r) => `${r.n}*@${r.alphaU}`).sort();
		expect(unf).toEqual(["12*@9", "3*@3", "4*@5", "6*@7", "8*@8"]);
	});
	it("same-family point fill impossible everywhere (γ = α + 24/n ≠ α) — the single-variant rider", () => {
		for (const r of rows) expect(r.sameFamilyPointMatch, `${r.n}*@${r.alphaU}`).toBe(false);
	});
	it("dent-by-dent fill impossible everywhere (γ < 12 < β′)", () => {
		for (const r of rows) expect(r.dentMatches, `${r.n}*@${r.alphaU}`).toEqual([]);
	});
	it("every POINT-ONLY and REGULAR-FILLABLE row carries a gear column entry per point filler", () => {
		for (const r of rows) expect(r.gear.length).toBe(r.crossFamilyPointMatches.length);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/star-vc.test.ts 2>&1 | tail -10`
Expected: FAIL — `computeDentFillTable` not exported.

- [ ] **Step 3: Append the TH-13 half to `StarTables.ts`**:

```ts
// ───────────────────────────── TH-13 — γ-feasibility table ─────────────────────────────

export type GearCls = 'regular' | 'point' | 'both' | 'none';
export type DentFillVerdict = 'REGULAR-FILLABLE' | 'POINT-ONLY' | 'UNFILLABLE';
export type DentFillRow = {
	n: number;
	alphaU: number;
	betaU: number; //                       reflex dent angle β = 24 − 24/n − α
	gammaU: number; //                      dent-fill angle γ = 24 − β = 24/n + α
	regularMatches: number[]; //            m ∈ STAR_NS with regular interior == γ
	sameFamilyPointMatch: boolean; //       γ == α (arithmetically impossible; computed anyway)
	crossFamilyPointMatches: R2Variant[]; // m*@γ exists as an in-ring variant (variant-validity)
	dentMatches: R2Variant[]; //            (m, α′) with β′ == γ (expect ∅: γ < 12 < β′)
	gear: { filler: R2Variant; gammaPrimeU: number; cls: GearCls }[]; // lem:dentchain rung 1
	verdict: DentFillVerdict;
};

/** Which single corners can fill an angle γ — class only (first rung of the gear recursion). */
function fillClass(gammaU: number): GearCls {
	const reg = R2_STAR_NS.some((m) => r2RegInteriorU(m) === gammaU);
	const pt = R2_STAR_NS.some((m) => gammaU > 0 && gammaU < r2RegInteriorU(m));
	return reg && pt ? 'both' : reg ? 'regular' : pt ? 'point' : 'none';
}

export function computeDentFillTable(): {
	rows: DentFillRow[];
	counts: Record<DentFillVerdict, number>;
	crossChecksPass: boolean;
	crossCheckLog: string[];
} {
	const all = r2AllVariants();
	const rows: DentFillRow[] = all.map(({ n, alphaU }) => {
		const betaU = 24 - 24 / n - alphaU;
		const gammaU = 24 - betaU; // = 24/n + α
		const regularMatches = [...R2_STAR_NS].filter((m) => r2RegInteriorU(m) === gammaU);
		const crossFamilyPointMatches: R2Variant[] = [...R2_STAR_NS]
			.filter((m) => gammaU > 0 && gammaU < r2RegInteriorU(m)) // 0 < γ ⇒ m*@γ is a valid variant
			.map((m) => ({ n: m, alphaU: gammaU }));
		const dentMatches = all.filter((v) => 24 - 24 / v.n - v.alphaU === gammaU);
		const gear = crossFamilyPointMatches.map((filler) => ({
			filler,
			gammaPrimeU: 24 / filler.n + gammaU,
			cls: fillClass(24 / filler.n + gammaU),
		}));
		const verdict: DentFillVerdict =
			regularMatches.length > 0 ? 'REGULAR-FILLABLE'
			: crossFamilyPointMatches.length > 0 ? 'POINT-ONLY'
			: 'UNFILLABLE';
		return {
			n, alphaU, betaU, gammaU, regularMatches,
			sameFamilyPointMatch: gammaU === alphaU,
			crossFamilyPointMatches, dentMatches, gear, verdict,
		};
	});

	const counts: Record<DentFillVerdict, number> = {
		'REGULAR-FILLABLE': 0, 'POINT-ONLY': 0, 'UNFILLABLE': 0,
	};
	for (const r of rows) counts[r.verdict]++;

	const crossCheckLog: string[] = [];
	let crossChecksPass = true;
	const check = (name: string, cond: boolean) => {
		crossCheckLog.push(`${cond ? '✓' : '✗'} ${name}`);
		crossChecksPass = crossChecksPass && cond;
	};
	const key = (v: R2Variant) => `${v.n}*@${v.alphaU}`;
	const regSet = rows.filter((r) => r.verdict === 'REGULAR-FILLABLE').map(key).sort().join(',');
	const filterSet = dentRegularFillableVariants().map(key).sort().join(',');
	check(`rows (${rows.length}) == inRingStarVariants().length (${inRingStarVariants().length})`,
		rows.length === inRingStarVariants().length);
	check(`REGULAR-FILLABLE count (${counts['REGULAR-FILLABLE']}) == dentRegularFillableVariants().length (${dentRegularFillableVariants().length})`,
		counts['REGULAR-FILLABLE'] === dentRegularFillableVariants().length);
	check('REGULAR-FILLABLE set == dentRegularFillableVariants() set', regSet === filterSet);
	check('same-family point match impossible everywhere (γ = α + 24/n ≠ α)',
		rows.every((r) => !r.sameFamilyPointMatch));
	check('dent matches empty everywhere (γ < 12 < β′)', rows.every((r) => r.dentMatches.length === 0));
	check('verdicts partition the 32',
		counts['REGULAR-FILLABLE'] + counts['POINT-ONLY'] + counts['UNFILLABLE'] === rows.length);
	return { rows, counts, crossChecksPass, crossCheckLog };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/star-vc.test.ts 2>&1 | tail -8`
Expected: PASS. If the 19/8/5 counts disagree: **STOP** — the 19 is cross-checked against the live filter, so a 19-failure means the formula derivation drifted; an 8/5 failure means the plan's hand-derivation was wrong — re-derive (γ values per n: n=3 → {9,10,11}, n=4 → {7..11}, n=6 → {5..11}, n=8 → {4..11}, n=12 → {3..11}; non-regular γ ≤ 9 are {3,5,7} occurrences + γ=11 is always UNFILLABLE) before touching either side.

- [ ] **Step 5: Commit**

```bash
git add lib/classes/algorithm/StarTables.ts tests/star-vc.test.ts
git commit -m "feat(th13): γ-feasibility table — verdicts computed, gear column, live-filter cross-checks"
```

---

### Task 5: TH-4 CLI script + committed log

**Files:**
- Create: `scripts/star-dmax-th4.ts`

- [ ] **Step 1: Create the script** (thin wrapper; all `node:fs` here):

```ts
/*
 * TH-4 — exact star d_max table (constants INPUT to TA's restated Remark 3 / cor:starbox(i);
 * TH-4 is NOT discharged by this table). Spec: docs/superpowers/specs/2026-06-10-th4-th13-star-tables-design.md.
 * Run: pnpm tsx scripts/star-dmax-th4.ts
 * Writes experiments/results/th4-star-dmax-<commit>-<date>.log synchronously; exit 1 on any check failure.
 */
import { execSync } from 'node:child_process';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { computeDmaxTable, degree7FalsifierPresent, STRATA, type DmaxRow } from '@/classes/algorithm/StarTables';
import type { R2Stratum } from '@/classes/algorithm/StarDmaxRoute2';

const commit = execSync('git rev-parse --short HEAD').toString().trim();
const date = new Date().toISOString().slice(0, 10);
const file = `experiments/results/th4-star-dmax-${commit}-${date}.log`;
mkdirSync('experiments/results', { recursive: true });
writeFileSync(file, '');
const out = (line = '') => { console.log(line); appendFileSync(file, line + '\n'); };

out(`=== TH-4 — exact star d_max table (commit ${commit}, ${date}) ===`);
out();
out('PREMISES (stated, not inherited from the enumerator — see spec §"Stated premises"):');
out('  P1 (≤1 dent/vertex): dents are reflex, β = 24 − 24/n − α > 12 units; two reflex corners sum > 24u = 2π. ∎');
out('  P2 (no two adjacent points): isotoxal star edges run point→dent; two adjacent points at v put a dent');
out('     of EACH star at the shared edge\'s far endpoint — two reflex corners > 2π by P1\'s arithmetic. ∎');
out('     (Both k-independent. Myers prune (iii) — ≥1 point, uniformity-only, TH-5 — is used NOWHERE here.)');
out('  P3 (scope, inherited NOT derived): n ∈ {3,4,6,8,12}, 0 < α < 12(n−2)/n, π/12 units (32 variants).');
out('     ⚑ If the star scope widens (n=24, off-ring α), every constant below must be recomputed.');
out('  P4 (degree = t over TRUE vertices): t ≥ 3 per def:tiling-vertex; t=2 dent-fills are non-vertices.');
out('  Strata: Fig-4 = 0 dents | Fig-3(=1) = exactly 1 (the TH-3 Γ⋆ stratum) | Fig-3(≤1) = identity');
out('     max(Fig-4, Fig-3(=1)) — reported for the work order, adds no information beyond the identity check.');
out();
out('Route 2 (PUBLISHED) = independent multiset engine (StarDmaxRoute2: P3 formulas, zero StarVC imports).');
out('Route 1 (CHECK) = enumerateStarVCs (prunes (i)/(ii) verbatim; prune (iii) hard-coded at StarVC.ts:134');
out('  is bypassed via computed point-free fold-backs: pure-regular ≤ 6; dent-no-point β ≥ 13 ⇒ t ≤ 3).');
out('Per-cell agreement + the Fig-3(≤1) identity are HARD GATES (exit 1 on failure).');
out();

const t0 = Date.now();
const cellStr = (row: DmaxRow, s: R2Stratum) =>
	`${row.cells[s].route2.dmax}${row.cells[s].agree ? '' : ` ✗R1=${row.cells[s].route1}`}`;
const { rows, allChecksPass } = computeDmaxTable((row, i, total) => {
	const el = (Date.now() - t0) / 1000;
	const eta = (el / (i + 1)) * (total - i - 1);
	out(`  [${String(i + 1).padStart(2)}/${total}] ${row.label.padEnd(19)} fig4=${cellStr(row, 'fig4')}  fig3(=1)=${cellStr(row, 'fig3eq1')}  fig3(≤1)=${cellStr(row, 'fig3le1')}${row.identityOk ? '' : '  ✗ IDENTITY'}  [${el.toFixed(1)}s, ETA ${eta.toFixed(0)}s]`);
});

out();
out('ENVELOPE WITNESSES (Route 2):');
for (const label of ['envelope-dentreg-19', 'envelope-all-32']) {
	const row = rows.find((r) => r.label === label)!;
	for (const s of STRATA) out(`  ${label} ${s}: d=${row.cells[s].route2.dmax}  [${row.cells[s].route2.witness.join(', ')}]`);
}

const get = (label: string) => rows.find((r) => r.label === label)!;
const checks: [string, boolean][] = [
	['regular-only fig4 == 6 (recovers the regular bound)', get('regular-only').cells.fig4.route2.dmax === 6],
	['regular-only fig3(=1) == 0 (no dents in alphabet ⇒ empty stratum)', get('regular-only').cells.fig3eq1.route2.dmax === 0],
	['envelope-all-32 fig4 == 9', get('envelope-all-32').cells.fig4.route2.dmax === 9],
	['envelope-dentreg-19 fig4 == 9', get('envelope-dentreg-19').cells.fig4.route2.dmax === 9],
	['every F(n,1) fig4 == 9', [3, 4, 6, 8, 12].every((n) => get(`F(${n},1)`).cells.fig4.route2.dmax === 9)],
	['every F(n,2) fig4 == 8', [3, 4, 6, 8, 12].every((n) => get(`F(${n},2)`).cells.fig4.route2.dmax === 8)],
	['envelope-all-32 fig3(=1) == 6', get('envelope-all-32').cells.fig3eq1.route2.dmax === 6],
	['degree-7 falsifier present in the enumeration (sanity anchor)', degree7FalsifierPresent()],
	['per-cell route agreement + Fig-3(≤1) identity on ALL rows', allChecksPass],
];
let pass = true;
out();
out('PINNED EXPECTATIONS (hand-derived in the spec):');
for (const [name, ok] of checks) { out(`  ${ok ? '✓' : '✗'} ${name}`); pass = pass && ok; }

const dmaxEnv = get('envelope-all-32').cells.fig3le1.route2.dmax; // covers both strata (fig3(=1) ≤ this)
out();
out('CONSEQUENCE FOR TA (constants input — TH-4 is discharged by TA\'s re-proved transfer, not here):');
out(`  d_max(in-ring envelope, all strata) = ${dmaxEnv}`);
out(`  ⇒ δ ≤ 2k·d_max = ${2 * dmaxEnv}k   (restated Remark 3; vs crude guess ≈11 ⇒ 22k; regular-derived 12k is FALSE for stars)`);
out(`  ⇒ F ≤ (d_max/2 − 1)·12k = ${(dmaxEnv / 2 - 1) * 12}k   (cor:starbox(i) with the exact constant)`);
out();
out(`${pass ? 'ALL CHECKS PASSED' : '✗ CHECK FAILURES — table NOT publishable'}  (${((Date.now() - t0) / 1000).toFixed(1)}s total)`);
process.exit(pass ? 0 : 1);
```

- [ ] **Step 2: Commit the script** (before running — the log filename embeds the code commit):

```bash
git add scripts/star-dmax-th4.ts
git commit -m "feat(th4): d_max table CLI — premise preamble, pinned-expectation gate, TA constants"
```

- [ ] **Step 3: Run it**

Run: `pnpm tsx scripts/star-dmax-th4.ts`
Expected: exit 0, `ALL CHECKS PASSED`, log at `experiments/results/th4-star-dmax-<commit>-<date>.log`. Note the total runtime — if the envelope rows take > ~5 min, record the number in the log header comment of the NOTES entry (Task 8); do NOT add caps.

- [ ] **Step 4: Verify exit code and log content**

Run: `echo "exit=$?" && tail -20 experiments/results/th4-star-dmax-*.log`
Expected: `exit=0`; the consequence block shows `δ ≤ 18k` and `F ≤ 42k`.

- [ ] **Step 5: Commit the log**

```bash
git add experiments/results/th4-star-dmax-*.log
git commit -m "results(th4): exact d_max table — envelope 9 (Fig-3(=1) 6) ⇒ δ ≤ 18k, F ≤ 42k; both routes agree on every cell"
```

---

### Task 6: TH-13 CLI script + committed log

**Files:**
- Create: `scripts/star-dentfill-th13.ts`

- [ ] **Step 1: Create the script**:

```ts
/*
 * TH-13 — dent-fill γ-feasibility table (scopes TA's lemma attempt; TH-13 is NOT discharged by
 * this table). Spec: docs/superpowers/specs/2026-06-10-th4-th13-star-tables-design.md.
 * Run: pnpm tsx scripts/star-dentfill-th13.ts
 * Writes experiments/results/th13-dentfill-table-<commit>-<date>.log synchronously; exit 1 on failure.
 */
import { execSync } from 'node:child_process';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { computeDentFillTable } from '@/classes/algorithm/StarTables';

const commit = execSync('git rev-parse --short HEAD').toString().trim();
const date = new Date().toISOString().slice(0, 10);
const file = `experiments/results/th13-dentfill-table-${commit}-${date}.log`;
mkdirSync('experiments/results', { recursive: true });
writeFileSync(file, '');
const out = (line = '') => { console.log(line); appendFileSync(file, line + '\n'); };

out(`=== TH-13 — dent-fill γ-feasibility table (commit ${commit}, ${date}) ===`);
out();
out('Per in-ring variant (n,α): dent β = 24 − 24/n − α; dent-fill angle γ = 24 − β = 24/n + α.');
out('ALL columns computed from the P3 formulas, none asserted; cross-checked against the live filter.');
out('Verdicts: REGULAR-FILLABLE (kept by dentRegularFillableVariants today) | POINT-ONLY (dropped today;');
out('  star-point-fillable in the MIXED universe only) | UNFILLABLE (no single corner — provably Fig-4-absent,');
out('  sharper than the filter\'s current justification). Gear column = first rung of lem:dentchain:');
out('  each point filler m*@γ\'s own dent-fill angle γ′ = 24/m + γ and its fill class.');
out();

const t0 = Date.now();
const { rows, counts, crossChecksPass, crossCheckLog } = computeDentFillTable();
const vkey = (v: { n: number; alphaU: number }) => `${v.n}*@${v.alphaU}`;
out('variant      β   γ   reg-matches   same-fam-pt   cross-fam-pt-matches          dent   verdict');
for (const r of rows) {
	out(
		`${vkey(r).padEnd(11)} ${String(r.betaU).padStart(3)} ${String(r.gammaU).padStart(3)}   ` +
		`${(r.regularMatches.join(',') || '—').padEnd(13)} ${(r.sameFamilyPointMatch ? '⚠ YES' : 'no').padEnd(13)} ` +
		`${(r.crossFamilyPointMatches.map(vkey).join(' ') || '—').padEnd(29)} ` +
		`${(r.dentMatches.length ? '⚠' : '∅').padEnd(6)} ${r.verdict}`,
	);
	for (const g of r.gear) out(`             gear: ${vkey(g.filler)} fills → its own γ′=${g.gammaPrimeU} is ${g.cls}`);
}

out();
out(`VERDICT COUNTS: ${counts['REGULAR-FILLABLE']} REGULAR-FILLABLE / ${counts['POINT-ONLY']} POINT-ONLY / ${counts['UNFILLABLE']} UNFILLABLE`);
out();
out('CROSS-CHECKS:');
for (const line of crossCheckLog) out(`  ${line}`);
out();
out('RIDER (verified by the same-family column): in any tiling whose stars are ALL one variant (n,α),');
out('  no dent can be star-point-filled (γ = α + 24/n ≠ α) ⇒ the regular-filler hypothesis holds');
out('  UNCONDITIONALLY for single-variant in-ring tilings. The at-risk class is MIXED-variant only;');
out('  gear chains (lem:dentchain) require ≥ 2 distinct variants.');
out();
out('⚑ TH-13 is NOT discharged by this table — it scopes TA\'s lemma attempt (vacuous where no point');
out('  match exists; the local-exclusion attempt is needed exactly on the cross-family matches above).');
out(`${crossChecksPass ? 'ALL CROSS-CHECKS PASSED' : '✗ CROSS-CHECK FAILURES — table NOT publishable'}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(crossChecksPass ? 0 : 1);
```

- [ ] **Step 2: Commit the script**

```bash
git add scripts/star-dentfill-th13.ts
git commit -m "feat(th13): γ-feasibility CLI — verdict table, gear column, single-variant rider"
```

- [ ] **Step 3: Run it and verify**

Run: `pnpm tsx scripts/star-dentfill-th13.ts; echo "exit=$?"`
Expected: `exit=0`, `ALL CROSS-CHECKS PASSED`, counts `19 / 8 / 5`, log file created. Runtime ~instant.

- [ ] **Step 4: Commit the log**

```bash
git add experiments/results/th13-dentfill-table-*.log
git commit -m "results(th13): γ-feasibility table — 19 regular / 8 point-only / 5 unfillable (γ=11); same-family point-fill impossible"
```

---

### Task 7: Build + full test verification

- [ ] **Step 1: Type-check + build** (workflow rule: only a full build surfaces the real issues)

Run: `pnpm build 2>&1 | tail -15`
Expected: build success, no new warnings. (The new lib modules are pure and not barrel-exported; a failure here most likely means an import path typo or a client-bundle leak — neither module may import `node:fs`.)

- [ ] **Step 2: Full star test file**

Run: `pnpm vitest run tests/star-vc.test.ts 2>&1 | tail -8`
Expected: PASS — 8 baseline + ~16 new tests.

- [ ] **Step 3: Lint**

Run: `pnpm lint 2>&1 | tail -5`
Expected: clean (or only pre-existing warnings — compare against `git stash`-free master if unsure).

- [ ] **Step 4: Commit any fixes** (only if Steps 1–3 forced changes; otherwise skip)

---

### Task 8: Ledger + cache docs

**Files:**
- Modify: `docs/DEVELOPMENT_NOTES.md` (append §35 — append-only ledger, never edit old sections)
- Modify: `docs/SYNC.md` (append one entry, 3–6 lines)
- Modify: `docs/STATUS.md` (update the star frontier line + repo state — cache, overwrite freely)
- Modify: `docs/NEXT.md` (update the CC line)

- [ ] **Step 1: Append NOTES §35.** Content requirements (write as prose in the ledger's voice; include all of):
  - What landed: TH-4 d_max table + TH-13 γ-table, engine modules (`StarDmaxRoute2.ts` zero-StarVC-imports / `StarTables.ts`), scripts, logs, pinned tests; branch + commit hashes.
  - The premise mini-lemmas P1/P2 (one line each, as in the script preamble) and the two fold-back lemmas (pure-regular ≤ 6; dent-no-point: β ≥ 13 ⇒ ≤ 11u ⇒ ≤ 2 regulars ⇒ t ≤ 3), with the note that both fold-backs are computed per alphabet, not asserted.
  - ⚑ The prune-(iii) trap: `StarVC.ts:134` applies (iii) unconditionally (`includeDents` does not bypass it) — Route 1 alone would have republished the uniformity-only premise at the Fig-3 column; this is why Route 2 has no lower bound on points and why the published numbers are Route 2's.
  - Results: in-ring envelope d_max = 9 (all strata; Fig-3(=1) stratum = 6) ⇒ δ ≤ 2k·9 = **18k**, F ≤ 42k; per-family 𝓕(n,1) = 9, 𝓕(n,2) = 8; regular-only recovers 6. TH-13: 19/8/5, UNFILLABLE = the five γ=11 variants (provably Fig-4-absent — sharper than the filter's "solver rejects extras"); same-family point-fill impossible ⇒ regular-filler UNCONDITIONAL for single-variant tilings; gear risk is mixed-variant only.
  - ⚑ Honest flags: (a) TH-4/TH-13 NOT discharged — constants/scoping input to TA; (b) P3 scope sentinel — the variant-set-equality test catches StarVC alphabet drift but cannot catch a deliberate scope widening; (c) envelope-row route agreement is verified by the script run (committed log), not in CI — the CI agreement test covers the 33 cheap rows; (d) Fig-3 class remains best-effort in the solver.
- [ ] **Step 2: Append the SYNC entry** (3–6 lines, after the last entry; fill `<commit>` with the final code commit):

```markdown
**2026-06-10 — CC → TA — ★ TH-4 d_max + TH-13 γ-feasibility tables LANDED (constants INPUT — neither discharged).**
d_max(in-ring envelope) = 9 EXACT, all strata (two independent routes, per-cell agreement; Fig-3(=1)
stratum = 6) ⇒ δ ≤ 18k, F ≤ 42k for cor:starbox(i)/Remark 3. TH-13: 19 regular / 8 point-only / 5
unfillable (γ=11, provably Fig-4-absent); same-family point-fill impossible ⇒ regular-filler holds
UNCONDITIONALLY for single-variant tilings — the gear/at-risk class is mixed-variant only. Branch
`feat/th4-th13-star-tables` @ `<commit>`, logs in `experiments/results/`, detail NOTES §35. — CC
```

- [ ] **Step 3: Update STATUS.md** star line (add the d_max/TH-13 result + branch pointer) and NEXT.md CC line (star-lane CC steps done pending TA consumption; next CC item per NEXT's existing queue). Keep both terse — they are caches.
- [ ] **Step 4: Run the docs linter, then commit**

```bash
pnpm docs:check
git add docs/DEVELOPMENT_NOTES.md docs/SYNC.md docs/STATUS.md docs/NEXT.md
git commit -m "docs: TH-4/TH-13 star tables recorded — NOTES §35, SYNC handoff (constants input, not discharge)"
```

---

### Task 9: Handoff (no merge without the user)

- [ ] **Step 1:** Verify the branch state: `git log --oneline master..HEAD` — expect ~9 commits (spec, plan, 4 feat/test, 2 results, docs).
- [ ] **Step 2:** Use superpowers:finishing-a-development-branch. Present the user the merge/PR/park options. **Do NOT merge to master or push unilaterally** — integration is single-writer and another CC session is active (memory: parallel-cc-sessions); the user decides who drives the merge.

---

## Self-review notes (run after drafting — resolved inline)

- **Spec coverage:** premises P1–P4 → script preamble + NOTES (Tasks 5, 8); module layout → Tasks 1, 3, 4; strata + identity → Tasks 2, 3, 5; pinned constants → Tasks 2, 5; falsifier → Task 3; TH-13 columns incl. gear + rider → Tasks 4, 6; logs → Tasks 5, 6; test-imports-engine → Tasks 1–4; honest framing in SYNC → Task 8. Envelope route agreement intentionally script-only (CI cost) — flagged in NOTES §35 and in the agreement test's comment.
- **Type consistency:** `R2Variant/R2Stratum/R2Cell` defined Task 1, consumed Tasks 3–5; `DmaxRow.cells[s].route2.dmax` shape consistent across Tasks 3 and 5; `computeDentFillTable` return shape consistent between Tasks 4 and 6.
- **Known judgment calls:** (a) fold-backs computed per alphabet rather than the spec's literal `max(enum, 6, 3)` — strictly stronger (the constants 6/3 would over-state d_max for families whose dent-no-point stratum is empty, breaking per-cell agreement); (b) `vitest` `expect(value, message)` second-arg form is used — supported in vitest 4.
