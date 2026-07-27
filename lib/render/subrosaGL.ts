// Batched WebGL2 renderer for the Sub Rosa substitution patches (app/(app)/substitutions).
//
// Unlike FlatCellRenderer (periodic, instanced: one cell mesh × a lattice of offsets), a Sub Rosa
// patch is APERIODIC — the tiles never repeat — so there is nothing to instance. We triangulate the
// whole patch ONCE into a single vertex buffer and draw it in one glDrawArrays. Pan/zoom is then just
// three uniforms (scale, origin) read in the vertex shader: the geometry never re-tessellates, so a
// drag or a wheel is "change a uniform, redraw" and stays at frame rate even at ~1M tiles.
//
// The view model is the one the substitutions client already uses: top-left CSS-px origin, y-down,
// screen = (ox + scale·x, oy − scale·y). The shader reproduces exactly that map, so the existing
// pan/zoom handlers are untouched.
//
// Tile outlines are a single-pass barycentric wireframe (Celes/NVIDIA trick): each vertex carries a
// vec3 whose channels are the triangle's barycentric coords, with the internal-diagonal channel
// pinned to 1 so it never strokes. The fragment darkens toward the stroke colour within uStrokePx of
// the nearest REAL edge, anti-aliased via fwidth — no separate stroke geometry.

import type { Vector } from "@/classes/Vector";

const FILL_VERT = `#version 300 es
in vec2 aPos;
in float aHue;
in vec3 aEdge;
uniform float uScale;
uniform vec2 uOrigin;  // ox, oy in CSS px (top-left origin, y down)
uniform vec2 uHalf;    // canvas CSS half-size (w/2, h/2)
out float vHue;
out vec3 vEdge;
void main() {
	// Transcribes the client's tx(): screen = (ox + scale·x, oy − scale·y). Then CSS px → clip.
	float sx = uOrigin.x + uScale * aPos.x;
	float sy = uOrigin.y - uScale * aPos.y;
	gl_Position = vec4(sx / uHalf.x - 1.0, 1.0 - sy / uHalf.y, 0.0, 1.0);
	vHue = aHue;
	vEdge = aEdge;
}
`;

const FILL_FRAG = `#version 300 es
precision highp float;
in float vHue;
in vec3 vEdge;
uniform float uLight;    // HSL lightness 0..100 (theme-dependent), to match the 2D path's hsl(h 58% L%)
uniform float uStrokePx; // outline half-width in CSS px; 0 disables the outline
uniform vec4 uStroke;    // outline colour, rgb 0..1 + alpha
out vec4 frag;
// Compact CSS hsl()→rgb (the spec's modulo form), s fixed at 0.58 to match the 2D renderer.
vec3 hsl2rgb(float h, float s, float l) {
	float a = s * min(l, 1.0 - l);
	vec3 k = mod(vec3(0.0, 8.0, 4.0) + h / 30.0, 12.0);
	return l - a * clamp(min(min(k - 3.0, 9.0 - k), 1.0), -1.0, 1.0);
}
void main() {
	vec3 base = hsl2rgb(vHue, 0.58, uLight * 0.01);
	if (uStrokePx > 0.0) {
		float d = min(min(vEdge.x, vEdge.y), vEdge.z); // distance (barycentric) to nearest REAL edge
		float aa = fwidth(d);
		float e = 1.0 - smoothstep(0.0, uStrokePx * aa, d);
		base = mix(base, uStroke.rgb, e * uStroke.a);
	}
	frag = vec4(base, 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
	const sh = gl.createShader(type);
	if (!sh) return null;
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		console.error("subrosa shader compile failed:", gl.getShaderInfoLog(sh));
		gl.deleteShader(sh);
		return null;
	}
	return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
	const v = compile(gl, gl.VERTEX_SHADER, vs);
	const f = compile(gl, gl.FRAGMENT_SHADER, fs);
	if (!v || !f) return null;
	const prog = gl.createProgram();
	gl.attachShader(prog, v);
	gl.attachShader(prog, f);
	gl.linkProgram(prog);
	gl.deleteShader(v);
	gl.deleteShader(f);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
		console.error("subrosa program link failed:", gl.getProgramInfoLog(prog));
		gl.deleteProgram(prog);
		return null;
	}
	return prog;
}

// The two triangles' per-vertex barycentric edge attributes for one rhombus (c0,c1,c2,c3), split on
// the diagonal c0–c2. The channel that would vanish on that diagonal is pinned to 1 at every vertex so
// the internal edge is never stroked; the other two channels carry the real barycentric coords.
// tri A = (c0,c1,c2): diagonal c2c0 is opposite c1 ⇒ pin channel 1.
// tri B = (c0,c2,c3): diagonal c0c2 is opposite c3 ⇒ pin channel 2 (the c3 channel here).
const EDGE_A = [
	[1, 1, 0], // c0
	[0, 1, 0], // c1
	[0, 1, 1], // c2
];
const EDGE_B = [
	[1, 0, 1], // c0
	[0, 1, 1], // c2
	[0, 0, 1], // c3
];

export interface SubRosaTile {
	protoId: number;
	corners: Vector[]; // 4 world corners
}

export interface SubRosaDrawParams {
	widthCss: number;
	heightCss: number;
	scale: number;
	ox: number;
	oy: number;
	light: number; // HSL lightness 0..100
	strokePx: number; // 0 disables outlines
	strokeRGBA: [number, number, number, number];
	clearRGBA?: [number, number, number, number]; // default transparent
}

// Retained-mode: uploadTiles() once per tile set, then draw() every frame with fresh view uniforms.
export class SubRosaGL {
	private gl: WebGL2RenderingContext;
	private prog: WebGLProgram;
	private posBuf: WebGLBuffer;
	private hueBuf: WebGLBuffer;
	private edgeBuf: WebGLBuffer;
	private vao: WebGLVertexArrayObject;
	private u: Record<string, WebGLUniformLocation | null> = {};
	private vertexCount = 0;
	private disposed = false;

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		const prog = link(gl, FILL_VERT, FILL_FRAG);
		if (!prog) throw new Error("subrosa renderer: shader compile/link failed");
		this.prog = prog;
		for (const name of ["uScale", "uOrigin", "uHalf", "uLight", "uStrokePx", "uStroke"]) {
			this.u[name] = gl.getUniformLocation(prog, name);
		}
		const aPos = gl.getAttribLocation(prog, "aPos");
		const aHue = gl.getAttribLocation(prog, "aHue");
		const aEdge = gl.getAttribLocation(prog, "aEdge");

		this.posBuf = gl.createBuffer();
		this.hueBuf = gl.createBuffer();
		this.edgeBuf = gl.createBuffer();
		this.vao = gl.createVertexArray();

		// Bake attribute layout into a VAO so each draw is bind-VAO + one drawArrays.
		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.hueBuf);
		gl.enableVertexAttribArray(aHue);
		gl.vertexAttribPointer(aHue, 1, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuf);
		gl.enableVertexAttribArray(aEdge);
		// Edge channels are 0/1, so a normalized unsigned byte (255→1.0) is exact and 1/4 the memory
		// of a float — meaningful at ~1M tiles.
		gl.vertexAttribPointer(aEdge, 3, gl.UNSIGNED_BYTE, true, 0, 0);
		gl.bindVertexArray(null);
	}

	// Triangulate the patch into one flat buffer. hueOf maps a tile's protoId to its HSL hue (degrees).
	uploadTiles(tiles: SubRosaTile[], hueOf: (protoId: number) => number): void {
		const gl = this.gl;
		const n = tiles.length;
		const pos = new Float32Array(n * 12); // 6 verts × 2
		const hue = new Float32Array(n * 6);
		const edge = new Uint8Array(n * 18); // 6 verts × 3, normalized (255 → 1.0)
		let pi = 0, hi = 0, ei = 0;
		for (const t of tiles) {
			const c = t.corners;
			const h = hueOf(t.protoId);
			// Two triangles: (c0,c1,c2) then (c0,c2,c3). Guard against a non-quad defensively.
			const triA = [c[0], c[1], c[2]];
			const triB = [c[0], c[2], c[3 % c.length]];
			for (let k = 0; k < 3; k++) {
				pos[pi++] = triA[k].x; pos[pi++] = triA[k].y;
				hue[hi++] = h;
				edge[ei++] = EDGE_A[k][0] * 255; edge[ei++] = EDGE_A[k][1] * 255; edge[ei++] = EDGE_A[k][2] * 255;
			}
			for (let k = 0; k < 3; k++) {
				pos[pi++] = triB[k].x; pos[pi++] = triB[k].y;
				hue[hi++] = h;
				edge[ei++] = EDGE_B[k][0] * 255; edge[ei++] = EDGE_B[k][1] * 255; edge[ei++] = EDGE_B[k][2] * 255;
			}
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
		gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.hueBuf);
		gl.bufferData(gl.ARRAY_BUFFER, hue, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuf);
		gl.bufferData(gl.ARRAY_BUFFER, edge, gl.STATIC_DRAW);
		this.vertexCount = n * 6;
	}

	// One frame. The caller owns the canvas backing-store size; we set the viewport from device px.
	draw(p: SubRosaDrawParams, dpr: number): void {
		const gl = this.gl;
		if (this.disposed || p.widthCss <= 0 || p.heightCss <= 0) return;
		gl.viewport(0, 0, Math.round(p.widthCss * dpr), Math.round(p.heightCss * dpr));
		const [cr, cg, cb, ca] = p.clearRGBA ?? [0, 0, 0, 0];
		gl.clearColor(cr, cg, cb, ca);
		gl.clear(gl.COLOR_BUFFER_BIT);
		if (this.vertexCount === 0) return;

		gl.useProgram(this.prog);
		gl.bindVertexArray(this.vao);
		gl.uniform1f(this.u.uScale, p.scale);
		gl.uniform2f(this.u.uOrigin, p.ox, p.oy);
		gl.uniform2f(this.u.uHalf, p.widthCss / 2, p.heightCss / 2);
		gl.uniform1f(this.u.uLight, p.light);
		gl.uniform1f(this.u.uStrokePx, p.strokePx);
		gl.uniform4f(this.u.uStroke, p.strokeRGBA[0], p.strokeRGBA[1], p.strokeRGBA[2], p.strokeRGBA[3]);
		gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
		gl.bindVertexArray(null);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		const gl = this.gl;
		gl.deleteProgram(this.prog);
		gl.deleteBuffer(this.posBuf);
		gl.deleteBuffer(this.hueBuf);
		gl.deleteBuffer(this.edgeBuf);
		gl.deleteVertexArray(this.vao);
	}
}
