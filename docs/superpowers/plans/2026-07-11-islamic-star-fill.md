# Islamic star-fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the cells of the Islamic line construction for star tilings by coloring each cell of the global line arrangement according to the highest-priority marker point it contains (centroid > dent > tip).

**Architecture:** A new pure module `lib/utils/islamicArrangement.ts` turns the construction segments into bounded faces (planar arrangement, no transversal crossings) and colors each face by marker containment. `Polygon` gains `islamicMarkers()`. `Tiling` gains `drawIslamicStarFill` and dispatches to it (star tilings) or the existing regular fill (dentless tilings) from `Tiling.show`.

**Tech Stack:** TypeScript, Vitest, p5.js (render only). Path alias `@/` → `lib/`. Tests import values through the `@/classes` barrel to avoid the circular-import ordering hazard.

**Repo policy:** commits happen only when the user asks. The "Commit" steps below are the intended commit points; hold them until the user approves.

---

## File structure

- Create `lib/utils/islamicArrangement.ts` — pure geometry: types (`Segment`, `Marker`, `Face`), helpers (`signedArea`, `pointInPolygon`, `lineIntersect`, `tipPoint`), `extractFaces`, `colorFaces`. No p5, no store, no `Polygon` import.
- Create `tests/islamic-arrangement.test.ts` — unit tests for the module.
- Modify `lib/classes/polygons/Polygon.ts` — add `islamicMarkers()`; remove the now-unused dim-base call site is not needed here (that lives in Tiling).
- Modify `lib/classes/Tiling.ts` — add `drawIslamicStarFill`; change the Islamic branch of `Tiling.show` to dispatch star vs regular.
- Modify `tests/islamic-construction.test.ts` — add the end-to-end marker/fill test for a 4-star.

The colors live as three constants in `islamicArrangement.ts` (`HUE`), promotable to config later.

---

## Task 1: Arrangement module scaffold and geometry helpers

**Files:**
- Create: `lib/utils/islamicArrangement.ts`
- Test: `tests/islamic-arrangement.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { Vector } from "@/classes";
import { signedArea, pointInPolygon, lineIntersect, tipPoint } from "@/utils/islamicArrangement";

describe("islamicArrangement geometry helpers", () => {
    it("signedArea is positive for a CCW triangle, negative for CW", () => {
        const ccw = [new Vector(0, 0), new Vector(1, 0), new Vector(0, 1)];
        expect(signedArea(ccw)).toBeCloseTo(0.5, 9);
        expect(signedArea([...ccw].reverse())).toBeCloseTo(-0.5, 9);
    });

    it("pointInPolygon is true inside and false outside a non-convex polygon", () => {
        // arrow/concave quad
        // concave dart with a reflex vertex at (0.5,1): (0.3,1) is in the carved-out notch (outside),
        // (1.5,1) is on the interior diagonal D-B (inside).
        const poly = [new Vector(0, 0), new Vector(2, 1), new Vector(0, 2), new Vector(0.5, 1)];
        expect(pointInPolygon(poly, new Vector(0.3, 1))).toBe(false);
        expect(pointInPolygon(poly, new Vector(1.5, 1))).toBe(true);
    });

    it("lineIntersect finds the crossing of two lines given point+direction", () => {
        const p = lineIntersect(new Vector(0, 0), new Vector(1, 0), new Vector(2, -1), new Vector(0, 1));
        expect(p!.x).toBeCloseTo(2, 9);
        expect(p!.y).toBeCloseTo(0, 9);
    });

    it("tipPoint of a unit square's two edges at a corner is the centroid", () => {
        // square (0,0),(1,0),(1,1),(0,1). Corner (1,0): edges (0,0)->(1,0) and (1,0)->(1,1).
        const hPrev = new Vector(0.5, 0), nPrev = new Vector(0, 1);   // inward normal of bottom edge
        const hCur = new Vector(1, 0.5), nCur = new Vector(-1, 0);    // inward normal of right edge
        const p = tipPoint(hPrev, nPrev, hCur, nCur);
        expect(p!.x).toBeCloseTo(0.5, 9);
        expect(p!.y).toBeCloseTo(0.5, 9);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/islamic-arrangement.test.ts`
Expected: FAIL — module `@/utils/islamicArrangement` not found / exports missing.

- [ ] **Step 3: Write minimal implementation**

Create `lib/utils/islamicArrangement.ts`:

```ts
import { Vector } from "@/classes/Vector";

export type Segment = [Vector, Vector];
export type MarkerKind = "centroid" | "dent" | "tip";
export interface Marker { point: Vector; kind: MarkerKind; }
export interface Face { vertices: Vector[]; }

export const PRIORITY: Record<MarkerKind, number> = { centroid: 0, dent: 1, tip: 2 };
export const HUE: Record<MarkerKind, number> = { centroid: 125, dent: 42, tip: 210 };

const QUANT = 1e5;
export const keyOf = (v: Vector): string => `${Math.round(v.x * QUANT)},${Math.round(v.y * QUANT)}`;

export function signedArea(pts: Vector[]): number {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
}

export function pointInPolygon(poly: Vector[], p: Vector): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
        const crosses = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
        if (crosses) inside = !inside;
    }
    return inside;
}

/** Intersection of line (p1 + s·d1) with line (p2 + t·d2). Null if parallel. */
export function lineIntersect(p1: Vector, d1: Vector, p2: Vector, d2: Vector): Vector | null {
    const denom = Vector.cross(d1, d2);
    if (Math.abs(denom) < 1e-12) return null;
    const diff = Vector.sub(p2, p1);
    const s = Vector.cross(diff, d2) / denom;
    return new Vector(p1.x + d1.x * s, p1.y + d1.y * s);
}

/** Tip point = intersection of the two inward-normal lines through the halfways of adjacent edges. */
export function tipPoint(hPrev: Vector, nPrev: Vector, hCur: Vector, nCur: Vector): Vector | null {
    return lineIntersect(hPrev, nPrev, hCur, nCur);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/islamic-arrangement.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/islamicArrangement.ts tests/islamic-arrangement.test.ts
git commit -m "feat(islamic): arrangement module scaffold + geometry helpers"
```

---

## Task 2: extractFaces — planar arrangement to bounded faces

**Files:**
- Modify: `lib/utils/islamicArrangement.ts`
- Test: `tests/islamic-arrangement.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/islamic-arrangement.test.ts`:

```ts
import { extractFaces } from "@/utils/islamicArrangement";

describe("extractFaces", () => {
    const seg = (ax: number, ay: number, bx: number, by: number): [Vector, Vector] =>
        [new Vector(ax, ay), new Vector(bx, by)];

    it("returns one bounded face for a single triangle", () => {
        const faces = extractFaces([seg(0, 0, 1, 0), seg(1, 0, 0, 1), seg(0, 1, 0, 0)]);
        expect(faces.length).toBe(1);
        expect(Math.abs(signedArea(faces[0].vertices))).toBeCloseTo(0.5, 6);
    });

    it("splits an edge at a T-junction, yielding two faces", () => {
        // triangle (0,0),(2,0),(0,2) plus a spoke from apex (0,2) to midpoint (1,0) of the base.
        const faces = extractFaces([
            seg(0, 0, 2, 0), seg(2, 0, 0, 2), seg(0, 2, 0, 0), seg(0, 2, 1, 0),
        ]);
        expect(faces.length).toBe(2);
    });

    it("returns four inner faces for a square with a center hub (no outer face)", () => {
        const faces = extractFaces([
            seg(0, 0, 2, 0), seg(2, 0, 2, 2), seg(2, 2, 0, 2), seg(0, 2, 0, 0), // square
            seg(1, 1, 0, 0), seg(1, 1, 2, 0), seg(1, 1, 2, 2), seg(1, 1, 0, 2), // hub to corners
        ]);
        expect(faces.length).toBe(4);
        for (const f of faces) expect(signedArea(f.vertices)).toBeGreaterThan(0); // CCW, outer dropped
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/islamic-arrangement.test.ts`
Expected: FAIL — `extractFaces` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/utils/islamicArrangement.ts`:

```ts
/**
 * Bounded faces of the arrangement of `segments`. Assumes the segments never cross transversally
 * (true for the Islamic construction: a ray always stops on contact), so the only vertices are
 * shared endpoints and T-junctions. Interior faces come out CCW; the outer face(s) are dropped.
 */
export function extractFaces(segments: Segment[]): Face[] {
    // 1. Dedupe endpoints to vertex indices.
    const idxOf = new Map<string, number>();
    const pts: Vector[] = [];
    const vid = (v: Vector): number => {
        const k = keyOf(v);
        let i = idxOf.get(k);
        if (i === undefined) { i = pts.length; idxOf.set(k, i); pts.push(v.copy()); }
        return i;
    };
    const raw: [number, number][] = [];
    for (const [a, b] of segments) {
        const i = vid(a), j = vid(b);
        if (i !== j) raw.push([i, j]);
    }

    // 2. Split each edge at any vertex lying on its interior (T-junctions).
    const edges = new Set<string>();
    const undirected = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    for (const [a, b] of raw) {
        const A = pts[a], B = pts[b];
        const AB = Vector.sub(B, A);
        const len2 = AB.dot(AB);
        if (len2 < 1e-18) continue;
        const on: { t: number; idx: number }[] = [];
        for (let k = 0; k < pts.length; k++) {
            if (k === a || k === b) continue;
            const AP = Vector.sub(pts[k], A);
            const t = AP.dot(AB) / len2;
            if (t <= 1e-7 || t >= 1 - 1e-7) continue;
            const proj = new Vector(A.x + AB.x * t, A.y + AB.y * t);
            if (Vector.distance(proj, pts[k]) < 1e-6) on.push({ t, idx: k });
        }
        on.sort((x, y) => x.t - y.t);
        let prev = a;
        for (const { idx } of on) { if (prev !== idx) edges.add(undirected(prev, idx)); prev = idx; }
        if (prev !== b) edges.add(undirected(prev, b));
    }

    // 3. Adjacency, sorted CCW by angle.
    const adj: number[][] = pts.map(() => []);
    for (const e of edges) {
        const [a, b] = e.split("-").map(Number);
        adj[a].push(b); adj[b].push(a);
    }
    const ang = (a: number, b: number) => Math.atan2(pts[b].y - pts[a].y, pts[b].x - pts[a].x);
    for (let a = 0; a < pts.length; a++) adj[a].sort((x, y) => ang(a, x) - ang(a, y));

    // 4. Trace faces: at each vertex the next half-edge is the one just clockwise of the reverse.
    const visited = new Set<string>();
    const he = (a: number, b: number) => `${a}->${b}`;
    const faces: Face[] = [];
    for (const e of edges) {
        const [u, v] = e.split("-").map(Number);
        for (const [a0, b0] of [[u, v], [v, u]] as [number, number][]) {
            if (visited.has(he(a0, b0))) continue;
            const loop: number[] = [];
            let a = a0, b = b0;
            let guard = 0;
            while (!visited.has(he(a, b)) && guard++ < 100000) {
                visited.add(he(a, b));
                loop.push(a);
                const nb = adj[b];
                const ia = nb.indexOf(a);
                const c = nb[(ia - 1 + nb.length) % nb.length];
                a = b; b = c;
            }
            faces.push({ vertices: loop.map((i) => pts[i]) });
        }
    }

    // 5. Keep interior faces (CCW, positive area); drop the outer face(s) and degenerate ones.
    const result: Face[] = [];
    for (const f of faces) if (signedArea(f.vertices) > 1e-9) result.push(f);
    return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/islamic-arrangement.test.ts`
Expected: PASS (all tests, including the 3 new ones).

If the square-hub test returns 0 faces instead of 4, the orientation convention is flipped: change the Step-3 keep condition to `signedArea(f.vertices) < -1e-9` and push `{ vertices: f.vertices.slice().reverse() }`. Re-run until green. (Hand-traced expectation with the current rule is positive-area interior; this note is the documented fallback, not a placeholder.)

- [ ] **Step 5: Commit**

```bash
git add lib/utils/islamicArrangement.ts tests/islamic-arrangement.test.ts
git commit -m "feat(islamic): extractFaces planar arrangement with T-junction splitting"
```

---

## Task 3: Polygon.islamicMarkers

**Files:**
- Modify: `lib/classes/polygons/Polygon.ts` (add method near `calculateIslamicSegments`)
- Test: `tests/islamic-construction.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/islamic-construction.test.ts` (the `regularPolygon` and `fourStar` helpers already exist there):

```ts
describe("Polygon.islamicMarkers", () => {
    it("gives a regular tile only its centroid", () => {
        const hex = regularPolygon(6);
        const markers = hex.islamicMarkers();
        expect(markers.length).toBe(1);
        expect(markers[0].kind).toBe("centroid");
        expect(Vector.distance(markers[0].point, hex.centroid)).toBeLessThan(1e-9);
    });

    it("gives a 4-star one centroid, four dents, four tips", () => {
        const star = fourStar(0.45);
        star.isStar = true; // mark as star so tip/dent markers are emitted
        const markers = star.islamicMarkers();
        const count = (k: string) => markers.filter((m) => m.kind === k).length;
        expect(count("centroid")).toBe(1);
        expect(count("dent")).toBe(4);
        expect(count("tip")).toBe(4);
    });

    it("keeps every star marker strictly inside the tile", () => {
        const star = fourStar(0.45);
        star.isStar = true;
        for (const m of star.islamicMarkers()) {
            expect(insidePolygon(star.vertices, m.point)).toBe(true);
        }
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/islamic-construction.test.ts`
Expected: FAIL — `star.islamicMarkers is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `lib/classes/polygons/Polygon.ts` (alongside the existing `@/utils` import; keep it a separate line to the leaf module to avoid pulling the whole barrel):

```ts
import { type Marker, tipPoint } from "@/utils/islamicArrangement";
```

Add this method to `Polygon`, right after `calculateIslamicSegments`:

```ts
/**
 * Typed marker points for the Islamic star fill: the centroid (always), plus for star tiles one
 * dent marker per reflex vertex (nudged toward the centroid so it never sits on a construction line)
 * and one tip marker per convex vertex (intersection of the two adjacent inward edge-normals). A
 * regular tile's tips collapse onto the centroid, so it emits the centroid only.
 */
islamicMarkers = (): Marker[] => {
    const markers: Marker[] = [{ point: this.centroid.copy(), kind: "centroid" }];
    if (!this.isStar) return markers;
    const n = this.vertices.length;
    const winding = this.vertices.reduce((a, v, i) => {
        const w = this.vertices[(i + 1) % n];
        return a + (v.x * w.y - w.x * v.y);
    }, 0) >= 0 ? 1 : -1;
    const inwardNormal = (e: number): Vector => {
        const ev = Vector.sub(this.vertices[(e + 1) % n], this.vertices[e]);
        let nrm = new Vector(-ev.y, ev.x).normalize();
        if (nrm.dot(Vector.sub(this.centroid, this.halfways[e])) < 0) nrm = nrm.scale(-1);
        return nrm;
    };
    for (let k = 0; k < n; k++) {
        const prev = this.vertices[(k - 1 + n) % n];
        const cur = this.vertices[k];
        const next = this.vertices[(k + 1) % n];
        const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
        const convex = cross * winding > 0;
        if (convex) {
            const tp = tipPoint(this.halfways[(k - 1 + n) % n], inwardNormal((k - 1 + n) % n), this.halfways[k], inwardNormal(k));
            if (tp) markers.push({ point: tp, kind: "tip" });
        } else {
            const toC = Vector.sub(this.centroid, cur);
            markers.push({ point: Vector.add(cur, Vector.scale(toC, 0.05)), kind: "dent" });
        }
    }
    return markers;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/islamic-construction.test.ts`
Expected: PASS (existing 7 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/classes/polygons/Polygon.ts tests/islamic-construction.test.ts
git commit -m "feat(islamic): Polygon.islamicMarkers (centroid, dents, tips)"
```

---

## Task 4: colorFaces — marker containment and priority

**Files:**
- Modify: `lib/utils/islamicArrangement.ts`
- Test: `tests/islamic-arrangement.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/islamic-arrangement.test.ts`:

```ts
import { colorFaces, HUE } from "@/utils/islamicArrangement";

describe("colorFaces", () => {
    const unit = [new Vector(0, 0), new Vector(1, 0), new Vector(1, 1), new Vector(0, 1)];
    const faceAt = (cx: number) => ({ vertices: unit.map((v) => new Vector(v.x + cx, v.y)) });

    it("colors a face by the only marker inside it", () => {
        const face = faceAt(0);
        const out = colorFaces([face], [{ point: new Vector(0.5, 0.5), kind: "dent" }]);
        expect(out.length).toBe(1);
        expect(out[0].hue).toBe(HUE.dent);
    });

    it("centroid wins when a face contains several markers", () => {
        const face = faceAt(0);
        const out = colorFaces([face], [
            { point: new Vector(0.3, 0.5), kind: "tip" },
            { point: new Vector(0.5, 0.5), kind: "centroid" },
            { point: new Vector(0.7, 0.5), kind: "dent" },
        ]);
        expect(out[0].hue).toBe(HUE.centroid);
    });

    it("leaves marker-free faces unfilled", () => {
        const out = colorFaces([faceAt(0), faceAt(5)], [{ point: new Vector(0.5, 0.5), kind: "tip" }]);
        expect(out.length).toBe(1); // only the face containing the tip
        expect(out[0].hue).toBe(HUE.tip);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/islamic-arrangement.test.ts`
Expected: FAIL — `colorFaces` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/utils/islamicArrangement.ts`:

```ts
export interface ColoredFace { face: Face; hue: number; kind: MarkerKind; }

let warnedDentTip = false;

/** Color each face by the highest-priority marker it contains. Marker-free faces are omitted. */
export function colorFaces(faces: Face[], markers: Marker[]): ColoredFace[] {
    const out: ColoredFace[] = [];
    for (const face of faces) {
        let best: MarkerKind | null = null;
        const present = new Set<MarkerKind>();
        for (const m of markers) {
            if (!pointInPolygon(face.vertices, m.point)) continue;
            present.add(m.kind);
            if (best === null || PRIORITY[m.kind] < PRIORITY[best]) best = m.kind;
        }
        if (best === null) continue;
        if (!warnedDentTip && present.has("dent") && present.has("tip") && !present.has("centroid")) {
            warnedDentTip = true;
            console.warn("colorFaces: a face holds a dent and a tip but no centroid — falling back to dent > tip");
        }
        out.push({ face, hue: HUE[best], kind: best });
    }
    return out;
}

/** Dedupe markers by quantized location, keeping the highest-priority kind on a collision. */
export function dedupeMarkers(markers: Marker[]): Marker[] {
    const byKey = new Map<string, Marker>();
    for (const m of markers) {
        const k = keyOf(m.point);
        const prev = byKey.get(k);
        if (!prev || PRIORITY[m.kind] < PRIORITY[prev.kind]) byKey.set(k, m);
    }
    return [...byKey.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/islamic-arrangement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/islamicArrangement.ts tests/islamic-arrangement.test.ts
git commit -m "feat(islamic): colorFaces marker containment + centroid priority"
```

---

## Task 5: End-to-end fill on a 4-star (pure pipeline test)

**Files:**
- Test: `tests/islamic-construction.test.ts`

This task adds no production code; it proves the three modules compose into a correct fill on a real star, so the render task can stay thin.

- [ ] **Step 1: Write the failing test**

Append to `tests/islamic-construction.test.ts`:

```ts
import { extractFaces, colorFaces, dedupeMarkers, HUE } from "@/utils/islamicArrangement";

describe("islamic star fill — end to end on a 4-star", () => {
    it("produces a green centroid cell plus yellow and blue cells at a separated angle", () => {
        const star = fourStar(0.45);
        star.isStar = true;
        const segments = star.calculateIslamicSegments((35 * Math.PI) / 180);
        const faces = extractFaces(segments);
        const colored = colorFaces(faces, dedupeMarkers(star.islamicMarkers()));

        const hues = new Set(colored.map((c) => c.hue));
        expect(hues.has(HUE.centroid)).toBe(true);
        expect(hues.has(HUE.dent)).toBe(true);
        expect(hues.has(HUE.tip)).toBe(true);

        // the green cell must actually contain the centroid
        const green = colored.find((c) => c.hue === HUE.centroid)!;
        expect(insidePolygon(green.face.vertices, star.centroid)).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `pnpm vitest run tests/islamic-construction.test.ts`
Expected: If it fails, read the failure. Likely causes and fixes:
- Fewer than three hues: the 4-star's construction at 35° may not separate all three roles. Try θ = 30 and 40 and pick the angle that yields all three; update the test to that angle. (The design's phase behavior means not every angle shows all three — the test documents one angle that does.)
- `extractFaces` returns 0 faces: orientation fallback from Task 2 Step 4 was needed and not applied.

- [ ] **Step 3: (no implementation — composition test only)**

If the test needed an angle change in Step 2, that edit is the only change. Otherwise nothing.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/islamic-construction.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/islamic-construction.test.ts
git commit -m "test(islamic): end-to-end 4-star fill composition"
```

---

## Task 6: Render integration in Tiling

**Files:**
- Modify: `lib/classes/Tiling.ts`

- [ ] **Step 1: Add the fill method and cache field**

Add imports at the top of `lib/classes/Tiling.ts`:

```ts
import { extractFaces, colorFaces, dedupeMarkers, type ColoredFace, type Marker, type Segment } from "@/utils/islamicArrangement";
```

Add a private cache field to the `Tiling` class (next to the other fields):

```ts
private islamicFillCache?: { nodesRef: Polygon[]; theta: number; animate: boolean; colored: ColoredFace[] };
```

Add the method to `Tiling`:

```ts
/** Star-tiling Islamic fill: color each cell of the global construction arrangement by the marker
 *  it contains. Cached per (nodes reference, angle); recomputed only when either changes. */
drawIslamicStarFill = (ctx, opacity: number = 1): void => {
    const cfg = useConfiguration.getState();
    const theta = Math.min(Math.max(cfg.islamicAngle, 0), 90);
    const cache = this.islamicFillCache;
    const fresh = cache && cache.nodesRef === this.nodes && cache.theta === theta && cache.animate === cfg.islamicAnimate;
    if (!fresh) {
        const angle = (theta * Math.PI) / 180;
        const segments: Segment[] = [];
        const markers: Marker[] = [];
        for (const node of this.nodes) {
            if (!node.vertices || !node.halfways) continue;
            const a: number | number[] = cfg.islamicAnimate ? islamicAnglesForHalfways(ctx, node.halfways) : angle;
            for (const s of node.calculateIslamicSegments(a)) segments.push(s);
            for (const m of node.islamicMarkers()) markers.push(m);
        }
        const colored = colorFaces(extractFaces(segments), dedupeMarkers(markers));
        this.islamicFillCache = { nodesRef: this.nodes, theta, animate: cfg.islamicAnimate, colored };
    }
    ctx.push();
    ctx.noStroke();
    for (const { face, hue } of this.islamicFillCache!.colored) {
        ctx.fill(hue, 55, 88, opacity);
        ctx.beginShape();
        for (const v of face.vertices) ctx.vertex(v.x, v.y);
        ctx.endShape(ctx.CLOSE);
    }
    ctx.pop();
}
```

- [ ] **Step 2: Rewire the Islamic branch of `Tiling.show`**

Replace the current Islamic branch:

```ts
        } else if (useConfiguration.getState().isIslamic) {
            // Islamic line-construction mode: dim the base tiling (pass 1), then draw the Hankin ray
            // construction as thick lines on top (pass 2) so no line is overdrawn by a neighbour's
            // fill. Star-cell fill (the old rosette rings) is set aside while the lines are pinned down.
            for (const node of this.nodes) node.showIslamicDimBase(ctx, opacity);
            for (const node of this.nodes) node.showIslamicLines(ctx);
        } else {
```

with:

```ts
        } else if (useConfiguration.getState().isIslamic) {
            if (this.nodes.some((n) => n.isStar)) {
                // Star tiling: fill the arrangement cells by marker, then the white lines as borders.
                this.drawIslamicStarFill(ctx, opacity);
                for (const node of this.nodes) node.showIslamicLines(ctx);
            } else {
                // Dentless tiling: keep the previous regular Islamic fill.
                this.drawIslamicVertexRegions(ctx, opacity);
                for (const node of this.nodes) node.showIslamicFilled(ctx, opacity);
            }
        } else {
```

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: compiles with no type errors.

- [ ] **Step 4: Verify the full test suite still passes**

Run: `pnpm vitest run tests/islamic-arrangement.test.ts tests/islamic-construction.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual visual check (user)**

Open a star tiling with Islamic on. Expect: filled star cells (green centers, yellow dent cells, blue tip cells), white construction lines as borders, no gray tiling showing, background where cells hold no marker. Sweep the angle 0–90 and confirm the coloring tracks the phase changes (cells merging into green as the centroid absorbs neighbors). Report anything off.

- [ ] **Step 6: Commit**

```bash
git add lib/classes/Tiling.ts
git commit -m "feat(islamic): render star-tiling cell fill, dispatch star vs regular"
```

---

## Self-review

**Spec coverage:**
- Trigger (star vs regular dispatch) → Task 6 Step 2.
- Markers (centroid/dent/tip, nudge, regular=centroid-only) → Task 3.
- Pipeline (collect segments, arrangement, T-junction split, faces, drop outer, color) → Tasks 2, 4, 6.
- Rendering (fill then lines, no gray base) → Task 6.
- Caching (per nodes-ref + angle) → Task 6 Step 1.
- Guard (dent+tip without centroid warns) → Task 4 Step 3.
- Testing (extractFaces known inputs, marker/color, end-to-end star) → Tasks 2, 3, 4, 5.
- Colors as constants → Task 1 (`HUE`).

**Placeholder scan:** none. The Task 2 Step 4 and Task 5 Step 2 notes are documented conditional fixes with exact edits, not open TODOs.

**Type consistency:** `Segment`, `Marker`, `MarkerKind`, `Face`, `ColoredFace`, `PRIORITY`, `HUE` defined in Task 1/2/4 and used with the same names in Tasks 3, 5, 6. `islamicMarkers()`, `calculateIslamicSegments()`, `drawIslamicStarFill()`, `showIslamicLines()`, `showIslamicFilled()`, `drawIslamicVertexRegions()` referenced with consistent signatures.

## Out of scope
- Interlaced strapwork.
- Config sliders for the three colors (they are constants in `islamicArrangement.ts`, easy to promote).
- Any change to the regular-tiling fill beyond restoring it on the dentless branch.
