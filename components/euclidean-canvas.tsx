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
	// Same centred-screen map as the fill.
	float sx = uOffset.x + uZoom * (c * world.x + s * world.y);
	float sy = uOffset.y + uZoom * (s * world.x - c * world.y);
	// Carry the edge normal through the SAME linear map (no translation), renormalise in screen space,
	// push by half the stroke width -> constant CSS-px outline at any zoom.
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
	const strokeProgRef = useRef<WebGLProgram | null>(null);
	const strokePosBufRef = useRef<WebGLBuffer | null>(null);
	const strokeNormBufRef = useRef<WebGLBuffer | null>(null);
	const strokeSideBufRef = useRef<WebGLBuffer | null>(null);
	const strokeUniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
	const strokeAttribsRef = useRef<Record<string, number>>({});
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
		gl.bindBuffer(gl.ARRAY_BUFFER, strokePosBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokePos, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, strokeNormBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeNorm, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, strokeSideBufRef.current);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeSide, gl.STATIC_DRAW);
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

		const strokeVs = compile(gl, gl.VERTEX_SHADER, STROKE_VERT);
		const strokeFs = compile(gl, gl.FRAGMENT_SHADER, STROKE_FRAG);
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

		for (const name of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf", "uHalfStrokePx", "uStroke"]) {
			strokeUniformsRef.current[name] = gl.getUniformLocation(strokeProg, name);
		}
		for (const name of ["aPos", "aNorm", "aSide", "aInst"]) {
			strokeAttribsRef.current[name] = gl.getAttribLocation(strokeProg, name);
		}

		strokePosBufRef.current = gl.createBuffer();
		strokeNormBufRef.current = gl.createBuffer();
		strokeSideBufRef.current = gl.createBuffer();

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
				const lightStroke = !cfg.showPolygonFill && dark; // matches Tiling.show white-stroke case
				if (lightStroke) g.uniform3f(SU.uStroke, 1, 1, 1);
				else g.uniform3f(SU.uStroke, 0, 0, 0);
				g.drawArraysInstanced(g.TRIANGLES, 0, mesh.strokeVertexCount, instRef.current.count);
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
			if (instBufRef.current) gl.deleteBuffer(instBufRef.current);
			if (strokeProgRef.current) gl.deleteProgram(strokeProgRef.current);
			gl.deleteShader(strokeVs);
			gl.deleteShader(strokeFs);
			if (strokePosBufRef.current) gl.deleteBuffer(strokePosBufRef.current);
			if (strokeNormBufRef.current) gl.deleteBuffer(strokeNormBufRef.current);
			if (strokeSideBufRef.current) gl.deleteBuffer(strokeSideBufRef.current);
			glRef.current = null;
			progRef.current = null;
			strokeProgRef.current = null;
			meshRef.current = null;
		};
	}, []);

	// (Re)build the static-cell mesh when the selected tiling changes (parametric handled in the loop).
	useEffect(() => {
		if (paramCell) return;
		const gl = glRef.current;
		if (!gl || !posBufRef.current) return;
		const mesh = buildCellMesh(translationalCell);
		if (mesh) uploadMesh(gl, mesh);
		else meshRef.current = null;
	}, [translationalCellId, translationalCell, paramCell]);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%", zIndex: 0 }}
		/>
	);
}
