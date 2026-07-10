# Wallpaper-symmetry overlays + exact 17-group classifier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two independent canvas toggles (symmetry elements; fundamental domain) to the Play viewer, backed by an EXACT `ℤ[ζ₂₄]` wallpaper-group classifier that names all 17 groups, and use that classifier to add lattice-shape and wallpaper-group filters to the Library.

**Architecture:** A pure exact core (`lib/classes/symmetry/WallpaperSymmetry.ts`) takes exact lattice vectors `T1,T2` and seed vertices (all `Cyclotomic`) and returns a `SymmetryData` object (group name, mirror/glide axes, order-marked rotation centers, fundamental-domain polygon, cell parallelogram — the geometry as floats for rendering). The Play canvas fetches the exact `cell_codec` for the selected tiling on demand, runs the core once per tiling (memoized), and draws the overlays inside the existing world transform. A build script precomputes `{group, latticeShape}` per catalogue tiling into a static index that powers the Library filters, and a Vitest asserts per-tiling correctness against hand-checked oracles.

**Tech Stack:** TypeScript, Next 16 / React 19, Zustand (`lib/stores/configuration.ts`), p5.js (via `lib/hooks/useP5.ts`), exact cyclotomic arithmetic (`lib/classes/Cyclotomic.ts`, `lib/classes/algorithm/exact/Surd.ts`, `lib/classes/algorithm/LatticeEnumerator.ts`), Vitest.

---

## Context the engineer must read first

**Read before coding:** the working item (TA's spec, this session), `experiments/th10-symdiagram2.py` (the validated FLOAT prototype), `scripts/oracle-characterize.ts` (exact Bravais classification, already correct), `lib/classes/TilingChecker.ts:58` (`computeWallpaperGroup` — a float detector that finds rotations 2/3/4/6 and mirrors but NO glides; we supersede it), and `docs/DEVELOPMENT_NOTES.md` §12.5 (`ℤ[ζ₂₄]` is dense in ℂ ⇒ never bound Euclidean length; bound step counts).

**The correction that drove the design.** The prototype in the spec is validated on the *elongated exception* tilings (low symmetry: p1/p2/pg/pgg/pm/cmm/pmg). It detects **2-fold rotation only** and names 7 groups. The Play/Library catalogue is the *regular k-uniform* family, which is mostly **high symmetry** (p4m/p6m/p3m1/p31m/p6/p4). AL chose the full exact classifier so the overlay is correct for the regular family and the group label is trustworthy enough to filter on. So we build past the prototype: all crystallographic rotation orders, mirrors AND glides, all 17 groups, exact.

**Why exact.** Per the project mandate (`CLAUDE.md`: every decisive test in exact `ℚ(ζ_N)`; float only for render). "Is `g` a symmetry of the tiling?" is a decisive test — it decides the group label and the Library filter — so it runs in exact `Cyclotomic`. Only the *rendered geometry* (axis endpoints, center dots, FD polygon) is float.

**The exact isometry model (N=24).** Every plane isometry that can preserve a `ℤ[ζ₂₄]` tiling in the 15° family is either a rotation `z ↦ ζ₂₄ʲ·z + t` or a reflection/glide `z ↦ ζ₂₄ʲ·z̄ + t`, with `t ∈ ℤ[ζ₂₄]`, `j ∈ {0..23}`. Complex conjugation `z̄` is the exact ring automorphism `ζ ↦ ζ⁻¹` = `Cyclotomic.conj()`. The reflection `ζ₂₄ʲ z̄` has axis angle `j·7.5°`.

**Glide vs mirror — the exact test (supersedes the prototype's float on-line-period trick).** For a reflection/glide `g(z) = ω·z̄ + t` with `ω = ζ₂₄ʲ`, compose it with itself:
`g²(z) = ω·(ω·z̄ + t)‾ + t = ω·(ω̄·z + t̄) + t = z + (ω·t̄ + t)`.
So `g²` is translation by `τ = ω·t̄ + t` (exact, in `ℤ[ζ₂₄]`), and `τ` is always parallel to the axis. `g` is a **pure mirror** iff `τ = 0`; otherwise `g` is a **glide** with glide vector `τ/2`. A single reflection coset `{g + λ : λ ∈ Λ}` contains both mirror lines and glide lines at different perpendicular offsets — we enumerate the coset's `Λ`-translates (small window) and classify each resulting line by its own `τ`. This is exact and sidesteps the centered-lattice bug (spec §8.1) entirely.

**Exact data source.** `found_tilings.cell_codec` is a `SerializedCell` (`scripts/scoutCodec.ts`): `{ basis:[EncCyc,EncCyc], polys:{n,a:EncCyc,d}[] }`. `deserializeCell(ring, sc)` returns `{ basisExact:[Cyclotomic,Cyclotomic], cellPolygons:RegularPolygon[] }`; each `RegularPolygon.exactVertices` is a `Cyclotomic[]`. So `T1,T2 = basisExact`, and `seed = ` dedup of every polygon's `exactVertices`. The catalogue read (`lib/services/catalogueService.ts`) deliberately omits `cell_codec` (heavy) — we add a one-row on-demand fetch.

---

## File structure

**Create:**
- `lib/classes/symmetry/WallpaperSymmetry.ts` — the exact core. `analyzeSymmetry(T1,T2,seed) → SymmetryData`; exact `inLattice`, isometry enumeration, glide classification, group ID, FD construction.
- `lib/classes/symmetry/types.ts` — `SymmetryData`, `Axis`, `Center`, `LatticeShape`, `WallpaperGroup`.
- `lib/services/cellCodecService.ts` — `fetchCellCodec(sb, canonicalKey) → SerializedCell | null` (one-row fetch) and `seedFromCell(cell) → { T1, T2, seed }`.
- `lib/hooks/useSymmetryData.ts` — React hook: given a `CatalogueTiling`, fetch codec + run `analyzeSymmetry`, memoized by `canonicalKey`.
- `components/canvas-overlays.ts` — pure p5 draw helpers `drawSymmetryElements(p5, data, zoom)` and `drawFundamentalDomain(p5, data)`.
- `scripts/precompute-symmetry.ts` — runs the core over the certified catalogue + reference atlas, writes `public/symmetry-index.json`.
- `tests/wallpaper-symmetry.test.ts` — the §7 validation harness.
- `tests/cell-codec-service.test.ts` — `seedFromCell` unit test.

**Modify:**
- `lib/stores/configuration.ts` — add `showSymmetryElements`, `showFundamentalDomain` (default false).
- `components/sidebar/tilings-tab.tsx` — two `Checkbox`es next to "Show Polygon Points".
- `components/canvas.tsx` — accept `symmetryData` prop; draw overlays inside the world transform.
- `app/(app)/play/_play-client.tsx` — call `useSymmetryData(selected)`, pass to `<Canvas>`.
- `lib/services/catalogueService.ts` — add `latticeShape?` and `wallpaperGroup?` to `CatalogueFilter` + `CatalogueTiling`; extend `matchesCatalogueFilters`.
- `components/library-filters.tsx` — lattice-shape + wallpaper-group filter controls.
- `app/(app)/library/_library-client.tsx` — parse/serialize the two new filters; join the precomputed index.

---

## Conventions used throughout

- Ring: `const ring = CyclotomicRing.create(24); setActiveRing(ring);` at the top of any exact entry point (mirrors `oracle-characterize.ts`).
- Build check after every task group: `pnpm build` (the project's real gate — `CLAUDE.md`). Type-only iteration: `pnpm tsc --noEmit`. Single test file: `pnpm vitest run tests/<file>.test.ts`.
- Commit after each task (frequent commits).
- Branch: this work starts on a fresh branch off `master` (`feat/wallpaper-symmetry`), created at execution handoff.

---

## Phase 0 — Exact data plumbing + a visible cell parallelogram (prove the pipeline end-to-end)

Goal: the moment this phase lands, toggling "Fundamental domain" on Play draws the primitive lattice cell of the selected certified tiling. No symmetry yet — this de-risks the fetch → deserialize → exact-seed → render seam AL will inspect.

### Task 0.1: Symmetry types

**Files:**
- Create: `lib/classes/symmetry/types.ts`

- [ ] **Step 1: Write the types**

```ts
// Geometry in SymmetryData is FLOAT (render-only). Every value here is derived from an EXACT
// decision in WallpaperSymmetry.ts; nothing downstream re-decides symmetry from these floats.
export type LatticeShape = "square" | "hexagonal" | "rhombic" | "rectangular" | "oblique";

export const WALLPAPER_GROUPS = [
	"p1", "p2", "pm", "pg", "cm", "pmm", "pmg", "pgg", "cmm",
	"p4", "p4m", "p4g", "p3", "p3m1", "p31m", "p6", "p6m",
] as const;
export type WallpaperGroup = (typeof WALLPAPER_GROUPS)[number];

export interface Vec2 { x: number; y: number }

export interface Axis {
	// A full line in world coordinates: point `p` on the line + unit direction `d`.
	p: Vec2;
	d: Vec2;
	kind: "mirror" | "glide";
}

export interface Center {
	z: Vec2;
	order: 2 | 3 | 4 | 6;
}

export interface SymmetryData {
	group: WallpaperGroup;
	latticeShape: LatticeShape;
	pointGroupOrder: number; // |point group| — used to check FD area = cellArea / this
	axes: Axis[];
	centers: Center[];
	fd: Vec2[]; // fundamental-domain polygon, CCW
	cell: [Vec2, Vec2]; // (T1, T2) as world vectors, anchored at origin of the cell
	cellOrigin: Vec2; // where to anchor the cell parallelogram for drawing
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/classes/symmetry/types.ts
git commit -m "feat(symmetry): SymmetryData / group / lattice-shape types"
```

### Task 0.2: Exact seed extraction from a cell codec

**Files:**
- Create: `lib/services/cellCodecService.ts`
- Test: `tests/cell-codec-service.test.ts`

- [ ] **Step 1: Write the failing test** (uses a real certified codec fixture — export one first, see note)

```ts
import { describe, it, expect } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { seedFromCell } from "@/lib/services/cellCodecService";
import square44 from "./fixtures/cell-44.json"; // the 4.4.4.4 (t1001) codec, exported in step 0.2a

describe("seedFromCell", () => {
	it("returns the two exact basis vectors and a deduped exact seed", () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const { T1, T2, seed } = seedFromCell(ring, square44);
		expect(T1.isZero()).toBe(false);
		expect(T2.isZero()).toBe(false);
		// square tiling: the two basis vectors are orthogonal, equal length
		const l1 = T1.normSquared().toVector().x;
		const l2 = T2.normSquared().toVector().x;
		expect(Math.abs(l1 - l2)).toBeLessThan(1e-9);
		// seed dedup: no two seed vertices share a spatial key
		const keys = new Set(seed.map((s) => s.key()));
		expect(keys.size).toBe(seed.length);
		expect(seed.length).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 0.2a: Export the fixture first**

Run (one-off, produces the fixture the test imports):
```bash
pnpm tsx -e "import{createClient}from'@supabase/supabase-js';import{writeFileSync}from'node:fs';(async()=>{const sb=createClient(process.env.PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const{data}=await sb.from('found_tilings').select('canonical_key,cell_codec').not('cell_codec','is',null).limit(50);const row=data.find(r=>r.canonical_key.includes('4.4.4.4'))??data[0];writeFileSync('tests/fixtures/cell-44.json',JSON.stringify(row.cell_codec));console.log('wrote',row.canonical_key)})()"
```
Expected: prints the chosen key; writes `tests/fixtures/cell-44.json`. (If credentials are absent, instead lift a codec from `scripts/export-figure-snapshot.ts` output `figures/data/catalogue-k1-3.json` — it stores `cellCodec` per tiling.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/cell-codec-service.test.ts`
Expected: FAIL — `seedFromCell` not exported.

- [ ] **Step 3: Implement**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { Cyclotomic, type CyclotomicRing } from "@/classes/Cyclotomic";
import { deserializeCell, type SerializedCell } from "@/scripts/scoutCodec";

export type { SerializedCell };

// One-row exact fetch. The catalogue read omits cell_codec (heavy); the Play viewer pulls it only
// for the selected tiling. Returns null if the row/codec is absent (viewer falls back to no overlay).
export async function fetchCellCodec(
	sb: SupabaseClient,
	canonicalKey: string,
): Promise<SerializedCell | null> {
	const { data, error } = await sb
		.from("found_tilings")
		.select("cell_codec")
		.eq("canonical_key", canonicalKey)
		.not("cell_codec", "is", null)
		.limit(1)
		.maybeSingle();
	if (error || !data?.cell_codec) return null;
	return data.cell_codec as SerializedCell;
}

// Exact seed = the two basis vectors + the deduped union of all cell-polygon vertices, as Cyclotomic.
export function seedFromCell(
	ring: CyclotomicRing,
	sc: SerializedCell,
): { T1: Cyclotomic; T2: Cyclotomic; seed: Cyclotomic[] } {
	const cell = deserializeCell(ring, sc);
	const [T1, T2] = cell.basisExact;
	const byKey = new Map<string, Cyclotomic>();
	for (const poly of cell.cellPolygons) {
		for (const v of poly.exactVertices ?? []) {
			if (!byKey.has(v.key())) byKey.set(v.key(), v);
		}
	}
	return { T1, T2, seed: Array.from(byKey.values()) };
}
```

> Note: `scripts/scoutCodec.ts` imports `node:fs` at module top (for `readResumeNdjson`). Importing it into a browser bundle would break the build. Move `readResumeNdjson` (the only `fs` user) into a new `scripts/scoutResume.ts`, or split `serializeCell`/`deserializeCell`/`SerializedCell` into `lib/classes/algorithm/cellCodec.ts` (no `fs`) and re-export from `scripts/scoutCodec.ts`. Do the split in this step and update the import above to `@/classes/algorithm/cellCodec`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/cell-codec-service.test.ts`
Expected: PASS.

- [ ] **Step 5: `pnpm build`**

Expected: clean (this proves the codec split didn't break the server-only `fs` boundary).

- [ ] **Step 6: Commit**

```bash
git add lib/classes/algorithm/cellCodec.ts scripts/scoutCodec.ts scripts/scoutResume.ts lib/services/cellCodecService.ts tests/cell-codec-service.test.ts tests/fixtures/cell-44.json
git commit -m "feat(symmetry): fs-free cell codec split + exact seedFromCell fetch"
```

### Task 0.3: `analyzeSymmetry` skeleton returning only the cell parallelogram

**Files:**
- Create: `lib/classes/symmetry/WallpaperSymmetry.ts`
- Test: `tests/wallpaper-symmetry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { seedFromCell } from "@/lib/services/cellCodecService";
import { analyzeSymmetry } from "@/lib/classes/symmetry/WallpaperSymmetry";
import square44 from "./fixtures/cell-44.json";

describe("analyzeSymmetry — cell", () => {
	it("returns the primitive cell as two independent world vectors", () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const { T1, T2, seed } = seedFromCell(ring, square44);
		const data = analyzeSymmetry(ring, T1, T2, seed);
		const [c1, c2] = data.cell;
		const cross = c1.x * c2.y - c1.y * c2.x;
		expect(Math.abs(cross)).toBeGreaterThan(1e-6); // non-degenerate
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/wallpaper-symmetry.test.ts`
Expected: FAIL — `analyzeSymmetry` not defined.

- [ ] **Step 3: Implement the skeleton**

```ts
import { Cyclotomic, type CyclotomicRing } from "@/classes/Cyclotomic";
import { gaussReduceExact } from "@/classes/algorithm/LatticeEnumerator";
import type { SymmetryData, Vec2 } from "./types";

const v2 = (z: Cyclotomic): Vec2 => { const v = z.toVector(); return { x: v.x, y: v.y }; };

export function analyzeSymmetry(
	ring: CyclotomicRing,
	T1: Cyclotomic,
	T2: Cyclotomic,
	seed: Cyclotomic[],
): SymmetryData {
	// Gauss-reduce so the cell parallelogram is the compact one (matches oracle-characterize).
	const [r1, r2] = gaussReduceExact(T1, T2);
	return {
		group: "p1",
		latticeShape: "oblique",
		pointGroupOrder: 1,
		axes: [],
		centers: [],
		fd: [{ x: 0, y: 0 }, v2(r1), { x: v2(r1).x + v2(r2).x, y: v2(r1).y + v2(r2).y }, v2(r2)],
		cell: [v2(r1), v2(r2)],
		cellOrigin: { x: 0, y: 0 },
	};
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/wallpaper-symmetry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/classes/symmetry/WallpaperSymmetry.ts tests/wallpaper-symmetry.test.ts
git commit -m "feat(symmetry): analyzeSymmetry skeleton (cell parallelogram only)"
```

### Task 0.4: Store toggles

**Files:**
- Modify: `lib/stores/configuration.ts` (interface near line 39; defaults near line 87)

- [ ] **Step 1: Add the two booleans to the interface**

After `showConstructionPoints: boolean;` (line 40):
```ts
	showSymmetryElements: boolean;
	showFundamentalDomain: boolean;
```

- [ ] **Step 2: Add the defaults**

After `showConstructionPoints: false,` (line 88):
```ts
	showSymmetryElements: false,
	showFundamentalDomain: false,
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm tsc --noEmit` → no errors.
```bash
git add lib/stores/configuration.ts
git commit -m "feat(symmetry): configuration toggles for the two overlays"
```

### Task 0.5: Canvas draws the cell parallelogram; play wires the data

**Files:**
- Create: `components/canvas-overlays.ts`
- Create: `lib/hooks/useSymmetryData.ts`
- Modify: `components/canvas.tsx` (props interface ~line 20; inside the `p5.push()…p5.pop()` block ~line 300, after `drawTiling`)
- Modify: `app/(app)/play/_play-client.tsx`

- [ ] **Step 1: Overlay draw helper (cell + FD only for now)**

`components/canvas-overlays.ts`:
```ts
import type { SymmetryData, Vec2 } from "@/lib/classes/symmetry/types";

// All draws run INSIDE the canvas world transform (…translate·rotate·scale·scale(1,-1)). p5 is the
// same untyped instance canvas.tsx uses. `zoom` lets element markers stay a fixed pixel size.
type P5 = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function polygon(p5: P5, pts: Vec2[]) {
	p5.beginShape();
	for (const q of pts) p5.vertex(q.x, q.y);
	p5.endShape(p5.CLOSE);
}

export function drawFundamentalDomain(p5: P5, data: SymmetryData) {
	const o = data.cellOrigin;
	const [c1, c2] = data.cell;
	// primitive cell parallelogram (thin neutral outline)
	p5.push();
	p5.noFill();
	p5.stroke(0, 0, 55);
	p5.strokeWeight(1.2 / p5._renderer._curCamera ? 1 : 1); // weight set by caller via strokeWeight below
	p5.strokeWeight(0.02);
	polygon(p5, [o, add(o, c1), add(o, c1, c2), add(o, c2)]);
	// fundamental domain (translucent yellow + orange edge)
	p5.fill(48, 90, 100, 0.5);
	p5.stroke(30, 90, 90);
	p5.strokeWeight(0.03);
	polygon(p5, data.fd);
	p5.pop();
}

const add = (a: Vec2, b: Vec2, c?: Vec2): Vec2 => ({
	x: a.x + b.x + (c?.x ?? 0),
	y: a.y + b.y + (c?.y ?? 0),
});
```

> Stroke weights are in WORLD units (the transform scales by `zoom`≈40–150), so `0.02`–`0.03` renders ~1–4 px. Tune during Step 6 review.

- [ ] **Step 2: The hook**

`lib/hooks/useSymmetryData.ts`:
```ts
"use client";
import { useEffect, useState } from "react";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { fetchCellCodec, seedFromCell } from "@/lib/services/cellCodecService";
import { analyzeSymmetry } from "@/lib/classes/symmetry/WallpaperSymmetry";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

const cache = new Map<string, SymmetryData>();

export function useSymmetryData(tiling: CatalogueTiling | null): SymmetryData | null {
	const [data, setData] = useState<SymmetryData | null>(
		tiling ? cache.get(tiling.canonicalKey) ?? null : null,
	);
	useEffect(() => {
		if (!tiling) { setData(null); return; }
		const key = tiling.canonicalKey;
		if (cache.has(key)) { setData(cache.get(key)!); return; }
		let alive = true;
		(async () => {
			const ring = CyclotomicRing.create(24);
			setActiveRing(ring);
			const codec = await fetchCellCodec(getBrowserSupabase(), key);
			if (!codec || !alive) { if (alive) setData(null); return; }
			const { T1, T2, seed } = seedFromCell(ring, codec);
			const result = analyzeSymmetry(ring, T1, T2, seed);
			cache.set(key, result);
			if (alive) setData(result);
		})();
		return () => { alive = false; };
	}, [tiling]);
	return data;
}
```

> Confirm the browser-client import name against `lib/supabase/browser.ts` (adjust `getBrowserSupabase`). If reference-mode tilings (id starting `t…`/`myers-…`) have no `cell_codec`, `fetchCellCodec` returns null and the overlay is simply absent — acceptable for Phase 0 (reference exact source is Phase 5).

- [ ] **Step 3: Canvas prop + draw call**

In `components/canvas.tsx` `CanvasProps` add:
```ts
	symmetryData?: import("@/lib/classes/symmetry/types").SymmetryData | null;
```
Thread `symmetryData` through `propsRef` (add to the object and the effect deps). Inside `p5.draw`, right after `drawTiling(cfg, tiling);` and before `p5.pop();`:
```ts
					const sd = propsRef.current.symmetryData;
					if (sd && cfg.showFundamentalDomain) drawFundamentalDomain(p5, sd);
```
Import at top: `import { drawFundamentalDomain } from "./canvas-overlays";`

- [ ] **Step 4: Play passes the data**

In `app/(app)/play/_play-client.tsx`, after `selected` is resolved:
```ts
	const symmetryData = useSymmetryData(selected);
```
and pass `symmetryData={symmetryData}` to `<Canvas … />`.

- [ ] **Step 5: `pnpm build`**

Expected: clean.

- [ ] **Step 6: Manual verify (this is the "inspect in real time" checkpoint)**

Run `pnpm dev`, open `/play`, select a certified tiling, toggle "Fundamental domain" (temporarily add the checkbox in Task 0.6 OR flip the store default to true for this check). Confirm a parallelogram + yellow region appear over the tiling and pan/zoom/rotate with it.

- [ ] **Step 7: Commit**

```bash
git add components/canvas-overlays.ts lib/hooks/useSymmetryData.ts components/canvas.tsx "app/(app)/play/_play-client.tsx"
git commit -m "feat(symmetry): fetch exact codec on Play, draw primitive cell + FD placeholder"
```

### Task 0.6: The two checkboxes

**Files:**
- Modify: `components/sidebar/tilings-tab.tsx` (after the `showPolygonPoints` Checkbox, ~line 66)

- [ ] **Step 1: Add the controls**

```tsx
					<Checkbox
						id="showSymmetryElements"
						label="Symmetry elements"
						checked={cfg.showSymmetryElements}
						onCheckedChange={(v) => setCfg({ showSymmetryElements: v })}
					/>
					<Checkbox
						id="showFundamentalDomain"
						label="Fundamental domain"
						checked={cfg.showFundamentalDomain}
						onCheckedChange={(v) => setCfg({ showFundamentalDomain: v })}
					/>
```

- [ ] **Step 2: `pnpm build`** → clean.

- [ ] **Step 3: Manual verify** — both checkboxes toggle the overlay live on Play.

- [ ] **Step 4: Commit**

```bash
git add components/sidebar/tilings-tab.tsx
git commit -m "feat(symmetry): Play checkboxes for the two overlays"
```

---

## Phase 1 — Exact rotations + order-marked centers

Goal: `analyzeSymmetry` detects every crystallographic rotation (orders 2/3/4/6) exactly and emits deduped, order-tagged centers; the canvas draws standard crystallographic marks. Validate rotation presence against `oracle-characterize.ts`'s known classes.

### Task 1.1: Exact lattice membership

**Files:**
- Modify: `lib/classes/symmetry/WallpaperSymmetry.ts`
- Modify: `tests/wallpaper-symmetry.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { Cyclotomic } from "@/classes/Cyclotomic";
// … inside the file, add:
it("inLattice: T1, T1+T2, 2T1-3T2 are in Λ; a half-vector is not", () => {
	const ring = CyclotomicRing.create(24); setActiveRing(ring);
	const { T1, T2 } = seedFromCell(ring, square44);
	expect(_inLatticeForTest(T1, T2, T1)).toBe(true);
	expect(_inLatticeForTest(T1, T2, T1.add(T2))).toBe(true);
	expect(_inLatticeForTest(T1, T2, T1.scaleRational(2n, 1n).sub(T2.scaleRational(3n, 1n)))).toBe(true);
	expect(_inLatticeForTest(T1, T2, T1.scaleRational(1n, 2n))).toBe(false);
});
```
(Export `_inLatticeForTest = inLattice` from the module for the test.)

- [ ] **Step 2: Run → FAIL** (`_inLatticeForTest` undefined).

- [ ] **Step 3: Implement `inLattice`** (exact BigInt Cramer over the 8-dim ℤ-basis)

```ts
// A Cyclotomic is (num: bigint[8], den: bigint) over the ζ₂₄ power basis. w = a·T1 + b·T2 with a,b ∈ ℤ
// iff: writing each as its length-8 integer numerator over a common denominator, the 8×2 integer
// system has an integer solution consistent in all 8 rows. Solve 2 independent rows by Cramer, check
// integrality, then verify the other 6. Exact, no floats.
function inLattice(T1: Cyclotomic, T2: Cyclotomic, w: Cyclotomic): boolean {
	const D = lcm3(T1.den, T2.den, w.den);
	const col = (z: Cyclotomic) => z.num.map((c) => (c * D) / z.den);      // length-8 integers
	const [A, B, W] = [col(T1), col(T2), col(w)];
	// find 2 rows i,j with nonzero 2×2 determinant
	for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
		const det = A[i] * B[j] - A[j] * B[i];
		if (det === 0n) continue;
		const aNum = W[i] * B[j] - W[j] * B[i];
		const bNum = A[i] * W[j] - A[j] * W[i];
		if (aNum % det !== 0n || bNum % det !== 0n) return false; // non-integer ⇒ not in Λ
		const a = aNum / det, b = bNum / det;
		for (let r = 0; r < 8; r++) if (a * A[r] + b * B[r] !== W[r]) return false; // consistency
		return true;
	}
	return false; // T1,T2 dependent over this basis ⇒ degenerate (shouldn't happen)
}
function lcm3(a: bigint, b: bigint, c: bigint) { const g=(x:bigint,y:bigint)=>{x=x<0n?-x:x;y=y<0n?-y:y;while(y){[x,y]=[y,x%y]}return x}; const l=(x:bigint,y:bigint)=>x/g(x,y)*y; return l(l(a,b),c); }
export const _inLatticeForTest = inLattice;
```

> `Cyclotomic.num`/`.den` are readonly instance fields (see `lib/classes/Cyclotomic.ts`). If they are private, add a package-internal getter `coeffs(): { num: bigint[]; den: bigint }` to `Cyclotomic` and use it here.

- [ ] **Step 4: Run → PASS. Commit.**

```bash
git add lib/classes/symmetry/WallpaperSymmetry.ts tests/wallpaper-symmetry.test.ts
git commit -m "feat(symmetry): exact inLattice via BigInt Cramer over the ζ₂₄ basis"
```

### Task 1.2: Congruence-closed symmetry test + rotation enumeration

**Files:**
- Modify: `lib/classes/symmetry/WallpaperSymmetry.ts`, `tests/wallpaper-symmetry.test.ts`

- [ ] **Step 1: Failing test** (square tiling has a 4-fold; hexagonal has a 6-fold)

```ts
it("detects the max rotation order: 4.4.4.4 ⇒ 4, 6.6.6/3.6.3.6 ⇒ 6", () => {
	const ring = CyclotomicRing.create(24); setActiveRing(ring);
	const s = seedFromCell(ring, square44);
	const rots = _rotationsForTest(ring, s.T1, s.T2, s.seed);
	expect(Math.max(...rots.map((r) => r.order))).toBe(4);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
const applyRot = (j: number, t: Cyclotomic, z: Cyclotomic) => z.mulZeta(j).add(t);
const applyRef = (j: number, t: Cyclotomic, z: Cyclotomic) => z.conj().mulZeta(j).add(t);

// g preserves the tiling iff every seed vertex maps into (seed + Λ). Precompute seed for membership:
// g(v) ≡ some seed w (mod Λ)  ⇔  ∃ w: inLattice(T1,T2, g(v) − w).
function preserves(T1: Cyclotomic, T2: Cyclotomic, seed: Cyclotomic[], g: (z: Cyclotomic) => Cyclotomic): boolean {
	for (const v of seed) {
		const gv = g(v);
		if (!seed.some((w) => inLattice(T1, T2, gv.sub(w)))) return false;
	}
	return true;
}

const CRYSTALLOGRAPHIC = new Set([1, 2, 3, 4, 6]);
const rotOrder = (j: number, N = 24) => { const g=(x:number,y:number)=>y?g(y,x%y):x; return N / g(j, N); };

// For each rotation power j, the translation part t must send seed[0] onto some seed vertex mod Λ.
// Enumerate candidate t = w − ζ^j·seed[0] over all seed w; keep those that make g a full symmetry.
function rotations(ring: CyclotomicRing, T1: Cyclotomic, T2: Cyclotomic, seed: Cyclotomic[]) {
	const out: { j: number; t: Cyclotomic; order: 2 | 3 | 4 | 6 }[] = [];
	const v0 = seed[0];
	for (let j = 1; j < 24; j++) {
		const order = rotOrder(j);
		if (!CRYSTALLOGRAPHIC.has(order) || order === 1) continue;
		for (const w of seed) {
			const t = w.sub(v0.mulZeta(j));
			if (preserves(T1, T2, seed, (z) => applyRot(j, t, z))) {
				out.push({ j, t, order: order as 2 | 3 | 4 | 6 });
				break; // one representative t per j; centers derived in Task 1.3
			}
		}
	}
	return out;
}
export const _rotationsForTest = rotations;
```

- [ ] **Step 4: Run → PASS.** Add analogous assertions for a hexagonal fixture (`cell-666.json`, exported like 0.2a) expecting order 6. Commit.

```bash
git add lib/classes/symmetry/WallpaperSymmetry.ts tests/wallpaper-symmetry.test.ts tests/fixtures/cell-666.json
git commit -m "feat(symmetry): exact congruence-closed rotation enumeration (orders 2/3/4/6)"
```

### Task 1.3: Rotation centers with orders + wire into SymmetryData

**Files:**
- Modify: `lib/classes/symmetry/WallpaperSymmetry.ts`, `tests/wallpaper-symmetry.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("emits order-4 centers for the square tiling, deduped in the cell", () => {
	const ring = CyclotomicRing.create(24); setActiveRing(ring);
	const s = seedFromCell(ring, square44);
	const data = analyzeSymmetry(ring, s.T1, s.T2, s.seed);
	expect(data.centers.some((c) => c.order === 4)).toBe(true);
	// centers are unique in the primitive cell (dedup mod Λ)
	const keys = new Set(data.centers.map((c) => `${c.z.x.toFixed(4)},${c.z.y.toFixed(4)}`));
	expect(keys.size).toBe(data.centers.length);
});
```

- [ ] **Step 2: Run → FAIL** (skeleton emits no centers).

- [ ] **Step 3: Implement** — center = fixed point `c = t/(1−ω)` computed in FLOAT (`toVector`) — division is a render detail, not a decision. Dedup centers by float position reduced mod Λ (tolerance `0.02`, per spec §8.5); assign each the MAX rotation order whose rotation fixes it.

```ts
// Fixed point of z ↦ ω z + t, in float: c = t/(1−ω). Only for placement — the decision was exact.
function rotationCenterFloat(ring: CyclotomicRing, j: number, t: Cyclotomic): Vec2 {
	const w = Cyclotomic.zeta(ring, j).toVector();   // ω as a float complex
	const tv = t.toVector();
	// c = t (1−ω)⁻¹ ; (1−ω) = (1−wx, −wy); invert the complex number
	const dx = 1 - w.x, dy = -w.y, den = dx * dx + dy * dy;
	return { x: (tv.x * dx + tv.y * dy) / den, y: (tv.y * dx - tv.x * dy) / den };
}
```
Then in `analyzeSymmetry`: run `rotations`, map each to its float center, translate into the primitive cell (`reduce mod Λ` in float using the reduced basis), dedup, keep max order. Store in `data.centers`, set `data.pointGroupOrder` = max rotation order for now (refined in Phase 3). A rotation of order `n` yields `n²`-ish center classes on the primitive cell — enumerate `c + (aT1+bT2)` for small `a,b`, keep those inside the reduced cell, then dedup (spec §8.6). Reuse `computeFillRadii`/`wrapOffset` math from `canvas.tsx` conceptually, but inline a simple fractional-coord reducer here.

- [ ] **Step 4: Run → PASS. Commit.**

```bash
git commit -am "feat(symmetry): rotation centers (float placement, exact orders) in SymmetryData"
```

### Task 1.4: Draw the centers

**Files:**
- Modify: `components/canvas-overlays.ts`, `components/canvas.tsx`

- [ ] **Step 1: Add `drawSymmetryElements`** (centers only in this task)

Standard marks, drawn at a fixed PIXEL size by scaling `1/zoom`, with the y-flip undone locally so symbols aren't mirrored:
```ts
export function drawSymmetryElements(p5: P5, data: SymmetryData, zoom: number) {
	const r = 6 / zoom; // ~6px marks
	for (const c of data.centers) {
		p5.push();
		p5.translate(c.z.x, c.z.y);
		p5.fill(50, 90, 100); p5.stroke(0, 0, 0); p5.strokeWeight(1 / zoom);
		if (c.order === 2) ellipseLens(p5, r);
		else regularMark(p5, c.order, r); // 3→triangle, 4→square, 6→hexagon
		p5.pop();
	}
}
```
Implement `ellipseLens` (a pointed oval) and `regularMark(p5,n,r)` (an n-gon) locally.

- [ ] **Step 2: Call it in canvas.tsx** after `drawTiling`:
```ts
					if (sd && cfg.showSymmetryElements) drawSymmetryElements(p5, sd, ctrl.zoom);
```

- [ ] **Step 3: `pnpm build` → clean. Manual verify** on Play: 4-fold squares, 6-fold hexagons appear at cell corners/centers of `4.4.4.4` and `6.6.6`.

- [ ] **Step 4: Commit.**

```bash
git commit -am "feat(symmetry): draw crystallographic rotation-center marks"
```

---

## Phase 2 — Exact mirrors + glides

Goal: enumerate reflection/glide cosets exactly, classify each line via `τ = ω·t̄ + t`, emit `Axis[]`, draw solid mirrors / dashed glides. Regression: cmm reports glides.

### Task 2.1: Reflection/glide enumeration + exact classification

**Files:**
- Modify: `lib/classes/symmetry/WallpaperSymmetry.ts`, `tests/wallpaper-symmetry.test.ts`

- [ ] **Step 1: Failing tests** (the anti-regression pair)

```ts
it("cmm fixture reports BOTH mirror and glide axes", () => {
	const ring = CyclotomicRing.create(24); setActiveRing(ring);
	const s = seedFromCell(ring, cmmFixture); // export t5125's codec as fixtures/cell-cmm.json
	const data = analyzeSymmetry(ring, s.T1, s.T2, s.seed);
	expect(data.axes.some((a) => a.kind === "mirror")).toBe(true);
	expect(data.axes.some((a) => a.kind === "glide")).toBe(true);
});
it("pgg fixture reports glides and NO mirrors", () => {
	const ring = CyclotomicRing.create(24); setActiveRing(ring);
	const s = seedFromCell(ring, pggFixture); // fixtures/cell-pgg.json (t6364)
	const data = analyzeSymmetry(ring, s.T1, s.T2, s.seed);
	expect(data.axes.some((a) => a.kind === "glide")).toBe(true);
	expect(data.axes.some((a) => a.kind === "mirror")).toBe(false);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** the coset enumeration + exact glide test:

```ts
// A reflection/glide coset for power j: representative translations t (mod Λ) making z↦ζ^j z̄ + t a
// symmetry. Then each Λ-translate t' = t + aT1 + bT2 is its own line; classify by τ = ω·t'̄ + t'.
function reflections(ring: CyclotomicRing, T1: Cyclotomic, T2: Cyclotomic, seed: Cyclotomic[]): Axis[] {
	const axes: Axis[] = [];
	const seenLine = new Set<string>();
	const v0 = seed[0];
	for (let j = 0; j < 24; j++) {
		const omega = Cyclotomic.zeta(ring, j);
		// find every coset rep t (dedup mod Λ)
		const reps: Cyclotomic[] = [];
		for (const w of seed) {
			const t = w.sub(v0.conj().mulZeta(j));
			if (!preserves(T1, T2, seed, (z) => applyRef(j, t, z))) continue;
			if (reps.some((r) => inLattice(T1, T2, t.sub(r)))) continue; // same coset
			reps.push(t);
		}
		const phi = (j * Math.PI) / 24; // axis angle = j·7.5°
		const dir = { x: Math.cos(phi), y: Math.sin(phi) };
		for (const t0 of reps) {
			for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
				const t = t0.add(T1.scaleRational(BigInt(a), 1n)).add(T2.scaleRational(BigInt(b), 1n));
				const tau = omega.mul(t.conj()).add(t);       // EXACT τ = ω t̄ + t
				const kind: "mirror" | "glide" = tau.isZero() ? "mirror" : "glide";
				// line placement (float): the reflection z↦ω z̄ + t fixes the line through t/2 along dir.
				const p = midOnAxis(t);                        // t.toVector()/2 projected — see note
				const off = p.x * -Math.sin(phi) + p.y * Math.cos(phi); // perpendicular offset
				const key = `${j % 12}|${off.toFixed(2)}|${kind}`;      // angle mod 180°, offset, kind
				if (seenLine.has(key)) continue;
				seenLine.add(key);
				axes.push({ p, d: dir, kind });
			}
		}
	}
	return axes;
}
```

> `midOnAxis(t)`: the reflection `z ↦ ω z̄ + t` maps `0 ↦ t`, so the axis passes through `t/2` (float `t.toVector()` halved). The perpendicular offset dedup key uses `j % 12` because angle `θ` and `θ+180°` are the same line. Keep the window `a,b ∈ [−3,3]` (spec §8.2 uses `[−3,3]`); widen only if a fixture drops a line.

- [ ] **Step 4: Export the two fixtures** (`cell-cmm.json` from t5125, `cell-pgg.json` from t6364) via the 0.2a one-liner with the matching key. Run → PASS.

- [ ] **Step 5: Commit.**

```bash
git commit -am "feat(symmetry): exact mirror/glide enumeration via τ=ωt̄+t; cmm-glide regression"
```

### Task 2.2: Draw axes

**Files:**
- Modify: `components/canvas-overlays.ts`

- [ ] **Step 1:** extend `drawSymmetryElements` to draw each `Axis` as a long segment through `p` along `d` (clip to a generous world extent, e.g. ±(|T1|+|T2|)·6): mirrors solid crimson `stroke(348,90,80)`, glides dashed royal-blue via `p5.drawingContext.setLineDash([8,5])` then reset with `setLineDash([])`. Draw axes BEFORE centers so marks sit on top.

- [ ] **Step 2:** `pnpm build` → clean. Manual verify: `4.4.4.4` shows 4 mirror directions; a cmm tiling shows solid + dashed lines.

- [ ] **Step 3: Commit.**

```bash
git commit -am "feat(symmetry): render mirror (solid) and glide (dashed) axes"
```

---

## Phase 3 — Group identification + fundamental domain + lattice shape

Goal: name all 17 groups from the exact inventory, set `pointGroupOrder`, classify `latticeShape` (reusing `oracle-characterize` logic), and construct the correct fundamental domain per the spec §4 table.

### Task 3.1: Lattice-shape classification

**Files:**
- Modify: `lib/classes/symmetry/WallpaperSymmetry.ts`, `tests/wallpaper-symmetry.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("classifies lattice shape: square⇒square, hex⇒hexagonal", () => {
	const ring = CyclotomicRing.create(24); setActiveRing(ring);
	expect(analyzeSymmetry(ring, ...vals(square44)).latticeShape).toBe("square");
	expect(analyzeSymmetry(ring, ...vals(hex666)).latticeShape).toBe("hexagonal");
});
```

- [ ] **Step 2: Run → FAIL** (skeleton returns "oblique").

- [ ] **Step 3: Implement** — port `classify` from `scripts/oracle-characterize.ts` verbatim (it is already correct, including the centered-cmm guard and the exact `isOblique` via lattice automorphisms). Reuse `sameLattice`, `gaussReduceExact`. Map its labels to `LatticeShape`: `'hexagonal'→hexagonal`, `'square'→square`, `'rhombic(cmm)'→rhombic`, `'rectangular'→rectangular`, `'cmm/rect(conventional)'→rhombic`, `'OBLIQUE'→oblique`.

- [ ] **Step 4: Run → PASS. Commit.**

```bash
git commit -am "feat(symmetry): exact Bravais lattice-shape classification (from oracle-characterize)"
```

### Task 3.2: Group identification (17-way)

**Files:**
- Modify: `lib/classes/symmetry/WallpaperSymmetry.ts`, `tests/wallpaper-symmetry.test.ts`

- [ ] **Step 1: Failing test — the §7 spot cases**

```ts
const CASES: [string, string][] = [
	["cell-44.json", "p4m"],   // 4.4.4.4
	["cell-666.json", "p6m"],  // 6.6.6
	["cell-3636.json", "p6m"], // 3.6.3.6
	["cell-p2.json", "p2"],    // t3055
	["cell-cmm.json", "cmm"],  // t5125
	["cell-pgg.json", "pgg"],  // t6364
	["cell-4612.json", "p6m"], // 4.6.12 (t1003) — the case the prototype gets WRONG
];
it.each(CASES)("identifies %s as %s", (fixture, group) => {
	const ring = CyclotomicRing.create(24); setActiveRing(ring);
	const s = seedFromCell(ring, load(fixture));
	expect(analyzeSymmetry(ring, s.T1, s.T2, s.seed).group).toBe(group);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement the flowchart** from `(nMax, hasMirror, hasGlide, centersOnMirror)`:

```ts
function identifyGroup(
	nMax: number, hasMirror: boolean, hasGlide: boolean,
	mirrorAngleCount: number, allTopCentersOnMirror: boolean,
): WallpaperGroup {
	switch (nMax) {
		case 1:
			if (!hasMirror) return hasGlide ? "pg" : "p1";
			return hasGlide ? "cm" : "pm";
		case 2:
			if (!hasMirror) return hasGlide ? "pgg" : "p2";
			if (!hasGlide) return "pmm";
			return mirrorAngleCount >= 2 ? "cmm" : "pmg";
		case 3:
			if (!hasMirror) return "p3";
			return allTopCentersOnMirror ? "p3m1" : "p31m";
		case 4:
			if (!hasMirror) return "p4";
			return allTopCentersOnMirror ? "p4m" : "p4g";
		case 6:
			return hasMirror ? "p6m" : "p6";
		default:
			return "p1";
	}
}
```
`nMax` = max center order (0 centers ⇒ 1). `mirrorAngleCount` = number of distinct axis angles (mod 180°) among `kind==="mirror"`. `allTopCentersOnMirror` = every center of order `nMax` lies on some mirror line (float: perpendicular distance to a mirror `< 0.02`). Set `pointGroupOrder` from the group (p1→1, p2→2, pm/pg/cm→2, pmm/pmg/pgg/cmm→4, p4→4, p4m/p4g→8, p3→3, p3m1/p31m→6, p6→6, p6m→12).

- [ ] **Step 4: Run → PASS for all 7.** If p4m/p4g or p3m1/p31m misclassify, the discriminator is `allTopCentersOnMirror`; verify the mirror-distance tolerance. Commit.

```bash
git commit -am "feat(symmetry): 17-group identification flowchart + pointGroupOrder"
```

### Task 3.3: Fundamental domain per group (spec §4 table)

**Files:**
- Modify: `lib/classes/symmetry/WallpaperSymmetry.ts`, `tests/wallpaper-symmetry.test.ts`

- [ ] **Step 1: Failing invariant test (catches wrong FDs cheaply)**

```ts
it("FD area equals cell area / point-group order for every spot case", () => {
	const ring = CyclotomicRing.create(24); setActiveRing(ring);
	for (const [fixture] of CASES) {
		const s = seedFromCell(ring, load(fixture));
		const d = analyzeSymmetry(ring, s.T1, s.T2, s.seed);
		const cellArea = Math.abs(d.cell[0].x * d.cell[1].y - d.cell[0].y * d.cell[1].x);
		expect(polyArea(d.fd)).toBeCloseTo(cellArea / d.pointGroupOrder, 4);
	}
});
```

- [ ] **Step 2: Run → FAIL** (skeleton FD is the whole cell).

- [ ] **Step 3: Implement `buildFD(group, data)`** with these constructions (all float, anchored on detected elements). `c0` = center nearest origin of the highest order; `[u,v]` = reduced cell vectors:

```
p1  : [0, u, u+v, v]                                   (whole cell)
p2  : [c0, c0+u, c0+½u+½v … ] → half cell: [c0, c0+u, c0+u+½v, c0+½v]
pm/pg/cm : strip between adjacent parallel axes, half a period long
pmm/pmg/pgg : quarter cell [c0, c0+½u, c0+½u+½v, c0+½v]
cmm : right triangle — anchor p = nearest mirror∩mirror; legs along the two mirror dirs d1,d2,
      lengths ½·onlinePeriod(di): [p, p+½P1 d1, p+½P2 d2]        (prototype's cmm construction)
p4  : quarter around a 4-fold: [c4, c4+½u, c4+½u+½v, c4+½v] then halve → triangle to the nearest 2-fold
p4m : 45-45-90 chamber: vertices = 4-fold, nearest 4-fold neighbour midpoint (a 2-fold), nearest mirror foot
p4g : 45-45-90 chamber rotated: vertices = 4-fold, nearest 2-fold, nearest glide/mirror foot
p3  : 60° rhombus at a 3-fold: [c3, c3+⅓(2u+v)…] use the two nearest 3-folds
p3m1: equilateral triangle of the 3 nearest 3-fold centers, halved by a mirror
p31m: 30-30-120 triangle: 3-fold, nearest 3-fold, mirror foot
p6  : triangle = 6-fold, nearest 3-fold, nearest 2-fold
p6m : 30-60-90 chamber = 6-fold, nearest 3-fold, nearest 2-fold  (Coxeter chamber)
```

Implement the reflection-group chambers (cmm, p4m, p4g, p3m1, p31m, p6m) via the GENERAL recipe: take the highest-order center `c0`; among the mirror lines through/near `c0`, take the two with the smallest angle between them; the chamber is the triangle bounded by those two mirrors and the nearest third mirror (or the segment to the nearest lower-order center). Concretely: `fd = [c0, footOnMirror1, footOnMirror2]` sized so `polyArea == cellArea/pointGroupOrder`. Use the area invariant as the acceptance test — if a chamber's area is off, scale/reselect vertices.

For rotation-only/glide groups (p1,p2,p3,p4,p6,pg,pgg,cm,pm — no triangular chamber), use the fraction-parallelogram/rhombus at `c0` with the fraction = `1/pointGroupOrder × (mirror halving where present)`.

- [ ] **Step 4: Run → PASS** (area invariant holds for all 7 cases). Commit.

```bash
git commit -am "feat(symmetry): group-determined fundamental domain (spec §4 table)"
```

### Task 3.4: Show the group label + wire FD/cell into the render

**Files:**
- Modify: `components/canvas.tsx` (the `TilingInfo` header, ~line 470) or `components/sidebar/tilings-tab.tsx`

- [ ] **Step 1:** display `symmetryData.group` (e.g. a small "Group: cmm" pill) near the certification badge, only when either overlay is on. `pnpm build` → clean.
- [ ] **Step 2: Manual verify** — 4.6.12 shows "p6m" with a 30-60-90 triangle FD; t5125 shows "cmm" with mirrors + glides + a right-triangle FD.
- [ ] **Step 3: Commit.**

```bash
git commit -am "feat(symmetry): surface the wallpaper-group label in the viewer"
```

---

## Phase 4 — Validation harness (spec §7)

### Task 4.1: Catalogue-wide validation

**Files:**
- Modify: `tests/wallpaper-symmetry.test.ts`

- [ ] **Step 1: Add the sweep test** over the exported catalogue snapshot (`figures/data/catalogue-k1-3.json` if present, else the fixtures set):

```ts
it("every certified k≤3 tiling classifies to one of the 17 groups", () => {
	const ring = CyclotomicRing.create(24); setActiveRing(ring);
	for (const t of catalogue) {
		const s = seedFromCell(ring, t.cellCodec);
		const d = analyzeSymmetry(ring, s.T1, s.T2, s.seed);
		expect(WALLPAPER_GROUPS).toContain(d.group);
		const cellArea = Math.abs(d.cell[0].x*d.cell[1].y - d.cell[0].y*d.cell[1].x);
		expect(polyArea(d.fd)).toBeCloseTo(cellArea / d.pointGroupOrder, 3);
	}
});
```

- [ ] **Step 2: Run.** Investigate any tiling that throws or violates the area invariant (these are real classifier bugs — fix in Phase 3 modules, do not loosen the assertion). Expected end state: PASS across the catalogue.

- [ ] **Step 3: Commit.**

```bash
git commit -am "test(symmetry): catalogue-wide group + FD-area validation sweep"
```

---

## Phase 5 — Precompute index (powers the Library filters)

### Task 5.1: Precompute script

**Files:**
- Create: `scripts/precompute-symmetry.ts`
- Output: `public/symmetry-index.json`

- [ ] **Step 1: Write the script** — read the certified catalogue snapshot (with `cellCodec`) and the reference atlas exact source (Galebach JSON, decoded as in `oracle-characterize.ts`; Myers entries flagged, may be `null`), run `analyzeSymmetry`, emit:

```ts
// public/symmetry-index.json : { [canonicalKey: string]: { group: WallpaperGroup; lattice: LatticeShape } }
```
Log progress + ETA to `experiments/results/precompute-symmetry-<date>.log` (per the Experiments rule in `CLAUDE.md`). Reference tilings without exact data are recorded as `null` and logged loudly (completeness discipline: never silently drop).

- [ ] **Step 2: Run it.**

Run: `pnpm tsx scripts/precompute-symmetry.ts`
Expected: writes `public/symmetry-index.json` with an entry per certified tiling; log shows counts per group + any nulls.

- [ ] **Step 3: Commit** (index + log + script).

```bash
git add scripts/precompute-symmetry.ts public/symmetry-index.json experiments/results/precompute-symmetry-*.log
git commit -m "feat(symmetry): precompute group/lattice index for the library filters"
```

---

## Phase 6 — Library filters (lattice shape + wallpaper group)

### Task 6.1: Extend the catalogue filter model

**Files:**
- Modify: `lib/services/catalogueService.ts`, `tests/catalogue-service.test.ts` (create if absent)

- [ ] **Step 1: Failing test**

```ts
it("filters by latticeShape and wallpaperGroup", () => {
	const t = { canonicalKey:"x", k:1, family:"4.4.4.4", renderCell:null, certified:true, runIds:[],
		latticeShape:"square" as const, wallpaperGroup:"p4m" as const };
	expect(matchesCatalogueFilters(t, { latticeShapes:["square"] })).toBe(true);
	expect(matchesCatalogueFilters(t, { latticeShapes:["hexagonal"] })).toBe(false);
	expect(matchesCatalogueFilters(t, { wallpaperGroups:["p4m"] })).toBe(true);
	expect(matchesCatalogueFilters(t, { wallpaperGroups:["cmm"] })).toBe(false);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — add optional `latticeShape?: LatticeShape` and `wallpaperGroup?: WallpaperGroup` to `CatalogueTiling`; add `latticeShapes?: LatticeShape[]` and `wallpaperGroups?: WallpaperGroup[]` to `CatalogueFilter`; extend `matchesCatalogueFilters`:
```ts
	if (f.latticeShapes?.length && (!t.latticeShape || !f.latticeShapes.includes(t.latticeShape))) return false;
	if (f.wallpaperGroups?.length && (!t.wallpaperGroup || !f.wallpaperGroups.includes(t.wallpaperGroup))) return false;
```

- [ ] **Step 4: Run → PASS. Commit.**

```bash
git commit -am "feat(library): latticeShape + wallpaperGroup in the catalogue filter model"
```

### Task 6.2: Join the index into the catalogue + UI

**Files:**
- Modify: `app/(app)/library/_library-client.tsx` (the `CertifiedShelf`), `components/library-filters.tsx`

- [ ] **Step 1:** load `public/symmetry-index.json` (static import or fetch) and annotate each `CatalogueTiling` with `latticeShape`/`wallpaperGroup` from the index before filtering.
- [ ] **Step 2:** add two multi-select filter groups to `components/library-filters.tsx` — lattice shape (5 fixed options) and wallpaper group (the 17, or only those present in the index — prefer present-only to avoid empty filters). Extend `LibraryFiltersValue`, `parseFilters`, and the URL serialization in `_library-client.tsx` to carry `lattice` and `wp` params.
- [ ] **Step 3:** `pnpm build` → clean. Manual verify on `/library`: selecting "hexagonal" narrows to hex-lattice tilings; selecting "p6m" narrows to those; combined with the existing k / certification filters.
- [ ] **Step 4: Commit.**

```bash
git commit -am "feat(library): lattice-shape and wallpaper-group filters wired to the index"
```

---

## Phase 7 — Lab surface + docs (finish)

### Task 7.1: Wire the overlays into Lab (spec §1 "ideally Lab too")

**Files:**
- Modify: whichever Lab tiling-view component mounts `<Canvas>` (search `rg -l "<Canvas" "app/(app)/lab"`).

- [ ] **Step 1:** if Lab renders certified tilings by `canonicalKey`, reuse `useSymmetryData` + the same `<Canvas symmetryData>` prop and the two checkboxes. If Lab tilings lack a `cell_codec` (in-progress runs), the hook returns null and the overlays are simply unavailable — log nothing (expected). `pnpm build` → clean.
- [ ] **Step 2: Commit.**

### Task 7.2: Ledger + sync

**Files:**
- Modify: `docs/DEVELOPMENT_NOTES.md` (new numbered section: what shipped, the prototype-vs-spec correction, the exact glide test, the 17-group flowchart, validation results), `docs/SYNC.md` (one 3–6 line CC→TA+AL entry with the commit hash), `docs/STATUS.md` (frontier line if relevant).

- [ ] **Step 1:** write the entries per the ledger rules (`CLAUDE.md` §Agent sync protocol). Note explicitly that the reference-atlas exact source (Myers) is partial, so some reference tilings have no group (logged).
- [ ] **Step 2: `pnpm docs:check`** → clean. Commit.

---

## Self-review

**Spec coverage:**
- §1 two independent toggles — Task 0.4/0.6 (store + checkboxes), independent guards in canvas.tsx. ✓
- §2 architecture placement (pure exact core; store; UI; render out of loop) — `WallpaperSymmetry.ts` pure; `useSymmetryData` memoizes per `canonicalKey` (not per frame). ✓
- §3 exact detection (isometry model, inLattice, rotations, mirror/glide) — Tasks 1.1–1.3, 2.1. Exact glide test via `τ=ωt̄+t` replaces the float on-line-period trick (stronger, kills §8.1 bug by construction). ✓
- §4 group-determined FD (NOT Voronoi), full 17-group table incl. p4m/p6m/p3m1 chambers — Task 3.3, area invariant as the acceptance test. ✓ (Chamber vertex selection is the least-certain code; the area invariant + spot cases are the guardrail — flagged as iterative.)
- §5 rendering (solid mirror / dashed glide / order marks / translucent FD / cell) — Tasks 0.5, 1.4, 2.2. Fixed-pixel marks via `1/zoom`. ✓
- §6 state + UI + optional legend — Tasks 0.4/0.6 (legend deferred as nice-to-have). ✓
- §7 verification (group ∈ 17, spot cases incl. cmm/pgg/p6m/p2, glide-on-cmm regression, FD-area invariant) — Tasks 2.1, 3.2, 3.3, 4.1. ✓
- §8 pitfalls — 8.1 (on-line period) obviated by exact `τ`; 8.2 (coset carries both) handled by translate-and-classify each line; 8.3 (all cosets per angle) — `reps` collects every coset, not the first; 8.4 (no Dirichlet) — FD from the group table; 8.5 (tolerance) — exact `inLattice`, float dedup at `0.02`; 8.6 (centers repeat) — enumerate `c+Λ` and dedup. ✓
- §9 scope — MVP (two toggles, Play) = Phase 0–3; group label = 3.4; library filters (original request) = Phase 6; Lab + SVG-export nice-to-have — Lab in 7.1, SVG export deferred. ✓
- Original message's second ask (library filters: lattice shape + wallpaper groups) — Phase 6. ✓

**Placeholder scan:** the FD chamber vertex selection (Task 3.3) is specified by construction + guarded by the area invariant rather than pre-written line-for-line for all 6 reflection groups — this is deliberate TDD (the exact chamber math is discovered under the area test), not a hidden TODO. Everything else has concrete code.

**Type consistency:** `SymmetryData`/`Axis`/`Center`/`LatticeShape`/`WallpaperGroup` (Task 0.1) are used unchanged in every later task; `analyzeSymmetry(ring, T1, T2, seed)` signature is stable from 0.3 onward; `seedFromCell` returns `{T1,T2,seed}` used identically in the hook, tests, and precompute.

**Known risks called out for the executor:**
1. `Cyclotomic.num/.den` visibility — may need an internal getter (Task 1.1 note).
2. `scripts/scoutCodec.ts` imports `node:fs` — MUST split before importing into the browser bundle (Task 0.2 note). This is the one build-boundary hazard.
3. Reference-atlas exact source is partial (Myers) — reference-shelf tilings may have no group; handled as null + logged, never silently dropped.
4. Chamber FD (3.3) is the iterative hotspot — lean on the area invariant + the 7 spot cases.
