// Per-pixel WebGL2 renderer for the binary family (lib/tilings/binary.ts). Each disk pixel goes to the
// camera's anchor frame and finds its tile there: in the horocyclic geometry by reading its row and
// column off its half-plane coordinates, in the geodesic one by walking from Voronoi cell to Voronoi
// cell. Either way it ends in its tile's frame, where the dual's edges are the rays from 0 to the
// neighbours' centres, so the dual face is the sector the pixel falls in. Strokes are hyperbolic
// distances converted to device px, with the taper of the other disks (hyperbolicPerPixelGL.ts).

import type { Su11 } from "@/lib/render/hyperbolic";
import { COMPLEX_GLSL } from "@/lib/render/materials";
import { linkProgram } from "@/lib/render/flatTilingGL";
import { TILE_PALETTE_GLSL, TILE_SAT } from "@/lib/render/tilePalette";
import { REG_DIRS, REG_EDGE, REG_MAPS, ROWS, ancestryRows, type BinaryAnchor } from "@/lib/tilings/binary";

/** The first child's hue; the others share out the ring. */
export const BINARY_HUE0 = 205;
/** The children of odd rows take this share of the saturation, so a tile never matches its parent. */
export const BINARY_ODD_SAT = 0.55;
const MAX_N = 8;

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uCenter;     // disk centre, device px (y up)
uniform float uR;         // disk radius, device px
uniform vec4 uView;       // anchor frame -> screen, SU(1,1): a = xy, b = zw
uniform float uN;         // children per tile
uniform int uGeodesic;    // 1: the geodesic geometry (n = 2)
uniform vec4 uDig[${ROWS / 4}];   // the anchor's ancestry: digit m at [m / 4][m % 4]
uniform vec4 uFrac[${ROWS / 4}];  // F(m): row m's tiles start at x = (k - F(m))·n^m in the anchor's half-plane
uniform int uLevel;       // the anchor row's level
uniform vec2 uDir[10];    // geodesic: unit directions to the five neighbours, child index j at 5j
uniform vec4 uM[12];      // geodesic: side maps (binary.ts REG_MAPS)
uniform vec3 uReg;        // geodesic: cosh L - 1, sinh L, 2 sinh(L/2)
uniform int uFillDual;    // 1: fill by the dual's faces
uniform float uTileStroke; // device px, 0 = none
uniform float uDualStroke;
uniform vec3 uStroke;
uniform vec3 uDualInk;
uniform float uSat;
out vec4 frag;

${COMPLEX_GLSL}
${TILE_PALETTE_GLSL}

vec2 su11(vec2 a, vec2 b, vec2 z) { return cdiv(cmul(a, z) + b, cmul(cconj(b), z) + cconj(a)); }
vec3 hyp(vec2 w) { float r2 = dot(w, w); return vec3(2.0 * w, 1.0 + r2) / (1.0 - r2); }
vec2 fromHalf(vec2 z) { return cdiv(vec2(z.x, z.y - 1.0), vec2(z.x, z.y + 1.0)); }
float dig(int m) { return m < 0 || m >= ${ROWS} ? 0.0 : uDig[m >> 2][m & 3]; }
float frc(int m) { return m < 0 || m >= ${ROWS} ? 0.0 : uFrac[m >> 2][m & 3]; }
// distance from X (hyperboloid) to the geodesic ray leaving the frame's origin along the unit u
float rayDist(vec3 X, vec2 u) { return dot(X.xy, u) > 0.0 ? asinh(abs(X.y * u.x - X.x * u.y)) : acosh(max(X.z, 1.0)); }
vec3 tileCol(int j, int odd) {
	return tileFillAt(${BINARY_HUE0.toFixed(1)} + 360.0 * float(j) / uN, uSat * (odd == 1 ? ${BINARY_ODD_SAT} : 1.0));
}
// From a tile's centre towards neighbour s, counter-clockwise from the parent: parent, left sibling,
// children left to right, right sibling. Horocyclic: the neighbour's centre, from its place in the box.
vec2 towards(int s, int j) {
	if (uGeodesic == 1) return uDir[j * 5 + s];
	int N = int(uN + 0.5);
	float sn = sqrt(uN);
	vec2 c = s == 0 ? vec2(0.5 * uN - float(j), uN * sn)
		: s == 1 ? vec2(-0.5, sn)
		: s == N + 2 ? vec2(1.5, sn)
		: vec2((float(s - 2) + 0.5) / uN, 1.0 / sn);
	return normalize(fromHalf(vec2(c.x - 0.5, c.y) / sn));
}

void main() {
	vec2 z = (gl_FragCoord.xy - uCenter) / uR;
	float r2 = dot(z, z);
	if (r2 >= 1.0) { frag = vec4(0.0); return; }
	vec2 w = su11(cconj(uView.xy), -uView.zw, z); // the inverse view: the pixel in the anchor's frame
	int N = int(uN + 0.5);

	int cnt, j, lev;
	vec2 wt;     // the pixel in its tile's frame
	float dTile; // hyperbolic distance to the tile's boundary
	bool lost = false;
	if (uGeodesic == 0) {
		float sn = sqrt(uN), lnN = log(uN);
		float d = (1.0 - w.x) * (1.0 - w.x) + w.y * w.y;
		vec2 h = vec2(0.5 - 2.0 * sn * w.y / d, sn * (1.0 - dot(w, w)) / d); // the anchor's half-plane
		lost = !(h.y > 0.0);
		float m = floor(log(h.y) / lnN), s = exp(m * lnN);
		if (h.y < s) { m -= 1.0; s /= uN; } else if (h.y >= s * uN) { m += 1.0; s *= uN; }
		lev = int(m);
		float ux = h.x / s + frc(lev), k = floor(ux);
		vec2 t = vec2(ux - k, h.y / s); // the tile's own box, [0, 1] x [1, n]
		j = imod(k + dig(lev), uN);
		dTile = min(log(min(t.y, uN / t.y)), asinh(min(t.x, 1.0 - t.x) / t.y));
		wt = fromHalf(vec2(t.x - 0.5, t.y) / sn);
		cnt = N + 3;
	} else {
		// walk to the dual vertex nearest the pixel, one neighbour at a time (binary.ts regWalk)
		int m = 0, k = 0;
		vec2 p = w;
		lost = true;
		for (int it = 0; it < 96; it++) {
			int jj = (k + int(dig(m))) & 1;
			vec3 X = hyp(p);
			float best = 0.0;
			int bs = -1;
			for (int s = 0; s < 5; s++) {
				float ps = uReg.y * dot(uDir[jj * 5 + s], X.xy) - uReg.x * X.z;
				if (ps > best) { best = ps; bs = s; }
			}
			if (bs < 0) { lost = false; break; }
			if (bs == 0) { k = (k + int(dig(m))) >> 1; m += 1; }
			else if (bs == 1 || bs == 4) k += bs == 1 ? -1 : 1;
			else { k = 2 * k + (bs - 2) - int(dig(m - 1)); m -= 1; }
			vec4 M = bs == 0 ? uM[8 + 2 * jj + ((k + int(dig(m))) & 1)] : uM[2 * (bs - 1) + jj];
			p = su11(M.xy, M.zw, p);
		}
		j = (k + int(dig(m))) & 1;
		lev = m;
		wt = p;
		cnt = 5;
		vec3 X = hyp(p);
		dTile = 1e9;
		for (int s = 0; s < 5; s++)
			dTile = min(dTile, asinh(max(uReg.x * X.z - uReg.y * dot(uDir[j * 5 + s], X.xy), 0.0) / uReg.z));
	}

	// The dual face: the wedge between neighbours sec and sec + 1 that holds the pixel. Every wedge is
	// under π, so two cross products decide it. Not atan: one GPU here returns 0, not π, for atan(-0, -1),
	// which is exactly the middle child's direction when n is odd.
	int sec = cnt - 1;
	vec2 ua = towards(0, j), ub;
	for (int s = 0; s < ${MAX_N + 3}; s++) {
		if (s >= cnt) break;
		ub = towards(s + 1 == cnt ? 0 : s + 1, j);
		if (ua.x * wt.y - ua.y * wt.x >= 0.0 && wt.x * ub.y - wt.y * ub.x > 0.0) { sec = s; break; }
		ua = ub;
	}
	vec3 Xt = hyp(wt);
	float dDual = min(rayDist(Xt, towards(sec, j)), rayDist(Xt, towards(sec + 1 == cnt ? 0 : sec + 1, j)));
	// a corner where a line goes on (4) or ends (3); binary.ts sectorSides
	int sides = sec == 0 ? (j == 0 ? 4 : 3) : sec == cnt - 1 ? (j == N - 1 ? 4 : 3) : (sec == 1 || sec == cnt - 2) ? 4 : 3;

	int odd = (lev + uLevel) & 1;
	vec3 col = uFillDual == 1 ? tileFillAt(polygonHue(float(sides)), uSat) : tileCol(j, odd);
	float px = (1.0 - r2) * uR * 0.5; // device px per hyperbolic unit here
	float taper = 1.5 * (1.0 - r2);   // half-width per px of stroke: the other disks' 3x, thinning with the metric
	float hD = uDualStroke * taper, hT = uTileStroke * taper;
	if (uDualStroke > 0.01) col = mix(col, uDualInk, 1.0 - smoothstep(hD - 1.0, hD + 1.0, dDual * px));
	if (uTileStroke > 0.01) col = mix(col, uStroke, 1.0 - smoothstep(hT - 1.0, hT + 1.0, dTile * px));

	// Near the rim a pixel covers many tiles: fade to their average before the colours alias.
	float fade = lost ? 1.0 : smoothstep(0.15, 0.5, 1.0 / px);
	if (fade > 0.0) {
		vec3 avg = vec3(0.0);
		if (uFillDual == 1) avg = 0.5 * (tileFillAt(polygonHue(3.0), uSat) + tileFillAt(polygonHue(4.0), uSat));
		else {
			for (int i = 0; i < ${MAX_N}; i++) {
				if (i >= N) break;
				avg += tileCol(i, 0) + tileCol(i, 1);
			}
			avg /= 2.0 * uN;
		}
		col = lost ? avg : mix(col, avg, fade); // a lost pixel's colour may be NaN, which mix would keep
	}
	frag = vec4(col, 1.0);
}`;

export interface BinaryDrawParams {
	/** The camera's view: the anchor tile's frame → the screen disk. */
	view: Su11;
	anchor: BinaryAnchor;
	geodesic: boolean;
	/** Disk radius and centre in device px (y down), and the canvas height. */
	R: number;
	cx: number;
	cy: number;
	canvasH: number;
	fillDual: boolean;
	/** Stroke widths in device px, at the disk centre; 0 = none. */
	tileStrokePx: number;
	dualStrokePx: number;
	dark: boolean;
}

export class BinaryTilingRenderer {
	private prog: WebGLProgram;
	private quad: WebGLBuffer;
	private u: Record<string, WebGLUniformLocation | null> = {};

	constructor(private gl: WebGL2RenderingContext) {
		const prog = linkProgram(gl, VERT, FRAG);
		if (!prog) throw new Error("binary tiling renderer: shader failed");
		this.prog = prog;
		for (const n of ["uCenter", "uR", "uView", "uN", "uGeodesic", "uDig", "uFrac", "uLevel", "uDir", "uM", "uReg"])
			this.u[n] = gl.getUniformLocation(prog, n);
		for (const n of ["uFillDual", "uTileStroke", "uDualStroke", "uStroke", "uDualInk", "uSat"])
			this.u[n] = gl.getUniformLocation(prog, n);
		this.quad = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		// the geodesic tables never change
		gl.useProgram(prog);
		gl.uniform2fv(
			this.u.uDir,
			REG_DIRS.flatMap((d) => d.flatMap((t) => [Math.cos(t), Math.sin(t)])),
		);
		gl.uniform4fv(
			this.u.uM,
			REG_MAPS.flatMap((m) => [m.a.x, m.a.y, m.b.x, m.b.y]),
		);
		gl.uniform3f(this.u.uReg, Math.cosh(REG_EDGE) - 1, Math.sinh(REG_EDGE), 2 * Math.sinh(REG_EDGE / 2));
	}

	draw(p: BinaryDrawParams): void {
		const gl = this.gl;
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(this.prog);
		const { digits, frac } = ancestryRows(p.anchor);
		gl.uniform2f(this.u.uCenter, p.cx, p.canvasH - p.cy);
		gl.uniform1f(this.u.uR, p.R);
		gl.uniform4f(this.u.uView, p.view.a.x, p.view.a.y, p.view.b.x, p.view.b.y);
		gl.uniform1f(this.u.uN, Math.min(p.anchor.n, MAX_N));
		gl.uniform1i(this.u.uGeodesic, p.geodesic ? 1 : 0);
		gl.uniform4fv(this.u.uDig, digits);
		gl.uniform4fv(this.u.uFrac, frac);
		gl.uniform1i(this.u.uLevel, ((p.anchor.level % 2) + 2) % 2);
		gl.uniform1i(this.u.uFillDual, p.fillDual ? 1 : 0);
		gl.uniform1f(this.u.uTileStroke, p.tileStrokePx);
		gl.uniform1f(this.u.uDualStroke, p.dualStrokePx);
		const ink = p.dark ? 0 : 0x11 / 255;
		gl.uniform3f(this.u.uStroke, ink, ink, ink);
		// the dual's lines under the tiles' when both are drawn; alone, they take the tiles' ink
		const dual = p.tileStrokePx > 0 ? 0.42 : ink;
		gl.uniform3f(this.u.uDualInk, dual, dual, dual);
		gl.uniform1f(this.u.uSat, TILE_SAT);
		const aPos = gl.getAttribLocation(this.prog, "aPos");
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	dispose(): void {
		this.gl.deleteBuffer(this.quad);
		this.gl.deleteProgram(this.prog);
	}
}
