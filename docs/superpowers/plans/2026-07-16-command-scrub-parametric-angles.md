# Command + mouse-move to scrub parametric angles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user hold Command and move the mouse (no button) over the canvas to set a Euclidean parametric tiling's free angle(s) — α on horizontal delta, β on vertical — continuous and clamped to each parameter's min/max, eased with the same target/live glide the rotation slider uses.

**Architecture:** Mirror the rotation control's two-value split, but on the shared `familyAlphas` store so the flat p5 canvas and the inversive WebGL overlay stay in lockstep. `familyAlphas.values` stays the target (slider + scrub write it); a new non-reactive `familyAlphas.live` is eased toward it each frame in the always-mounted flat-canvas draw loop; both renderers draw from `live`. A new `p5.mouseMoved` handler on the flat canvas accumulates relative mouse deltas into the clamped target when Command is held and a parametric family is selected.

**Tech Stack:** Next.js 16 + React 19, Zustand (`familyAlphas` store), p5.js (instance mode, sketch inline in `components/canvas.tsx`), a WebGL overlay (`components/inversive-canvas.tsx`), Vitest.

Spec: `docs/superpowers/specs/2026-07-16-command-scrub-parametric-angles-design.md`

---

## File map

- `lib/utils/paramCell.ts` — add `clampAlphaOnly` (clamp into the open interval, no 0.5° grid snap). Pure, unit-tested.
- `lib/utils/paramCell.test.ts` — **new**, tests for `clampAlphaOnly`.
- `lib/stores/familyAlphas.ts` — add `live: number[] | null` + `resetLive()`.
- `lib/stores/familyAlphas.test.ts` — **new**, tests for `set` vs `resetLive` semantics.
- `components/canvas.tsx` — sensitivity/damp constants; per-frame α/β ease in the draw loop; `renderAlphas` helper; swap two render/pick reads to `live`; `p5.mouseMoved` scrub handler; `move`-cursor affordance + keyup/blur reset.
- `components/inversive-canvas.tsx` — swap the render read (`:276`) to `live`.
- `app/(app)/play/_play-client.tsx` — call `resetLive()` on the selection-change reconcile so `live` never eases across families.

Order matters: Task 1 (`clampAlphaOnly`) and Task 2 (store) are the primitives; Tasks 3-6 consume them; Task 7 is the whole-feature verification. Every task leaves a green build.

---

### Task 1: `clampAlphaOnly` helper (clamp without grid snap)

**Files:**
- Create: `lib/utils/paramCell.test.ts`
- Modify: `lib/utils/paramCell.ts` (add function after `clampAlpha`, ~line 102)

- [ ] **Step 1: Write the failing test**

Create `lib/utils/paramCell.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clampAlphaOnly, clampAlphaAt, type ParametricCellData } from "@/lib/utils/paramCell";

// Minimal fixture: clampAlphaOnly only reads params[i].alphaRangeDegOpen.
const PC = (lo: number, hi: number): ParametricCellData => ({
	params: [{ name: "a", alpha0Deg: lo, deltaRangeDeg: [0, 0], alphaRangeDegOpen: [lo, hi], defaultAlphaDeg: (lo + hi) / 2 }],
	cellPolygons: [],
	basis: [[], []],
});

describe("clampAlphaOnly", () => {
	it("passes an off-grid interior value through untouched (no 0.5° snap)", () => {
		const pc = PC(30, 90);
		expect(clampAlphaOnly(pc, 0, 47.37)).toBe(47.37);
		// contrast: the slider's grid-snapped clamp DOES round to 0.5°
		expect(clampAlphaAt(pc, 0, 47.37)).toBe(47.5);
	});

	it("clamps below the min up to lo and above the max down to hi", () => {
		const pc = PC(30, 90);
		expect(clampAlphaOnly(pc, 0, 10)).toBe(30);
		expect(clampAlphaOnly(pc, 0, 200)).toBe(90);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/utils/paramCell.test.ts`
Expected: FAIL — `clampAlphaOnly` is not exported (import error / "is not a function").

- [ ] **Step 3: Implement `clampAlphaOnly`**

In `lib/utils/paramCell.ts`, insert directly after `clampAlpha` (the block ending at line 102):

```ts
/** Clamp one parameter's angle into the family's range WITHOUT snapping to the slider grid. For the
 *  continuous Command+drag scrub, where the 0.5° snap that clampAlphaAt applies would make the sweep
 *  stair-step. The evaluated angle is still held ALPHA_EPS_DEG inside the open interval downstream in
 *  deltasFor, so storing exactly lo/hi is safe. */
export function clampAlphaOnly(pc: ParametricCellData, paramIndex: number, alphaDeg: number): number {
	const [lo, hi] = pc.params[paramIndex].alphaRangeDegOpen;
	return Math.min(hi, Math.max(lo, alphaDeg));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/utils/paramCell.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/paramCell.ts lib/utils/paramCell.test.ts
git commit -m "feat(paramCell): clampAlphaOnly (clamp without grid snap) for continuous angle scrub"
```

---

### Task 2: `familyAlphas` store — add `live` + `resetLive`

**Files:**
- Create: `lib/stores/familyAlphas.test.ts`
- Modify: `lib/stores/familyAlphas.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/stores/familyAlphas.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useFamilyAlphas } from "@/stores/familyAlphas";

describe("useFamilyAlphas", () => {
	beforeEach(() => useFamilyAlphas.setState({ values: null, live: null }));

	it("set writes the target values and leaves live untouched (a slider/scrub tick keeps the ease going)", () => {
		useFamilyAlphas.setState({ live: [40] });
		useFamilyAlphas.getState().set([50]);
		expect(useFamilyAlphas.getState().values).toEqual([50]);
		expect(useFamilyAlphas.getState().live).toEqual([40]);
	});

	it("resetLive nulls live and leaves values (a selection change forces the render tuple to reseed)", () => {
		useFamilyAlphas.setState({ values: [50], live: [40] });
		useFamilyAlphas.getState().resetLive();
		expect(useFamilyAlphas.getState().live).toBeNull();
		expect(useFamilyAlphas.getState().values).toEqual([50]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/stores/familyAlphas.test.ts`
Expected: FAIL — `live` is not a field / `resetLive is not a function`.

- [ ] **Step 3: Implement the store changes**

Replace the interface + `create` block in `lib/stores/familyAlphas.ts` (lines 11-19) with:

```ts
interface FamilyAlphasState {
	// TARGET tuple (one per parameter α, β, …), in degrees. The slider and the Command+drag scrub both
	// write this. null ⇒ unset.
	values: number[] | null;
	// LIVE, eased render tuple that the canvas draw loops draw from. Mutated IN PLACE each frame (no
	// setState — the panel subscribes to `values`, not `live`, so no re-render). null ⇒ the draw loop
	// reseeds it from `values` this frame (mount, or a selection change via resetLive), no ease.
	live: number[] | null;
	set: (values: number[] | null) => void;
	// Force `live` back to null so it reseeds for a NEW family instead of gliding across two unrelated
	// tilings. Called on selection change; NOT on a slider/scrub tick (that would kill the smoothing).
	resetLive: () => void;
}

export const useFamilyAlphas = create<FamilyAlphasState>()((set) => ({
	values: null,
	live: null,
	set: (values) => set({ values }),
	resetLive: () => set({ live: null }),
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/stores/familyAlphas.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add lib/stores/familyAlphas.ts lib/stores/familyAlphas.test.ts
git commit -m "feat(familyAlphas): add non-reactive live tuple + resetLive for eased angle rendering"
```

---

### Task 3: Ease `live` in the draw loop and render from it (flat canvas)

No unit test — this is p5 draw-loop wiring, verified by the build here and the manual pass in Task 7.

**Files:**
- Modify: `components/canvas.tsx` (import line 20; constants ~65-67; `renderAlphas` helper after `ensureTiling`; draw-loop ease after the rotation ease ~613; two read sites at 383-384 and 819-822)

- [ ] **Step 1: Add `clampAlphaOnly` to the paramCell import**

`components/canvas.tsx` line 20 — replace:

```ts
import { evaluateParamCell, resolveAlphaDegs, type ParametricCellData } from "@/lib/utils/paramCell";
```

with:

```ts
import { evaluateParamCell, resolveAlphaDegs, clampAlphaOnly, type ParametricCellData } from "@/lib/utils/paramCell";
```

- [ ] **Step 2: Add the sensitivity + damp constants**

`components/canvas.tsx` — directly after line 67 (`const ROTATE_DAMP = 0.2; ...`) insert:

```ts
// Command+drag angle scrub for parametric families. ALPHA_DEG_PER_PX: degrees of free-angle change per
// pixel of mouse movement (α on horizontal delta, β on vertical). ALPHA_DAMP: per-frame ease of the live
// angle toward the target tuple, matching ROTATE_DAMP so the flat and inversive views settle in step.
const ALPHA_DEG_PER_PX = 0.25;
const ALPHA_DAMP = 0.2;
```

- [ ] **Step 3: Add the `renderAlphas` helper**

`components/canvas.tsx` — the sketch defines `ensureTiling` starting at line 358. Directly above `const ensureTiling = () => {` (line 358), insert:

```ts
// The angle tuple the render/pick path should draw for a parametric family: the eased LIVE tuple when it
// exists (Command+drag or slider glide), else the resolved target. Bypasses resolveAlphaDegs' 0.5° grid
// snap so the continuous ease stays smooth; `live` is always in range (seeded from resolveAlphaDegs and
// eased monotonically toward it — no overshoot), and deltasFor still holds it inside the open interval.
const renderAlphas = (pc: ParametricCellData): number[] => {
	const fa = useFamilyAlphas.getState();
	return fa.live && fa.live.length === pc.params.length ? fa.live : resolveAlphaDegs(pc, fa.values);
};
```

- [ ] **Step 4: Ease `live` every frame in the draw loop**

`components/canvas.tsx` — the rotation ease block ends at line 613 (`}`), immediately before `p5.clear();` at line 615. Insert this block between them (after line 613, before line 615):

```ts
				// Ease the live parametric angle(s) toward the target tuple (familyAlphas.values — the slider
				// position or the Command+drag scrub), the same flywheel glide rotation uses, but per-parameter
				// and clamped (never wrapped). Runs every frame in every view (before the skipFlat check) because
				// both the flat grid and the inversive overlay render from `live`. A null/length-mismatched `live`
				// (mount, or a selection change via resetLive) seeds from the target this frame with no ease.
				{
					const pc = propsRef.current.paramCell;
					if (pc) {
						const fa = useFamilyAlphas.getState();
						const target = resolveAlphaDegs(pc, fa.values);
						const live = fa.live;
						if (!live || live.length !== target.length) {
							fa.live = target.slice();
						} else {
							for (let i = 0; i < target.length; i++) {
								const d = target[i] - live[i];
								if (Math.abs(d) < 0.01) live[i] = target[i];
								else live[i] += d * ALPHA_DAMP;
							}
						}
					}
				}
```

- [ ] **Step 5: Render the flat grid from `live`**

`components/canvas.tsx` — inside `ensureTiling`, replace lines 383-384:

```ts
						const alphas = resolveAlphaDegs(pc, useFamilyAlphas.getState().values);
						tcId = `${baseId ?? ""}@a=${alphas.map((a) => a.toFixed(2)).join(",")}`;
```

with:

```ts
						const alphas = renderAlphas(pc);
						tcId = `${baseId ?? ""}@a=${alphas.map((a) => a.toFixed(2)).join(",")}`;
```

- [ ] **Step 6: Use `live` in the inversive hit-test path too**

`components/canvas.tsx` — replace the pick-path resolve at lines 820-822:

```ts
					const cell = pc
						? evaluateParamCell(pc, resolveAlphaDegs(pc, useFamilyAlphas.getState().values))
						: staticCell;
```

with:

```ts
					const cell = pc
						? evaluateParamCell(pc, renderAlphas(pc))
						: staticCell;
```

- [ ] **Step 7: Build**

Run: `pnpm build`
Expected: compiles clean (no type errors, no new warnings). At this point a slider drag already routes through the ease (the geometry now glides toward the slider target instead of snapping) — a good intermediate check when you run Task 7.

- [ ] **Step 8: Commit**

```bash
git add components/canvas.tsx
git commit -m "feat(canvas): ease parametric alpha via live tuple; render flat grid + pick from it"
```

---

### Task 4: `p5.mouseMoved` Command-scrub handler + cursor affordance

**Files:**
- Modify: `components/canvas.tsx` (add `scrubCursorRef` ~305; keyup/blur reset effect near the other effects ~334; `p5.mouseMoved` handler after `p5.mouseWheel` ~922)

- [ ] **Step 1: Add the cursor-tracking ref**

`components/canvas.tsx` — after line 305 (`const scrollAccumRef = useRef(0);`) insert:

```ts
	// True while WE'VE set the canvas cursor to "move" for an active Command-scrub, so we only reset the
	// cursor we own (not one a future pan/grab handler might set).
	const scrubCursorRef = useRef(false);
```

- [ ] **Step 2: Add the keyup/blur cursor-reset effect**

`components/canvas.tsx` — after the `propsRef` effect (ends line 334) insert:

```ts
	// Clear the Command-scrub "move" cursor when Command is released (or the window blurs) without another
	// mouse move to clear it in mouseMoved. Cosmetic: the scrub itself is driven entirely by mouseMoved.
	useEffect(() => {
		const clear = () => {
			const c = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
			if (c) c.style.cursor = "";
			scrubCursorRef.current = false;
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key === "Meta" || !e.metaKey) clear();
		};
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", clear);
		return () => {
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", clear);
		};
	}, []);
```

- [ ] **Step 3: Add the `p5.mouseMoved` scrub handler**

`components/canvas.tsx` — after the `p5.mouseWheel = …` handler closes (line 922, the `};`) insert:

```ts
				// Command + move (no button): scrub the parametric angle(s). α on horizontal delta, β on vertical,
				// relative (movementX/Y) so pressing Command never snaps the value — only actual motion moves it.
				// Continuous, clamped to each parameter's range (never wrapped); the draw loop eases the live
				// value behind it. Writes the TARGET (familyAlphas.values), so the slider thumbs track instantly.
				// Inert unless a parametric family is selected. Re-renders only the small ParamSliderPanel (it
				// alone subscribes to `values`), exactly like a slider drag.
				p5.mouseMoved = (event?: MouseEvent) => {
					if (!event || event.target !== p5.canvas) return;
					const pc = propsRef.current.paramCell;
					if (!event.metaKey || !pc) {
						if (scrubCursorRef.current) {
							p5.canvas.style.cursor = "";
							scrubCursorRef.current = false;
						}
						return;
					}
					if (!scrubCursorRef.current) {
						p5.canvas.style.cursor = "move";
						scrubCursorRef.current = true;
					}
					const dx = event.movementX || 0;
					const dy = event.movementY || 0;
					if (dx === 0 && dy === 0) return;
					const fa = useFamilyAlphas.getState();
					const next = resolveAlphaDegs(pc, fa.values); // fresh array (map) — safe to mutate
					next[0] = clampAlphaOnly(pc, 0, next[0] + dx * ALPHA_DEG_PER_PX);
					if (pc.params.length >= 2) next[1] = clampAlphaOnly(pc, 1, next[1] - dy * ALPHA_DEG_PER_PX);
					fa.set(next);
				};
```

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: compiles clean. (Type note: `event.movementX/Y` and `event.metaKey` are standard `MouseEvent` fields; `p5.canvas` is the `any`-typed sketch canvas already used by the other handlers. The other handlers read raw DOM-event fields — `.target`, `.button`, `.shiftKey`, `.deltaY` — so p5 passes the native event and `movementX/Y` are populated. If Task 7 Step 3 shows no movement, the fallback is p5's own `p5.movedX`/`p5.movedY` in place of `event.movementX`/`event.movementY`.)

- [ ] **Step 5: Commit**

```bash
git add components/canvas.tsx
git commit -m "feat(canvas): Command+mouse-move scrubs parametric angles (alpha=x, beta=y) with move cursor"
```

---

### Task 5: Render the inversive overlay from `live`

**Files:**
- Modify: `components/inversive-canvas.tsx` (line 276)

- [ ] **Step 1: Swap the inversive render read to `live`**

`components/inversive-canvas.tsx` — replace line 276:

```ts
					const alphas = resolveAlphaDegs(pc, useFamilyAlphas.getState().values);
```

with:

```ts
					const fa = useFamilyAlphas.getState();
					const alphas = fa.live && fa.live.length === pc.params.length ? fa.live : resolveAlphaDegs(pc, fa.values);
```

(The flat canvas draw loop — always mounted beneath this overlay — drives the ease of `live`; this loop only reads it. The existing `sig`/`lastSigRef` cache at lines 277-279 makes the changing eased value rebuild the geometry each frame during the glide, exactly as a slider drag does.)

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: compiles clean.

- [ ] **Step 3: Commit**

```bash
git add components/inversive-canvas.tsx
git commit -m "feat(inversive-canvas): render parametric family from the eased live alpha tuple"
```

---

### Task 6: Reseed `live` on selection change

**Files:**
- Modify: `app/(app)/play/_play-client.tsx` (the reconcile effect, lines 218-222)

- [ ] **Step 1: Call `resetLive` in the selection reconcile**

`app/(app)/play/_play-client.tsx` — replace the effect body at lines 218-222:

```ts
	useEffect(() => {
		if (!paramCell) return;
		const fa = useFamilyAlphas.getState();
		fa.set(resolveAlphaDegs(paramCell, fa.values));
	}, [selected?.canonicalKey, paramCell]);
```

with:

```ts
	useEffect(() => {
		if (!paramCell) return;
		const fa = useFamilyAlphas.getState();
		fa.set(resolveAlphaDegs(paramCell, fa.values));
		fa.resetLive(); // reseed the eased render tuple for the NEW family — never glide across two families
	}, [selected?.canonicalKey, paramCell]);
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: compiles clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/play/_play-client.tsx"
git commit -m "feat(play): reseed eased alpha tuple on parametric selection change"
```

---

### Task 7: Full-feature verification

No new code — exercise the runtime and confirm behavior. Use the `verify` skill (drive the real flow, not just tests/build).

- [ ] **Step 1: Full test + build gate**

Run: `pnpm test` then `pnpm build`
Expected: all tests pass (including the two new files); build clean, no new warnings.

- [ ] **Step 2: Run the app**

Run: `pnpm dev`, open the printed URL, go to `/play`.

- [ ] **Step 3: Single-angle family**

Select a one-parameter isotoxal family (the floating angle-slider panel appears bottom-center — that panel's presence marks a parametric tiling). Confirm:
- Hold Command, move the mouse horizontally over the canvas → α changes, the panel's α readout tracks live, the tiling morphs and glides (eases), the cursor shows `move`.
- Vertical movement alone does nothing (single parameter).
- Push to either extreme → α clamps hard at the family's min/max, never wraps.
- Release Command → the value freezes; the cursor returns to default.
- Move the mouse with Command NOT held → nothing changes (no scrub, normal cursor).

- [ ] **Step 4: Two-angle family**

Select a two-parameter isotoxal family. Confirm horizontal = α, vertical = β, a diagonal move changes both, each clamps independently.

- [ ] **Step 5: Inversive parity**

Toggle the inversive conformal view on for a parametric family. Confirm Command+move scrubs the angle(s) there too and the overlay eases in step with what the flat view showed.

- [ ] **Step 6: No regressions to existing gestures**

Confirm the wheel still zooms, Shift+wheel still rotates the view, left-drag still pans, and a click still centers a tile — all unchanged.

- [ ] **Step 7: Update the ledgers**

Append a 3-6 line dated, signed (`CC`) entry to `docs/SYNC.md` (what landed + the final commit hash + a pointer to the spec). Add a narrative note to `docs/DEVELOPMENT_NOTES.md` if the session warrants it. Refresh `docs/STATUS.md` if the frontier/NEXT changed. Commit.

```bash
git add docs/SYNC.md docs/STATUS.md docs/DEVELOPMENT_NOTES.md
git commit -m "docs: log Command+mouse-move parametric angle scrub"
```

---

## Tuning knobs (adjust after feeling it in Step 3, no code-structure change)

- `ALPHA_DEG_PER_PX` (0.25) — scrub sensitivity, °/px.
- `ALPHA_DAMP` (0.2) — ease rate; higher = snappier, lower = floatier.
- Sign convention in the `mouseMoved` handler: `+dx` for α, `-dy` for β (right = +α, up = +β). Flip a sign if it reads backwards.
