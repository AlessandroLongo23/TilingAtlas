// The polychoron renderer: a uniform 4-polytope drawn as a tiling of the 3-sphere, seen in projection.
//
// Everything 4D happens in the vertex shader. A vertex is sent as a point of R^4, turned by one mat4
// (any rotation of 4-space, so every plane of rotation costs the same), pushed onto the unit 3-sphere,
// and projected into space from a point at distance uPole on the w axis (uPole = 1 is stereographic).
// Faces are subdivided flat on the CPU, so the push onto the sphere is what curves them.
//
// The faces are films and must be transparent whatever their order: a 4D turn reorders hundreds of
// layers every frame, so sorting is not available. Both blends used here commute. On a dark ground a
// film SCREENS over what is behind it (1 - (1 - dst)(1 - src), light that adds and cannot overflow); on
// a light ground it MULTIPLIES it, like stained glass. The edges are opaque ribbons with a disc at each
// vertex, drawn first with depth, and the films are depth-tested against them.
//
// Raw WebGL2 and not three.js, which the spherical shelf uses: that shelf depth-sorts its triangles
// (lib/render/depthSort.ts), and a 4D vertex stage with unsorted blending fits neither of its paths.

import { linkProgram } from "./flatTilingGL";
import { faceHue } from "./sphStar";
import { tileHueRgb01 } from "./tilePalette";
import type { Geometry4, Vec4 } from "./polychora";

const COMMON = `
uniform mat4 uRot;
uniform mat4 uProj;
uniform float uPole;
uniform float uDist;
float scaleAt(vec4 q) { return sqrt(uPole * uPole - 1.0) / (uPole - q.w); }
vec3 toView(vec4 q) { return q.xyz * scaleAt(q) - vec3(0.0, 0.0, uDist); }
`;

const FACE_VERT = `#version 300 es
in vec4 aPos;
in vec3 aCol;
out vec3 vView;
out vec3 vCol;
${COMMON}
void main() {
	vView = toView(normalize(uRot * aPos));
	vCol = aCol;
	gl_Position = uProj * vec4(vView, 1.0);
}
`;

// A film shows most where it is seen edge-on, which is also what gives the cells their shape.
const FACE_FRAG = `#version 300 es
precision highp float;
in vec3 vView;
in vec3 vCol;
uniform float uOpacity;
uniform float uDark;
out vec4 frag;
void main() {
	vec3 n = cross(dFdx(vView), dFdy(vView));
	float len = length(n);
	float facing = len > 0.0 ? abs(dot(n / len, normalize(vView))) : 1.0;
	float rim = pow(1.0 - facing, 2.0);
	float a = min(1.0, uOpacity * (0.4 + 1.6 * rim));
	frag = uDark > 0.5 ? vec4(vCol * a + vec3(0.25 * a * rim), 1.0) : vec4(vec3(1.0) - a * (vec3(1.0) - vCol), 1.0);
}
`;

const EDGE_VERT = `#version 300 es
in vec4 aA;
in vec4 aB;
in vec2 aStrip; // x: position along the edge 0..1, y: side -1 or +1
uniform float uWidth;
uniform float uCap; // 1: aA == aB is a vertex and the strip is the quad of its disc
out vec2 vAcross;
${COMMON}
vec4 along(vec4 a, vec4 b, float t) {
	float w = acos(clamp(dot(a, b), -1.0, 1.0));
	return (sin((1.0 - t) * w) * a + sin(t * w) * b) / sin(w);
}
void main() {
	vec4 a = uRot * aA, b = uRot * aB;
	if (uCap > 0.5) {
		vAcross = vec2(2.0 * aStrip.x - 1.0, aStrip.y);
		gl_Position = uProj * vec4(toView(a) + vec3(vAcross, 0.0) * uWidth * scaleAt(a), 1.0);
		return;
	}
	vec4 q = along(a, b, aStrip.x);
	vec3 p = toView(q);
	vec3 ahead = toView(along(a, b, aStrip.x + 0.01));
	vec3 side = normalize(cross(ahead - p, p));
	vAcross = vec2(0.0, aStrip.y);
	gl_Position = uProj * vec4(p + side * aStrip.y * uWidth * scaleAt(q), 1.0);
}
`;

const EDGE_FRAG = `#version 300 es
precision highp float;
in vec2 vAcross;
uniform float uDark;
out vec4 frag;
void main() {
	float r2 = dot(vAcross, vAcross);
	if (r2 > 1.0) discard;
	float tube = sqrt(1.0 - r2);
	frag = vec4(uDark > 0.5 ? vec3(0.80, 0.83, 0.90) * (0.25 + 0.75 * tube) : vec3(0.06, 0.06, 0.08) + 0.30 * tube * tube, 1.0);
}
`;

// A film is seen through many others, so it carries more colour than an opaque tile does.
const FILM_SAT_PCT = 80;
const dist4 = (a: Vec4, b: Vec4) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]);

/**
 * Triangles for the faces (xyzw + rgb per vertex), the two unit endpoints of every edge, and the vertices.
 * A face is fanned from its centre, a pentagram in winding order so its core is covered twice, and
 * each fan triangle is cut into n² pieces, n set by the arc an edge spans and capped by `budget`.
 */
export function buildPolychoronMesh(g: Geometry4, budget = 300_000) {
	const R = Math.hypot(...g.vertices[0]);
	const U = g.vertices.map((p) => p.map((x) => x / R) as Vec4);
	const arc = 2 * Math.asin(Math.min(1, dist4(U[g.edges[0][0]], U[g.edges[0][1]]) / 2));
	const fans = g.faces.reduce((s, f) => s + (f.length === 3 ? 1 : f.length), 0);
	let n = Math.min(40, Math.max(1, Math.ceil(arc / 0.04)));
	while (n > 1 && fans * n * n > budget) n--;
	const faces = new Float32Array(fans * n * n * 21);
	let o = 0;
	const put = (A: number[], B: number[], C: number[], i: number, j: number, col: number[]) => {
		for (let k = 0; k < 4; k++) faces[o++] = A[k] + ((B[k] - A[k]) * i + (C[k] - A[k]) * j) / n;
		faces[o++] = col[0];
		faces[o++] = col[1];
		faces[o++] = col[2];
	};
	const cut = (A: number[], B: number[], C: number[], col: number[]) => {
		for (let i = 0; i < n; i++)
			for (let j = 0; j < n - i; j++) {
				put(A, B, C, i, j, col);
				put(A, B, C, i + 1, j, col);
				put(A, B, C, i, j + 1, col);
				if (i + j < n - 1) {
					put(A, B, C, i + 1, j, col);
					put(A, B, C, i + 1, j + 1, col);
					put(A, B, C, i, j + 1, col);
				}
			}
	};
	for (const f of g.faces) {
		let chord = Infinity;
		for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) chord = Math.min(chord, dist4(U[f[i]], U[f[j]]));
		const star = dist4(U[f[0]], U[f[1]]) > chord * (1 + 1e-6);
		const col = tileHueRgb01(faceHue(f.length, star ? 2 : 1), FILM_SAT_PCT);
		if (f.length === 3) cut(U[f[0]], U[f[1]], U[f[2]], col);
		else {
			const c = [0, 1, 2, 3].map((k) => f.reduce((s, v) => s + U[v][k], 0) / f.length);
			f.forEach((v, i) => cut(c, U[v], U[f[(i + 1) % f.length]], col));
		}
	}
	const edges = new Float32Array(g.edges.length * 8);
	g.edges.forEach(([a, b], i) => {
		edges.set(U[a], 8 * i);
		edges.set(U[b], 8 * i + 4);
	});
	const segments = Math.max(1, Math.min(32, Math.ceil(arc / 0.05), Math.floor(200_000 / g.edges.length)));
	return { faces, edges, segments, vertices: new Float32Array(U.flat()) };
}

/**
 * The area of all the films on the unit 3-sphere, measured flat. A line of sight crosses films in
 * proportion to it, so it is what a default opacity should follow: the count of faces is not, a
 * pentagram of a star polychoron being many times a pentagon of the 120-cell.
 */
export function filmArea(g: Geometry4): number {
	const R = Math.hypot(...g.vertices[0]);
	let area = 0;
	for (const f of g.faces) {
		const c = [0, 1, 2, 3].map((k) => f.reduce((s, v) => s + g.vertices[v][k], 0) / f.length);
		f.forEach((v, i) => {
			const a = g.vertices[v].map((x, k) => (x - c[k]) / R), b = g.vertices[f[(i + 1) % f.length]].map((x, k) => (x - c[k]) / R);
			const aa = a.reduce((s, x) => s + x * x, 0), bb = b.reduce((s, x) => s + x * x, 0), ab = a.reduce((s, x, k) => s + x * b[k], 0);
			area += Math.sqrt(Math.max(0, aa * bb - ab * ab)) / 2;
		});
	}
	return area;
}

export interface PolychoronView {
	/** A rotation of R^4, row-major. */
	rot: ArrayLike<number>;
	/** Distance of the projection point from the centre of the unit 3-sphere; 1 is stereographic. */
	pole: number;
	opacity: number;
	edgeWidth: number;
	zoom: number;
	/** Backing-store pixels per CSS pixel, as a fraction of the device's; lowered when the films outrun the fill rate. */
	resolution: number;
	showFaces: boolean;
	showEdges: boolean;
	dark: boolean;
}

/** Turn a row-major 4×4 rotation in the plane of axes i and j, applied after what it already holds. */
export function rotatePlane(M: Float32Array, i: number, j: number, angle: number) {
	const c = Math.cos(angle), s = Math.sin(angle);
	for (let k = 0; k < 4; k++) {
		const a = M[4 * i + k], b = M[4 * j + k];
		M[4 * i + k] = c * a - s * b;
		M[4 * j + k] = s * a + c * b;
	}
}

/** Gram–Schmidt on the rows, so a long run of small turns stays a rotation. */
export function orthonormalize(M: Float32Array) {
	for (let i = 0; i < 4; i++) {
		for (let j = 0; j < i; j++) {
			let d = 0;
			for (let k = 0; k < 4; k++) d += M[4 * i + k] * M[4 * j + k];
			for (let k = 0; k < 4; k++) M[4 * i + k] -= d * M[4 * j + k];
		}
		const len = Math.hypot(M[4 * i], M[4 * i + 1], M[4 * i + 2], M[4 * i + 3]);
		for (let k = 0; k < 4; k++) M[4 * i + k] /= len;
	}
}

export class PolychoronRenderer {
	private gl: WebGL2RenderingContext;
	private face: WebGLProgram;
	private edge: WebGLProgram;
	private faceVao: WebGLVertexArrayObject;
	private edgeVao: WebGLVertexArrayObject;
	private capVao: WebGLVertexArrayObject;
	private buffers = { faces: null as WebGLBuffer | null, edges: null as WebGLBuffer | null, strip: null as WebGLBuffer | null, vertices: null as WebGLBuffer | null };
	private counts = { faceVerts: 0, edges: 0, stripVerts: 0, vertices: 0 };

	constructor(canvas: HTMLCanvasElement) {
		const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
		const face = gl && linkProgram(gl, FACE_VERT, FACE_FRAG);
		const edge = gl && linkProgram(gl, EDGE_VERT, EDGE_FRAG);
		if (!gl || !face || !edge) throw new Error("polychoron renderer: WebGL2 is not available");
		this.gl = gl;
		this.face = face;
		this.edge = edge;
		this.faceVao = gl.createVertexArray()!;
		this.edgeVao = gl.createVertexArray()!;
		this.capVao = gl.createVertexArray()!;
		for (const k of ["faces", "edges", "strip", "vertices"] as const) this.buffers[k] = gl.createBuffer();
	}

	setGeometry(g: Geometry4) {
		const { gl } = this;
		const mesh = buildPolychoronMesh(g);
		const attrib = (prog: WebGLProgram, name: string, size: number, stride: number, offset: number, perInstance = false) => {
			const loc = gl.getAttribLocation(prog, name);
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
			gl.vertexAttribDivisor(loc, perInstance ? 1 : 0);
		};
		gl.bindVertexArray(this.faceVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.faces);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.faces, gl.STATIC_DRAW);
		attrib(this.face, "aPos", 4, 7, 0);
		attrib(this.face, "aCol", 3, 7, 4);
		gl.bindVertexArray(this.edgeVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.edges);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.edges, gl.STATIC_DRAW);
		attrib(this.edge, "aA", 4, 8, 0, true);
		attrib(this.edge, "aB", 4, 8, 4, true);
		// The ribbon template, then the four corners of a vertex disc.
		const strip = new Float32Array((mesh.segments + 1) * 4 + 8);
		for (let s = 0; s <= mesh.segments; s++) strip.set([s / mesh.segments, -1, s / mesh.segments, 1], 4 * s);
		strip.set([0, -1, 0, 1, 1, -1, 1, 1], (mesh.segments + 1) * 4);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.strip);
		gl.bufferData(gl.ARRAY_BUFFER, strip, gl.STATIC_DRAW);
		attrib(this.edge, "aStrip", 2, 2, 0);
		gl.bindVertexArray(this.capVao);
		attrib(this.edge, "aStrip", 2, 2, (mesh.segments + 1) * 4);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vertices);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
		attrib(this.edge, "aA", 4, 4, 0, true);
		attrib(this.edge, "aB", 4, 4, 0, true);
		gl.bindVertexArray(null);
		this.counts = { faceVerts: mesh.faces.length / 7, edges: g.edges.length, stripVerts: 2 * (mesh.segments + 1), vertices: g.vertices.length };
	}

	draw(v: PolychoronView) {
		const { gl } = this;
		const canvas = gl.canvas as HTMLCanvasElement;
		const dpr = Math.min(window.devicePixelRatio || 1, 2) * v.resolution;
		const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		gl.viewport(0, 0, w, h);
		const bg = v.dark ? [0.035, 0.04, 0.065] : [0.97, 0.965, 0.95];
		gl.clearColor(bg[0], bg[1], bg[2], 1);
		gl.depthMask(true);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		// The projected sphere has radius 1; the camera sits where it just fits at zoom 1.
		const half = Math.PI / 12, dist = 1.2 / Math.sin(half) / v.zoom, near = 0.05, far = dist + 4;
		const fy = (1 / Math.tan(half)) * Math.min(1, w / h), fx = (fy * h) / w;
		const proj = [fx, 0, 0, 0, 0, fy, 0, 0, 0, 0, (far + near) / (near - far), (2 * far * near) / (near - far), 0, 0, -1, 0];
		const common = (prog: WebGLProgram) => {
			gl.useProgram(prog);
			gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uRot"), true, v.rot as Float32Array);
			gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uProj"), true, proj);
			gl.uniform1f(gl.getUniformLocation(prog, "uPole"), v.pole);
			gl.uniform1f(gl.getUniformLocation(prog, "uDist"), dist);
			gl.uniform1f(gl.getUniformLocation(prog, "uDark"), v.dark ? 1 : 0);
		};
		gl.enable(gl.DEPTH_TEST);
		if (v.showEdges && this.counts.edges) {
			gl.disable(gl.BLEND);
			common(this.edge);
			gl.uniform1f(gl.getUniformLocation(this.edge, "uWidth"), v.edgeWidth);
			gl.uniform1f(gl.getUniformLocation(this.edge, "uCap"), 0);
			gl.bindVertexArray(this.edgeVao);
			gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, this.counts.stripVerts, this.counts.edges);
			gl.uniform1f(gl.getUniformLocation(this.edge, "uCap"), 1);
			gl.bindVertexArray(this.capVao);
			gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.counts.vertices);
		}
		if (v.showFaces && this.counts.faceVerts) {
			gl.enable(gl.BLEND);
			if (v.dark) gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ONE);
			else gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
			gl.depthMask(false);
			common(this.face);
			gl.uniform1f(gl.getUniformLocation(this.face, "uOpacity"), v.opacity);
			gl.bindVertexArray(this.faceVao);
			gl.drawArrays(gl.TRIANGLES, 0, this.counts.faceVerts);
			gl.depthMask(true);
		}
		gl.bindVertexArray(null);
	}

	dispose() {
		const { gl } = this;
		for (const b of Object.values(this.buffers)) gl.deleteBuffer(b);
		gl.deleteVertexArray(this.faceVao);
		gl.deleteVertexArray(this.edgeVao);
		gl.deleteVertexArray(this.capVao);
		gl.deleteProgram(this.face);
		gl.deleteProgram(this.edge);
	}
}
