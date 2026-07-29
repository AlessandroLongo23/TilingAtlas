"use client";

import { useEffect, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import {
	MAX_BUCKET_ENTRIES,
	PRIM_TEXELS,
	averageCellFill,
	packPeriodicCell,
	type PackedCell,
	type PeriodicCell,
} from "@/lib/render/periodicCell";
import { spiralSimilarity, wrapStripDrift } from "@/lib/render/spiralMap";
import { syncCanvasSize } from "@/lib/render/canvasSize";
import { evaluateParamCell, renderAlphaDegs, type ParametricCellData } from "@/lib/utils/paramCell";
import { tilingPeriodicCell } from "@/lib/render/periodic/tilings";
import { useFamilyAlphas } from "@/stores/familyAlphas";

// The inversive view. A WebGL2 full-screen quad renders a conformal image of the selected tiling. For
// every output pixel we invert the lens map, undo pan/zoom/rotation to a world point, then decide its
// colour ANALYTICALLY from the cell's primitives (uploaded as data textures): which ones contain it
// (→ fill) and the distance to their edges (→ a crisp, screen-width stroke). No raster texture, so lines
// stay sharp at any magnification.
//
// The geometry comes in as a PeriodicCell (lib/render/periodicCell.ts) — the shared IR every Euclidean
// decoration emits, not just the plain tilings this view used to be limited to. Point location walks ONE
// bucket of a uniform grid built in lattice coordinates, which replaced the old 3×3 sweep over lattice
// copies: same seamlessness, a ninth of the per-pixel work, and no ceiling on primitive count.
//
// It reads pan/zoom/rotation from the same configuration store the p5 canvas writes, so the p5 canvas
// (mounted underneath, input-only while inversive is on) keeps driving panning with no new input code.

// No width/height props: the canvas fills its parent by CSS and measures itself in the render loop
// (syncCanvasSize) — see lib/render/canvasSize.ts.
interface InversiveCanvasProps {
	/** The drawing to render under the lens. Null blanks the canvas. */
	cell: PeriodicCell | null;
	/** Changes whenever `cell` describes different geometry; drives the re-upload. */
	cellId: string | null;
	/** Free-angle family cell. When present, the geometry is rebuilt in the render loop from the store's
	 *  `familyAlphas` (imperative — the alpha slider never re-renders React), matching the p5 canvas. */
	paramCell?: ParametricCellData | null;
}

/** Vertices walked per primitive. A cap for the GLSL loop only — `count` breaks out early. Sized for the
 *  worst real case, a freedraw polyomino face or a high-density {n/d} hollow ring. */
const MAX_VERTS_PER_PRIM = 256;

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uRes;      // CSS pixel size (w, h)
uniform float uDpr;     // device pixel ratio
uniform vec2 uOffset;   // pan offset, centred CSS px (y down, matches p5)
uniform float uZoom;    // px per world unit
uniform float uRot;     // rotation, radians
uniform int uMode;      // 0 = circle inversion, 1 = Mobius (loxodromic), 2 = spiral (complex log)
uniform float uR;       // lens radius, CSS px (spiral + double ⇒ pole separation)
uniform vec2 uKinv;     // inverse multiplier (complex) for the Mobius map
uniform int uSpiralDouble;   // spiral: 0 = one center, 1 = two centers (Droste)
uniform vec2 uSpiralK;       // spiral: complex K = (a·v1+b·v2)/(2πi); world = cmul(K, log w − V)
uniform vec2 uSpiralV;       // spiral: strip-space pan (x = dolly, y = spin; zoom + rotation folded in)

uniform mat2 uMinv;     // world -> lattice (a, b)
uniform vec2 uV1;       // lattice basis vectors (world)
uniform vec2 uV2;

uniform sampler2D uVerts;   // RGBA32F, .xy = vertex world coords
uniform int uVertsW;
uniform sampler2D uMeta;    // RGBA32F, ${PRIM_TEXELS} texels/prim (see lib/render/periodicCell.ts)
uniform int uMetaW;
uniform sampler2D uHead;    // RGBA32F, G×G buckets of [start, count, 0, 0]
uniform int uGrid;          // G
uniform sampler2D uList;    // RGBA32F, [primIndex, di, dj, 0] per bucket entry
uniform int uListW;

uniform float uStrokePx;
uniform float uHueOffset; // global hue rotation, degrees (the sidebar hue ring); hsb2rgb wraps via mod
uniform vec3 uSurface;
uniform vec3 uAvg;      // cell average fill (already hue-shifted CPU-side); the unresolvable centre blends to this
uniform float uFeature; // median tile-edge length (world); the fade/blend track this, not the cell period

out vec4 frag;

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) {
	float d = dot(b, b) + 1e-9;
	return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d;
}

vec3 hsb2rgb(float h, float s, float v) {
	vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}

vec2 getVert(int idx) {
	return texelFetch(uVerts, ivec2(idx % uVertsW, idx / uVertsW), 0).xy;
}
vec4 getMeta(int t) {
	return texelFetch(uMeta, ivec2(t % uMetaW, t / uMetaW), 0);
}
vec4 getEntry(int i) {
	return texelFetch(uList, ivec2(i % uListW, i / uListW), 0);
}

float segDist(vec2 p, vec2 a, vec2 b) {
	vec2 pa = p - a, ba = b - a;
	float h = clamp(dot(pa, ba) / (dot(ba, ba) + 1e-12), 0.0, 1.0);
	return length(pa - ba * h);
}

void main() {
	// Centred CSS pixel, y down (same convention as the p5 canvas).
	vec2 fragCss = gl_FragCoord.xy / uDpr;
	vec2 s = vec2(fragCss.x - uRes.x * 0.5, uRes.y * 0.5 - fragCss.y);

	// Undo the view map: content shown at pixel s comes from world point f(s). Inversion and Möbius invert
	// a lens; the spiral (uMode 2) is the complex-log of Kaplan's exponential spiral tilings. uMode is a
	// uniform, so these branches are uniform control flow — the dFdx/dFdy footprints inside stay defined.
	vec2 world;
	float pwRaw;
	if (uMode == 2) {
		// Kaplan's spiral (tactile-js/spirals): world = K·(log w − V), K = (a·v1+b·v2)/(2πi) — the inverse
		// of the SIMILARITY taking the seam onto the vertical 2π segment. One complex multiplication: no
		// shear, tiles keep their shape. Pole locked to the screen centre; pan/zoom/rotation act in STRIP
		// space via V (x = self-similar dolly, y = spin), matching his tiling_V.
		vec2 w = s / max(0.5 * min(uRes.x, uRes.y), 1.0);
		if (uSpiralDouble == 1) {
			vec2 P = vec2(uR / max(0.5 * min(uRes.x, uRes.y), 1.0), 0.0);
			w = cdiv(w - P, w + P);   // Möbius: P → 0, −P → ∞ (two poles)
		}
		// merc = log w. θ+2π ⇒ world += cmul(K,(0,2π)) = a·v1+b·v2, a lattice translation — which is why
		// the atan branch cut at θ = ±π closes seamlessly onto the same tile.
		vec2 merc = vec2(0.5 * log(max(dot(w, w), 1e-30)), atan(w.y, w.x));
		world = cmul(uSpiralK, merc - uSpiralV);
		// Footprint on the CONTINUOUS coord w: log is conformal (isotropic step |dw|/|w|) and K a
		// similarity, so the world footprint is just |K|·|dw|/|w|. Measuring on w, not the folded
		// world keeps the branch cut from spiking dFdx into a one-pixel radial seam.
		float pw_w = max(length(dFdx(w)), length(dFdy(w)));
		pwRaw = length(uSpiralK) * pw_w / max(length(w), 1e-6);
	} else {
		vec2 v;
		if (uMode == 0) {
			float r2 = max(dot(s, s), 1.0);
			v = (uR * uR) * s / r2;
		} else {
			vec2 a = vec2(uR, 0.0);
			vec2 m = cmul(uKinv, cdiv(s - a, s + a));
			v = cmul(a, cdiv(vec2(1.0, 0.0) + m, vec2(1.0, 0.0) - m));
		}
		// Undo affine (pan/zoom/rotate + y-flip): world = Rt * ((v - offset) / zoom), Rt an involution.
		vec2 u = (v - uOffset) / uZoom;
		float c = cos(uRot), sn = sin(uRot);
		world = vec2(c * u.x + sn * u.y, sn * u.x - c * u.y);
		pwRaw = max(length(dFdx(world)), length(dFdy(world)));
	}

	// Reduce into the fundamental parallelogram, then read the ONE bucket of the lattice-space uniform
	// grid the reduced point falls in. Each entry carries its own integer lattice shift, so primitives
	// that straddle the cell boundary are found from either side — that is what keeps the picture seamless
	// without sweeping the 3×3 block of copies.
	vec2 ab = uMinv * world;
	vec2 baseAB = floor(ab);
	vec2 f = ab - baseAB;
	vec2 qw = world - (baseAB.x * uV1 + baseAB.y * uV2);

	float gf = float(uGrid);
	int bi = int(clamp(floor(f.x * gf), 0.0, gf - 1.0));
	int bj = int(clamp(floor(f.y * gf), 0.0, gf - 1.0));
	vec4 hd = texelFetch(uHead, ivec2(bi, bj), 0);
	int eStart = int(hd.x);
	int eCount = int(hd.y);

	// Fills composite in bucket order (the packer z-sorts each bucket), which is what lets the hollow
	// class stack translucent self-intersecting faces. Strokes take the STRONGEST coverage instead of
	// compositing: two tiles sharing an edge both stroke it at the same coverage, and an "over" blend
	// would darken and fatten every shared edge by exactly that doubling.
	vec3 fillCol = uSurface;
	vec3 lineCol = vec3(0.0);
	float lineCov = 0.0;

	for (int e = 0; e < ${MAX_BUCKET_ENTRIES}; e++) {
		if (e >= eCount) break;
		vec4 ent = getEntry(eStart + e);
		int p = int(ent.x);
		vec2 q = qw - (ent.y * uV1 + ent.z * uV2);

		int mt = p * ${PRIM_TEXELS};
		vec4 m0 = getMeta(mt);          // [vertStart, vertCount, flags, hue]
		vec4 fillC = getMeta(mt + 1);   // [r, g, b, alpha]
		vec4 strokeC = getMeta(mt + 2); // [r, g, b, alpha]
		vec4 bb = getMeta(mt + 3);      // [minX, minY, maxX, maxY]
		float strokeScale = getMeta(mt + 4).x;

		// Stroke half-width in WORLD units (a fraction of the tile edge), so it scales with the tiles
		// under the map: compressed near the centre it shrinks with them and dissolves on its own.
		float halfW = strokeC.a > 0.0 ? strokeScale * uStrokePx * uFeature : 0.0;
		if (q.x < bb.x - halfW || q.x > bb.z + halfW || q.y < bb.y - halfW || q.y > bb.w + halfW) continue;

		int flags = int(m0.z);
		bool isOpen = (flags & 1) != 0;
		bool nonzero = (flags & 2) != 0;
		bool hueFill = (flags & 4) != 0;
		int vStart = int(m0.x);
		int vCount = int(m0.y);

		// One walk gives both answers: the crossing count (parity ⇒ even-odd) and the signed winding
		// (⇒ nonzero), plus the distance to the nearest segment.
		int cross = 0;
		int wind = 0;
		float minD = 1e20;
		vec2 prev = getVert(vStart + vCount - 1);
		for (int k = 0; k < ${MAX_VERTS_PER_PRIM}; k++) {
			if (k >= vCount) break;
			vec2 cur = getVert(vStart + k);
			// An open polyline has no closing segment, so skip the wrap-around pair at k == 0.
			if (!(isOpen && k == 0)) {
				if ((prev.y > q.y) != (cur.y > q.y)) {
					float xint = prev.x + (cur.x - prev.x) * (q.y - prev.y) / (cur.y - prev.y);
					if (q.x < xint) {
						cross++;
						wind += (cur.y > prev.y) ? 1 : -1;
					}
				}
				minD = min(minD, segDist(q, prev, cur));
			}
			prev = cur;
		}

		if (!isOpen && fillC.a > 0.0) {
			bool ins = nonzero ? (wind != 0) : ((cross - 2 * (cross / 2)) == 1);
			if (ins) {
				// s=0.40, b=1.0 — the same HSB fill the raster paths use (Tiling.show, drawPolygons). A
				// literal-RGB prim (colorings, hollow, Islamic) ignores the hue ring by design.
				vec3 c = hueFill ? hsb2rgb((m0.w + uHueOffset) / 360.0, 0.40, 1.0) : fillC.rgb;
				fillCol = mix(fillCol, c, fillC.a);
			}
		}

		if (halfW > 0.0) {
			// Coverage = the exact 1-D overlap of the world-width stripe [−halfW, halfW] around the nearest
			// edge with the pixel footprint pwRaw. Thick stroke → 1 near the edge; sub-pixel stroke → falls
			// smoothly to zero, so lines dissolve continuously as tiles shrink instead of aliasing.
			float hi = min(minD + 0.5 * pwRaw, halfW);
			float lo = max(minD - 0.5 * pwRaw, -halfW);
			float cov = clamp((hi - lo) / max(pwRaw, 1e-9), 0.0, 1.0) * strokeC.a;
			if (cov > lineCov) {
				lineCov = cov;
				lineCol = strokeC.rgb;
			}
		}
	}

	// The fill is point-sampled, so once primitives fall below a pixel it speckles; blend toward the cell
	// average there so the very centre is a clean disk, not colour noise.
	fillCol = mix(fillCol, uAvg, smoothstep(uFeature * 0.8, uFeature * 3.0, pwRaw));
	frag = vec4(mix(fillCol, lineCol, lineCov), 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
	const sh = gl.createShader(type);
	if (!sh) return null;
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		console.error("inversive shader compile failed:", gl.getShaderInfoLog(sh));
		gl.deleteShader(sh);
		return null;
	}
	return sh;
}

function uploadFloatTex(
	gl: WebGL2RenderingContext, tex: WebGLTexture, data: Float32Array, w: number, h: number,
) {
	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

const TEX_NAMES = ["verts", "meta", "head", "list"] as const;
type TexName = (typeof TEX_NAMES)[number];

export function InversiveCanvas({ cell, cellId, paramCell = null }: InversiveCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const glRef = useRef<WebGL2RenderingContext | null>(null);
	const progRef = useRef<WebGLProgram | null>(null);
	const texRef = useRef<Partial<Record<TexName, WebGLTexture>>>({});
	const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
	const packedRef = useRef<PackedCell | null>(null);
	// Hue-shifted uAvg, cached per (offset, geometry) — recomputed only when the ring or the cell changes.
	const avgCacheRef = useRef<{ off: number; parts: Float32Array; avg: [number, number, number] } | null>(null);
	// Last render-loop timestamp for the velocity-pad drift integration (0 = no previous frame).
	const lastTRef = useRef(0);
	// Latest paramCell for the render loop (read imperatively so the loop never re-subscribes), plus the
	// last slider signature we uploaded geometry for. Reset on any selection/family change so a new family
	// always rebuilds even if its slider tuple stringifies the same as the previous one.
	const paramCellRef = useRef(paramCell);
	paramCellRef.current = paramCell;
	const lastSigRef = useRef<string | null>(null);
	useEffect(() => {
		lastSigRef.current = null;
	}, [paramCell, cellId]);

	// One-time GL setup + render loop. Reads the latest props/config through refs so the loop never
	// re-subscribes; panning stays smooth.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false });
		if (!gl) {
			console.error("inversive view: WebGL2 unavailable");
			return;
		}
		// Float textures are core in WebGL2, but sampling/reading them needs this on some drivers.
		gl.getExtension("OES_texture_float_linear");
		glRef.current = gl;

		const vs = compile(gl, gl.VERTEX_SHADER, VERT);
		const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
		if (!vs || !fs) return;
		const prog = gl.createProgram();
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			console.error("inversive program link failed:", gl.getProgramInfoLog(prog));
			return;
		}
		progRef.current = prog;
		gl.useProgram(prog);

		for (const name of [
			"uRes", "uDpr", "uOffset", "uZoom", "uRot", "uMode", "uR", "uKinv",
			"uSpiralDouble", "uSpiralK", "uSpiralV",
			"uMinv", "uV1", "uV2",
			"uVerts", "uVertsW", "uMeta", "uMetaW", "uHead", "uGrid", "uList", "uListW",
			"uStrokePx", "uHueOffset", "uSurface", "uAvg", "uFeature",
		]) {
			uniformsRef.current[name] = gl.getUniformLocation(prog, name);
		}

		const quad = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, quad);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
		const aPos = gl.getAttribLocation(prog, "aPos");
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

		for (const n of TEX_NAMES) texRef.current[n] = gl.createTexture() ?? undefined;

		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const g = glRef.current;
			const p = progRef.current;
			if (!g || !p) return;

			const cfg = useConfiguration.getState();

			// Parametric family: rebuild + re-upload the cell geometry when the store's slider tuple
			// changes. An imperative read in the loop — the alpha slider never re-renders React, so this
			// path stays as smooth as the p5 canvas.
			const pc = paramCellRef.current;
			if (pc) {
				const fa = useFamilyAlphas.getState();
				const alphas = renderAlphaDegs(pc, fa.live, fa.values);
				const sig = alphas.map((a) => a.toFixed(2)).join(",");
				if (sig !== lastSigRef.current) {
					lastSigRef.current = sig;
					const built = packPeriodicCell(tilingPeriodicCell(evaluateParamCell(pc, alphas)));
					if (built) {
						uploadPacked(g, texRef.current, built);
						packedRef.current = built;
					}
				}
			}

			const geom = packedRef.current;
			if (!geom) return;
			// Measured every frame from the element itself, so the backing store tracks a transitioning layout
			// exactly instead of trailing a React render behind it (lib/render/canvasSize.ts).
			const { w, h, dpr } = syncCanvasSize(canvas);
			if (w <= 0 || h <= 0) return;
			g.viewport(0, 0, canvas.width, canvas.height);

			const ctrl = cfg.controls;
			const R = cfg.inversiveRadiusFrac * Math.min(w, h) * 0.5;
			const sigma = 0.5;
			const tau = (cfg.mobiusTwist * Math.PI) / 180;
			const kinvMag = Math.exp(-sigma);
			const dark = document.documentElement.classList.contains("dark");
			const [m00, m01, m10, m11] = geom.minv;
			// Spiral similarity K = (a·v1+b·v2)/(2πi) — Kaplan's tiling_T inverse, built from the CELL's
			// actual lattice. Pan/zoom/rotation act in STRIP space (his tiling_V): drag = (dolly, spin)
			// scaled 2π per half-viewport (his TWO_PI/(HEIGHT/2)), wheel-zoom = ln-dolly (self-similar),
			// rotation = spin. Rebuilt each frame — a tiny CPU calc over live controls.
			const spiral = spiralSimilarity(cfg.spiralArmA, cfg.spiralArmB, geom.v1, geom.v2);
			const stripSc = (2 * Math.PI) / Math.max(0.5 * Math.min(w, h), 1);
			// Velocity pad: integrate the strip-space drift (dt clamped so a backgrounded tab doesn't
			// jump on return), then wrap modulo the strip lattice — an exact world-lattice translation,
			// invisible — so an animation left running never grows V into float32 jitter in merc − V.
			// The drift object is store state mutated in place (the `controls` pattern), surviving
			// remounts. See docs/superpowers/specs/2026-07-16-spiral-velocity-pad-design.md.
			const now = performance.now();
			const dt = lastTRef.current > 0 ? Math.min((now - lastTRef.current) / 1000, 0.05) : 0;
			lastTRef.current = now;
			const vel = cfg.spiralVel;
			const drift = cfg.spiralDrift;
			if (cfg.inversiveMode === "spiral" && (vel.x !== 0 || vel.y !== 0)) {
				const [wx, wy] = wrapStripDrift(
					[drift.x + vel.x * dt, drift.y + vel.y * dt],
					spiral.k, geom.v1, geom.v2,
				);
				drift.x = wx;
				drift.y = wy;
			}
			const spiralV: [number, number] = [
				ctrl.offset.x * stripSc - Math.log(Math.max(ctrl.zoom, 1) / 50) + drift.x,
				-ctrl.offset.y * stripSc - ((ctrl.rotation || 0) * Math.PI) / 180 + drift.y,
			];

			const U = uniformsRef.current;
			g.uniform2f(U.uRes, w, h);
			g.uniform1f(U.uDpr, dpr);
			g.uniform2f(U.uOffset, ctrl.offset.x, ctrl.offset.y);
			g.uniform1f(U.uZoom, ctrl.zoom);
			g.uniform1f(U.uRot, ((ctrl.rotation || 0) * Math.PI) / 180);
			g.uniform1i(U.uMode, cfg.inversiveMode === "spiral" ? 2 : cfg.inversiveMode === "mobius" ? 1 : 0);
			g.uniform1f(U.uR, R);
			g.uniform2f(U.uKinv, kinvMag * Math.cos(-tau), kinvMag * Math.sin(-tau));
			g.uniform1i(U.uSpiralDouble, cfg.spiralDouble ? 1 : 0);
			g.uniform2f(U.uSpiralK, spiral.k[0], spiral.k[1]);
			g.uniform2f(U.uSpiralV, spiralV[0], spiralV[1]);
			g.uniformMatrix2fv(U.uMinv, false, [m00, m10, m01, m11]);
			g.uniform2f(U.uV1, geom.v1[0], geom.v1[1]);
			g.uniform2f(U.uV2, geom.v2[0], geom.v2[1]);
			g.uniform1i(U.uVertsW, geom.vertsW);
			g.uniform1i(U.uMetaW, geom.metaW);
			g.uniform1i(U.uGrid, geom.grid);
			g.uniform1i(U.uListW, geom.listW);
			// Stroke half-width as a fraction of the tile edge (uStrokePx * uFeature in the shader). The
			// "Line stroke" slider scales it; 0 → no strokes.
			g.uniform1f(U.uStrokePx, cfg.lineWidth * 0.028);
			g.uniform1f(U.uHueOffset, cfg.hueOffset || 0);
			g.uniform3f(U.uSurface, dark ? 0.08 : 0.96, dark ? 0.09 : 0.96, dark ? 0.11 : 0.97);
			// uAvg must be averaged AFTER the hue rotation (rotating the averaged RGB would be wrong);
			// cached per (offset, cell) so the per-frame cost is two comparisons while the ring is idle.
			let avg = geom.avg;
			if (cfg.hueOffset) {
				const cache = avgCacheRef.current;
				if (cache && cache.off === cfg.hueOffset && cache.parts === geom.avgParts) avg = cache.avg;
				else {
					avg = averageCellFill(geom.avgParts, cfg.hueOffset);
					avgCacheRef.current = { off: cfg.hueOffset, parts: geom.avgParts, avg };
				}
			}
			g.uniform3f(U.uAvg, avg[0], avg[1], avg[2]);
			g.uniform1f(U.uFeature, geom.feature);

			bindTex(g, texRef.current.verts, 0, U.uVerts);
			bindTex(g, texRef.current.meta, 1, U.uMeta);
			bindTex(g, texRef.current.head, 2, U.uHead);
			bindTex(g, texRef.current.list, 3, U.uList);

			g.drawArrays(g.TRIANGLES, 0, 6);
		};
		raf = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(raf);
			gl.deleteProgram(prog);
			gl.deleteShader(vs);
			gl.deleteShader(fs);
			for (const n of TEX_NAMES) {
				const t = texRef.current[n];
				if (t) gl.deleteTexture(t);
			}
			texRef.current = {};
			glRef.current = null;
			progRef.current = null;
			packedRef.current = null;
		};
	}, []);

	// (Re)pack + upload whenever the selected drawing changes. Parametric families are handled
	// imperatively in the render loop (from the store's slider tuple), so skip them here.
	useEffect(() => {
		if (paramCell) return;
		const gl = glRef.current;
		if (!gl) return;
		const packed = packPeriodicCell(cell);
		packedRef.current = packed;
		if (packed) uploadPacked(gl, texRef.current, packed);
	}, [cellId, cell, paramCell]);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%" }}
		/>
	);
}

function bindTex(
	gl: WebGL2RenderingContext, tex: WebGLTexture | undefined, unit: number, loc: WebGLUniformLocation | null,
) {
	if (!tex) return;
	gl.activeTexture(gl.TEXTURE0 + unit);
	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.uniform1i(loc, unit);
}

function uploadPacked(
	gl: WebGL2RenderingContext, tex: Partial<Record<TexName, WebGLTexture>>, packed: PackedCell,
) {
	if (!tex.verts || !tex.meta || !tex.head || !tex.list) return;
	uploadFloatTex(gl, tex.verts, packed.verts, packed.vertsW, packed.vertsH);
	uploadFloatTex(gl, tex.meta, packed.meta, packed.metaW, packed.metaH);
	uploadFloatTex(gl, tex.head, packed.head, packed.grid, packed.grid);
	uploadFloatTex(gl, tex.list, packed.list, packed.listW, packed.listH);
}
