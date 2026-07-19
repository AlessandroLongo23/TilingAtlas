"use client";

import { useEffect, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import { buildCellMesh, type CellMesh } from "@/lib/render/buildCellMesh";
import { buildOrbitDotMesh, type OrbitDotMesh } from "@/lib/render/buildOrbitDotMesh";
import { computeFillRadii, wrapOffset } from "@/lib/render/flatView";
import {
	FILL_VERT, FILL_FRAG, STROKE_VERT, STROKE_FRAG, POINTS_VERT, POINTS_FRAG,
	ORBIT_VERT, ORBIT_FRAG, ORBIT_MAX, compileShader,
} from "@/lib/render/flatTilingGL";
import { getOrbitHoverWorld } from "@/lib/render/orbitHoverBridge";
import { evaluateParamCell, resolveAlphaDegs, type ParametricCellData } from "@/lib/utils/paramCell";
import { useFamilyAlphas } from "@/stores/familyAlphas";
import { Vector } from "@/classes/Vector";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import {
	TILING_TRANSITION_IN_MS,
	TILING_TRANSITION_OUT_MS,
	prefersReducedMotion,
} from "@/lib/utils/tilingTransition";

// Vertex-orbit hover-grow, mirroring Tiling.drawVertexOrbits (ORBIT_HOVER_GROW / ORBIT_HOVER_DAMP): the
// hovered orbit's dots ease toward 2x radius, the rest back to 1x, at this per-frame lerp rate.
const ORBIT_HOVER_GROW = 2;
const ORBIT_HOVER_DAMP = 0.2;

// Parse a CSS "rgb(r, g, b)" / "rgba(r, g, b, a)" string to [r,g,b] in 0..1. Used for the orbit-mode dim
// target (the surface background). Falls back to white so a dim never turns tiles black on a parse miss.
function parseRgb(s: string): [number, number, number] {
	const m = s.match(/[\d.]+/g);
	if (!m || m.length < 3) return [1, 1, 1];
	// A transparent background (alpha 0, or the keyword "transparent") gives no colour to fade toward, so
	// fall back to white rather than fading tiles to black.
	if (m.length >= 4 && Number(m[3]) === 0) return [1, 1, 1];
	return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255];
}

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
	orbitData?: OrbitData | null;
}

// The GLSL sources + compile helper moved to lib/render/flatTilingGL.ts (imported above) so the
// theory-page preview cards render through the exact same shaders — edit them there.

export function EuclideanCanvas({ width, height, translationalCell, translationalCellId, paramCell = null, orbitData = null }: EuclideanCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const glRef = useRef<WebGL2RenderingContext | null>(null);
	const progRef = useRef<WebGLProgram | null>(null);
	const posBufRef = useRef<WebGLBuffer | null>(null);
	const hueBufRef = useRef<WebGLBuffer | null>(null);
	const centroidBufRef = useRef<WebGLBuffer | null>(null);
	const instBufRef = useRef<WebGLBuffer | null>(null);
	const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
	const attribsRef = useRef<Record<string, number>>({});
	const strokeProgRef = useRef<WebGLProgram | null>(null);
	const strokePosBufRef = useRef<WebGLBuffer | null>(null);
	const strokeNormBufRef = useRef<WebGLBuffer | null>(null);
	const strokeSideBufRef = useRef<WebGLBuffer | null>(null);
	const strokeCentroidBufRef = useRef<WebGLBuffer | null>(null);
	const strokeUniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
	const strokeAttribsRef = useRef<Record<string, number>>({});
	const pointsProgRef = useRef<WebGLProgram | null>(null);
	const pointsPosBufRef = useRef<WebGLBuffer | null>(null);
	const pointsCornerBufRef = useRef<WebGLBuffer | null>(null);
	const pointsColorBufRef = useRef<WebGLBuffer | null>(null);
	const pointsUniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
	const pointsAttribsRef = useRef<Record<string, number>>({});
	// Vertex-orbit dots (M3, showVertexOrbits): own program/buffers, own mesh (built from orbitData), and a
	// caller-owned per-orbit hover-grow scale array eased each frame. The dots share the fill's instance grid.
	const orbitProgRef = useRef<WebGLProgram | null>(null);
	const orbitPosBufRef = useRef<WebGLBuffer | null>(null);
	const orbitCornerBufRef = useRef<WebGLBuffer | null>(null);
	const orbitOrbitBufRef = useRef<WebGLBuffer | null>(null);
	const orbitUniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
	const orbitAttribsRef = useRef<Record<string, number>>({});
	const orbitMeshRef = useRef<OrbitDotMesh | null>(null);
	const orbitScalesRef = useRef<number[]>([]);
	const orbitDataRef = useRef<OrbitData | null>(orbitData);
	orbitDataRef.current = orbitData;
	const meshRef = useRef<CellMesh | null>(null);
	const instRef = useRef<{ Ri: number; Rj: number; count: number }>({ Ri: -1, Rj: -1, count: 0 });
	const sizeRef = useRef({ width, height });
	sizeRef.current = { width, height };

	// Selection-transition wave (M2), the shader port of makeWaveScale/transitionRef in canvas.tsx. When a
	// NEW static tiling is picked, the current mesh COLLAPSES to its centroids (phase "out"), then the
	// incoming one GROWS back out (phase "in"), both driven by the fill/stroke vertex shaders' uWavePhase/
	// uWaveP. Only one mesh is ever on the GPU: the incoming is built and stashed here, then uploaded at the
	// out->in handover — so no second buffer set is needed. Static tilings and param->static switches animate;
	// static->param and param->param still jump-cut (the loop's param path owns those, no regression).
	const transitionRef = useRef<{ phase: "out" | "in"; start: number } | null>(null);
	const pendingMeshRef = useRef<CellMesh | null>(null);
	// The last translationalCellId the mesh effect saw, so it animates only on a genuine selection change
	// (id changed) and not on a same-id re-render that merely recreates the cell object (matches the p5
	// baseId check in canvas.tsx). Starts null so the first tiling loads without a wave.
	const prevCellIdRef = useRef<string | null>(null);

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
		gl.bindBuffer(gl.ARRAY_BUFFER, centroidBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.fillCentroid, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, strokePosBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokePos, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, strokeNormBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeNorm, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, strokeSideBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeSide, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, strokeCentroidBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeCentroid, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, pointsPosBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.pointPos, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, pointsCornerBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.pointCorner, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, pointsColorBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.pointColor, gl.STATIC_DRAW);
		meshRef.current = mesh;
		instRef.current = { Ri: -1, Rj: -1, count: 0 }; // force an instance rebuild for the new basis
	};

	// Upload the vertex-orbit dot mesh (M3), or clear it when there's no orbit data. Reset the eased hover
	// scales so a new tiling starts at rest.
	const uploadOrbitMesh = (gl: WebGL2RenderingContext, mesh: OrbitDotMesh | null) => {
		orbitMeshRef.current = mesh;
		orbitScalesRef.current = [];
		if (!mesh) return;
		gl.bindBuffer(gl.ARRAY_BUFFER, orbitPosBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, orbitCornerBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.corner, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, orbitOrbitBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.orbit, gl.STATIC_DRAW);
	};

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
		if (!gl) { console.error("euclidean view: WebGL2 unavailable"); return; }
		glRef.current = gl;

		const vs = compileShader(gl, gl.VERTEX_SHADER, FILL_VERT);
		const fs = compileShader(gl, gl.FRAGMENT_SHADER, FILL_FRAG);
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

		for (const name of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf", "uHueOffset", "uWavePhase", "uWaveP", "uFillDim", "uDimTarget"]) {
			uniformsRef.current[name] = gl.getUniformLocation(prog, name);
		}
		for (const name of ["aPos", "aHue", "aInst", "aCentroid"]) {
			attribsRef.current[name] = gl.getAttribLocation(prog, name);
		}

		posBufRef.current = gl.createBuffer();
		hueBufRef.current = gl.createBuffer();
		centroidBufRef.current = gl.createBuffer();
		instBufRef.current = gl.createBuffer();

		const strokeVs = compileShader(gl, gl.VERTEX_SHADER, STROKE_VERT);
		const strokeFs = compileShader(gl, gl.FRAGMENT_SHADER, STROKE_FRAG);
		if (!strokeVs || !strokeFs) return;
		const strokeProg = gl.createProgram();
		gl.attachShader(strokeProg, strokeVs);
		gl.attachShader(strokeProg, strokeFs);
		gl.linkProgram(strokeProg);
		if (!gl.getProgramParameter(strokeProg, gl.LINK_STATUS)) {
			console.error("euclidean stroke program link failed:", gl.getProgramInfoLog(strokeProg));
			return;
		}
		strokeProgRef.current = strokeProg;

		for (const name of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf", "uHalfStrokePx", "uStroke", "uWavePhase", "uWaveP", "uStrokeDim", "uDimTarget"]) {
			strokeUniformsRef.current[name] = gl.getUniformLocation(strokeProg, name);
		}
		for (const name of ["aPos", "aNorm", "aSide", "aInst", "aCentroid"]) {
			strokeAttribsRef.current[name] = gl.getAttribLocation(strokeProg, name);
		}

		strokePosBufRef.current = gl.createBuffer();
		strokeNormBufRef.current = gl.createBuffer();
		strokeSideBufRef.current = gl.createBuffer();
		strokeCentroidBufRef.current = gl.createBuffer();

		const pointsVs = compileShader(gl, gl.VERTEX_SHADER, POINTS_VERT);
		const pointsFs = compileShader(gl, gl.FRAGMENT_SHADER, POINTS_FRAG);
		if (!pointsVs || !pointsFs) return;
		const pointsProg = gl.createProgram();
		gl.attachShader(pointsProg, pointsVs);
		gl.attachShader(pointsProg, pointsFs);
		gl.linkProgram(pointsProg);
		if (!gl.getProgramParameter(pointsProg, gl.LINK_STATUS)) {
			console.error("euclidean points program link failed:", gl.getProgramInfoLog(pointsProg));
			return;
		}
		pointsProgRef.current = pointsProg;

		for (const name of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf", "uRadiusPx"]) {
			pointsUniformsRef.current[name] = gl.getUniformLocation(pointsProg, name);
		}
		for (const name of ["aPos", "aCorner", "aColor", "aInst"]) {
			pointsAttribsRef.current[name] = gl.getAttribLocation(pointsProg, name);
		}

		pointsPosBufRef.current = gl.createBuffer();
		pointsCornerBufRef.current = gl.createBuffer();
		pointsColorBufRef.current = gl.createBuffer();

		const orbitVs = compileShader(gl, gl.VERTEX_SHADER, ORBIT_VERT);
		const orbitFs = compileShader(gl, gl.FRAGMENT_SHADER, ORBIT_FRAG);
		if (!orbitVs || !orbitFs) return;
		const orbitProg = gl.createProgram();
		gl.attachShader(orbitProg, orbitVs);
		gl.attachShader(orbitProg, orbitFs);
		gl.linkProgram(orbitProg);
		if (!gl.getProgramParameter(orbitProg, gl.LINK_STATUS)) {
			console.error("euclidean orbit program link failed:", gl.getProgramInfoLog(orbitProg));
			return;
		}
		orbitProgRef.current = orbitProg;

		for (const name of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf", "uRadiusPx", "uK", "uOrbitScale"]) {
			orbitUniformsRef.current[name] = gl.getUniformLocation(orbitProg, name);
		}
		for (const name of ["aPos", "aCorner", "aOrbit", "aInst"]) {
			orbitAttribsRef.current[name] = gl.getAttribLocation(orbitProg, name);
		}

		orbitPosBufRef.current = gl.createBuffer();
		orbitCornerBufRef.current = gl.createBuffer();
		orbitOrbitBufRef.current = gl.createBuffer();

		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const g = glRef.current;
			const prg = progRef.current;
			if (!g || !prg) return;

			const cfg = useConfiguration.getState();

			// Parametric family: rebuild the cell mesh when the slider tuple changes (imperative, no React).
			// Suppressed while a selection wave is running (transitionRef non-null) so a stray alpha tick can't
			// clobber the collapsing/growing mesh mid-transition; the effect owns the mesh for the wave's duration.
			const pc = paramCellRef.current;
			if (pc && !transitionRef.current) {
				const alphas = resolveAlphaDegs(pc, useFamilyAlphas.getState().values);
				const sig = alphas.map((a) => a.toFixed(2)).join(",");
				if (sig !== lastSigRef.current) {
					lastSigRef.current = sig;
					const mesh = buildCellMesh(evaluateParamCell(pc, alphas));
					if (mesh) uploadMesh(g, mesh);
				}
			}

			// Advance the selection wave. Phase "out" collapses the current mesh; at p>=1 the stashed incoming
			// mesh is uploaded and phase "in" grows it back. wavePhaseInt (0/+1/-1) + waveP feed the shaders.
			let wavePhaseInt = 0;
			let waveP = 0;
			const tr = transitionRef.current;
			if (tr && !cfg.tilingTransition) {
				// Toggled off mid-flight: land on the incoming tiling at once (mirrors canvas.tsx).
				if (pendingMeshRef.current) { uploadMesh(g, pendingMeshRef.current); pendingMeshRef.current = null; }
				transitionRef.current = null;
			} else if (tr) {
				const dur = tr.phase === "out" ? TILING_TRANSITION_OUT_MS : TILING_TRANSITION_IN_MS;
				const elapsed = (performance.now() - tr.start) / dur;
				if (tr.phase === "out") {
					if (elapsed >= 1) {
						if (pendingMeshRef.current) { uploadMesh(g, pendingMeshRef.current); pendingMeshRef.current = null; }
						transitionRef.current = { phase: "in", start: performance.now() };
						wavePhaseInt = 1; waveP = 0;
					} else { wavePhaseInt = -1; waveP = elapsed; }
				} else if (elapsed >= 1) {
					transitionRef.current = null;
				} else { wavePhaseInt = 1; waveP = elapsed; }
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
			const { Ri, Rj } = computeFillRadii(v1, v2, mesh.det, ctrl.zoom, w, h, rot, mesh.extent);
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
			g.bindBuffer(g.ARRAY_BUFFER, centroidBufRef.current);
			g.enableVertexAttribArray(A.aCentroid);
			g.vertexAttribPointer(A.aCentroid, 2, g.FLOAT, false, 0, 0);
			g.vertexAttribDivisor(A.aCentroid, 0);
			g.bindBuffer(g.ARRAY_BUFFER, instBufRef.current);
			g.enableVertexAttribArray(A.aInst);
			g.vertexAttribPointer(A.aInst, 2, g.FLOAT, false, 0, 0);
			g.vertexAttribDivisor(A.aInst, 1);

			// Vertex-orbit mode (M3): the shader draws the orbit dots AND fades the tiles to 0.3, replacing
			// p5's drawVertexOrbits + dim. Active only while a dot mesh exists (orbitData present). The wave
			// (M2) suppresses it — the dots ride the un-scaled outline, so we hide them for the transition,
			// matching Tiling.show / the canvas.tsx orbit gate.
			const orbitMode = cfg.showVertexOrbits && orbitMeshRef.current != null && wavePhaseInt === 0;
			// Dim target = the actual surface background behind this (transparent) canvas, so the faded fill
			// reads pale in light theme and dark in dark theme, matching what p5 composites over. Read only in
			// orbit mode (a static overlay); otherwise uFillDim=0 makes uDimTarget irrelevant.
			const dim: [number, number, number] = orbitMode
				? parseRgb(getComputedStyle(canvas.parentElement ?? canvas).backgroundColor)
				: [0, 0, 0];

			g.uniform2f(U.uOffset, draw.x, draw.y);
			g.uniform1f(U.uZoom, ctrl.zoom);
			g.uniform1f(U.uRot, rot);
			g.uniform2f(U.uV1, mesh.v1[0], mesh.v1[1]);
			g.uniform2f(U.uV2, mesh.v2[0], mesh.v2[1]);
			g.uniform2f(U.uHalf, w / 2, h / 2);
			g.uniform1f(U.uHueOffset, cfg.hueOffset || 0);
			g.uniform1i(U.uWavePhase, wavePhaseInt);
			g.uniform1f(U.uWaveP, waveP);
			g.uniform1f(U.uFillDim, orbitMode ? 1 : 0);
			g.uniform3f(U.uDimTarget, dim[0], dim[1], dim[2]);

			if (cfg.showPolygonFill) {
				g.drawArraysInstanced(g.TRIANGLES, 0, mesh.fillVertexCount, instRef.current.count);
			}

			if (cfg.lineWidth > 0 && mesh.strokeVertexCount > 0) {
				// Blend stays enabled across frames deliberately: both fragment shaders write alpha 1.0, so
				// SRC_ALPHA blending is identity today; keeping it on future-proofs a per-tile-opacity fill
				// without a state-toggle dance.
				g.enable(g.BLEND);
				g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
				// No VAOs: both programs share the default VAO and the instance buffer, so EVERY attribute must
				// be fully rebound (bindBuffer + vertexAttribPointer + vertexAttribDivisor) before its own draw
				// every frame. Do NOT skip rebinding as a "nothing changed" perf shortcut — the two programs'
				// attribute locations aren't guaranteed disjoint, so a skipped rebind would corrupt
				// divisor/pointer state across passes.
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
				g.bindBuffer(g.ARRAY_BUFFER, strokeCentroidBufRef.current);
				g.enableVertexAttribArray(SA.aCentroid);
				g.vertexAttribPointer(SA.aCentroid, 2, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(SA.aCentroid, 0);
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
				g.uniform1i(SU.uWavePhase, wavePhaseInt);
				g.uniform1f(SU.uWaveP, waveP);
				g.uniform1f(SU.uStrokeDim, orbitMode ? 1 : 0); // fade the outline with the dimmed fill in orbit mode
				g.uniform3f(SU.uDimTarget, dim[0], dim[1], dim[2]);
				g.uniform1f(SU.uHalfStrokePx, cfg.lineWidth * 0.5); // p5 strokeWeight(lineWidth/zoom) => lineWidth px
				const dark = document.documentElement.classList.contains("dark");
				const lightStroke = !cfg.showPolygonFill && dark; // matches Tiling.show white-stroke case
				if (lightStroke) g.uniform3f(SU.uStroke, 1, 1, 1);
				else g.uniform3f(SU.uStroke, 0, 0, 0);
				g.drawArraysInstanced(g.TRIANGLES, 0, mesh.strokeVertexCount, instRef.current.count);
				g.useProgram(progRef.current); // restore the fill program for next frame's fill pass
			}

			// Points pass (showPolygonPoints): instanced disks at each centroid/halfway/vertex, screen-
			// constant radius, coloured red/green/blue with a dark rim — matching Tiling.show's p5 dots,
			// which canvas.tsx now skips when this shader is active. Same instance grid as the fill. Hidden
			// while a wave runs (wavePhaseInt != 0): the dots sit on the UNscaled outline, so they'd float off
			// a collapsing tile — Tiling.show suppresses them the same way (`showPolygonPoints && !scaleOf`).
			if (cfg.showPolygonPoints && wavePhaseInt === 0 && mesh.pointVertexCount > 0) {
				g.enable(g.BLEND);
				g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
				g.useProgram(pointsProgRef.current);
				const PA = pointsAttribsRef.current, PU = pointsUniformsRef.current;
				g.bindBuffer(g.ARRAY_BUFFER, pointsPosBufRef.current);
				g.enableVertexAttribArray(PA.aPos);
				g.vertexAttribPointer(PA.aPos, 2, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(PA.aPos, 0);
				g.bindBuffer(g.ARRAY_BUFFER, pointsCornerBufRef.current);
				g.enableVertexAttribArray(PA.aCorner);
				g.vertexAttribPointer(PA.aCorner, 2, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(PA.aCorner, 0);
				g.bindBuffer(g.ARRAY_BUFFER, pointsColorBufRef.current);
				g.enableVertexAttribArray(PA.aColor);
				g.vertexAttribPointer(PA.aColor, 3, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(PA.aColor, 0);
				g.bindBuffer(g.ARRAY_BUFFER, instBufRef.current);
				g.enableVertexAttribArray(PA.aInst);
				g.vertexAttribPointer(PA.aInst, 2, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(PA.aInst, 1);
				g.uniform2f(PU.uOffset, draw.x, draw.y);
				g.uniform1f(PU.uZoom, ctrl.zoom);
				g.uniform1f(PU.uRot, rot);
				g.uniform2f(PU.uV1, mesh.v1[0], mesh.v1[1]);
				g.uniform2f(PU.uV2, mesh.v2[0], mesh.v2[1]);
				g.uniform2f(PU.uHalf, w / 2, h / 2);
				g.uniform1f(PU.uRadiusPx, 2.5); // p5 drew a 5px-diameter dot (5/zoom world units)
				g.drawArraysInstanced(g.TRIANGLES, 0, mesh.pointVertexCount, instRef.current.count);
				g.useProgram(progRef.current); // restore the fill program for next frame's fill pass
			}

			// Vertex-orbit dots pass (M3): instanced disks coloured by orbit, on top of the dimmed fill.
			// Hover-grow: hit-test the p5-published mouse-world (orbitHoverBridge) against the base-cell dots
			// reduced modulo the lattice to find the hovered orbit, then ease every orbit's radius scale
			// toward 2x (hovered) or 1x — the same per-orbit lerp Tiling.drawVertexOrbits runs. The hit-test
			// uses the BASE radius, so hover is deterministic (no grow/shrink flicker at the boundary).
			const orbitMesh = orbitMeshRef.current;
			if (orbitMode && orbitMesh && orbitMesh.vertexCount > 0) {
				const k = orbitMesh.k;
				const det = mesh.det;
				const [v1x, v1y] = mesh.v1, [v2x, v2y] = mesh.v2;
				const hover = getOrbitHoverWorld();
				let hoveredOrbit = -1;
				if (hover && Math.abs(det) > 1e-9) {
					const rWorld = 4 / ctrl.zoom;        // dot radius in world units (uRadiusPx / zoom)
					let best = rWorld * rWorld;
					for (const d of orbitMesh.dots) {
						// Nearest lattice image of this base dot to the cursor: solve Δ = i·v1 + j·v2, round i,j.
						const dx = hover.x - d.x, dy = hover.y - d.y;
						const fi = (dx * v2y - dy * v2x) / det;
						const fj = (dy * v1x - dx * v1y) / det;
						const i = Math.round(fi), j = Math.round(fj);
						const rx = dx - (i * v1x + j * v2x), ry = dy - (i * v1y + j * v2y);
						const dist2 = rx * rx + ry * ry;
						if (dist2 < best) { best = dist2; hoveredOrbit = d.orbit; }
					}
				}
				const scales = orbitScalesRef.current;
				if (scales.length !== k) { scales.length = k; scales.fill(1); }
				const arr = new Float32Array(ORBIT_MAX).fill(1);
				for (let o = 0; o < k; o++) {
					const target = o === hoveredOrbit ? ORBIT_HOVER_GROW : 1;
					const dd = target - scales[o];
					scales[o] = Math.abs(dd) < 0.01 ? target : scales[o] + dd * ORBIT_HOVER_DAMP;
					if (o < ORBIT_MAX) arr[o] = scales[o];
				}

				g.enable(g.BLEND);
				g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
				g.useProgram(orbitProgRef.current);
				const OA = orbitAttribsRef.current, OU = orbitUniformsRef.current;
				g.bindBuffer(g.ARRAY_BUFFER, orbitPosBufRef.current);
				g.enableVertexAttribArray(OA.aPos);
				g.vertexAttribPointer(OA.aPos, 2, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(OA.aPos, 0);
				g.bindBuffer(g.ARRAY_BUFFER, orbitCornerBufRef.current);
				g.enableVertexAttribArray(OA.aCorner);
				g.vertexAttribPointer(OA.aCorner, 2, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(OA.aCorner, 0);
				g.bindBuffer(g.ARRAY_BUFFER, orbitOrbitBufRef.current);
				g.enableVertexAttribArray(OA.aOrbit);
				g.vertexAttribPointer(OA.aOrbit, 1, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(OA.aOrbit, 0);
				g.bindBuffer(g.ARRAY_BUFFER, instBufRef.current);
				g.enableVertexAttribArray(OA.aInst);
				g.vertexAttribPointer(OA.aInst, 2, g.FLOAT, false, 0, 0);
				g.vertexAttribDivisor(OA.aInst, 1);
				g.uniform2f(OU.uOffset, draw.x, draw.y);
				g.uniform1f(OU.uZoom, ctrl.zoom);
				g.uniform1f(OU.uRot, rot);
				g.uniform2f(OU.uV1, mesh.v1[0], mesh.v1[1]);
				g.uniform2f(OU.uV2, mesh.v2[0], mesh.v2[1]);
				g.uniform2f(OU.uHalf, w / 2, h / 2);
				g.uniform1f(OU.uRadiusPx, 4); // p5 drew an 8px-diameter orbit dot (8/zoom world units)
				g.uniform1f(OU.uK, k);
				g.uniform1fv(OU.uOrbitScale, arr);
				g.drawArraysInstanced(g.TRIANGLES, 0, orbitMesh.vertexCount, instRef.current.count);
				g.useProgram(progRef.current); // restore the fill program for next frame's fill pass
			}
		};
		raf = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(raf);
			gl.deleteProgram(prog);
			gl.deleteShader(vs);
			gl.deleteShader(fs);
			if (posBufRef.current) gl.deleteBuffer(posBufRef.current);
			if (hueBufRef.current) gl.deleteBuffer(hueBufRef.current);
			if (centroidBufRef.current) gl.deleteBuffer(centroidBufRef.current);
			if (instBufRef.current) gl.deleteBuffer(instBufRef.current);
			if (strokeProgRef.current) gl.deleteProgram(strokeProgRef.current);
			gl.deleteShader(strokeVs);
			gl.deleteShader(strokeFs);
			if (strokePosBufRef.current) gl.deleteBuffer(strokePosBufRef.current);
			if (strokeNormBufRef.current) gl.deleteBuffer(strokeNormBufRef.current);
			if (strokeSideBufRef.current) gl.deleteBuffer(strokeSideBufRef.current);
			if (strokeCentroidBufRef.current) gl.deleteBuffer(strokeCentroidBufRef.current);
			if (pointsProgRef.current) gl.deleteProgram(pointsProgRef.current);
			gl.deleteShader(pointsVs);
			gl.deleteShader(pointsFs);
			if (pointsPosBufRef.current) gl.deleteBuffer(pointsPosBufRef.current);
			if (pointsCornerBufRef.current) gl.deleteBuffer(pointsCornerBufRef.current);
			if (pointsColorBufRef.current) gl.deleteBuffer(pointsColorBufRef.current);
			if (orbitProgRef.current) gl.deleteProgram(orbitProgRef.current);
			gl.deleteShader(orbitVs);
			gl.deleteShader(orbitFs);
			if (orbitPosBufRef.current) gl.deleteBuffer(orbitPosBufRef.current);
			if (orbitCornerBufRef.current) gl.deleteBuffer(orbitCornerBufRef.current);
			if (orbitOrbitBufRef.current) gl.deleteBuffer(orbitOrbitBufRef.current);
			glRef.current = null;
			progRef.current = null;
			strokeProgRef.current = null;
			pointsProgRef.current = null;
			orbitProgRef.current = null;
			meshRef.current = null;
			orbitMeshRef.current = null;
		};
	}, []);

	// (Re)build the orbit-dot mesh when the tiling or its orbit data changes. Independent of the fill mesh
	// (which the effect above / the loop own): orbit data arrives asynchronously (useVertexOrbits computes it
	// after selection), so this fires again when it lands. For a parametric family the dots track the CURRENT
	// alpha cell — cheap and rare (orbit mode is a Regular-shelf overlay, not an alpha-drag surface).
	useEffect(() => {
		const gl = glRef.current;
		if (!gl || !orbitPosBufRef.current) return;
		const cell = paramCell
			? evaluateParamCell(paramCell, resolveAlphaDegs(paramCell, useFamilyAlphas.getState().values))
			: translationalCell;
		uploadOrbitMesh(gl, buildOrbitDotMesh(cell, orbitData));
	}, [translationalCellId, translationalCell, paramCell, orbitData]);

	// (Re)build the static-cell mesh when the selected tiling changes (parametric handled in the loop).
	// When there is already a tiling on screen, play the selection wave (M2) instead of jump-cutting: keep
	// the current mesh uploaded so the render loop can COLLAPSE it (phase "out"), and stash the incoming
	// mesh in pendingMeshRef for the loop to upload and GROW at the handover. First load, reduced-motion,
	// and a disabled toggle upload straight away. Fires on a switch FROM a param family too (paramCell just
	// went null), so param->static also animates; static->param / param->param stay jump-cuts (loop-owned).
	useEffect(() => {
		const isNewSelection = translationalCellId !== prevCellIdRef.current;
		prevCellIdRef.current = translationalCellId;
		if (paramCell) return;
		const gl = glRef.current;
		if (!gl || !posBufRef.current) return;
		const mesh = buildCellMesh(translationalCell);
		if (!mesh) { meshRef.current = null; return; }
		const canAnimate =
			isNewSelection && !!meshRef.current
			&& useConfiguration.getState().tilingTransition && !prefersReducedMotion();
		if (!canAnimate) {
			uploadMesh(gl, mesh);
			transitionRef.current = null;
			pendingMeshRef.current = null;
			return;
		}
		// Supersede the incoming mesh but let an already-running collapse finish (mirrors canvas.tsx: only the
		// not-yet-shown incoming is replaced); otherwise start a fresh collapse of what's currently on screen.
		pendingMeshRef.current = mesh;
		if (transitionRef.current?.phase !== "out") {
			transitionRef.current = { phase: "out", start: performance.now() };
		}
	}, [translationalCellId, translationalCell, paramCell]);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%", zIndex: 0 }}
		/>
	);
}
