"use client";

import { useEffect, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import { buildCellGeom } from "@/lib/render/inversiveCellGeom";
import { evaluateParamCell, resolveAlphaDegs, type ParametricCellData } from "@/lib/utils/paramCell";
import { useFamilyAlphas } from "@/stores/familyAlphas";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// The inversive view. A WebGL2 full-screen quad renders a conformal image of the selected tiling. For
// every output pixel we invert the lens map, undo pan/zoom/rotation to a world point, then decide its
// colour ANALYTICALLY from the cell's polygons (uploaded as data textures): which polygon contains it
// (→ fill) and the distance to the nearest edge (→ a crisp, screen-width stroke). Point-location and
// edge distance are evaluated over the 3×3 block of lattice copies, so both are continuous across cell
// boundaries — no seam, and lines stay sharp at any magnification (no raster texture to blur).
//
// It reads pan/zoom/rotation from the same configuration store the p5 canvas writes, so the p5 canvas
// (mounted underneath, input-only while inversive is on) keeps driving panning with no new input code.

interface InversiveCanvasProps {
	width: number;
	height: number;
	translationalCell: TranslationalCellData | null;
	translationalCellId: string | null;
	/** Free-angle family cell. When present, the geometry is rebuilt in the render loop from the store's
	 *  `familyAlphas` (imperative — the alpha slider never re-renders React), matching the p5 canvas. */
	paramCell?: ParametricCellData | null;
}

const MAX_POLYS = 128;
const MAX_VERTS_PER_POLY = 40;

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
uniform int uMode;      // 0 = circle inversion, 1 = Mobius (loxodromic)
uniform float uR;       // lens radius, CSS px
uniform vec2 uKinv;     // inverse multiplier (complex) for the Mobius map

uniform mat2 uMinv;     // world -> lattice (a, b)
uniform vec2 uV1;       // lattice basis vectors (world)
uniform vec2 uV2;
uniform sampler2D uVerts;   // RGBA32F, .xy = vertex world coords
uniform int uVertsW;
uniform sampler2D uMeta;    // RGBA32F, 2 texels/poly: [start,count,hue,0], [minX,minY,maxX,maxY]
uniform int uPolyCount;

uniform float uStrokePx;
uniform vec3 uSurface;
uniform vec3 uLine;
uniform vec3 uAvg;      // cell average fill; the unresolvable centre blends to this
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

float segDist(vec2 p, vec2 a, vec2 b) {
	vec2 pa = p - a, ba = b - a;
	float h = clamp(dot(pa, ba) / (dot(ba, ba) + 1e-12), 0.0, 1.0);
	return length(pa - ba * h);
}

void main() {
	// Centred CSS pixel, y down (same convention as the p5 canvas).
	vec2 fragCss = gl_FragCoord.xy / uDpr;
	vec2 s = vec2(fragCss.x - uRes.x * 0.5, uRes.y * 0.5 - fragCss.y);

	// Undo the lens map g: content shown at pixel s comes from view pixel g^{-1}(s).
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
	vec2 world = vec2(c * u.x + sn * u.y, sn * u.x - c * u.y);

	// Reduce into the fundamental parallelogram at the origin, then test the 3×3 block of copies.
	vec2 ab = uMinv * world;
	vec2 baseAB = floor(ab);
	vec2 qw = world - (baseAB.x * uV1 + baseAB.y * uV2);

	// Local world-units-per-pixel. Strokes stay a constant SCREEN width (uStrokePx * pwRaw) so they never
	// fatten into a ring near the centre; pwRaw itself drives the density fade + centre blend below. The
	// bbox-cull margin is bounded so the per-pixel work stays cheap where one pixel spans many cells.
	float pwRaw = max(length(dFdx(world)), length(dFdy(world)));
	float cellScale = 0.5 * (length(uV1) + length(uV2));
	// Stroke half-width in WORLD units (a fraction of the tile edge), so it scales with the tiles under the
	// map: compressed near the centre, it shrinks with them and dissolves on its own — no fade, no ring.
	float halfW = uStrokePx * uFeature;
	float margin = min(halfW + pwRaw, cellScale);

	vec3 fill = uSurface;
	float minD = 1e20;

	for (int p = 0; p < ${MAX_POLYS}; p++) {
		if (p >= uPolyCount) break;
		vec4 m0 = texelFetch(uMeta, ivec2(2 * p, 0), 0);
		vec4 bb = texelFetch(uMeta, ivec2(2 * p + 1, 0), 0);
		int start = int(m0.x);
		int count = int(m0.y);
		float hue = m0.z;

		for (int dj = -1; dj <= 1; dj++) {
			for (int di = -1; di <= 1; di++) {
				vec2 q = qw - (float(di) * uV1 + float(dj) * uV2);
				if (q.x < bb.x - margin || q.x > bb.z + margin || q.y < bb.y - margin || q.y > bb.w + margin) continue;

				bool inside = false;
				vec2 prev = getVert(start + count - 1);
				for (int k = 0; k < ${MAX_VERTS_PER_POLY}; k++) {
					if (k >= count) break;
					vec2 cur = getVert(start + k);
					if (((prev.y > q.y) != (cur.y > q.y)) &&
						(q.x < (cur.x - prev.x) * (q.y - prev.y) / (cur.y - prev.y) + prev.x)) {
						inside = !inside;
					}
					minD = min(minD, segDist(q, prev, cur));
					prev = cur;
				}
				// s=0.40, b=1.0 — the same HSB fill the raster paths use (Tiling.show, drawPolygons), now that
				// they too paint opaque. Anything else here and the two views drift apart on colour.
				if (inside) fill = hsb2rgb(hue / 360.0, 0.40, 1.0);
			}
		}
	}

	// Stroke coverage = the accurate 1-D overlap of the world-width stripe [-halfW, halfW] (around the
	// nearest edge, at distance minD) with the pixel footprint pwRaw. Thick stroke → 1 near the edge;
	// sub-pixel stroke → falls smoothly to zero. So the lines dissolve continuously as tiles shrink.
	float hi = min(minD + 0.5 * pwRaw, halfW);
	float lo = max(minD - 0.5 * pwRaw, -halfW);
	float line = clamp((hi - lo) / max(pwRaw, 1e-9), 0.0, 1.0);
	// The fill is point-sampled, so once tiles fall below a pixel it speckles; blend toward the cell
	// average there so the very centre is a clean disk rather than colour noise.
	fill = mix(fill, uAvg, smoothstep(uFeature * 0.8, uFeature * 3.0, pwRaw));
	frag = vec4(mix(fill, uLine, line), 1.0);
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

export function InversiveCanvas({ width, height, translationalCell, translationalCellId, paramCell = null }: InversiveCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const glRef = useRef<WebGL2RenderingContext | null>(null);
	const progRef = useRef<WebGLProgram | null>(null);
	const vertsTexRef = useRef<WebGLTexture | null>(null);
	const metaTexRef = useRef<WebGLTexture | null>(null);
	const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
	const geomRef = useRef<{ minv: [number, number, number, number]; v1: [number, number]; v2: [number, number]; vertsW: number; polyCount: number; avg: [number, number, number]; feature: number } | null>(null);
	const sizeRef = useRef({ width, height });
	sizeRef.current = { width, height };
	// Latest paramCell for the render loop (read imperatively so the loop never re-subscribes), plus the
	// last slider signature we uploaded geometry for. Reset on any selection/family change so a new family
	// always rebuilds even if its slider tuple stringifies the same as the previous one.
	const paramCellRef = useRef(paramCell);
	paramCellRef.current = paramCell;
	const lastSigRef = useRef<string | null>(null);
	useEffect(() => {
		lastSigRef.current = null;
	}, [paramCell, translationalCellId]);

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
			"uMinv", "uV1", "uV2", "uVerts", "uVertsW", "uMeta", "uPolyCount",
			"uStrokePx", "uSurface", "uLine", "uAvg", "uFeature",
		]) {
			uniformsRef.current[name] = gl.getUniformLocation(prog, name);
		}

		const quad = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, quad);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
		const aPos = gl.getAttribLocation(prog, "aPos");
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

		vertsTexRef.current = gl.createTexture();
		metaTexRef.current = gl.createTexture();

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
			if (pc && vertsTexRef.current && metaTexRef.current) {
				const alphas = resolveAlphaDegs(pc, useFamilyAlphas.getState().values);
				const sig = alphas.map((a) => a.toFixed(2)).join(",");
				if (sig !== lastSigRef.current) {
					lastSigRef.current = sig;
					const built = buildCellGeom(evaluateParamCell(pc, alphas));
					if (built) {
						uploadFloatTex(g, vertsTexRef.current, built.verts, built.vertsW, built.vertsH);
						uploadFloatTex(g, metaTexRef.current, built.meta, built.polyCount * 2, 1);
						geomRef.current = { minv: built.minv, v1: built.v1, v2: built.v2, vertsW: built.vertsW, polyCount: built.polyCount, avg: built.avg, feature: built.feature };
					}
				}
			}

			const geom = geomRef.current;
			if (!geom) return;
			const { width: w, height: h } = sizeRef.current;
			if (w <= 0 || h <= 0) return;

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr);
			const bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) {
				canvas.width = bw;
				canvas.height = bh;
			}
			g.viewport(0, 0, bw, bh);

			const ctrl = cfg.controls;
			const R = cfg.inversiveRadiusFrac * Math.min(w, h) * 0.5;
			const sigma = 0.5;
			const tau = (cfg.mobiusTwist * Math.PI) / 180;
			const kinvMag = Math.exp(-sigma);
			const dark = document.documentElement.classList.contains("dark");
			const [m00, m01, m10, m11] = geom.minv;

			const U = uniformsRef.current;
			g.uniform2f(U.uRes, w, h);
			g.uniform1f(U.uDpr, dpr);
			g.uniform2f(U.uOffset, ctrl.offset.x, ctrl.offset.y);
			g.uniform1f(U.uZoom, ctrl.zoom);
			g.uniform1f(U.uRot, ((ctrl.rotation || 0) * Math.PI) / 180);
			g.uniform1i(U.uMode, cfg.inversiveMode === "mobius" ? 1 : 0);
			g.uniform1f(U.uR, R);
			g.uniform2f(U.uKinv, kinvMag * Math.cos(-tau), kinvMag * Math.sin(-tau));
			g.uniformMatrix2fv(U.uMinv, false, [m00, m10, m01, m11]);
			g.uniform2f(U.uV1, geom.v1[0], geom.v1[1]);
			g.uniform2f(U.uV2, geom.v2[0], geom.v2[1]);
			g.uniform1i(U.uVertsW, geom.vertsW);
			g.uniform1i(U.uPolyCount, geom.polyCount);
			// Stroke half-width as a fraction of the tile edge (uStrokePx * uFeature in the shader). The
			// "Line stroke" slider scales it; 0 → no strokes.
			g.uniform1f(U.uStrokePx, cfg.lineWidth * 0.028);
			g.uniform3f(U.uSurface, dark ? 0.08 : 0.96, dark ? 0.09 : 0.96, dark ? 0.11 : 0.97);
			g.uniform3f(U.uLine, 0.05, 0.05, 0.07);
			g.uniform3f(U.uAvg, geom.avg[0], geom.avg[1], geom.avg[2]);
			g.uniform1f(U.uFeature, geom.feature);

			g.activeTexture(g.TEXTURE0);
			g.bindTexture(g.TEXTURE_2D, vertsTexRef.current);
			g.uniform1i(U.uVerts, 0);
			g.activeTexture(g.TEXTURE1);
			g.bindTexture(g.TEXTURE_2D, metaTexRef.current);
			g.uniform1i(U.uMeta, 1);

			g.drawArrays(g.TRIANGLES, 0, 6);
		};
		raf = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(raf);
			gl.deleteProgram(prog);
			gl.deleteShader(vs);
			gl.deleteShader(fs);
			if (vertsTexRef.current) gl.deleteTexture(vertsTexRef.current);
			if (metaTexRef.current) gl.deleteTexture(metaTexRef.current);
			glRef.current = null;
			progRef.current = null;
			geomRef.current = null;
		};
	}, []);

	// (Re)upload the cell geometry whenever the selected tiling changes. Parametric families are handled
	// imperatively in the render loop (from the store's slider tuple), so skip them here.
	useEffect(() => {
		if (paramCell) return;
		const gl = glRef.current;
		const vTex = vertsTexRef.current;
		const mTex = metaTexRef.current;
		if (!gl || !vTex || !mTex) return;

		const geom = buildCellGeom(translationalCell);
		if (!geom) {
			geomRef.current = null;
			return;
		}
		uploadFloatTex(gl, vTex, geom.verts, geom.vertsW, geom.vertsH);
		uploadFloatTex(gl, mTex, geom.meta, geom.polyCount * 2, 1);
		geomRef.current = { minv: geom.minv, v1: geom.v1, v2: geom.v2, vertsW: geom.vertsW, polyCount: geom.polyCount, avg: geom.avg, feature: geom.feature };
	}, [translationalCellId, translationalCell, paramCell]);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%" }}
		/>
	);
}
