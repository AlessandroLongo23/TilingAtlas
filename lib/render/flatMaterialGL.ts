// Materials on the Euclidean plane (lib/render/materials.ts): the /play shader view's fill pass, drawn in
// place of the coloured fill and the stroke when Materials is on. The cell is instanced across the
// viewport as the plain fill is (flatTilingGL.ts); each pixel finds its distance to the nearest side of
// its own tile from the tile's vertex ring, uploaded once per cell as a small float texture.
//
// A tile's seed is its copy in the lattice plus its index in the cell. The copy is counted from the
// UNWRAPPED pan (wrapOffset's `cells`), so a tile keeps its slab when the pan folds back by a period.

import type { CellMesh } from "@/lib/render/buildCellMesh";
import { linkProgram, WAVE_GLSL } from "@/lib/render/flatTilingGL";
import type { Mat2 } from "@/lib/render/flatView";
import {
	COMPLEX_GLSL,
	MATERIAL_CODE,
	MATERIAL_GLSL,
	sizeRanks,
	SurfaceTextures,
	type Material,
} from "@/lib/render/materials";

/** Material units per world unit. A unit-edge square then has an inradius of 0.5 units, near a {7,3}
 *  heptagon's 0.55 on the disk, so a slab's veins and a board's rings come out the same size on both. */
const MAT_SCALE = 1.0;
/** The longest vertex ring the fragment loop walks. */
const MAX_RING = 128;

const VERT = `#version 300 es
in vec2 aPos;
in vec2 aInst;
in vec2 aCentroid;
in vec2 aTile;           // the tile's index in the cell, its side count
uniform vec2 uOffset;    // wrapped pan, centred CSS px, y down
uniform float uZoom;
uniform float uRot;
uniform vec2 uV1;
uniform vec2 uV2;
uniform mat2 uDeform;
uniform vec2 uHalf;
uniform int uWavePhase;
uniform float uWaveP;
out vec2 vLocal;         // the point in the cell, undeformed
flat out vec2 vCentroid;
flat out vec2 vTile;
flat out vec2 vInst;
${WAVE_GLSL}
void main() {
	// FILL_VERT's map (flatTilingGL.ts), wave included, so the material sits exactly where the fill would.
	float c = cos(uRot), s = sin(uRot);
	vec2 pos = aPos;
	if (uWavePhase != 0) {
		vec2 wc = uDeform * (aCentroid + aInst.x * uV1 + aInst.y * uV2);
		vec2 cs = uOffset + uZoom * vec2(c * wc.x + s * wc.y, s * wc.x - c * wc.y);
		float scale = waveTileScale(uWavePhase, length(cs) / max(1.0, length(uHalf)), uWaveP);
		if (scale < 0.02) scale = 0.0;
		pos = aCentroid + scale * (aPos - aCentroid);
	}
	vec2 world = uDeform * (pos + aInst.x * uV1 + aInst.y * uV2);
	vec2 sxy = uOffset + uZoom * vec2(c * world.x + s * world.y, s * world.x - c * world.y);
	gl_Position = vec4(sxy.x / uHalf.x, -sxy.y / uHalf.y, 0.0, 1.0);
	vLocal = aPos;
	vCentroid = aCentroid;
	vTile = aTile;
	vInst = aInst;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vLocal;
flat in vec2 vCentroid;
flat in vec2 vTile;
flat in vec2 vInst;
uniform highp sampler2D uRings; // per tile, its vertex ring (CellMesh.tileRings)
uniform mat2 uDeform;
uniform float uZoom;
uniform float uRot;
uniform float uDpr;
uniform float uHalfW;     // the Line stroke's half-width, device px
uniform vec2 uShift;      // wrapOffset's cells
uniform vec2 uRes;        // drawing buffer, device px
uniform float uHueOffset;
out vec4 frag;
${COMPLEX_GLSL}
${MATERIAL_GLSL}
void main() {
	int t = int(vTile.x + 0.5), n = int(vTile.y + 0.5);
	// The nearest side, in the deformed plane (the one on screen): its squared distance and the way in.
	vec2 q = uDeform * vLocal;
	vec2 a = uDeform * texelFetch(uRings, ivec2(n - 1, t), 0).xy;
	float d2 = 1e9;
	vec2 dir = vec2(0.0);
	for (int k = 0; k < ${MAX_RING}; k++) {
		if (k >= n) break;
		vec2 b = uDeform * texelFetch(uRings, ivec2(k, t), 0).xy;
		vec2 ab = b - a;
		vec2 foot = a + ab * clamp(dot(q - a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
		vec2 v = q - foot;
		if (dot(v, v) < d2) { d2 = dot(v, v); dir = v; }
		a = b;
	}
	float pxPerWorld = uZoom * uDpr;
	// The world reaches the screen (y up, as gl_FragCoord) turned by -uRot: the p5 map's y flip and the
	// screen's cancel, so the whole chain is conformal.
	vec2 rot = vec2(cos(uRot), -sin(uRot));
	ivec2 cell = ivec2(floor(vInst - uShift + 0.5));
	uint h = mhash(uint(cell.x + 32768) * 73856093u ^ uint(cell.y + 32768) * 19349663u ^ uint(t) * 83492791u);
	Surf sf;
	sf.horo = false;
	sf.p = (vLocal - vCentroid) * ${MAT_SCALE.toFixed(4)};
	sf.conf = pxPerWorld / ${MAT_SCALE.toFixed(4)};
	sf.fp = 1.0 / sf.conf;
	sf.seed = float(h & 0xffffffu) / 16777216.0;
	sf.key = float(n);
	sf.edgePx = sqrt(d2) * pxPerWorld;
	sf.edgeH = sqrt(d2) * ${MAT_SCALE.toFixed(4)};
	sf.halfW = uHalfW;
	vec2 inS = cmul(dir, rot);
	sf.inward = dot(inS, inS) > 0.0 ? normalize(inS) : vec2(0.0);
	sf.toScreen = rot;
	sf.z = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y));
	frag = vec4(shadeMaterial(sf), 1.0);
}`;

export interface FlatMaterialDraw {
	/** The caller's instance buffer (i, j per copy) and its count: the plain fill's grid. */
	inst: WebGLBuffer;
	instCount: number;
	offset: { x: number; y: number }; // wrapped pan, centred CSS px, y down
	cells: [number, number]; // wrapOffset's
	zoom: number;
	rot: number; // radians
	deform: Mat2;
	width: number; // CSS px
	height: number;
	dpr: number;
	lineWidth: number; // CSS px
	hueOffset: number;
	material: Material;
	scanned: boolean;
	wavePhase: number;
	waveP: number;
}

export class FlatMaterialPass {
	private prog: WebGLProgram;
	private u: Record<string, WebGLUniformLocation | null> = {};
	private a: Record<string, number> = {};
	private buf: Record<"pos" | "centroid" | "tile", WebGLBuffer>;
	private rings: WebGLTexture;
	private surf: SurfaceTextures;
	private mesh: CellMesh | null = null;
	private ranks = sizeRanks([]);

	constructor(private gl: WebGL2RenderingContext) {
		const prog = linkProgram(gl, VERT, FRAG);
		if (!prog) throw new Error("flat material pass: shader compile/link failed");
		this.prog = prog;
		for (const n of [
			"uOffset",
			"uZoom",
			"uRot",
			"uV1",
			"uV2",
			"uDeform",
			"uHalf",
			"uWavePhase",
			"uWaveP",
			"uRings",
			"uDpr",
			"uHalfW",
			"uShift",
			"uRes",
			"uHueOffset",
			"uMaterial",
			"uScan",
			"uSurfC",
			"uSurfN",
			"uSurfSlots",
			"uRank",
			"uRankN",
		])
			this.u[n] = gl.getUniformLocation(prog, n);
		for (const n of ["aPos", "aInst", "aCentroid", "aTile"]) this.a[n] = gl.getAttribLocation(prog, n);
		this.buf = { pos: gl.createBuffer(), centroid: gl.createBuffer(), tile: gl.createBuffer() };
		this.rings = gl.createTexture();
		this.surf = new SurfaceTextures(gl);
	}

	upload(mesh: CellMesh): void {
		const gl = this.gl;
		if (!mesh.fillTile || !mesh.tileRings || !mesh.ringWidth) {
			this.mesh = null;
			return;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.pos);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.fillVerts, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.centroid);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.fillCentroid, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.tile);
		gl.bufferData(gl.ARRAY_BUFFER, mesh.fillTile, gl.STATIC_DRAW);
		gl.bindTexture(gl.TEXTURE_2D, this.rings);
		const rows = mesh.tileRings.length / (2 * mesh.ringWidth);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, mesh.ringWidth, rows, 0, gl.RG, gl.FLOAT, mesh.tileRings);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		this.ranks = sizeRanks(mesh.fillTile.filter((_, i) => i % 2 === 1));
		this.mesh = mesh;
	}

	/** False when the mesh carries no tile rings (the caller then draws the plain fill). */
	draw(p: FlatMaterialDraw): boolean {
		const gl = this.gl;
		const mesh = this.mesh;
		if (!mesh) return false;
		gl.useProgram(this.prog);
		const A = this.a,
			U = this.u;
		// No VAOs here either: every attribute is rebound before the draw (see euclidean-canvas.tsx).
		const attr = (loc: number, buf: WebGLBuffer, size: number, divisor: number) => {
			gl.bindBuffer(gl.ARRAY_BUFFER, buf);
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(loc, divisor);
		};
		attr(A.aPos, this.buf.pos, 2, 0);
		attr(A.aCentroid, this.buf.centroid, 2, 0);
		attr(A.aTile, this.buf.tile, 2, 0);
		attr(A.aInst, p.inst, 2, 1);
		gl.uniform2f(U.uOffset, p.offset.x, p.offset.y);
		gl.uniform1f(U.uZoom, p.zoom);
		gl.uniform1f(U.uRot, p.rot);
		gl.uniform2f(U.uV1, mesh.v1[0], mesh.v1[1]);
		gl.uniform2f(U.uV2, mesh.v2[0], mesh.v2[1]);
		gl.uniformMatrix2fv(U.uDeform, false, p.deform as unknown as Float32List);
		gl.uniform2f(U.uHalf, p.width / 2, p.height / 2);
		gl.uniform1i(U.uWavePhase, p.wavePhase);
		gl.uniform1f(U.uWaveP, p.waveP);
		gl.uniform1f(U.uDpr, p.dpr);
		gl.uniform1f(U.uHalfW, p.lineWidth * 0.5 * p.dpr);
		gl.uniform2f(U.uShift, p.cells[0], p.cells[1]);
		gl.uniform2f(U.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.uniform1f(U.uHueOffset, p.hueOffset);
		gl.uniform1f(U.uMaterial, MATERIAL_CODE[p.material]);
		const { scan, slots } = this.surf.want(p.material, p.scanned);
		gl.uniform1f(U.uScan, scan ? 1 : 0);
		gl.uniform1f(U.uSurfSlots, slots);
		gl.uniform2fv(U.uRank, this.ranks.pairs);
		gl.uniform1i(U.uRankN, this.ranks.n);
		this.surf.bind(1);
		gl.uniform1i(U.uSurfC, 1);
		gl.uniform1i(U.uSurfN, 2);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.rings);
		gl.uniform1i(U.uRings, 0);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.fillVertexCount, p.instCount);
		return true;
	}

	dispose(): void {
		const gl = this.gl;
		gl.deleteProgram(this.prog);
		for (const b of Object.values(this.buf)) gl.deleteBuffer(b);
		gl.deleteTexture(this.rings);
		this.surf.dispose();
	}
}
