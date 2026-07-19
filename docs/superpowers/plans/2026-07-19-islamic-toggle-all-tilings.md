# Islamic toggle on every flat tiling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the Islamic/Hankin construction toggle on every flat and spherical tiling class (convex, isotoxal, mixed, scaled, polyomino), not just regular/star/islamic/spherical, with parametric families morphing live as their slider moves.

**Architecture:** Widen the single capability gate `polygonClassSupportsIslamic` and let the existing render, cache, and rebuild machinery carry the rest. The construction geometry is already shape-agnostic; scaled T-junctions are pre-encoded as flat 180° corners so their sub-edge Vs come for free; the Islamic caches key on `Tiling.nodes` identity so a parameter rebuild already invalidates them. No change to geometry, render paths, or the parametric rebuild.

**Tech Stack:** TypeScript, Next.js 16 / React 19, Vitest, Zustand, p5.js + WebGL render paths.

**Spec:** `docs/superpowers/specs/2026-07-19-islamic-toggle-all-tilings-design.md`

**Branch note:** Work lands on the current branch (`moduli-graph`), which already carries unrelated uncommitted changes. Do not sweep those into these commits — stage only the files each step names. Branch/PR decisions are deferred to the finishing step.

---

## Task 1: Widen the capability gate

**Files:**
- Modify: `lib/utils/tilingLabel.ts:7-17` (the doc comment + `polygonClassSupportsIslamic`)
- Test: `tests/islamic-gate.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/islamic-gate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { polygonClassSupportsIslamic } from "@/lib/utils/tilingLabel";

// The gate feeds three UI sites: the sidebar checkbox, the force-off effect, and the `I` shortcut.
// It must now admit every flat/spherical class and exclude only hyperbolic (its own shader path).
type GateInput = Parameters<typeof polygonClassSupportsIslamic>[0];

describe("polygonClassSupportsIslamic — open to every flat class", () => {
	const enabled: Array<[string, GateInput]> = [
		["regular", { family: "3.3.3.3.3.3" }],
		["star (family token)", { family: "3.6*.3.6*" }],
		["convex (composable)", { family: "cx-4571", source: "composable" }],
		["convex (family token)", { family: "cx-9", source: undefined }],
		["isotoxal", { family: "α.4.α.4", source: "isotoxal" }],
		["mixed", { family: "m-1", source: "mixed" }],
		["scaled", { family: "3.3₂", source: "scaled" }],
		["polyomino", { family: "L-tetromino", source: "polyomino" }],
		["islamic", { family: "girih-bobbin", source: "islamic" }],
		["spherical", { family: "{4,3}", source: "spherical" }],
	];
	for (const [name, t] of enabled) {
		it(`enables Islamic for ${name}`, () => {
			expect(polygonClassSupportsIslamic(t)).toBe(true);
		});
	}

	it("excludes hyperbolic (drawn by the Poincaré-disk shader, gated by wythoff)", () => {
		expect(polygonClassSupportsIslamic({ family: "{7,3}", source: "hyperbolic" })).toBe(false);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/islamic-gate.test.ts`
Expected: FAIL. The convex/isotoxal/mixed/scaled/polyomino cases return `false` under the current gate (which admits only regular/star/islamic/spherical).

- [ ] **Step 3: Widen the gate**

In `lib/utils/tilingLabel.ts`, replace the doc comment block and the function body (lines 7-17) with:

```ts
// The flat Hankin construction (Polygon.calculateIslamicSegments) is shape-agnostic — it reads only
// vertices, edge midpoints, centroid, and per-edge inward normals — so it applies to every flat and
// spherical tile class the catalogue ships. Scaled tiles carry their T-junctions as flat 180° corners
// (scripts/build-scaled-atlas.ts), so `halfways` already holds one midpoint per unit sub-edge and the
// construction emits a ray-pair ("V") at each. Only "hyperbolic" is excluded here: it draws its
// strapwork through the Poincaré-disk shader, gated separately by `selected.wythoff` at the call sites.
export function polygonClassSupportsIslamic(t: { family: string; source?: ReferenceTiling["source"] }): boolean {
	return tileClassOf(t) !== "hyperbolic";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/islamic-gate.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/islamic-gate.test.ts lib/utils/tilingLabel.ts
git commit -m "feat(islamic): open the construction gate to every flat class

polygonClassSupportsIslamic now admits convex, isotoxal, mixed, scaled,
and polyomino; only hyperbolic (own shader path) stays out. The
construction is already shape-agnostic and scaled sub-edge Vs come from
the degenerate-corner encoding, so this is the whole enabling change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Reconcile the consumer comments and confirm no other gate site

The three call sites need no logic change (they all delegate to the widened function), but their surrounding comments still assert "regular/star only" and are now wrong. This task fixes the stale comments and proves there is no fourth gate site.

**Files:**
- Modify: `components/sidebar/tilings-tab.tsx:32-34`
- Modify: `app/(app)/play/_play-client.tsx:226-233`
- Modify: `app/(app)/play/_play-client.tsx:374-377`

- [ ] **Step 1: Confirm the full set of gate consumers**

Run: `grep -rn "polygonClassSupportsIslamic" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v tests/`
Expected: exactly four lines — the definition in `lib/utils/tilingLabel.ts`, and three call sites (`components/sidebar/tilings-tab.tsx`, and two in `app/(app)/play/_play-client.tsx`). If any other consumer appears, stop and reconcile it before continuing.

- [ ] **Step 2: Fix the sidebar comment**

In `components/sidebar/tilings-tab.tsx`, replace the comment at lines 32-33 (directly above `const islamicSupported = …`) with:

```tsx
	// Islamic construction applies to every flat and spherical class (see polygonClassSupportsIslamic —
	// the shape-agnostic Hankin construction handles them all), plus EVERY hyperbolic tiling, whose
	// Poincaré-disk shader draws the strapwork for regular, uniform, and snub.
```

Leave line 34 (`const islamicSupported = !!selected && (polygonClassSupportsIslamic(selected) || !!selected.wythoff);`) unchanged.

- [ ] **Step 3: Fix the force-off comment**

In `app/(app)/play/_play-client.tsx`, replace the comment at lines 226-228 (above the force-off `useEffect`) with:

```tsx
	// The Islamic construction applies to every flat/spherical class now, so this force-off only fires
	// for a selection that supports it via neither the class gate nor `wythoff` — effectively never for
	// the shipped catalogue. Kept as a safety net so the render path can't draw the fill for a tiling
	// whose sidebar hides the control.
```

Leave the `useEffect` body (lines 229-233) unchanged.

- [ ] **Step 4: Fix the shortcut comment**

In `app/(app)/play/_play-client.tsx`, in the comment block at lines 374-377, replace the clause "and Islamic only for the regular/star classes" with "and Islamic applies to every flat/spherical class (hyperbolic draws it through its own shader)". Leave the `blocked` expression (lines 379-383) unchanged.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: build completes with no type errors and no new warnings. (CLAUDE.md: a full build is the required check; lint/test alone are not substitutes.)

- [ ] **Step 6: Run the test suite for regressions**

Run: `pnpm vitest run tests/islamic-gate.test.ts tests/islamic-construction.test.ts tests/islamic-abc.test.ts tests/islamic-arrangement.test.ts tests/isotoxal.test.ts`
Expected: all PASS. No existing test asserts the gate returns false for a flat class, so nothing should regress.

- [ ] **Step 7: Commit**

```bash
git add components/sidebar/tilings-tab.tsx "app/(app)/play/_play-client.tsx"
git commit -m "docs(islamic): reconcile gate-site comments with the widened gate

The three consumers (sidebar checkbox, force-off effect, I shortcut)
delegate to polygonClassSupportsIslamic and need no logic change; only
their now-stale 'regular/star only' comments are corrected.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Visual verification in /play

Automated tests cover the gate; the strapwork quality on the new classes is a visual property that must be checked by eye. This task is manual. Record the result of each check.

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Open the printed URL, go to `/play`, open the tilings sidebar tab.

- [ ] **Step 2: Convex — straps connect across shared edges**

Select a convex-irregular tiling (the "Convex irregular" catalogue group). Toggle Islamic on (checkbox or press `I`). Confirm the checkbox now appears and that strapwork lines meet across every shared edge (convex uniform tilings are edge-to-edge). Try both the line style and the plain-fill style.
Expected: toggle present; straps connect; no console errors.

- [ ] **Step 3: Isotoxal — live parametric morph**

Select an isotoxal family (has an α or α,β slider). Toggle Islamic on. Drag the parameter slider.
Expected: the strapwork recomputes and morphs continuously as the slider moves (no stale frame, no crash). This is the "watch it behave as you move the parameter" acceptance check. Confirm it works while dragging, not only on release.

- [ ] **Step 4: Scaled — sub-edge Vs connect**

Select a scaled tiling that uses a side-2 or side-3 tile (the "Scaled polygons (sides 1–3)" group). Toggle Islamic on.
Expected: on a large tile's long edge, the straps connect at each unit sub-edge to the neighboring small tiles (the free sub-edge V behavior from the flat-corner encoding), not just at the edge midpoint. On the densest scaled tiling, confirm interaction/FPS stays acceptable (watch for the O(rays²) per-tile cost flagged in the spec).

- [ ] **Step 5: Mixed and polyomino**

Select a mixed tiling, toggle Islamic on: confirm straps connect where tiles are edge-to-edge.
Select a polyomino (Tetris) tiling, toggle Islamic on: confirm whether straps connect at domino/L T-junctions. Per spec caveat 2, if they do NOT connect (minimal rectilinear encoding without flat corners), that is the expected known limitation under the unconditional directive — record it, do not treat it as a build failure. If it looks unacceptably broken, note it as the trigger for the deferred Approach B (general contact-point subdivision, spec "Out of scope").

- [ ] **Step 6: Record the outcome**

Append a short note to `docs/DEVELOPMENT_NOTES.md` (the CC narrative ledger) stating what landed (Islamic toggle opened to all flat classes, one-function change), the commit hashes, and the per-class verification result — especially the polyomino connection outcome and any FPS observation on scaled. Add a 3–6 line signed entry to `docs/SYNC.md`. Commit those doc updates:

```bash
git add docs/DEVELOPMENT_NOTES.md docs/SYNC.md
git commit -m "docs(islamic): record all-class toggle landing + per-class verification

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** enabling all flat classes → Task 1; parametric live morph reuse → verified in Task 3 Step 3 (no code, by design); scaled sub-edge Vs → Task 3 Step 4; caveats (two-tone fill, polyomino, perf) → surfaced in Task 3 Steps 4–5; hyperbolic untouched → Task 1 excludes only hyperbolic, comments in Task 2. All spec sections map to a task.
- **No placeholders:** every code and comment block is spelled out; commands have expected output.
- **Type consistency:** `polygonClassSupportsIslamic` signature and `tileClassOf`'s `"hyperbolic"` return value are used verbatim from `lib/utils/tilingLabel.ts` and `lib/services/referenceAtlas.ts:117-129`.
