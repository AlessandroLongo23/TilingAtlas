// Per-pixel WebGL2 renderer for a developed hyperbolic tiling. For each disk pixel it maps to a world
// point (inverse view) and REDUCES it into the CERTIFIED Dirichlet fundamental domain with the complete
// side-pairing generators (lib/render/hyperbolicDirichlet.ts). With a complete side-pairing set the
// greedy loop provably terminates inside the domain (Voight 2009 Prop. 4.4) — the "stuck outside the
// field" holes of the old heuristic generator set cannot occur. It then samples the TOTAL fundamental
// field: tile side count nearest-texel (von Gagern: linear filtering across a domain boundary blends
// far-apart sources), edge distance manually-bilinear (smooth strokes). Robust for any tiling the
// certificate accepts — regular, mixed, k-uniform alike — and fills the disk to the rim.

import type { Su11 } from "@/lib/render/hyperbolic";
import { EDGE_SCALE, type ShaderTiling } from "@/lib/render/hyperbolicReduce";

const MAX_GENS = 128; // uniform array bound; side pairings ∪ inverses (measured ≤ ~48 across the atlas)

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uCenter;      // disk centre, device px (y up, WebGL convention)
uniform float uR;          // disk radius, device px
uniform vec4 uView;        // view SU(1,1): a = uView.xy, b = uView.zw
uniform vec4 uGens[${MAX_GENS}];
uniform int uNumGens;
uniform sampler2D uField;
uniform float uRTex;       // field half-extent (covers the Dirichlet domain + collar)
uniform float uRIn;        // domain inradius: |w| below this ⇒ inside, reduction can stop
uniform float uRes;        // field resolution (texels per side)
uniform vec3 uBg;          // disk background (theme)
uniform vec3 uStroke;      // stroke colour
uniform float uHueOffset;  // global hue rotation (deg)
uniform float uStrokePx;   // stroke width, device px
uniform float uShowFill;   // 1 fill by tile, 0 flat background
uniform float uTaper;      // 1 taper the stroke toward the rim
out vec4 frag;

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { float d = dot(b, b); return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d; }
vec2 cconj(vec2 a) { return vec2(a.x, -a.y); }
// SU(1,1) action z -> (a z + b)/(conj(b) z + conj(a))
vec2 su11(vec2 a, vec2 b, vec2 z) { return cdiv(cmul(a, z) + b, cmul(cconj(b), z) + cconj(a)); }

vec3 hsb2rgb(float h, float s, float v) {
	vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}

void main() {
	vec2 z = (gl_FragCoord.xy - uCenter) / uR;
	float r2 = dot(z, z);
	if (r2 >= 1.0) { frag = vec4(0.0); return; } // outside the disk: transparent

	// world point under the view
	vec2 va = uView.xy, vb = uView.zw;
	vec2 w = su11(cconj(va), -vb, z); // inverse view: a -> conj(a), b -> -b

	// Dirichlet reduction over the COMPLETE side pairings. Exit on "no generator improves" — with a
	// complete set that IS membership in the closed domain (Voight 2009), not a stuck local minimum.
	// Alongside w we accumulate the INVERSE fold word Minv ∈ SU(1,1): it transports the baked tile
	// barycenter back to world space for the per-tile depth shade.
	vec2 ma = vec2(1.0, 0.0), mb = vec2(0.0, 0.0);
	for (int it = 0; it < 96; it++) {
		float wr2 = dot(w, w);
		if (wr2 <= uRIn * uRIn) break;
		float bestR2 = wr2 - 1e-9;
		vec2 best = w;
		int bestG = -1;
		for (int g = 0; g < ${MAX_GENS}; g++) {
			if (g >= uNumGens) break;
			vec2 q = su11(uGens[g].xy, uGens[g].zw, w);
			float qr2 = dot(q, q);
			if (qr2 < bestR2) { bestR2 = qr2; best = q; bestG = g; }
		}
		if (bestG < 0) break; // inside the closed domain
		w = best;
		// Minv <- Minv ∘ g⁻¹, with g⁻¹ = (conj(ga), −gb)
		vec2 ga = uGens[bestG].xy, gb = uGens[bestG].zw;
		vec2 na = cmul(ma, cconj(ga)) - cmul(mb, cconj(gb));
		vec2 nb = cmul(mb, ga) - cmul(ma, gb);
		ma = na; mb = nb;
	}
	// unconverged sub-pixel rim residue (iteration cap): re-aim to a valid interior sample — a
	// plausible tile colour in the same direction, NEVER the background (no black holes, ever).
	bool reaimed = false;
	if (dot(w, w) > uRTex * uRTex) { w = normalize(w) * uRIn * 0.9; reaimed = true; }

	// field sampling: side count from the NEAREST texel (id must not interpolate across tile borders),
	// edge distance manually bilinear from the same four texels (smooth strokes).
	vec2 st = clamp((w / uRTex) * 0.5 + 0.5, 0.0, 1.0) * uRes - 0.5;
	vec2 i0 = floor(st);
	vec2 fr = st - i0;
	ivec2 p00 = ivec2(clamp(i0, vec2(0.0), vec2(uRes - 1.0)));
	ivec2 p11 = ivec2(clamp(i0 + 1.0, vec2(0.0), vec2(uRes - 1.0)));
	vec4 f00 = texelFetch(uField, p00, 0);
	vec4 f10 = texelFetch(uField, ivec2(p11.x, p00.y), 0);
	vec4 f01 = texelFetch(uField, ivec2(p00.x, p11.y), 0);
	vec4 f11 = texelFetch(uField, p11, 0);
	vec4 fn = fr.x < 0.5 ? (fr.y < 0.5 ? f00 : f01) : (fr.y < 0.5 ? f10 : f11);
	float sides = floor(fn.r * 255.0 + 0.5);
	float distByte = mix(mix(f00.g, f10.g, fr.x), mix(f01.g, f11.g, fr.x), fr.y);

	// PER-TILE depth: transport the baked tile barycenter through the inverse fold word to world
	// space, project to screen, and shade the whole tile by ITS radius — one flat shade per tile
	// (byte-matched to the 2D developed-draw / euclidean / spherical fill convention). The barycenter
	// is the Minkowski mean (equivariant), so pixels folding through different words agree exactly.
	float dep;
	if (reaimed) {
		dep = 1.0; // sub-pixel rim residue: the correct limit shade
	} else {
		vec2 cFund = vec2(fn.b, fn.a) * 2.0 - 1.0;
		vec2 cWorld = su11(ma, mb, cFund);
		vec2 cScreen = su11(va, vb, cWorld);
		dep = min(length(cScreen), 1.0);
	}
	float dim = 1.0 - 0.5 * dep * dep;
	vec3 fill = uShowFill > 0.5 ? hsb2rgb(mod(sides * 47.0 + uHueOffset, 360.0) / 360.0, 0.40, 1.0) * dim : uBg;

	// stroke: the stored edge distance is HYPERBOLIC (isometry-invariant), so "inside the stroke" =
	// hypEdge ≤ h with h a constant hyperbolic half-width — an equidistant band around each geodesic.
	// Both sides convert to screen px via the local conformal factor: px = hyp · (1−r²) · uR/2.
	// h is calibrated so the band reads uStrokePx device px at the disk centre (h = uStrokePx/uR),
	// giving halfW = uStrokePx·0.5·(1−r²): the EXACT metric thinning toward the rim (perspective
	// mode). Flat mode keeps a constant screen width instead.
	float hypEdge = distByte * 255.0 / ${EDGE_SCALE}.0;
	float edgePx = hypEdge * (1.0 - r2) * uR * 0.5;
	float halfW = uStrokePx * 0.5 * (uTaper > 0.5 ? (1.0 - r2) : 1.0);
	float strokeAmt = 1.0 - smoothstep(halfW - 1.0, halfW + 1.0, edgePx);
	frag = vec4(mix(fill, uStroke, strokeAmt), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
	const s = gl.createShader(type);
	if (!s) return null;
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
		console.error("hyperbolic per-pixel shader compile failed:", gl.getShaderInfoLog(s));
		gl.deleteShader(s);
		return null;
	}
	return s;
}

export interface PerPixelDrawParams {
	view: Su11;
	R: number; // disk radius, device px
	cx: number; // disk centre x, device px
	cy: number; // disk centre y, device px (top-down; converted to WebGL y-up internally)
	canvasH: number; // backing height, device px (for the y flip)
	dark: boolean;
	showFill: boolean;
	hueOffset: number;
	strokePx: number;
	taper: boolean;
}

export class HyperbolicPerPixelRenderer {
	private gl: WebGL2RenderingContext;
	private prog: WebGLProgram;
	private quad: WebGLBuffer;
	private tex: WebGLTexture;
	private u: Record<string, WebGLUniformLocation | null> = {};
	private aPos: number;
	private numGens = 0;
	private disposed = false;

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		const vs = compile(gl, gl.VERTEX_SHADER, VERT);
		const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
		if (!vs || !fs) throw new Error("hyperbolic per-pixel renderer: shader compile failed");
		const prog = gl.createProgram();
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			const log = gl.getProgramInfoLog(prog);
			gl.deleteProgram(prog);
			throw new Error("hyperbolic per-pixel renderer: link failed: " + log);
		}
		this.prog = prog;
		for (const n of [
			"uCenter", "uR", "uView", "uGens", "uNumGens", "uField", "uRTex", "uRIn", "uRes", "uBg",
			"uStroke", "uHueOffset", "uStrokePx", "uShowFill", "uTaper",
		]) {
			this.u[n] = gl.getUniformLocation(prog, n);
		}
		this.aPos = gl.getAttribLocation(prog, "aPos");
		this.quad = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one big triangle
		this.tex = gl.createTexture();
	}

	/** Upload a prepared tiling: certified side-pairing generators + the total fundamental field. */
	setTiling(t: ShaderTiling): void {
		const gl = this.gl;
		if (t.gens.length / 4 > MAX_GENS) {
			console.error(`hyperbolic per-pixel renderer: ${t.gens.length / 4} generators exceed MAX_GENS=${MAX_GENS}`);
		}
		this.numGens = Math.min(t.gens.length / 4, MAX_GENS);
		gl.useProgram(this.prog);
		gl.uniform4fv(this.u.uGens, t.gens.subarray(0, this.numGens * 4));
		gl.uniform1i(this.u.uNumGens, this.numGens);
		gl.uniform1f(this.u.uRTex, t.field.rTex);
		gl.uniform1f(this.u.uRIn, t.rInEu);
		gl.uniform1f(this.u.uRes, t.field.res);
		gl.bindTexture(gl.TEXTURE_2D, this.tex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.field.res, t.field.res, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.field.data);
		// NEAREST: the shader samples via texelFetch (nearest id + manual bilinear distance).
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	draw(p: PerPixelDrawParams): void {
		const gl = this.gl;
		if (this.numGens === 0) return;
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.useProgram(this.prog);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.uniform2f(this.u.uCenter, p.cx, p.canvasH - p.cy); // WebGL y is bottom-up
		gl.uniform1f(this.u.uR, p.R);
		gl.uniform4f(this.u.uView, p.view.a.x, p.view.a.y, p.view.b.x, p.view.b.y);
		const bg = p.dark ? [0x14 / 255, 0x11 / 255, 0x0d / 255] : [0xfa / 255, 0xf8 / 255, 0xf5 / 255];
		const stroke = p.dark ? [0, 0, 0] : [0x11 / 255, 0x11 / 255, 0x11 / 255];
		gl.uniform3f(this.u.uBg, bg[0], bg[1], bg[2]);
		gl.uniform3f(this.u.uStroke, stroke[0], stroke[1], stroke[2]);
		gl.uniform1f(this.u.uHueOffset, p.hueOffset);
		gl.uniform1f(this.u.uStrokePx, Math.max(p.strokePx, 0.5));
		gl.uniform1f(this.u.uShowFill, p.showFill ? 1 : 0);
		gl.uniform1f(this.u.uTaper, p.taper ? 1 : 0);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.tex);
		gl.uniform1i(this.u.uField, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.enableVertexAttribArray(this.aPos);
		gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		const gl = this.gl;
		gl.deleteProgram(this.prog);
		gl.deleteBuffer(this.quad);
		gl.deleteTexture(this.tex);
	}
}
