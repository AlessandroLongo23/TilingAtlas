# Euclidean shader renderer — Milestone 1 (fill + stroke) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the plain coloured-tile fill and stroke of the flat (Euclidean) view with a WebGL2 retained-mode renderer instead of p5 immediate mode, behind a `euclideanShader` dev flag, so a dense tiling pans/zooms/rotates at full frame rate.

**Architecture:** TypeScript builds the fundamental cell's triangles once (`buildCellMesh`); a WebGL2 vertex shader replicates the cell across the viewport with per-instance lattice offsets and one `drawArraysInstanced` call per frame. The shader and p5 share one transform module (`lib/render/flatView.ts`) so p5's still-drawn overlays register on top of the shader fill. See the design spec: `docs/superpowers/specs/2026-07-16-euclidean-shader-renderer-design.md`.

**Tech Stack:** WebGL2 (raw, mirroring `components/inversive-canvas.tsx`), React 19, Zustand (`lib/stores/configuration.ts`), Vitest, Next 16.

**Scope:** Milestone 1 only — plain fill + stroke. Vertex/halfway/centroid points (M1b), the selection-transition wave (M2), orbits (M3), Islamic (M4), symmetry/dual/circle-packing (M5) are NOT in this plan. The shader is active ONLY in the plain fill mode; when Islamic, circle-packing, or symmetry-elements is on, or the hyperbolic/inversive views are active, the shader mounts nothing and p5 draws as today.

---

## File structure

- Create `lib/render/flatView.ts` — the shared flat-view transform + fill-radius math. Extracted from `components/canvas.tsx` (single source of truth to keep the shader and p5 aligned) plus a new `flatWorldToClip` that the vertex shader transcribes.
- Create `lib/render/buildCellMesh.ts` — turns a `TranslationalCellData` into GPU fill geometry (fan-triangulated verts + per-vertex hue). Reuses `parseBaseCell`/`polygonFillHue`/`starHue` from `lib/utils/renderTiling.ts`.
- Create `components/euclidean-canvas.tsx` — the WebGL2 component. Mirrors `components/inversive-canvas.tsx`'s GL lifecycle, but retained-mode (vertex buffers + instancing) instead of per-pixel analytic.
- Create `tests/flat-view.test.ts`, `tests/build-cell-mesh.test.ts` — unit tests for the two pure modules.
- Modify `lib/stores/configuration.ts` — add the `euclideanShader` boolean flag.
- Modify `components/canvas.tsx` — mount `EuclideanCanvas` behind the p5 canvas when the shader is active; skip p5's plain fill; import the extracted helpers from `flatView.ts`.
- Modify `lib/classes/Tiling.ts` — `show` gains a `skipFill` param that draws outlines without fills.

---

## Task 1: Shared flat-view transform module + parity test

Extract the flat-view math out of `components/canvas.tsx` into `lib/render/flatView.ts` so the shader and p5 draw from one source. Add `flatWorldToClip` (the exact function the vertex shader will transcribe) and pin it against the already-trusted `worldToScreen` with a unit test.

**Files:**
- Create: `lib/render/flatView.ts`
- Create: `tests/flat-view.test.ts`
- Modify: `components/canvas.tsx` (remove the four local helpers + two constants, import from `flatView.ts`)

- [ ] **Step 1: Write `lib/render/flatView.ts`**

Copy the four helpers and two constants verbatim from `components/canvas.tsx` (`MAX_FILL_RADIUS`, `DEGENERATE_DET`, `latticeBasisFromCell`, `screenLatticeVectors`, `computeFillRadii`, `wrapOffset` — currently at `components/canvas.tsx:90-211`) and add the transform functions. Full file:

```ts
// Shared math for the flat (Euclidean) view. Single source of truth for the world->screen transform,
// the lattice fill-radius, and the pan wrap, so the p5 canvas (components/canvas.tsx) and the WebGL
// shader (components/euclidean-canvas.tsx) never drift apart. flatWorldToClip is the exact function
// the euclidean-canvas vertex shader transcribes; the parity test pins it to worldToScreen.

import { Vector } from "@/classes/Vector";
import type { TranslationalCellData } from "@/classes/algorithm/types";

// Per-axis safety backstop on the replicated grid (see the original note in canvas.tsx).
export const MAX_FILL_RADIUS = 144;
export const DEGENERATE_DET = 1e-9;

export function latticeBasisFromCell(cellData: TranslationalCellData): { v1: Vector; v2: Vector; det: number } {
	const basisRaw = cellData?.b ?? cellData?.basis ?? [[1, 0], [0, 1]];
	const v1 = new Vector(basisRaw[0][0], basisRaw[0][1]);
	const v2 = new Vector(basisRaw[1][0], basisRaw[1][1]);
	return { v1, v2, det: v1.x * v2.y - v2.x * v1.y };
}

export function screenLatticeVectors(v1: Vector, v2: Vector, zoom: number, rotation: number) {
	const c = Math.cos(rotation), s = Math.sin(rotation);
	const e = (v: Vector) => ({ x: zoom * (c * v.x + s * v.y), y: zoom * (s * v.x - c * v.y) });
	return { e1: e(v1), e2: e(v2) };
}

export function computeFillRadii(
	v1: Vector, v2: Vector, det: number, zoomForFill: number, width: number, height: number, rotation: number,
): { Ri: number; Rj: number } {
	if (Math.abs(det) < DEGENERATE_DET || zoomForFill <= 0) return { Ri: 6, Rj: 6 };
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoomForFill, rotation);
	const detM = e1.x * e2.y - e2.x * e1.y;
	let maxA = 0, maxB = 0;
	const hw = width / 2, hh = height / 2;
	for (const cx of [-hw, hw]) {
		for (const cy of [-hh, hh]) {
			const a = (cx * e2.y - cy * e2.x) / detM;
			const b = (-cx * e1.y + cy * e1.x) / detM;
			if (Math.abs(a) > maxA) maxA = Math.abs(a);
			if (Math.abs(b) > maxB) maxB = Math.abs(b);
		}
	}
	const clamp = (n: number) => Math.max(1, Math.min(MAX_FILL_RADIUS, Math.ceil(n) + 1));
	return { Ri: clamp(maxA), Rj: clamp(maxB) };
}

export function wrapOffset(
	offset: Vector, v1: Vector, v2: Vector, det: number, zoom: number, rotation: number,
): { draw: Vector; worldShiftX: number; worldShiftY: number } {
	if (Math.abs(det) < DEGENERATE_DET || zoom <= 0) {
		return { draw: offset.copy(), worldShiftX: 0, worldShiftY: 0 };
	}
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoom, rotation);
	const detM = e1.x * e2.y - e2.x * e1.y;
	const a = (offset.x * e2.y - offset.y * e2.x) / detM;
	const b = (-offset.x * e1.y + offset.y * e1.x) / detM;
	const ra = Math.round(a), rb = Math.round(b);
	return {
		draw: new Vector(offset.x - ra * e1.x - rb * e2.x, offset.y - ra * e1.y - rb * e2.y),
		worldShiftX: ra * v1.x + rb * v2.x,
		worldShiftY: ra * v1.y + rb * v2.y,
	};
}

export interface FlatViewParams {
	offset: { x: number; y: number }; // wrapped pan, centred CSS px, y down
	zoom: number;
	rot: number;
	v1: [number, number];
	v2: [number, number];
	halfW: number; // canvas CSS half-width
	halfH: number; // canvas CSS half-height
}

// EXACT reference for the euclidean-canvas vertex shader. The GLSL must compute the same sx/sy/clip.
// Centred-screen (sx, sy) is y-down (matching worldToScreen in canvasPick.ts and the p5 transform);
// clip is y-up, hence the negated clipY.
export function flatWorldToClip(wx: number, wy: number, i: number, j: number, p: FlatViewParams) {
	const worldX = wx + i * p.v1[0] + j * p.v2[0];
	const worldY = wy + i * p.v1[1] + j * p.v2[1];
	const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
	const sx = p.offset.x + p.zoom * (cos * worldX + sin * worldY);
	const sy = p.offset.y + p.zoom * (sin * worldX - cos * worldY);
	return { sx, sy, clipX: sx / p.halfW, clipY: -sy / p.halfH };
}
```

- [ ] **Step 2: Write `tests/flat-view.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { flatWorldToClip, computeFillRadii, wrapOffset, type FlatViewParams } from "@/lib/render/flatView";
import { worldToScreen } from "@/lib/utils/canvasPick";
import { Vector } from "@/classes/Vector";

const base = (over: Partial<FlatViewParams> = {}): FlatViewParams => ({
	offset: { x: 0, y: 0 }, zoom: 50, rot: 0, v1: [1, 0], v2: [0, 1], halfW: 300, halfH: 300, ...over,
});

describe("flatWorldToClip centred-screen == worldToScreen (transform parity)", () => {
	const params = [
		base(),
		base({ offset: { x: 37, y: -12 }, zoom: 83.5, rot: Math.PI / 5 }),
		base({ offset: { x: -100, y: 60 }, zoom: 20, rot: -1.3 }),
	];
	const pts = [{ x: 0, y: 0 }, { x: 1.5, y: -2.2 }, { x: -3.1, y: 4.7 }];
	for (const p of params) for (const q of pts) {
		it(`(${q.x},${q.y}) zoom ${p.zoom} rot ${p.rot.toFixed(2)}`, () => {
			const got = flatWorldToClip(q.x, q.y, 0, 0, p);
			const ref = worldToScreen(q.x, q.y, p.offset, p.zoom, p.rot);
			expect(got.sx).toBeCloseTo(ref.x, 9);
			expect(got.sy).toBeCloseTo(ref.y, 9);
		});
	}
});

describe("flatWorldToClip instancing == worldToScreen of the lattice shift", () => {
	it("instance (i,j) shifts by worldToScreen(i*v1 + j*v2) - worldToScreen(0)", () => {
		const p = base({ offset: { x: 10, y: -5 }, zoom: 40, rot: 0.7, v1: [1.2, 0.3], v2: [-0.4, 1.1] });
		const i = 3, j = -2;
		const inst = flatWorldToClip(0, 0, i, j, p);
		const origin = flatWorldToClip(0, 0, 0, 0, p);
		const shiftWorldX = i * p.v1[0] + j * p.v2[0];
		const shiftWorldY = i * p.v1[1] + j * p.v2[1];
		const a = worldToScreen(shiftWorldX, shiftWorldY, p.offset, p.zoom, p.rot);
		const b = worldToScreen(0, 0, p.offset, p.zoom, p.rot);
		expect(inst.sx - origin.sx).toBeCloseTo(a.x - b.x, 9);
		expect(inst.sy - origin.sy).toBeCloseTo(a.y - b.y, 9);
	});
});

describe("computeFillRadii / wrapOffset still behave (characterisation)", () => {
	it("unit square lattice covers a 600x600 viewport with a small radius", () => {
		const { Ri, Rj } = computeFillRadii(new Vector(1, 0), new Vector(0, 1), 1, 50, 600, 600, 0);
		expect(Ri).toBeGreaterThanOrEqual(1);
		expect(Ri).toBeLessThanOrEqual(144);
		expect(Rj).toBe(Ri);
	});
	it("wrap keeps the drawn offset within one screen lattice cell", () => {
		const zoom = 50;
		const { draw } = wrapOffset(new Vector(1234, -987), new Vector(1, 0), new Vector(0, 1), 1, zoom, 0);
		expect(Math.abs(draw.x)).toBeLessThanOrEqual(zoom / 2 + 1e-6);
		expect(Math.abs(draw.y)).toBeLessThanOrEqual(zoom / 2 + 1e-6);
	});
});
```

- [ ] **Step 3: Run the test, expect FAIL (module not created yet? it is — expect PASS on the new file, but canvas.tsx still has duplicates)**

Run: `pnpm vitest run tests/flat-view.test.ts`
Expected: PASS (the new module compiles and matches).

- [ ] **Step 4: Remove the duplicated helpers from `components/canvas.tsx` and import from `flatView.ts`**

Delete `MAX_FILL_RADIUS`, `DEGENERATE_DET`, `latticeBasisFromCell`, `screenLatticeVectors`, `computeFillRadii`, `wrapOffset` from `components/canvas.tsx` (lines ~90-211; keep `buildTilingFromCell`, `makeVisibilityCull`, `makeWaveScale`, `transitionsEnabled`). Add to the import block near the top:

```ts
import {
	MAX_FILL_RADIUS,
	latticeBasisFromCell,
	computeFillRadii,
	wrapOffset,
} from "@/lib/render/flatView";
```

`buildTilingFromCell` uses `MAX_FILL_RADIUS`; the draw loop uses `latticeBasisFromCell`, `computeFillRadii`, `wrapOffset`. `screenLatticeVectors` and `DEGENERATE_DET` are only used internally by the moved functions — do not import them unless a remaining reference needs them (grep first).

- [ ] **Step 5: Verify canvas.tsx has no dangling references**

Run: `grep -n "screenLatticeVectors\|DEGENERATE_DET\|function computeFillRadii\|function wrapOffset" components/canvas.tsx`
Expected: no matches (all moved).

- [ ] **Step 6: Build + test**

Run: `pnpm build && pnpm vitest run tests/flat-view.test.ts`
Expected: build succeeds with no type errors; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/render/flatView.ts tests/flat-view.test.ts components/canvas.tsx
git commit -m "refactor(render): extract flatView transform module + parity test"
```

---

## Task 2: `buildCellMesh` — fan-triangulated fill geometry

Turn a `TranslationalCellData` into GPU-ready fill triangles and per-vertex hue, reusing the existing cell parser and hue functions.

**Files:**
- Create: `lib/render/buildCellMesh.ts`
- Create: `tests/build-cell-mesh.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildCellMesh } from "@/lib/render/buildCellMesh";
import { polygonFillHue } from "@/lib/utils/renderTiling";

// A unit square centred at the origin, CCW, in a unit-square lattice.
const squareVerts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const cell = { p: [{ v: squareVerts, n: 4 }], b: [[1, 0], [0, 1]] };

describe("buildCellMesh", () => {
	it("fan-triangulates one square into 4 triangles from the centroid", () => {
		const mesh = buildCellMesh(cell)!;
		expect(mesh).not.toBeNull();
		// 4 edges -> 4 triangles -> 12 vertices -> 24 floats.
		expect(mesh.fillVertexCount).toBe(12);
		expect(mesh.fillVerts.length).toBe(24);
		// First triangle is (centroid, v0, v1); centroid of the centred square is (0,0).
		expect(Array.from(mesh.fillVerts.slice(0, 6))).toEqual([0, 0, -0.5, -0.5, 0.5, -0.5]);
	});

	it("assigns the regular fill hue to every vertex of the square", () => {
		const mesh = buildCellMesh(cell)!;
		const expected = polygonFillHue(squareVerts.map(([x, y]) => ({ x, y })));
		expect(mesh.fillHue.length).toBe(mesh.fillVertexCount);
		for (const h of mesh.fillHue) expect(h).toBeCloseTo(expected, 9);
	});

	it("returns the lattice basis", () => {
		const mesh = buildCellMesh(cell)!;
		expect(mesh.v1).toEqual([1, 0]);
		expect(mesh.v2).toEqual([0, 1]);
	});

	it("returns null for an empty / degenerate cell", () => {
		expect(buildCellMesh({ p: [], b: [[1, 0], [0, 1]] })).toBeNull();
		expect(buildCellMesh({ p: [{ v: squareVerts, n: 4 }], b: [[1, 0], [2, 0]] })).toBeNull(); // det 0
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/build-cell-mesh.test.ts`
Expected: FAIL with "buildCellMesh is not a function" / cannot find module.

- [ ] **Step 3: Write `lib/render/buildCellMesh.ts`**

```ts
// Retained-mode fill geometry for the flat WebGL renderer (components/euclidean-canvas.tsx). Parses the
// fundamental cell (reusing parseBaseCell), fan-triangulates each polygon from its centroid, and emits
// a flat triangle-vertex buffer plus a per-vertex hue buffer. The GPU instances this base cell across
// the viewport, so only ONE cell is triangulated regardless of zoom. Fan-from-centroid is valid for
// every catalogue tile: regular tiles are convex and star tiles are star-shaped from their centre.

import {
	parseBaseCell,
	polygonFillHue,
	starApexAngleDeg,
	starHue,
	type TranslationalCellData,
} from "@/lib/utils/renderTiling";

export interface CellMesh {
	fillVerts: Float32Array; // 2 floats per vertex, triangles (x0,y0, x1,y1, ...)
	fillHue: Float32Array; // 1 float per vertex, hue in degrees
	fillVertexCount: number; // = fillVerts.length / 2
	v1: [number, number];
	v2: [number, number];
	det: number;
}

export function buildCellMesh(cell: TranslationalCellData | null): CellMesh | null {
	if (!cell) return null;
	const base = parseBaseCell(cell);
	if (!base) return null;

	const [[v1x, v1y], [v2x, v2y]] = base.basis;
	const det = v1x * v2y - v2x * v1y;
	if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;

	// Count triangles first: each n-gon fans into n triangles.
	let triCount = 0;
	for (const poly of base.polys) triCount += poly.vertices.length;
	if (triCount === 0) return null;

	const fillVerts = new Float32Array(triCount * 3 * 2);
	const fillHue = new Float32Array(triCount * 3);

	let vi = 0; // vertex index into the flat buffers
	for (const poly of base.polys) {
		const vs = poly.vertices;
		let cx = 0, cy = 0;
		for (const v of vs) { cx += v.x; cy += v.y; }
		cx /= vs.length;
		cy /= vs.length;
		// Hue: explicit override (polyominoes) > star hue > regular by-side ramp. Mirrors drawPolygons and
		// buildCellGeom so the shader colour matches the p5 and inversive views exactly.
		const hue = poly.hue ?? (poly.star ? starHue(poly.n, starApexAngleDeg(vs)) : polygonFillHue(vs));
		for (let k = 0; k < vs.length; k++) {
			const a = vs[k];
			const b = vs[(k + 1) % vs.length];
			// Triangle (centroid, a, b).
			fillVerts[vi * 2] = cx; fillVerts[vi * 2 + 1] = cy; fillHue[vi] = hue; vi++;
			fillVerts[vi * 2] = a.x; fillVerts[vi * 2 + 1] = a.y; fillHue[vi] = hue; vi++;
			fillVerts[vi * 2] = b.x; fillVerts[vi * 2 + 1] = b.y; fillHue[vi] = hue; vi++;
		}
	}

	return {
		fillVerts,
		fillHue,
		fillVertexCount: vi,
		v1: [v1x, v1y],
		v2: [v2x, v2y],
		det,
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/build-cell-mesh.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/render/buildCellMesh.ts tests/build-cell-mesh.test.ts
git commit -m "feat(render): buildCellMesh — fan-triangulated fill geometry for the flat shader"
```

---

## Task 3: `EuclideanCanvas` WebGL2 component (fill only)

The WebGL2 component that uploads one cell mesh, instances it across the viewport, and draws the fill. Mirrors `components/inversive-canvas.tsx`'s GL lifecycle (compile/link/RAF/DPR/param-cell rebuild), but with vertex buffers + instancing instead of data textures. Stroke comes in Task 5. Not mounted yet — Task 4 wires it in.

**Files:**
- Create: `components/euclidean-canvas.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import { buildCellMesh, type CellMesh } from "@/lib/render/buildCellMesh";
import { computeFillRadii, wrapOffset } from "@/lib/render/flatView";
import { evaluateParamCell, resolveAlphaDegs, type ParametricCellData } from "@/lib/utils/paramCell";
import { useFamilyAlphas } from "@/stores/familyAlphas";
import { Vector } from "@/classes/Vector";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// The flat (Euclidean) view, retained-mode. TS builds the fundamental cell's triangles once
// (buildCellMesh); the vertex shader replicates the cell with per-instance lattice offsets (i*v1 + j*v2)
// and draws every copy in one instanced call. Pan/zoom/rotate are pure uniform updates. It reads the
// same configuration store the p5 canvas writes, and shares flatView.ts's transform, so p5's overlays
// (drawn on top) register on the shader fill.

interface EuclideanCanvasProps {
	width: number;
	height: number;
	translationalCell: TranslationalCellData | null;
	translationalCellId: string | null;
	paramCell?: ParametricCellData | null;
}

const VERT = `#version 300 es
in vec2 aPos;
in float aHue;
in vec2 aInst;
uniform vec2 uOffset;   // wrapped pan, centred CSS px, y down
uniform float uZoom;
uniform float uRot;
uniform vec2 uV1;
uniform vec2 uV2;
uniform vec2 uHalf;     // canvas CSS half-size (w/2, h/2)
out float vHue;
void main() {
	// Transcribes flatWorldToClip in lib/render/flatView.ts — keep the two in step.
	vec2 world = aPos + aInst.x * uV1 + aInst.y * uV2;
	float c = cos(uRot), s = sin(uRot);
	float sx = uOffset.x + uZoom * (c * world.x + s * world.y);
	float sy = uOffset.y + uZoom * (s * world.x - c * world.y);
	gl_Position = vec4(sx / uHalf.x, -sy / uHalf.y, 0.0, 1.0);
	vHue = aHue;
}
`;

const FRAG = `#version 300 es
precision highp float;
in float vHue;
out vec4 frag;
vec3 hsb2rgb(float h, float s, float v) {
	vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}
void main() {
	// s=0.40, b=1.0, opaque — matches Tiling.show and the inversive shader so the views agree on colour.
	frag = vec4(hsb2rgb(vHue / 360.0, 0.40, 1.0), 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
	const sh = gl.createShader(type);
	if (!sh) return null;
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		console.error("euclidean shader compile failed:", gl.getShaderInfoLog(sh));
		gl.deleteShader(sh);
		return null;
	}
	return sh;
}

export function EuclideanCanvas({ width, height, translationalCell, translationalCellId, paramCell = null }: EuclideanCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const glRef = useRef<WebGL2RenderingContext | null>(null);
	const progRef = useRef<WebGLProgram | null>(null);
	const posBufRef = useRef<WebGLBuffer | null>(null);
	const hueBufRef = useRef<WebGLBuffer | null>(null);
	const instBufRef = useRef<WebGLBuffer | null>(null);
	const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
	const attribsRef = useRef<Record<string, number>>({});
	const meshRef = useRef<CellMesh | null>(null);
	const instRef = useRef<{ Ri: number; Rj: number; count: number }>({ Ri: -1, Rj: -1, count: 0 });
	const sizeRef = useRef({ width, height });
	sizeRef.current = { width, height };

	const paramCellRef = useRef(paramCell);
	paramCellRef.current = paramCell;
	const lastSigRef = useRef<string | null>(null);
	useEffect(() => { lastSigRef.current = null; }, [paramCell, translationalCellId]);

	// Upload a cell mesh into the pos/hue buffers.
	const uploadMesh = (gl: WebGL2RenderingContext, mesh: CellMesh) => {
		gl.bindBuffer(gl.ARRAY_BUFFER, posBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.fillVerts, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, hueBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.fillHue, gl.STATIC_DRAW);
		meshRef.current = mesh;
		instRef.current = { Ri: -1, Rj: -1, count: 0 }; // force an instance rebuild for the new basis
	};

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
		if (!gl) { console.error("euclidean view: WebGL2 unavailable"); return; }
		glRef.current = gl;

		const vs = compile(gl, gl.VERTEX_SHADER, VERT);
		const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
		if (!vs || !fs) return;
		const prog = gl.createProgram();
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			console.error("euclidean program link failed:", gl.getProgramInfoLog(prog));
			return;
		}
		progRef.current = prog;
		gl.useProgram(prog);

		for (const name of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf"]) {
			uniformsRef.current[name] = gl.getUniformLocation(prog, name);
		}
		for (const name of ["aPos", "aHue", "aInst"]) {
			attribsRef.current[name] = gl.getAttribLocation(prog, name);
		}

		posBufRef.current = gl.createBuffer();
		hueBufRef.current = gl.createBuffer();
		instBufRef.current = gl.createBuffer();

		// Static-cell mesh: build+upload once here (parametric cells rebuild in the loop).
		if (!paramCellRef.current) {
			const mesh = buildCellMesh(translationalCell);
			if (mesh) uploadMesh(gl, mesh);
		}

		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const g = glRef.current;
			const prg = progRef.current;
			if (!g || !prg) return;

			const cfg = useConfiguration.getState();

			// Parametric family: rebuild the cell mesh when the slider tuple changes (imperative, no React).
			const pc = paramCellRef.current;
			if (pc) {
				const alphas = resolveAlphaDegs(pc, useFamilyAlphas.getState().values);
				const sig = alphas.map((a) => a.toFixed(2)).join(",");
				if (sig !== lastSigRef.current) {
					lastSigRef.current = sig;
					const mesh = buildCellMesh(evaluateParamCell(pc, alphas));
					if (mesh) uploadMesh(g, mesh);
				}
			}

			const mesh = meshRef.current;
			if (!mesh) return;
			const { width: w, height: h } = sizeRef.current;
			if (w <= 0 || h <= 0) return;

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
			g.viewport(0, 0, bw, bh);

			const ctrl = cfg.controls;
			const rot = ((ctrl.rotation || 0) * Math.PI) / 180;
			const v1 = new Vector(mesh.v1[0], mesh.v1[1]);
			const v2 = new Vector(mesh.v2[0], mesh.v2[1]);

			// Instance grid: (i,j) over the visible lattice range. Rebuild only when the radius changes.
			const { Ri, Rj } = computeFillRadii(v1, v2, mesh.det, ctrl.zoom, w, h, rot);
			if (Ri !== instRef.current.Ri || Rj !== instRef.current.Rj) {
				const inst: number[] = [];
				for (let i = -Ri; i <= Ri; i++) for (let j = -Rj; j <= Rj; j++) inst.push(i, j);
				g.bindBuffer(g.ARRAY_BUFFER, instBufRef.current);
				g.bufferData(g.ARRAY_BUFFER, new Float32Array(inst), g.DYNAMIC_DRAW);
				instRef.current = { Ri, Rj, count: inst.length / 2 };
			}

			// Wrapped pan keeps the offset bounded so the fixed instance grid always covers the viewport.
			const { draw } = wrapOffset(ctrl.offset, v1, v2, mesh.det, ctrl.zoom, rot);

			g.clearColor(0, 0, 0, 0);
			g.clear(g.COLOR_BUFFER_BIT);

			const A = attribsRef.current, U = uniformsRef.current;
			g.bindBuffer(g.ARRAY_BUFFER, posBufRef.current);
			g.enableVertexAttribArray(A.aPos);
			g.vertexAttribPointer(A.aPos, 2, g.FLOAT, false, 0, 0);
			g.vertexAttribDivisor(A.aPos, 0);
			g.bindBuffer(g.ARRAY_BUFFER, hueBufRef.current);
			g.enableVertexAttribArray(A.aHue);
			g.vertexAttribPointer(A.aHue, 1, g.FLOAT, false, 0, 0);
			g.vertexAttribDivisor(A.aHue, 0);
			g.bindBuffer(g.ARRAY_BUFFER, instBufRef.current);
			g.enableVertexAttribArray(A.aInst);
			g.vertexAttribPointer(A.aInst, 2, g.FLOAT, false, 0, 0);
			g.vertexAttribDivisor(A.aInst, 1);

			g.uniform2f(U.uOffset, draw.x, draw.y);
			g.uniform1f(U.uZoom, ctrl.zoom);
			g.uniform1f(U.uRot, rot);
			g.uniform2f(U.uV1, mesh.v1[0], mesh.v1[1]);
			g.uniform2f(U.uV2, mesh.v2[0], mesh.v2[1]);
			g.uniform2f(U.uHalf, w / 2, h / 2);

			g.drawArraysInstanced(g.TRIANGLES, 0, mesh.fillVertexCount, instRef.current.count);
		};
		raf = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(raf);
			gl.deleteProgram(prog);
			gl.deleteShader(vs);
			gl.deleteShader(fs);
			if (posBufRef.current) gl.deleteBuffer(posBufRef.current);
			if (hueBufRef.current) gl.deleteBuffer(hueBufRef.current);
			if (instBufRef.current) gl.deleteBuffer(instBufRef.current);
			glRef.current = null;
			progRef.current = null;
			meshRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// (Re)build the static-cell mesh when the selected tiling changes (parametric handled in the loop).
	useEffect(() => {
		if (paramCell) return;
		const gl = glRef.current;
		if (!gl || !posBufRef.current) return;
		const mesh = buildCellMesh(translationalCell);
		if (mesh) uploadMesh(gl, mesh);
		else meshRef.current = null;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [translationalCellId, translationalCell, paramCell]);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%", zIndex: 0 }}
		/>
	);
}
```

- [ ] **Step 2: Build (the component must compile even though nothing mounts it yet)**

Run: `pnpm build`
Expected: no type errors. (Visual verification happens in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add components/euclidean-canvas.tsx
git commit -m "feat(render): EuclideanCanvas WebGL2 component (instanced fill, unmounted)"
```

---

## Task 4: Flag + integration — mount behind p5, skip p5 fill

Add the `euclideanShader` flag, mount `EuclideanCanvas` behind the p5 canvas when the shader is active, and make p5 draw tile outlines with no fill (so the shader fill shows through while the strokes stay on p5 until Task 5). This is the first visual checkpoint AND the registration test — strokes must sit exactly on the shader fill edges.

**Files:**
- Modify: `lib/stores/configuration.ts`
- Modify: `lib/classes/Tiling.ts`
- Modify: `components/canvas.tsx`

- [ ] **Step 1: Add the flag to the store**

In `lib/stores/configuration.ts`, add to the `ConfigurationState` interface near the other view flags (by `debugView`, ~line 51):

```ts
	// Flat view: draw the plain coloured-tile fill/stroke with the WebGL2 renderer
	// (components/euclidean-canvas.tsx) instead of p5 immediate mode. Dev flag until parity is reached.
	euclideanShader: boolean;
```

And to the defaults, next to the `hyperbolic`/`inversive` defaults (~line 152):

```ts
	euclideanShader: false,
```

- [ ] **Step 2: Add `skipFill` to `Tiling.show`**

In `lib/classes/Tiling.ts`, extend the `show` signature (currently `show = (ctx, showPolygonPoints, opacity, circlePacking, cull?, scaleOf?)`, ~line 45):

```ts
	show = (
		ctx,
		showPolygonPoints: boolean,
		opacity: number = 1,
		circlePacking: boolean = false,
		cull?: (c: Vector) => boolean,
		scaleOf?: (c: Vector) => number,
		skipFill: boolean = false,
	): void => {
```

In the plain-branch hot loop (the `else` at ~line 98), change the fill decision so `skipFill` forces `noFill` while the shape (and thus its stroke) still draws. Find:

```ts
				if (showFill) ctx.fill(node.hue, 40, fillV, fillA);
				else ctx.noFill();
```

Replace with:

```ts
				if (showFill && !skipFill) ctx.fill(node.hue, 40, fillV, fillA);
				else ctx.noFill();
```

Nothing else in `show` changes — the stroke set at the top of the method still strokes each outline, and the points block is untouched.

- [ ] **Step 3: Thread `skipFill` through `drawTiling` in `components/canvas.tsx`**

In the `drawTiling` helper (~line 489), add a param and forward it:

```ts
			const drawTiling = (
				cfg: ReturnType<typeof readCfg>,
				tiling: Tiling,
				cull?: (c: Vector) => boolean,
				scaleOf?: (c: Vector) => number,
				skipFill?: boolean,
			) => {
				const orbitMode = cfg.showVertexOrbits && !cfg.isIslamic;
				const opacity = orbitMode ? 0.3 : 1;
				if (cfg.exportGraphButtonHover) tiling.showGraph(p5);
				else tiling.show(p5, cfg.showPolygonPoints, opacity, cfg.circlePacking, cull, scaleOf, skipFill);
```

(keep the rest of `drawTiling` as-is).

- [ ] **Step 4: Compute `euclideanShaderActive` and pass `skipFill` in the draw loop**

In `components/canvas.tsx`, add a store subscription near the other `useConfiguration` selectors (~line 346):

```ts
	const euclideanShader = useConfiguration((s) => s.euclideanShader);
	const isIslamicSel = useConfiguration((s) => s.isIslamic);
	const circlePackingSel = useConfiguration((s) => s.circlePacking);
	const inversiveSel = useConfiguration((s) => s.inversive);
	const hyperbolicSel = useConfiguration((s) => s.hyperbolic);
	const euclideanShaderActive =
		euclideanShader && !inversiveSel && !hyperbolicSel && !isIslamicSel && !circlePackingSel && !showSymmetryElements;
```

In the `p5.draw` flat branch, where it currently calls `drawTiling(cfg, tiling, cull, wave)` (~line 734), read the same condition from live state and pass `skipFill`:

```ts
						const shaderFill =
							cfg.euclideanShader && !cfg.inversive && !cfg.hyperbolic &&
							!cfg.isIslamic && !cfg.circlePacking && !cfg.showSymmetryElements;
						if (symmetryActive) drawTilingPlain(p5, tiling, ctrl.zoom);
						else drawTiling(cfg, tiling, cull, wave, shaderFill);
```

- [ ] **Step 5: Mount `EuclideanCanvas` behind the p5 canvas**

In `components/canvas.tsx`, add the import and an aliased type import. `canvas.tsx` already imports `TranslationalCellData` from `@/classes/algorithm/types`; `EuclideanCanvas`'s prop uses the looser one from `@/lib/utils/renderTiling`, so alias it and cast at the mount exactly as play-client does for `InversiveCanvas` (`_play-client.tsx:14,431`):

```ts
import { EuclideanCanvas } from "./euclidean-canvas";
import type { TranslationalCellData as FlatCellData } from "@/lib/utils/renderTiling";
```

In the component's returned JSX (~line 926-934), give the p5 host a stacking position above the shader layer and mount the shader canvas as a z-0 sibling inside the same outer div (which paints `bg-surface-base` behind both):

```tsx
		<div className="relative h-full w-full bg-surface-base">
			{euclideanShaderActive ? (
				<EuclideanCanvas
					width={width}
					height={height}
					translationalCell={(activeCellRef.current ?? translationalCell) as unknown as FlatCellData | null}
					translationalCellId={translationalCellId}
					paramCell={paramCell}
				/>
			) : null}
			<div
				ref={containerRef}
				className="relative z-[1] cursor-pointer"
				role="application"
				onContextMenu={(e) => e.preventDefault()}
			/>
```

Note the `translationalCell` passed is the *static* prop for rigid tilings; for a parametric family, `EuclideanCanvas` rebuilds from the store's slider tuple in its own loop (it reads `paramCell`), exactly like `InversiveCanvas`. Passing `activeCellRef.current ?? translationalCell` gives it a sensible initial static cell without waiting a frame.

- [ ] **Step 6: Build**

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 7: Manual visual verification**

To toggle the dev flag deterministically (no toggle UI exists yet), temporarily flip its default in `lib/stores/configuration.ts` from `euclideanShader: false` to `euclideanShader: true`, run the check, then revert to `false` before committing. (Do NOT commit the flipped default.)

Run: `pnpm dev`, open `/play`.

Expected observations with the flag ON, on a regular tiling (e.g. `4^4` square, and a `3.6.3.6`):
- Tiles are filled the SAME colours as with the flag off (compare side by side).
- Tile outlines (still drawn by p5) sit exactly on the fill edges — no visible offset. **This is the registration check.** A consistent 1px offset means the shader transform disagrees with p5; recheck `flatWorldToClip` vs the vertex shader.
- Panning, zooming (wheel), and rotating (shift+wheel) stay smooth and the fill tracks the strokes with no drift.
- Switching to an Islamic or circle-packing tiling: the shader canvas unmounts and p5 draws everything as before (no double-draw, no missing fill).

Fix any misregistration before committing. If the fill and strokes are pixel-aligned across pan/zoom/rotate, the transform is correct.

- [ ] **Step 8: Commit**

```bash
git add lib/stores/configuration.ts lib/classes/Tiling.ts components/canvas.tsx
git commit -m "feat(render): mount EuclideanCanvas behind p5, shader fill + p5 stroke behind flag"
```

---

## Task 5: Strokes in the shader — complete M1

Add screen-constant tile outlines to the shader (edge quads expanded in the vertex shader), then switch p5 to skip the plain outline too, so the shader owns the full plain tile render.

**Files:**
- Modify: `lib/render/buildCellMesh.ts` (emit stroke geometry)
- Modify: `tests/build-cell-mesh.test.ts` (assert stroke geometry)
- Modify: `components/euclidean-canvas.tsx` (stroke program + pass)
- Modify: `lib/classes/Tiling.ts` (skipFill also skips the outline)

- [ ] **Step 1: Extend the mesh with stroke geometry — write the failing test**

Add to `tests/build-cell-mesh.test.ts`:

```ts
describe("buildCellMesh stroke geometry", () => {
	it("emits two triangles (6 verts) per polygon edge as a quad", () => {
		const mesh = buildCellMesh(cell)!;
		// Square: 4 edges * 6 stroke verts = 24 stroke verts -> 48 position floats.
		expect(mesh.strokeVertexCount).toBe(24);
		expect(mesh.strokePos.length).toBe(48);
		expect(mesh.strokeNorm.length).toBe(48);
		expect(mesh.strokeSide.length).toBe(24);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run tests/build-cell-mesh.test.ts`
Expected: FAIL — `strokeVertexCount` undefined.

- [ ] **Step 3: Emit stroke geometry in `buildCellMesh.ts`**

Extend the `CellMesh` interface:

```ts
export interface CellMesh {
	fillVerts: Float32Array;
	fillHue: Float32Array;
	fillVertexCount: number;
	// Stroke: each polygon edge -> a quad (2 triangles, 6 verts). Each stroke vert carries the edge-point
	// world position (strokePos), the screen-space unit normal of the edge (strokeNorm), and a side flag
	// (strokeSide, +1 / -1) telling the vertex shader which way to push by half the screen stroke width.
	strokePos: Float32Array;  // 2 floats/vert
	strokeNorm: Float32Array; // 2 floats/vert (world-space edge normal; normalised after view scale in shader)
	strokeSide: Float32Array; // 1 float/vert
	strokeVertexCount: number;
	v1: [number, number];
	v2: [number, number];
	det: number;
}
```

Build the stroke buffers alongside the fill loop. After computing `fillVerts`/`fillHue`, add a second pass (or fold into the same polygon loop). Insert before the `return`:

```ts
	// Stroke quads: one quad per edge. For edge (a,b) with world direction d and left-normal nrm, emit
	// two triangles over the four corners { a-, a+, b-, b+ } where +/- is the side flag; the vertex shader
	// offsets each corner by side * halfWidthScreen along the edge normal (constant screen width).
	let sTri = 0;
	for (const poly of base.polys) sTri += poly.vertices.length; // n edges -> n quads -> 2n triangles
	const strokePos = new Float32Array(sTri * 6 * 2);
	const strokeNorm = new Float32Array(sTri * 6 * 2);
	const strokeSide = new Float32Array(sTri * 6);
	let si = 0;
	const pushStroke = (px: number, py: number, nx: number, ny: number, side: number) => {
		strokePos[si * 2] = px; strokePos[si * 2 + 1] = py;
		strokeNorm[si * 2] = nx; strokeNorm[si * 2 + 1] = ny;
		strokeSide[si] = side;
		si++;
	};
	for (const poly of base.polys) {
		const vs = poly.vertices;
		for (let k = 0; k < vs.length; k++) {
			const a = vs[k];
			const b = vs[(k + 1) % vs.length];
			const dx = b.x - a.x, dy = b.y - a.y;
			const len = Math.hypot(dx, dy) || 1;
			// Left normal of the edge direction (world space). The shader scales it to screen and renormalises.
			const nx = -dy / len, ny = dx / len;
			// Two triangles: (a-, a+, b-) and (b-, a+, b+).
			pushStroke(a.x, a.y, nx, ny, -1);
			pushStroke(a.x, a.y, nx, ny, +1);
			pushStroke(b.x, b.y, nx, ny, -1);
			pushStroke(b.x, b.y, nx, ny, -1);
			pushStroke(a.x, a.y, nx, ny, +1);
			pushStroke(b.x, b.y, nx, ny, +1);
		}
	}
```

And add the new fields to the returned object:

```ts
	return {
		fillVerts, fillHue, fillVertexCount: vi,
		strokePos, strokeNorm, strokeSide, strokeVertexCount: si,
		v1: [v1x, v1y], v2: [v2x, v2y], det,
	};
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `pnpm vitest run tests/build-cell-mesh.test.ts`
Expected: PASS (fill + stroke tests).

- [ ] **Step 5: Add the stroke program + pass to `components/euclidean-canvas.tsx`**

Add a second program for strokes. Stroke vertex shader — transform the edge point exactly like the fill (so it lands on the fill edge), then offset by the screen-space normal by half the stroke width in CSS px:

```ts
const STROKE_VERT = `#version 300 es
in vec2 aPos;
in vec2 aNorm;    // world-space edge normal
in float aSide;   // +1 / -1
in vec2 aInst;
uniform vec2 uOffset;
uniform float uZoom;
uniform float uRot;
uniform vec2 uV1;
uniform vec2 uV2;
uniform vec2 uHalf;
uniform float uHalfStrokePx;  // half stroke width, CSS px
void main() {
	vec2 world = aPos + aInst.x * uV1 + aInst.y * uV2;
	float c = cos(uRot), s = sin(uRot);
	// Same centred-screen map as the fill (note the y-flip inside: sy uses (s*x - c*y)).
	float sx = uOffset.x + uZoom * (c * world.x + s * world.y);
	float sy = uOffset.y + uZoom * (s * world.x - c * world.y);
	// Carry the edge normal through the SAME linear map (no translation), then renormalise in screen space
	// and push by half the stroke width. This keeps the outline a constant CSS-px width at any zoom.
	float nsx = uZoom * (c * aNorm.x + s * aNorm.y);
	float nsy = uZoom * (s * aNorm.x - c * aNorm.y);
	float nl = length(vec2(nsx, nsy));
	vec2 n = nl > 0.0 ? vec2(nsx, nsy) / nl : vec2(0.0);
	sx += aSide * uHalfStrokePx * n.x;
	sy += aSide * uHalfStrokePx * n.y;
	gl_Position = vec4(sx / uHalf.x, -sy / uHalf.y, 0.0, 1.0);
}
`;

const STROKE_FRAG = `#version 300 es
precision highp float;
uniform vec3 uStroke;
out vec4 frag;
void main() { frag = vec4(uStroke, 1.0); }
`;
```

Wire it in the component parallel to the fill program:

1. In the setup `useEffect`, after the fill program: `compile` + link `STROKE_VERT`/`STROKE_FRAG` into `strokeProgRef`; read its attrib locations (`aPos`, `aNorm`, `aSide`, `aInst`) into `strokeAttribsRef` and uniform locations (`uOffset`, `uZoom`, `uRot`, `uV1`, `uV2`, `uHalf`, `uHalfStrokePx`, `uStroke`) into `strokeUniformsRef`; create `strokePosBufRef`, `strokeNormBufRef`, `strokeSideBufRef`; delete all three plus `strokeProgRef` in the cleanup.
2. In `uploadMesh`, also upload the stroke buffers and store the count:

```ts
		gl.bindBuffer(gl.ARRAY_BUFFER, strokePosBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokePos, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, strokeNormBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeNorm, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, strokeSideBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeSide, gl.STATIC_DRAW);
```

3. In the render loop, after the fill `drawArraysInstanced`, add the stroke pass (constant screen width, colour matched to `Tiling.show`: pure black normally, white only for outline-only tiles on a dark theme):

```ts
			if (cfg.lineWidth > 0 && mesh.strokeVertexCount > 0) {
				g.enable(g.BLEND);
				g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
				g.useProgram(strokeProgRef.current);
				const SA = strokeAttribsRef.current, SU = strokeUniformsRef.current;
				g.bindBuffer(g.ARRAY_BUFFER, strokePosBufRef.current);
				g.enableVertexAttribArray(SA.aPos);
				g.vertexAttribPointer(SA.aPos, 2, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(SA.aPos, 0);
				g.bindBuffer(g.ARRAY_BUFFER, strokeNormBufRef.current);
				g.enableVertexAttribArray(SA.aNorm);
				g.vertexAttribPointer(SA.aNorm, 2, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(SA.aNorm, 0);
				g.bindBuffer(g.ARRAY_BUFFER, strokeSideBufRef.current);
				g.enableVertexAttribArray(SA.aSide);
				g.vertexAttribPointer(SA.aSide, 1, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(SA.aSide, 0);
				g.bindBuffer(g.ARRAY_BUFFER, instBufRef.current);
				g.enableVertexAttribArray(SA.aInst);
				g.vertexAttribPointer(SA.aInst, 2, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(SA.aInst, 1);
				g.uniform2f(SU.uOffset, draw.x, draw.y);
				g.uniform1f(SU.uZoom, ctrl.zoom);
				g.uniform1f(SU.uRot, rot);
				g.uniform2f(SU.uV1, mesh.v1[0], mesh.v1[1]);
				g.uniform2f(SU.uV2, mesh.v2[0], mesh.v2[1]);
				g.uniform2f(SU.uHalf, w / 2, h / 2);
				g.uniform1f(SU.uHalfStrokePx, cfg.lineWidth * 0.5); // p5 strokeWeight(lineWidth/zoom) => lineWidth px
				const dark = document.documentElement.classList.contains("dark");
				const lightStroke = !cfg.showPolygonFill && dark; // matches Tiling.show:66-68
				if (lightStroke) g.uniform3f(SU.uStroke, 1, 1, 1);
				else g.uniform3f(SU.uStroke, 0, 0, 0);
				g.drawArraysInstanced(g.TRIANGLES, 0, mesh.strokeVertexCount, instRef.current.count);
				g.useProgram(progRef.current); // restore the fill program for the next frame's fill pass
			}
```

(The fill pass writes alpha 1, so leaving blend enabled across frames is harmless.)

- [ ] **Step 6: Make p5 stop drawing the outline when the shader owns it**

Now that the shader draws strokes, p5 must draw neither fill nor stroke for plain tiles. In `lib/classes/Tiling.ts` `show`, when `skipFill` is true, skip the whole plain shape draw (not just the fill). Wrap the plain-branch draw loop (the `for` over nodes that does `beginShape`/`endShape`, ~line 107-128) so it is skipped entirely when `skipFill`, while the points block after it still runs:

```ts
			const showFill = cfg.showPolygonFill;
			const fillV = 100 / opacity;
			const fillA = 1.0 * opacity;
			if (!skipFill) {
				for (let i = 0; i < this.nodes.length; i++) {
					// ... existing per-node fill+shape loop, unchanged ...
				}
			}
```

(Undo the Task 4 Step 2 `showFill && !skipFill` line — with the whole loop guarded, that inner condition reverts to the original `if (showFill)`.)

- [ ] **Step 7: Build + test**

Run: `pnpm build && pnpm vitest run tests/build-cell-mesh.test.ts tests/flat-view.test.ts`
Expected: build clean, tests PASS.

- [ ] **Step 8: Manual visual verification**

Run `pnpm dev`, `/play`, flag ON. On `4^4`, `3.6.3.6`, and a star tiling:
- Tiles have crisp outlines of constant width at every zoom level (zoom in/out — the stroke stays ~`lineWidth` px, it does not fatten or thin).
- The "Line stroke" width control changes the outline thickness; setting it to 0 removes outlines.
- No double strokes (p5 no longer draws them) and no missing fills.
- Pan/zoom/rotate stay smooth; outline and fill move together.
- Compare against flag OFF: visually equivalent (colours, stroke weight, outline colour in dark and light themes).

- [ ] **Step 9: Commit**

```bash
git add lib/render/buildCellMesh.ts tests/build-cell-mesh.test.ts components/euclidean-canvas.tsx lib/classes/Tiling.ts
git commit -m "feat(render): shader tile strokes — M1 flat renderer complete behind flag"
```

---

## Done criteria for M1

- `euclideanShader` flag on: plain coloured tiles (fill + constant-width stroke) render via WebGL2, instanced, one draw call per pass per frame; pan/zoom/rotate are smooth at high tile counts.
- Flag off: unchanged p5 behaviour.
- Shader active only in plain mode; Islamic / circle-packing / symmetry / hyperbolic / inversive fall back to the existing paths.
- Transform-parity unit test green; fill and (p5, then shader) strokes register to sub-pixel.
- `pnpm build` clean; `pnpm vitest run` green for the two new test files.

**Next (separate plans):** M1b points → M2 transition wave → M3 orbit dots → M4 Islamic (segments/faces as buffers, arrangement stays in TS) → M5 symmetry/dual/circle-packing. Then flip the flag default on, profile on low-end hardware, and once parity holds, delete the p5 plain-fill path.
```
