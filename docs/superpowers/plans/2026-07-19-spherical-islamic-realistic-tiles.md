# Spherical Islamic + Realistic (raised lit tiles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a spherical tiling has Islamic + Fill + Realistic all on, render the Islamic cells as raised, light-catching tiles that pop out of the sphere with the star-lines as recessed channels; and make the lit sphere read brighter by boosting the scene lights (not the palette).

**Architecture:** The Islamic fill (`buildIslamicFill`) already tessellates each cell and projects every vertex flush onto the sphere with an unlit `MeshBasicMaterial`. We add a `relief` mode: displace each subdivided vertex radially outward by a height that is 0 on the cell boundary and ramps up to `δ` in the interior (a per-cell smoothstep of distance-to-boundary), and shade it with a `MeshStandardMaterial` (flat-shaded, so the crease at each cell boundary reads as a crisp tile edge). Because both sides of a shared edge stay at height 0, neighbours meet flush — no cracks. Brightness comes from raising the existing hemisphere/directional light intensities (plus a small ambient) in the sphere scene; the `0.40` saturation constant is left untouched everywhere.

**Tech Stack:** TypeScript, Three.js (BufferGeometry, MeshStandardMaterial, ArcballControls), React 19 effects, Vitest (jsdom), Zustand.

---

## Design decisions locked in during planning (deviations from the spec)

- **Normals: `flatShading: true`, not indexed-per-cell smoothing.** The spec (section 3) proposed building indexed-per-cell geometry and `computeVertexNormals()` per cell. `flatShading` on the existing dense non-indexed tessellation achieves the same visual result — smooth-reading domed interior (facets are sub-perceptible at the subdivision density) plus a crisp crease at every cell boundary (the tile edge) — with far less code and zero change to the vertex layout of the flat path. If faceting is visible on large cells after tuning, the fallback is to raise the relief-path subdivision floor; indexed smoothing stays out of scope.
- **Brightness: light-rig boost, no palette change.** AL directive (2026-07-19): the perceived dullness of the lit sphere is a lighting effect, so increase the light source rather than the surface saturation. The `0.40` saturation is a shared cross-view/thesis-figure constant and stays as-is. Only lit materials brighten (realistic sphere, wireframe, weave, relief fill); unlit `MeshBasicMaterial` modes are unaffected by design.

## File map

- `lib/render/sphericalIslamicFill.ts` — **modify.** Add pure `reliefHeight` helper; add `relief` option; displace vertices + swap material in the relief path. The only file with new testable logic.
- `components/spherical-canvas.tsx` — **modify.** Pass `relief: sphericalRealistic` into `buildIslamicFill` + extend the fill effect's deps; boost the scene light rig.
- `tests/spherical-islamic-fill.test.ts` — **modify.** Add tests for `reliefHeight` and for `buildIslamicFill`'s relief geometry/material invariants.

No new files, no new store fields, no new UI. Trigger is the existing combination `isIslamic && !sphericalWireframe && sphericalRealistic`.

---

## Task 1: Pure `reliefHeight` helper

**Files:**
- Modify: `lib/render/sphericalIslamicFill.ts` (add exported helper near the top-level helpers, after `hsb2rgb`)
- Test: `tests/spherical-islamic-fill.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/spherical-islamic-fill.test.ts` (add `reliefHeight` to the existing import from `@/lib/render/sphericalIslamicFill`):

```ts
import { triangulateFillCell, reliefHeight } from "@/lib/render/sphericalIslamicFill";

describe("reliefHeight — 0 on the boundary, ramps to depth in the interior", () => {
	// Unit square centred at the origin (side 1), CCW. Nearest-boundary distance at the centre is 0.5.
	const square = [new Vector(-0.5, -0.5), new Vector(0.5, -0.5), new Vector(0.5, 0.5), new Vector(-0.5, 0.5)];
	const depth = 0.03;
	const bevel = 0.2;

	it("is 0 exactly on a boundary vertex", () => {
		expect(reliefHeight(-0.5, -0.5, square, depth, bevel)).toBeCloseTo(0, 9);
	});

	it("is 0 at the midpoint of a boundary edge", () => {
		expect(reliefHeight(0, -0.5, square, depth, bevel)).toBeCloseTo(0, 9);
	});

	it("reaches full depth well inside the bevel band (centre, dist 0.5 > bevel 0.2)", () => {
		expect(reliefHeight(0, 0, square, depth, bevel)).toBeCloseTo(depth, 9);
	});

	it("is a monotonic non-decreasing ramp moving inward from an edge", () => {
		const a = reliefHeight(0, -0.45, square, depth, bevel); // near edge
		const b = reliefHeight(0, -0.35, square, depth, bevel);
		const c = reliefHeight(0, -0.25, square, depth, bevel);
		expect(a).toBeLessThan(b);
		expect(b).toBeLessThan(c);
		expect(a).toBeGreaterThanOrEqual(0);
		expect(c).toBeLessThanOrEqual(depth + 1e-9);
	});

	it("degenerate bevel (<= 0) gives full depth off the boundary", () => {
		expect(reliefHeight(0, 0, square, depth, 0)).toBeCloseTo(depth, 9);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/spherical-islamic-fill.test.ts -t "reliefHeight"`
Expected: FAIL — `reliefHeight` is not exported / not a function.

- [ ] **Step 3: Write the minimal implementation**

In `lib/render/sphericalIslamicFill.ts`, after the `hsb2rgb` helper (around line 44), add:

```ts
// Squared distance from point (px,py) to segment (ax,ay)-(bx,by).
function pointSegDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	const cx = ax + t * dx;
	const cy = ay + t * dy;
	const ex = px - cx;
	const ey = py - cy;
	return ex * ex + ey * ey;
}

// Radial relief height at a face-plane point for a cell with 2D boundary `boundary`. Returns 0 on the
// boundary (so neighbouring cells meet flush — no cracks) and ramps via smoothstep up to `depth` once the
// point is more than `bevel` (in 2D gnomonic units) inside the cell. `depth` is in sphere-radius units;
// `bevel` is in the same 2D units as `boundary`. Pure — unit-tested; used by the relief displacement below.
export function reliefHeight(px: number, py: number, boundary: Vector[], depth: number, bevel: number): number {
	if (boundary.length < 2) return 0;
	let d2 = Infinity;
	for (let i = 0; i < boundary.length; i++) {
		const a = boundary[i];
		const b = boundary[(i + 1) % boundary.length];
		const dd = pointSegDist2(px, py, a.x, a.y, b.x, b.y);
		if (dd < d2) d2 = dd;
	}
	const d = Math.sqrt(d2);
	const t = bevel <= 0 ? 1 : Math.min(1, d / bevel);
	const s = t * t * (3 - 2 * t); // smoothstep(0,1,t)
	return depth * s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/spherical-islamic-fill.test.ts -t "reliefHeight"`
Expected: PASS (5 assertions green).

- [ ] **Step 5: Commit**

```bash
git add lib/render/sphericalIslamicFill.ts tests/spherical-islamic-fill.test.ts
git commit -m "feat(spherical): pure reliefHeight helper for raised Islamic tiles"
```

---

## Task 2: Relief geometry + lit material in `buildIslamicFill`

**Files:**
- Modify: `lib/render/sphericalIslamicFill.ts` (`IslamicFillOptions`, `Cell`, `buildIslamicFill`)
- Test: `tests/spherical-islamic-fill.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/spherical-islamic-fill.test.ts`. Add the import for the builder and the solids helper (both already used elsewhere in the file via `bySolid`/`PLATONIC_SOLIDS`):

```ts
import { buildIslamicFill } from "@/lib/render/sphericalIslamicFill";
import * as THREE from "three";

describe("buildIslamicFill — relief mode", () => {
	const opts = { angleRad: (45 * Math.PI) / 180 };

	function radii(fill: NonNullable<ReturnType<typeof buildIslamicFill>>): { min: number; max: number; count: number } {
		const mesh = fill.object.children[0] as THREE.Mesh;
		const pos = (mesh.geometry as THREE.BufferGeometry).getAttribute("position");
		let min = Infinity;
		let max = -Infinity;
		for (let i = 0; i < pos.count; i++) {
			const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
			if (r < min) min = r;
			if (r > max) max = r;
		}
		return { min, max, count: pos.count };
	}

	it("flat mode (default): all vertices on the sphere, unlit MeshBasicMaterial", () => {
		const fill = buildIslamicFill(bySolid("tetrahedron"), opts)!;
		const mesh = fill.object.children[0] as THREE.Mesh;
		expect(mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial);
		const { min, max } = radii(fill);
		expect(min).toBeCloseTo(1, 4);
		expect(max).toBeCloseTo(1, 4);
	});

	it("relief mode: boundary vertices stay on the sphere, interior pushed out, lit flat-shaded material", () => {
		const flat = buildIslamicFill(bySolid("tetrahedron"), opts)!;
		const relief = buildIslamicFill(bySolid("tetrahedron"), { ...opts, relief: true })!;
		const mesh = relief.object.children[0] as THREE.Mesh;
		const mat = mesh.material as THREE.MeshStandardMaterial;
		expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
		expect(mat.flatShading).toBe(true);
		expect(mat.vertexColors).toBe(true);

		const rFlat = radii(flat);
		const rRelief = radii(relief);
		// Same tessellation (same vertex count), just displaced.
		expect(rRelief.count).toBe(rFlat.count);
		// The lowest points (cell boundaries) are still on the unit sphere; the highest bulge outward.
		expect(rRelief.min).toBeCloseTo(1, 3);
		expect(rRelief.max).toBeGreaterThan(1.01);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/spherical-islamic-fill.test.ts -t "relief mode"`
Expected: FAIL — `relief` option is ignored, so `max` radius is ~1 (not > 1.01) and the material is `MeshBasicMaterial`, not `MeshStandardMaterial`.

- [ ] **Step 3: Write the implementation**

3a. Add the two relief constants next to `TARGET_SEG`/`MAX_SUBDIV` (around line 49):

```ts
// Relief (Realistic Islamic) tuning. RELIEF_DEPTH is the radial bulge in sphere-radius units (compare the
// carved sphere's DEFAULT_CARVE_DEPTH = 0.022); RELIEF_BEVEL is the 2D-gnomonic width of the ramp from a
// cell boundary up to full depth. Tuned by eye in Task 5.
const RELIEF_DEPTH = 0.03;
const RELIEF_BEVEL = 0.16;
```

3b. Extend `IslamicFillOptions` (after `checkerColorB`, around line 68):

```ts
	/** Realistic mode: raise each cell into a lit, beveled tile (relief) instead of the flat unlit shell. */
	relief?: boolean;
```

3c. Add the cell's 2D boundary to the `Cell` interface (around line 80-84) so pass 2 can compute distance-to-boundary:

```ts
interface Cell {
	tris: Array<[Vector, Vector, Vector]>;
	klass: number;
	aHue: number;
	boundary: Vector[]; // the cell's 2D boundary polygon (face-plane), for relief height
}
```

3d. In `buildIslamicFill`, read the flag near the other option reads (around line 122):

```ts
	const relief = opts.relief ?? false;
```

3e. Update `pushCell` to carry the boundary (around lines 150-156). It currently receives `vs` (the cell polygon) — store it:

```ts
		const pushCell = (vs: Vector[], klass: number, aHue: number) => {
			if (vs.length < 3) return;
			const tris = triangulateFillCell(vs);
			if (tris.length === 0) return;
			cells.push({ tris, klass, aHue, boundary: vs });
			baseTris += tris.length;
		};
```

3f. In pass 2, apply the radial displacement. The current loop (around lines 214-245) destructures `const { tris, klass, aHue } = cell;` and writes `grid[a][b] = to3(...)`. Change the destructure to include `boundary`, and when `relief` is on, scale the projected point outward by `(radius + h) / radius`:

```ts
		for (const cell of cells) {
			const { tris, klass, aHue, boundary } = cell;
			for (const [t0, t1, t2] of tris) {
				const ax = t0.x;
				const ay = t0.y;
				const ux = t1.x - ax;
				const uy = t1.y - ay;
				const wx = t2.x - ax;
				const wy = t2.y - ay;
				for (let a = 0; a <= L; a++) {
					for (let b = 0; b <= L - a; b++) {
						const s = a / L;
						const t = b / L;
						const gx = ax + s * ux + t * wx;
						const gy = ay + s * uy + t * wy;
						let p = to3(gx, gy);
						if (relief) {
							const h = reliefHeight(gx, gy, boundary, RELIEF_DEPTH, RELIEF_BEVEL);
							if (h !== 0) {
								const f = (radius + h) / radius;
								p = [p[0] * f, p[1] * f, p[2] * f];
							}
						}
						grid[a][b] = p;
					}
				}
				// ... (the existing writeVert emission loop is unchanged) ...
```

Leave the `writeVert` emission loop (lines 231-242) exactly as-is.

3g. Build the geometry with a normal attribute and pick the material by mode. Replace the geometry/material block (around lines 247-254):

```ts
	const geom = new THREE.BufferGeometry();
	geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
	const colorAttr = new THREE.BufferAttribute(new Float32Array(triCount * 9), 3);
	geom.setAttribute("color", colorAttr);

	let material: THREE.Material;
	if (relief) {
		// computeVertexNormals on the non-indexed mesh gives per-facet normals; with flatShading the beveled
		// rim of each tile catches the light and every cell boundary stays a crisp crease (the tile edge).
		geom.computeVertexNormals();
		material = new THREE.MeshStandardMaterial({
			vertexColors: true,
			side: THREE.FrontSide, // raised tiles form a closed opaque shell — near occludes far
			roughness: 0.9,
			metalness: 0.0,
			flatShading: true,
		});
	} else {
		// DoubleSide: the flat cells tile the whole sphere into an opaque shell (near side occludes far).
		// Unlit — flat tile colours.
		material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
	}
```

Everything below (the `fixed1`/`fixed2` colours, `applyColor`, the returned `IslamicFill`) is unchanged — `applyColor` writes the same `color` attribute, which `MeshStandardMaterial({ vertexColors: true })` reads as albedo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/spherical-islamic-fill.test.ts`
Expected: PASS — the new "relief mode" block and all pre-existing tests stay green (the flat path is byte-identical: `relief` defaults false).

- [ ] **Step 5: Commit**

```bash
git add lib/render/sphericalIslamicFill.ts tests/spherical-islamic-fill.test.ts
git commit -m "feat(spherical): raised lit Islamic tiles (relief mode) in buildIslamicFill"
```

---

## Task 3: Route Realistic into the Islamic fill

**Files:**
- Modify: `components/spherical-canvas.tsx` (the Islamic cell-fill effect, ~lines 264-324)

- [ ] **Step 1: Add `sphericalRealistic` to the fill effect and pass `relief`**

In `components/spherical-canvas.tsx`, the fill effect already reads `realistic` via the base-surface effect's selector at line 131 (`const realistic = useConfiguration((s) => s.sphericalRealistic);`) — reuse it. In the `buildIslamicFill(poly, { ... })` call (around lines 308-318), add the `relief` option:

```ts
		const fill = buildIslamicFill(poly, {
			angleRad,
			edgeOffsetFrac,
			intersectionCount: islamicIntersectionCount,
			hueOffset: cfg.hueOffset,
			style: cfg.islamicStyle,
			fillColorB: cfg.islamicFillColorB,
			fillColorC: cfg.islamicFillColorC,
			checkerColorA: cfg.islamicCheckerColorA,
			checkerColorB: cfg.islamicCheckerColorB,
			relief: cfg.sphericalRealistic, // Realistic + Islamic ⇒ raised lit tiles
		});
```

- [ ] **Step 2: Add `realistic` to the fill effect's dependency array**

The fill effect's deps are at line 324. Add `realistic` so toggling Realistic rebuilds the fill:

```ts
	}, [poly, isIslamic, islamicFill, islamicStyle, islamicAngle, islamicEdgeOffset, islamicIntersectionCount, islamicBandWidth, wireframe, weaveFlat, realistic]);
```

- [ ] **Step 3: Build to verify wiring + types**

Run: `pnpm build`
Expected: build succeeds, no type errors. (Per the project workflow rule, a full build — not just lint/test — is the gate.)

- [ ] **Step 4: Commit**

```bash
git add components/spherical-canvas.tsx
git commit -m "feat(spherical): wire Realistic toggle into the Islamic cell fill"
```

---

## Task 4: Brighten the lit sphere via the light rig

**Files:**
- Modify: `components/spherical-canvas.tsx` (the light rig, ~lines 86-92)

- [ ] **Step 1: Raise the light intensities and add a small ambient**

In the scene-setup effect, replace the light rig (lines 89-92):

```ts
		// Light rig — shades the lit materials (wireframe/weave/carved sphere, and the raised Islamic relief
		// tiles). Boosted from the original 0.55/0.55 so lit tile hues read as brightly as the unlit flat
		// modes; roughness 0.9 keeps specular soft so the extra intensity doesn't clip on saturated hues.
		const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.85);
		const dir = new THREE.DirectionalLight(0xffffff, 0.8);
		dir.position.set(3, 4, 5);
		const ambient = new THREE.AmbientLight(0xffffff, 0.2);
		scene.add(hemi, dir, ambient);
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/spherical-canvas.tsx
git commit -m "feat(spherical): brighten lit sphere materials via stronger light rig"
```

> These intensities are starting points. Final values are set by eye in Task 5 against the reference screenshot; adjust the three numbers there and amend this commit or add a `chore(spherical): tune sphere lighting` follow-up.

---

## Task 5: Visual verification and tuning

**Files:**
- Possibly tune: `lib/render/sphericalIslamicFill.ts` (`RELIEF_DEPTH`, `RELIEF_BEVEL`), `components/spherical-canvas.tsx` (light intensities), and the Islamic line ribbon radius if buried.

- [ ] **Step 1: Run the app**

Run: `pnpm dev`, open `/play`, select a spherical tiling (e.g. the truncated icosahedron / any `k=1 Spherical` entry). Turn on **Islamic** (I), keep **Fill** on, turn on **Realistic**.

- [ ] **Step 2: Verify the target look**

Confirm, rotating the sphere:
- The Islamic star cells sit raised off the sphere and catch the light (a bright side and a shaded side as you rotate); the star-lines read as recessed channels between tiles.
- Toggling **Realistic** off returns to the flat unlit Islamic look (regression: the flat path is unchanged).
- The lit sphere (both plain Realistic and Realistic-Islamic) reads noticeably brighter than before the light boost.

- [ ] **Step 3: Check the stress cases**

- Sweep the **Islamic Angle** across its range (Acute/Median/Obtuse and the extremes ~5° and ~88°). Watch the non-convex star-arm cells: no cracks, no z-fighting/moiré at cell boundaries, tiles stay seated (boundaries flush).
- Confirm the star-line ribbons are still visible in the channels and not buried by the raised caps. If buried, raise the ribbon sample radius slightly in `buildIslamicPattern`'s call/consumer so the lines float at ~`1 + RELIEF_DEPTH * 0.5`; re-verify.

- [ ] **Step 4: Tune**

If tiles are too flat or too spiky, adjust `RELIEF_DEPTH` (bulge) and `RELIEF_BEVEL` (rim width) in `sphericalIslamicFill.ts`. If the surface is too dark/washed, adjust the hemi/dir/ambient intensities in `spherical-canvas.tsx`. If large cells show visible facets, raise the subdivision floor for the relief path (e.g. bump the `Math.max(6, …)` floor in the `L` computation to `Math.max(10, …)` when `relief`). Re-run Steps 2-3 after any change.

- [ ] **Step 5: Full test + build gate**

Run: `pnpm vitest run tests/spherical-islamic-fill.test.ts` — Expected: PASS.
Run: `pnpm build` — Expected: succeeds, no errors/warnings.

- [ ] **Step 6: Commit any tuning**

```bash
git add lib/render/sphericalIslamicFill.ts components/spherical-canvas.tsx
git commit -m "chore(spherical): tune relief depth/bevel and sphere lighting by eye"
```

---

## Self-review notes

- **Spec coverage:** Sections 1 (route realistic → Task 3), 2 (relief geometry → Tasks 1-2), 3 (lit material + crease → Task 2, via flatShading instead of indexed normals, documented above), 4 (lighting → Task 4, redirected from ambient-tweak to a full light boost per AL directive), line-ribbons check (→ Task 5 Step 3), verification (→ Task 5). Section 5 (saturation bump) is intentionally dropped per the AL directive — brightness is lighting-only.
- **Scope:** single feature, one geometry file + one component; fits one plan.
- **Type consistency:** `reliefHeight(px, py, boundary, depth, bevel)` defined in Task 1 is called identically in Task 2 (3f). `Cell.boundary` added in Task 2 (3c) is written in 3e and read in 3f. `relief` option added in Task 2 (3b) is passed in Task 3 (Step 1).
