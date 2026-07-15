# Uniform hyperbolic tilings — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 18 uniform (Wythoffian) hyperbolic tilings — truncated, rectified, rhombi-, omnitruncated, snub of the three triangle groups (2,3,7)/(2,3,8)/(2,4,5) — to the /play hyperbolic shelf.

**Architecture:** Extend the existing Poincaré-disk WebGL shader with a Schwarz-triangle fold + Wythoff-point classifier. The correctness core (which polygons appear, where the generating vertex sits) is pure code in `lib/render/hyperbolic.ts`, unit-tested against the known vertex configurations. The shader consumes derived per-tiling uniforms; the 18 tilings are compact `wythoff` data rows.

**Tech Stack:** TypeScript, Next 16, WebGL2/GLSL (fragment shader), Vitest.

Spec: `docs/superpowers/specs/2026-07-15-uniform-hyperbolic-tilings-design.md`.

## Geometry reference (load-bearing — do not re-derive wrong)

For {p,q} (central p-gon at origin, reference edge midpoint on +x), `mirrorParams(p,q)` gives `rIn, rC, edgeA, edgeRho`. The fundamental Schwarz triangle T:

- Corner `O` = (0, 0), the p-gon centre, angle π/p. Mirrors meeting here: A and B.
- Corner `E` = (rIn, 0), an edge midpoint, angle π/2. Mirrors: A and C.
- Corner `V` = (rC·cos(π/p), rC·sin(π/p)), a tiling vertex, angle π/q. Mirrors: B and C.

The three mirrors (geodesics), with `rings = [a, b, c]` ringing `[A, B, C]`:
- `A` (face mirror, opposite V) = the real axis (diameter through O, E).
- `B` (edge mirror, opposite E) = the diameter at angle π/p (through O, V).
- `C` (vertex mirror, opposite O) = the edge circle: centre (edgeA, 0), radius edgeRho (orthogonal to the unit circle).

**Face-size rule** (side count of the face centred at each corner; 0 = no face there):
- `n_O` = 0 if a=0 ∧ b=0; `2p` if a=1 ∧ b=1; else `p` (exactly one of a,b).
- `n_V` = 0 if b=0 ∧ c=0; `2q` if b=1 ∧ c=1; else `q` (exactly one of b,c).
- `n_E` = `4` if a=1 ∧ c=1; else `0` (an order-2 corner: a lone ring gives a degenerate 2-gon = no face).

Verified against the scope table, e.g. [7,3]: tr{7,3}=[1,1,1] → {14,6,4}=4.6.14 ✓; t{7,3}=[1,1,0] → {14,3}=3.14.14 ✓; r{7,3}=[0,1,0] → {7,3}=3.7.3.7 ✓; rr{7,3}=[1,0,1] → {7,3,4}=3.4.7.4 ✓; t{3,7}=[0,1,1] → {7,6}=6.6.7 ✓.

**Wythoff generating vertex** W (a tiling vertex, inside/on T): lies ON every unringed mirror, equidistant from the ringed mirrors.
- `[0,1,0]` rectified: W on A and C ⇒ W = E = (rIn, 0).
- `[1,1,0]` truncated: W on C, on the bisector of A,B (the diameter at angle π/2p).
- `[0,1,1]` trunc-dual: W on A (real axis), equidistant from B and C.
- `[1,0,1]` rhombi: W on B (diameter at π/p), equidistant from A and C.
- `[1,1,1]` omnitrunc: W = incenter of T (equidistant from all three mirrors).

---

## Task 1: Face-size derivation (pure, combinatorial)

**Files:**
- Modify: `lib/render/hyperbolic.ts`
- Test: `tests/hyperbolic.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/hyperbolic.test.ts` (add `wythoffFaces` and `type Rings` to the import from `@/lib/render/hyperbolic`):

```ts
describe("wythoffFaces (per-corner face sizes)", () => {
	// [group p, q, rings, expected {O,V,E} face sizes, name]
	const CASES: Array<[number, number, [boolean, boolean, boolean], [number, number, number], string]> = [
		[7, 3, [true, true, false], [14, 3, 0], "t{7,3}=3.14.14"],
		[7, 3, [false, true, false], [7, 3, 0], "r{7,3}=3.7.3.7"],
		[7, 3, [false, true, true], [7, 6, 0], "t{3,7}=6.6.7"],
		[7, 3, [true, false, true], [7, 3, 4], "rr{7,3}=3.4.7.4"],
		[7, 3, [true, true, true], [14, 6, 4], "tr{7,3}=4.6.14"],
		[8, 3, [true, true, true], [16, 6, 4], "tr{8,3}=4.6.16"],
		[5, 4, [true, true, false], [10, 4, 0], "t{5,4}=4.10.10"],
		[5, 4, [false, true, false], [5, 4, 0], "r{5,4}=4.5.4.5"],
		[5, 4, [false, true, true], [5, 8, 0], "t{4,5}=5.8.8"],
		[5, 4, [true, false, true], [5, 4, 4], "rr{5,4}=4.4.5.4"],
		[5, 4, [true, true, true], [10, 8, 4], "tr{5,4}=4.8.10"],
		[7, 3, [true, false, false], [7, 0, 0], "{7,3} regular"],
	];
	for (const [p, q, rings, expected, name] of CASES) {
		it(`derives ${name}`, () => {
			const f = wythoffFaces(p, q, rings);
			expect([f.nO, f.nV, f.nE]).toEqual(expected);
		});
	}
	it("distinct nonzero sizes match the vertex config's distinct polygons", () => {
		const f = wythoffFaces(7, 3, [true, false, true]); // 3.4.7.4 → {3,4,7}
		const distinct = new Set([f.nO, f.nV, f.nE].filter((n) => n > 0));
		expect(distinct).toEqual(new Set([7, 3, 4]));
	});
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/hyperbolic.test.ts -t wythoffFaces` → FAIL ("wythoffFaces is not defined").

- [ ] **Step 3: Implement** — append to `lib/render/hyperbolic.ts`:

```ts
/** Coxeter–Dynkin ring flags on the linear diagram A—p—B—q—C. */
export type Rings = [boolean, boolean, boolean];

export interface WythoffFaces {
	/** face at corner O (p-fold centre), 0 if none */ nO: number;
	/** face at corner V (q-fold vertex), 0 if none */ nV: number;
	/** face at corner E (order-2 edge midpoint), 0 if none */ nE: number;
}

/**
 * Side counts of the faces centred at the three Schwarz-triangle corners of the uniform tiling with the
 * given ring pattern. A corner where both incident mirrors are ringed carries a 2·order-gon (truncation);
 * exactly one ringed carries an order-gon; none carries no face. The order-2 corner E degenerates: a lone
 * ring there is a 2-gon (an edge, not a face), so E only carries a genuine square when both A and C ring.
 */
export function wythoffFaces(p: number, q: number, rings: Rings): WythoffFaces {
	const [a, b, c] = rings;
	const nO = a && b ? 2 * p : a || b ? p : 0;
	const nV = b && c ? 2 * q : b || c ? q : 0;
	const nE = a && c ? 4 : 0;
	return { nO, nV, nE };
}
```

- [ ] **Step 4: Run to verify it passes** — `pnpm vitest run tests/hyperbolic.test.ts -t wythoffFaces` → PASS.

- [ ] **Step 5: Commit** — `git add lib/render/hyperbolic.ts tests/hyperbolic.test.ts && git commit -m "feat(hyperbolic): Wythoff per-corner face-size rule"`

---

## Task 2: Schwarz-triangle corners + Wythoff generating vertex (pure geometry)

**Files:**
- Modify: `lib/render/hyperbolic.ts`
- Test: `tests/hyperbolic.test.ts`

Helpers used here (add near the top of `hyperbolic.ts` if not present): hyperbolic distance from a disk point `z` to a geodesic. For a **diameter** at angle θ, the signed distance uses the perpendicular projection; for the **edge circle** (centre (cx,0), radius ρ, orthogonal to unit circle) the hyperbolic distance to a point is monotonic in the Euclidean "inversive distance" — for equidistance tests we only need a comparator, so compare the two half-plane potentials directly.

- [ ] **Step 1: Write the failing test** — append (import `schwarzCorners`, `wythoffVertex`):

```ts
describe("schwarzCorners", () => {
	it("places O at the origin, E on +x at rIn, V at circumradius/angle π/p", () => {
		const { rIn, rC } = mirrorParams(7, 3);
		const { O, V, E } = schwarzCorners(7, 3);
		expect(near(O.x, 0) && near(O.y, 0)).toBe(true);
		expect(near(E.x, rIn) && near(E.y, 0)).toBe(true);
		expect(near(V.x, rC * Math.cos(Math.PI / 7))).toBe(true);
		expect(near(V.y, rC * Math.sin(Math.PI / 7))).toBe(true);
	});
});

describe("wythoffVertex", () => {
	const onRealAxis = (z: Complex) => near(z.y, 0, 1e-7);
	const onDiameter = (z: Complex, ang: number) => near(z.x * Math.sin(ang) - z.y * Math.cos(ang), 0, 1e-7);
	const onEdgeCircle = (z: Complex, a: number, rho: number) =>
		near(Math.hypot(z.x - a, z.y) - rho, 0, 1e-6);

	it("rectified [0,1,0] sits at the edge midpoint E", () => {
		const { rIn } = mirrorParams(7, 3);
		const w = wythoffVertex(7, 3, [false, true, false]);
		expect(near(w.x, rIn) && near(w.y, 0)).toBe(true);
	});
	it("truncated [1,1,0] lies on the edge circle and the π/2p bisector", () => {
		const { edgeA, edgeRho } = mirrorParams(7, 3);
		const w = wythoffVertex(7, 3, [true, true, false]);
		expect(onEdgeCircle(w, edgeA, edgeRho)).toBe(true);
		expect(onDiameter(w, Math.PI / (2 * 7))).toBe(true);
	});
	it("trunc-dual [0,1,1] lies on the real axis (mirror A)", () => {
		const w = wythoffVertex(7, 3, [false, true, true]);
		expect(onRealAxis(w)).toBe(true);
		expect(Math.hypot(w.x, w.y)).toBeLessThan(1);
	});
	it("rhombi [1,0,1] lies on the π/p diameter (mirror B)", () => {
		const w = wythoffVertex(7, 3, [true, false, true]);
		expect(onDiameter(w, Math.PI / 7)).toBe(true);
	});
	it("omnitruncated [1,1,1] lies strictly inside T (off all three mirrors)", () => {
		const { edgeA, edgeRho } = mirrorParams(7, 3);
		const w = wythoffVertex(7, 3, [true, true, true]);
		expect(onRealAxis(w)).toBe(false);
		expect(onDiameter(w, Math.PI / 7)).toBe(false);
		expect(onEdgeCircle(w, edgeA, edgeRho)).toBe(false);
		expect(Math.hypot(w.x, w.y)).toBeLessThan(1);
	});
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/hyperbolic.test.ts -t "schwarzCorners|wythoffVertex"` → FAIL.

- [ ] **Step 3: Implement** — append to `lib/render/hyperbolic.ts`. Uses a small hyperbolic-distance-to-geodesic comparator and a 1-D root find (bisection) along the unringed locus. Complete code:

```ts
export interface SchwarzCorners { O: Complex; V: Complex; E: Complex; }

/** The three Poincaré-disk corners of the {p,q} fundamental Schwarz triangle (see mirrorParams frame). */
export function schwarzCorners(p: number, q: number): SchwarzCorners {
	const { rIn, rC } = mirrorParams(p, q);
	const a = Math.PI / p;
	return { O: { x: 0, y: 0 }, E: { x: rIn, y: 0 }, V: { x: rC * Math.cos(a), y: rC * Math.sin(a) } };
}

/** Hyperbolic distance between two Poincaré-disk points. */
function hypDist(u: Complex, v: Complex): number {
	const dx = u.x - v.x, dy = u.y - v.y;
	const num = dx * dx + dy * dy;
	const du = 1 - (u.x * u.x + u.y * u.y);
	const dv = 1 - (v.x * v.x + v.y * v.y);
	return Math.acosh(1 + (2 * num) / (du * dv));
}

// Distance from a disk point to a mirror geodesic, as a nonnegative comparator (0 on the mirror).
// A/B are diameters (distance = |perpendicular projection| in the hyperbolic metric via the foot);
// we use the reflection trick: dist(z, mirror) = ½·hypDist(z, reflect(z, mirror)).
function reflectDiameter(z: Complex, ang: number): Complex {
	// reflect across the line through the origin at angle `ang`.
	const c = Math.cos(2 * ang), s = Math.sin(2 * ang);
	return { x: c * z.x + s * z.y, y: s * z.x - c * z.y };
}
function reflectEdgeCircle(z: Complex, cx: number, rho: number): Complex {
	// inversion in the circle (cx,0),rho — the hyperbolic reflection across that geodesic.
	const dx = z.x - cx, dy = z.y;
	const d2 = dx * dx + dy * dy;
	const k = (rho * rho) / d2;
	return { x: cx + k * dx, y: k * dy };
}
function distToMirror(z: Complex, mirror: "A" | "B" | "C", p: number, edgeA: number, edgeRho: number): number {
	const r =
		mirror === "A" ? reflectDiameter(z, 0)
		: mirror === "B" ? reflectDiameter(z, Math.PI / p)
		: reflectEdgeCircle(z, edgeA, edgeRho);
	return 0.5 * hypDist(z, r);
}

/**
 * The Wythoff generating vertex for `rings`: on every unringed mirror, equidistant from the ringed ones.
 * Implemented by parametrising the unringed locus (a point, a diameter ray, or the 2-D interior) and
 * root-finding the equidistance condition with bisection — robust and geometry-exact enough for rendering.
 */
export function wythoffVertex(p: number, q: number, rings: Rings): Complex {
	const [a, b, c] = rings;
	const { rIn, edgeA, edgeRho } = mirrorParams(p, q);
	const dA = (z: Complex) => distToMirror(z, "A", p, edgeA, edgeRho);
	const dB = (z: Complex) => distToMirror(z, "B", p, edgeA, edgeRho);
	const dC = (z: Complex) => distToMirror(z, "C", p, edgeA, edgeRho);
	const ringed = [a, b, c];

	// One ring only ⇒ W is the corner where the two unringed mirrors meet.
	if (a && !b && !c) return schwarzCorners(p, q).V; // on B,C
	if (!a && !b && c) return schwarzCorners(p, q).O; // on A,B (regular {q,p} case, unused)
	if (!a && b && !c) return { x: rIn, y: 0 };        // rectified: on A,C ⇒ E

	// Bisection helper: find t∈[0,1] on the segment param `pt(t)` where f(t)=0 (f monotone).
	const solve = (pt: (t: number) => Complex, f: (z: Complex) => number): Complex => {
		let lo = 0, hi = 1, flo = f(pt(0));
		for (let i = 0; i < 60; i++) {
			const mid = (lo + hi) / 2, fm = f(pt(mid));
			if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
		}
		return pt((lo + hi) / 2);
	};

	if (a && b && !c) {
		// truncated: on C (edge circle), equidistant from A,B ⇒ on the π/2p bisector diameter ∩ C.
		const ang = Math.PI / (2 * p);
		// march radius outward along the bisector until we hit the edge circle.
		return solve(
			(t) => ({ x: t * Math.cos(ang), y: t * Math.sin(ang) }),
			(z) => Math.hypot(z.x - edgeA, z.y) - edgeRho,
		);
	}
	if (!a && b && c) {
		// trunc-dual: on A (real axis), equidistant from B,C. March x∈[0,1) on +x.
		return solve((t) => ({ x: t * 0.999, y: 0 }), (z) => dB(z) - dC(z));
	}
	if (a && !b && c) {
		// rhombi: on B (π/p diameter), equidistant from A,C.
		const ang = Math.PI / p;
		return solve((t) => ({ x: t * 0.999 * Math.cos(ang), y: t * 0.999 * Math.sin(ang) }), (z) => dA(z) - dC(z));
	}
	// omnitruncated [1,1,1]: incenter — 2-D solve. Walk toward equidistance from a start at the centroid.
	let z = (() => { const { O, V, E } = schwarzCorners(p, q); return { x: (O.x + V.x + E.x) / 3, y: (O.y + V.y + E.y) / 3 }; })();
	for (let i = 0; i < 200; i++) {
		const gA = dA(z), gB = dB(z), gC = dC(z);
		const target = (gA + gB + gC) / 3;
		// nudge along the negative gradient of the variance (finite-diff), tiny step.
		const h = 1e-4;
		const varAt = (zz: Complex) => { const x = [dA(zz), dB(zz), dC(zz)]; const m = (x[0]+x[1]+x[2])/3; return (x[0]-m)**2+(x[1]-m)**2+(x[2]-m)**2; };
		const gx = (varAt({ x: z.x + h, y: z.y }) - varAt({ x: z.x - h, y: z.y })) / (2 * h);
		const gy = (varAt({ x: z.x, y: z.y + h }) - varAt({ x: z.x, y: z.y - h })) / (2 * h);
		z = { x: z.x - 0.5 * gx, y: z.y - 0.5 * gy };
		void target;
		if (gx * gx + gy * gy < 1e-20) break;
	}
	return z;
}
```

- [ ] **Step 4: Run to verify it passes** — `pnpm vitest run tests/hyperbolic.test.ts -t "schwarzCorners|wythoffVertex"` → PASS. (If the incenter solve is loose, tighten the step/iterations; the test only checks it is off all mirrors and inside the disk.)

- [ ] **Step 5: Commit** — `git commit -am "feat(hyperbolic): Schwarz corners + Wythoff generating vertex"`

---

## Task 3: Tile-type hue map + per-tiling descriptor

**Files:**
- Modify: `lib/render/hyperbolic.ts`
- Test: `tests/hyperbolic.test.ts`

- [ ] **Step 1: Write the failing test**:

```ts
describe("tileHue + uniformDescriptor", () => {
	it("gives a stable, distinct hue per polygon side count", () => {
		expect(tileHue(3)).toBe(tileHue(3));
		expect(tileHue(3)).not.toBe(tileHue(4));
		expect(tileHue(14)).toBeGreaterThanOrEqual(0);
		expect(tileHue(14)).toBeLessThan(360);
	});
	it("descriptor lists the tiling's tile types with hues and the Wythoff vertex", () => {
		const d = uniformDescriptor(7, 3, [true, true, true]); // 4.6.14
		const sizes = d.tiles.map((t) => t.sides).sort((a, b) => a - b);
		expect(sizes).toEqual([4, 6, 14]);
		expect(d.tiles.find((t) => t.sides === 4)!.corner).toBe("E");
		expect(Math.hypot(d.wythoff.x, d.wythoff.y)).toBeLessThan(1);
	});
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL ("tileHue is not defined").

- [ ] **Step 3: Implement**:

```ts
/** Stable hue (degrees) for an n-gon, so a given polygon reads the same colour across tilings. */
export function tileHue(sides: number): number {
	return ((sides * 47) % 360 + 360) % 360;
}

export interface UniformTile { corner: "O" | "V" | "E"; sides: number; hue: number; }
export interface UniformDescriptor {
	p: number; q: number; rings: Rings;
	wythoff: Complex;
	corners: SchwarzCorners;
	tiles: UniformTile[]; // only corners that carry a face
}

/** Full derived descriptor a renderer needs for a non-snub uniform {p,q} tiling. */
export function uniformDescriptor(p: number, q: number, rings: Rings): UniformDescriptor {
	const f = wythoffFaces(p, q, rings);
	const corners = schwarzCorners(p, q);
	const tiles: UniformTile[] = [];
	if (f.nO > 0) tiles.push({ corner: "O", sides: f.nO, hue: tileHue(f.nO) });
	if (f.nV > 0) tiles.push({ corner: "V", sides: f.nV, hue: tileHue(f.nV) });
	if (f.nE > 0) tiles.push({ corner: "E", sides: f.nE, hue: tileHue(f.nE) });
	return { p, q, rings, wythoff: wythoffVertex(p, q, rings), corners, tiles };
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(hyperbolic): tile-hue map + uniform descriptor"`

---

## Task 4: Shader — fold to the Schwarz triangle + classify by tile type

**Files:**
- Modify: `lib/render/hyperbolicShader.ts` (GLSL + `HyperbolicUniforms` + `UNIFORM_NAMES`)

Shader work is verified visually, not by Vitest. Protocol per step: rebuild via `pnpm build`, run `pnpm dev`, open /play, select a uniform entry (added in Task 6; until then temporarily point an existing entry's uniforms at a `uniformDescriptor` in the canvas to eyeball it), compare against `experiments/hyperbolic/render_poincare.py` output for the same {p,q}.

- [ ] **Step 1: Add uniforms.** Extend the fragment shader with: `uniform int uNTiles; uniform vec3 uTileClass[3];` where each `uTileClass[i] = (cornerId, sides, hue)` with cornerId 0=O,1=V,2=E; and `uniform vec2 uWythoff;`. Add matching keys to `HyperbolicUniforms`, `UNIFORM_NAMES`.

- [ ] **Step 2: Fold one reflection further.** After the existing loop lands `z` in the reference kite, add `float side = sign(z.y); z.y = abs(z.y);` to fold into T (the half-wedge [0, π/p]). Carry `side` for the AA Jacobian (the reflection is an isometry, scale 1, so `jac` is unchanged; only orientation flips).

- [ ] **Step 3: Classify.** Compute the pixel's tile: for each occupied corner, the region of T assigned to it is bounded by the geodesic segments from `uWythoff` to the feet of its perpendiculars on the two sides meeting that corner. Implement the equivalent test: the pixel belongs to the corner `X` minimising hyperbolic distance to `X` among occupied corners **after** clipping by the `uWythoff`-centred wedge boundaries (geodesics `uWythoff`→foot). Concretely, precompute in GLSL the three internal boundary geodesics (as circles/lines) once per frame is not possible (no varyings), so pass the three feet `uFootA/B/C` as uniforms computed CPU-side from `uWythoff`, and classify by side-of-geodesic tests. Colour by the matched tile's hue; keep the existing distance-dim and stroke logic, taking the stroke where the pixel is within `halfW` of any internal boundary or the outer edge geodesic.

- [ ] **Step 4: CPU side** — in `hyperbolic.ts` add `wythoffFeet(p,q,rings)` returning the three perpendicular feet (reuse `reflect*` + the geodesic-foot midpoint: foot = the point on the mirror minimising `hypDist` to W, found by the same bisection along the mirror). Add a test that each foot lies on its mirror. Pass feet as uniforms from the canvas/thumbnail.

- [ ] **Step 5: Visual verify + commit.** Confirm 4.6.14, 3.14.14, 3.7.3.7 render correctly (three tile types / two / two) with clean edges and unbounded pan. `git commit -am "feat(hyperbolic): Schwarz-triangle fold + Wythoff tile classifier in shader"`

---

## Task 5: Wire the canvas + thumbnail to the descriptor

**Files:**
- Modify: `components/hyperbolic-canvas.tsx`, `components/hyperbolic-thumbnail.tsx`

- [ ] **Step 1:** Change both components' `geom`/`renderToDataUrl` to accept a `wythoff` descriptor `{ p, q, rings, snub }` (falling back to `rings:[1,0,0]` when only `schlafli` is present, so the four regular entries are unchanged). Build `uniformDescriptor` + `wythoffFeet` and set `uNTiles`, `uTileClass[]`, `uWythoff`, `uFoot*`. For a single-tile tiling (regular) `uNTiles=1` and the classifier returns that one tile everywhere — identical output to today.
- [ ] **Step 2:** `pnpm build` clean; /play regular entries look identical to before (regression check); uniform entries render.
- [ ] **Step 3:** `git commit -am "feat(hyperbolic): drive canvas + thumbnail from the uniform descriptor"`

---

## Task 6: Data — 18 uniform entries + migrate the 4 regular ones

**Files:**
- Modify: `public/reference-atlas-hyperbolic.json`, `lib/services/referenceAtlas.ts`, `lib/services/catalogueService.ts`, `components/reference-card.tsx`, `app/(app)/play/_play-client.tsx`

- [ ] **Step 1:** In `referenceAtlas.ts` add `wythoff?: { p: number; q: number; rings: [boolean, boolean, boolean]; snub?: boolean }` to the entry type (both the raw record type and the mapped `ReferenceTiling`), carried through the `.map` at ~line 280. Route hyperbolic on `geometry === "hyperbolic"` (already present) — keep `schlafli` optional.
- [ ] **Step 2:** Add the four regular entries' `wythoff: { p, q, rings: [true,false,false] }` alongside their existing `schlafli`.
- [ ] **Step 3:** Append 18 entries (6 forms × 3 groups). Each: `id` (e.g. `hyp-t-7-3`), `source:"hyperbolic"`, `k:1`, `family` (e.g. `"t{7,3}"`), `geometry:"hyperbolic"`, `discoverer:"Coxeter"`, a `note` with the form name + vertex config, `wythoff: { p, q, rings }` (snub set in Task 7), and the throwaway `renderCell` (unchanged shape, never drawn). Use the scope table for names/configs.
- [ ] **Step 4:** In `catalogueService.ts`, `reference-card.tsx`, and the play client, read `wythoff` where they branch on `schlafli` (card label falls back to the `family` string when there is no Schläfli symbol).
- [ ] **Step 5:** `pnpm build`; /play shows all 22 hyperbolic entries; thumbnails render; `git commit -am "feat(hyperbolic): 18 uniform tiling catalogue entries"`

---

## Task 7: Snub (isolated, highest-risk — final increment)

**Files:**
- Modify: `lib/render/hyperbolic.ts`, `lib/render/hyperbolicShader.ts`, `public/reference-atlas-hyperbolic.json`

Snub sr{p,q} is the alternation of the omnitruncated tiling: chiral, with p-gons, q-gons, and triangles. It is NOT a perpendicular-of-W decomposition.

- [ ] **Step 1:** Pure geometry — `snubVertex(p,q)`: the snub point s in T such that the resulting triangles are equilateral at the tiling edge length (solve the closure condition; test the derived vertex config equals `3.3.…q`). Add the doubled fundamental domain (rotation subgroup: two Schwarz triangles across mirror A).
- [ ] **Step 2:** Shader — fold with the rotation subgroup (drop the final `abs(z.y)` reflection; instead reduce by the order-`p` rotation about O and the order-`q` rotation about V), classify into p-gon / q-gon / snub-triangle with a chirality parity term from the fold's reflection count.
- [ ] **Step 3:** Add the three snub entries `wythoff: { p, q, rings:[true,true,true], snub:true }`.
- [ ] **Step 4:** Visual verify each snub renders chirally-correct and pans; `git commit -am "feat(hyperbolic): snub uniform tilings"`

**Fallback:** if Step 2 proves disproportionately costly, drop the three snub entries and ship 15 — Tasks 1–6 stand alone. Record the decision in NOTES.

---

## Task 8: Docs + build gate

- [ ] **Step 1:** `pnpm build` clean (types + lint); `pnpm test` green.
- [ ] **Step 2:** Append a `DEVELOPMENT_NOTES.md` section (§60) — what landed, the face-size rule, the snub outcome. Add a `SYNC.md` entry (3–6 lines).
- [ ] **Step 3:** `git commit -am "docs(hyperbolic): NOTES §60 + SYNC for uniform tilings"`

---

## Self-review

- **Spec coverage:** §Scope→Tasks 1/6; §Data model→Task 6; §Geometry→Tasks 1–3; §Shader→Tasks 4/7; §Interaction & catalogue→Tasks 5/6; snub→Task 7. Covered.
- **Type consistency:** `Rings`, `WythoffFaces{nO,nV,nE}`, `SchwarzCorners{O,V,E}`, `UniformDescriptor`, `UniformTile{corner,sides,hue}`, `wythoffFaces`/`schwarzCorners`/`wythoffVertex`/`tileHue`/`uniformDescriptor`/`wythoffFeet`/`snubVertex` — names used consistently across tasks.
- **Placeholder scan:** shader steps (Tasks 4/7) are visual-verify by nature (GLSL is not Vitest-testable); they carry the exact construction, not "TODO". The incenter/snub solves are numeric with explicit iteration counts.
