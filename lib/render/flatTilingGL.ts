// The flat (Euclidean) WebGL2 rendering core, shared by the /play shader view
// (components/euclidean-canvas.tsx) and the theory-page preview cards
// (components/interactive-tiling-preview-card.tsx). Owns the GLSL sources — single source of truth so
// the two surfaces can never drift — plus compile/link helpers and FlatCellRenderer, a self-contained
// draw pipeline over a CellMesh (euclidean-canvas.tsx still runs its own inline plumbing; migrating it
// onto FlatCellRenderer is a welcome follow-up once its in-flight work lands).

import { Vector } from "@/classes/Vector";
import type { CellMesh } from "@/lib/render/buildCellMesh";
import { computeFillRadii, wrapOffset } from "@/lib/render/flatView";

export const FILL_VERT = `#version 300 es
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

export const FILL_FRAG = `#version 300 es
precision highp float;
in float vHue;
uniform float uHueOffset; // global hue rotation, degrees (the sidebar hue ring); hsb2rgb wraps via mod
out vec4 frag;
vec3 hsb2rgb(float h, float s, float v) {
	vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}
void main() {
	// s=0.40, b=1.0, opaque — matches Tiling.show and the inversive shader so the views agree on colour.
	frag = vec4(hsb2rgb((vHue + uHueOffset) / 360.0, 0.40, 1.0), 1.0);
}
`;

export const STROKE_VERT = `#version 300 es
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

export const STROKE_FRAG = `#version 300 es
precision highp float;
uniform vec3 uStroke;
out vec4 frag;
void main() { frag = vec4(uStroke, 1.0); }
`;

// Points (showPolygonPoints): each centroid/halfway/vertex is a quad billboarded to a constant CSS-px
// radius; the fragment shader carves an anti-aliased disk with a dark rim out of it. Instanced by the
// same lattice grid as the fill, so every replicated cell shows its dots. aCorner is the unit-quad corner
// in [-1,1]; the world point maps like the fill, then the corner pushes by uRadiusPx in screen space.
export const POINTS_VERT = `#version 300 es
in vec2 aPos;
in vec2 aCorner;   // unit-quad corner in [-1,1]
in vec3 aColor;
in vec2 aInst;
uniform vec2 uOffset;
uniform float uZoom;
uniform float uRot;
uniform vec2 uV1;
uniform vec2 uV2;
uniform vec2 uHalf;
uniform float uRadiusPx; // disk radius, CSS px
out vec2 vCorner;
out vec3 vColor;
void main() {
	vec2 world = aPos + aInst.x * uV1 + aInst.y * uV2;
	float c = cos(uRot), s = sin(uRot);
	float sx = uOffset.x + uZoom * (c * world.x + s * world.y);
	float sy = uOffset.y + uZoom * (s * world.x - c * world.y);
	sx += aCorner.x * uRadiusPx;
	sy += aCorner.y * uRadiusPx;
	gl_Position = vec4(sx / uHalf.x, -sy / uHalf.y, 0.0, 1.0);
	vCorner = aCorner;
	vColor = aColor;
}
`;

export const POINTS_FRAG = `#version 300 es
precision highp float;
in vec2 vCorner;
in vec3 vColor;
out vec4 frag;
void main() {
	float d = length(vCorner);              // 0 at centre, 1 at the disk edge
	float aa = fwidth(d);
	float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
	if (alpha <= 0.0) discard;
	float ring = smoothstep(0.6, 0.72, d);  // dark rim, matching the p5 dot's 1px black border
	frag = vec4(mix(vColor, vec3(0.0), ring), alpha);
}
`;

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
	const sh = gl.createShader(type);
	if (!sh) return null;
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		console.error("flat shader compile failed:", gl.getShaderInfoLog(sh));
		gl.deleteShader(sh);
		return null;
	}
	return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
	const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
	if (!vs || !fs) return null;
	const prog = gl.createProgram();
	gl.attachShader(prog, vs);
	gl.attachShader(prog, fs);
	gl.linkProgram(prog);
	// Shaders can be flagged for deletion once linked; the program keeps them alive.
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
		console.error("flat program link failed:", gl.getProgramInfoLog(prog));
		gl.deleteProgram(prog);
		return null;
	}
	return prog;
}

export interface FlatDrawParams {
	width: number; // CSS px
	height: number; // CSS px
	offset: { x: number; y: number }; // UNWRAPPED pan, centred CSS px, y down (wrap applied here)
	zoom: number;
	rotationDeg: number;
	lineWidth: number; // CSS px; 0 disables the stroke pass
	showFill: boolean;
	strokeRGB: [number, number, number]; // 0..1
	hueOffsetDeg?: number; // global fill-hue rotation (degrees); omitted ⇒ 0 (theory cards)
}

// Retained-mode instanced renderer over one CellMesh: upload the cell once, then every frame is two
// instanced draws with fresh uniforms. Mirrors euclidean-canvas.tsx's inline pipeline exactly.
export class FlatCellRenderer {
	private gl: WebGL2RenderingContext;
	private fillProg: WebGLProgram;
	private strokeProg: WebGLProgram;
	private posBuf: WebGLBuffer;
	private hueBuf: WebGLBuffer;
	private instBuf: WebGLBuffer;
	private strokePosBuf: WebGLBuffer;
	private strokeNormBuf: WebGLBuffer;
	private strokeSideBuf: WebGLBuffer;
	private fillU: Record<string, WebGLUniformLocation | null> = {};
	private fillA: Record<string, number> = {};
	private strokeU: Record<string, WebGLUniformLocation | null> = {};
	private strokeA: Record<string, number> = {};
	private mesh: CellMesh | null = null;
	private inst = { Ri: -1, Rj: -1, count: 0 };
	private disposed = false;

	// Throws on shader/link failure so callers can fall back (e.g. a static placeholder card).
	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		const fillProg = linkProgram(gl, FILL_VERT, FILL_FRAG);
		const strokeProg = linkProgram(gl, STROKE_VERT, STROKE_FRAG);
		if (!fillProg || !strokeProg) throw new Error("flat renderer: shader compile/link failed");
		this.fillProg = fillProg;
		this.strokeProg = strokeProg;

		for (const name of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf", "uHueOffset"]) {
			this.fillU[name] = gl.getUniformLocation(fillProg, name);
		}
		for (const name of ["aPos", "aHue", "aInst"]) {
			this.fillA[name] = gl.getAttribLocation(fillProg, name);
		}
		for (const name of ["uOffset", "uZoom", "uRot", "uV1", "uV2", "uHalf", "uHalfStrokePx", "uStroke"]) {
			this.strokeU[name] = gl.getUniformLocation(strokeProg, name);
		}
		for (const name of ["aPos", "aNorm", "aSide", "aInst"]) {
			this.strokeA[name] = gl.getAttribLocation(strokeProg, name);
		}

		this.posBuf = gl.createBuffer();
		this.hueBuf = gl.createBuffer();
		this.instBuf = gl.createBuffer();
		this.strokePosBuf = gl.createBuffer();
		this.strokeNormBuf = gl.createBuffer();
		this.strokeSideBuf = gl.createBuffer();
	}

	uploadMesh(mesh: CellMesh): void {
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.fillVerts, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.hueBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.fillHue, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.strokePosBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokePos, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeNormBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeNorm, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeSideBuf);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.strokeSide, gl.STATIC_DRAW);
		this.mesh = mesh;
		this.inst = { Ri: -1, Rj: -1, count: 0 }; // force an instance rebuild for the new basis
	}

	// One frame. The caller owns canvas backing-size/viewport management (DPR differs per surface).
	draw(p: FlatDrawParams): void {
		const gl = this.gl;
		const mesh = this.mesh;
		if (this.disposed || !mesh || p.width <= 0 || p.height <= 0) return;

		const rot = (p.rotationDeg * Math.PI) / 180;
		const v1 = new Vector(mesh.v1[0], mesh.v1[1]);
		const v2 = new Vector(mesh.v2[0], mesh.v2[1]);

		// Instance grid: (i,j) over the visible lattice range. Rebuild only when the radius changes.
		const { Ri, Rj } = computeFillRadii(v1, v2, mesh.det, p.zoom, p.width, p.height, rot, mesh.extent);
		if (Ri !== this.inst.Ri || Rj !== this.inst.Rj) {
			const inst: number[] = [];
			for (let i = -Ri; i <= Ri; i++) for (let j = -Rj; j <= Rj; j++) inst.push(i, j);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(inst), gl.DYNAMIC_DRAW);
			this.inst = { Ri, Rj, count: inst.length / 2 };
		}

		// Wrapped pan keeps the offset bounded so the fixed instance grid always covers the viewport.
		const { draw } = wrapOffset(new Vector(p.offset.x, p.offset.y), v1, v2, mesh.det, p.zoom, rot);

		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		// No VAOs: both programs share the default VAO and the instance buffer, so EVERY attribute must
		// be fully rebound (bindBuffer + vertexAttribPointer + vertexAttribDivisor) before its own draw
		// every frame — the two programs' attribute locations aren't guaranteed disjoint.
		if (p.showFill) {
			gl.useProgram(this.fillProg);
			const A = this.fillA, U = this.fillU;
			gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
			gl.enableVertexAttribArray(A.aPos);
			gl.vertexAttribPointer(A.aPos, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aPos, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.hueBuf);
			gl.enableVertexAttribArray(A.aHue);
			gl.vertexAttribPointer(A.aHue, 1, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aHue, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
			gl.enableVertexAttribArray(A.aInst);
			gl.vertexAttribPointer(A.aInst, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aInst, 1);
			gl.uniform2f(U.uOffset, draw.x, draw.y);
			gl.uniform1f(U.uZoom, p.zoom);
			gl.uniform1f(U.uRot, rot);
			gl.uniform2f(U.uV1, mesh.v1[0], mesh.v1[1]);
			gl.uniform2f(U.uV2, mesh.v2[0], mesh.v2[1]);
			gl.uniform2f(U.uHalf, p.width / 2, p.height / 2);
			gl.uniform1f(U.uHueOffset, p.hueOffsetDeg ?? 0);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.fillVertexCount, this.inst.count);
		}

		if (p.lineWidth > 0 && mesh.strokeVertexCount > 0) {
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.useProgram(this.strokeProg);
			const A = this.strokeA, U = this.strokeU;
			gl.bindBuffer(gl.ARRAY_BUFFER, this.strokePosBuf);
			gl.enableVertexAttribArray(A.aPos);
			gl.vertexAttribPointer(A.aPos, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aPos, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeNormBuf);
			gl.enableVertexAttribArray(A.aNorm);
			gl.vertexAttribPointer(A.aNorm, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aNorm, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeSideBuf);
			gl.enableVertexAttribArray(A.aSide);
			gl.vertexAttribPointer(A.aSide, 1, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aSide, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
			gl.enableVertexAttribArray(A.aInst);
			gl.vertexAttribPointer(A.aInst, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(A.aInst, 1);
			gl.uniform2f(U.uOffset, draw.x, draw.y);
			gl.uniform1f(U.uZoom, p.zoom);
			gl.uniform1f(U.uRot, rot);
			gl.uniform2f(U.uV1, mesh.v1[0], mesh.v1[1]);
			gl.uniform2f(U.uV2, mesh.v2[0], mesh.v2[1]);
			gl.uniform2f(U.uHalf, p.width / 2, p.height / 2);
			gl.uniform1f(U.uHalfStrokePx, p.lineWidth * 0.5);
			gl.uniform3f(U.uStroke, p.strokeRGB[0], p.strokeRGB[1], p.strokeRGB[2]);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.strokeVertexCount, this.inst.count);
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		const gl = this.gl;
		gl.deleteProgram(this.fillProg);
		gl.deleteProgram(this.strokeProg);
		gl.deleteBuffer(this.posBuf);
		gl.deleteBuffer(this.hueBuf);
		gl.deleteBuffer(this.instBuf);
		gl.deleteBuffer(this.strokePosBuf);
		gl.deleteBuffer(this.strokeNormBuf);
		gl.deleteBuffer(this.strokeSideBuf);
		this.mesh = null;
	}
}
