// Bakes a spherical tiling into an EQUIRECTANGULAR albedo texture for a plain UV sphere. This replaced the
// per-face mesh + tube edges: the tiling is now pixels in a texture, so edges lie flat on the surface, the
// stroke slider sets their width, and — the point of the exercise — the surface becomes a standard
// MeshStandardMaterial where normal / displacement / roughness maps drop in later on the same UVs.
//
// The bake is a single fragment-shader pass over a render target (no triangle rasterisation): for each
// texel, reconstruct the sphere direction the UV maps to (exactly matching three's SphereGeometry UV
// convention, so the texture lands without rotation), then classify it against the solid's face normals —
// face = argmax(dot(dir, n_i)); edge = where the top two faces are near-tied. Anti-aliased via fwidth.
//
// Re-baking is one quad render (sub-millisecond), so hue-ring and stroke-slider drags re-bake live.

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { faceExitNormals } from "./sphericalGeometry";
import { polygonHue } from "@/lib/utils/renderTiling";

const MAX_FACES = 96; // covers the snub dodecahedron (92 faces), the most-faced Archimedean solid.
// Faces are packed one-per-vec4 (xyz = normal, w = hue) so the array costs 96 uniform vectors, safely
// under the WebGL2 minimum (MAX_FRAGMENT_UNIFORM_VECTORS ≥ 224) — separate vec3[] + float[] arrays would
// each burn a full register per element and blow that budget.

// Half-width of an edge line at stroke = 1, as an arc half-width in the shader's edge metric (g is
// normalised to an arc distance there). Scaled only by the slider — uniform across edge types and solids.
const EDGE_ANGLE_PER_STROKE = 0.011;

// NOTE: no `#version 300 es` here — three prepends it for a RawShaderMaterial with glslVersion GLSL3, and a
// second directive is a compile error.
const VERT = /* glsl */ `in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `precision highp float;
in vec2 vUv;
out vec4 fragColor;
#define MAX_FACES ${MAX_FACES}
uniform vec4 uFace[MAX_FACES]; // xyz = face normal, w = face hue (by polygon size — one hue on a Platonic
uniform int uFaceCount;        // solid, several on an Archimedean solid: triangles vs squares vs …)
uniform float uHueOffset;  // global hue ring
uniform float uEdgeWidth;  // edge half-width in the classification-gap metric
uniform vec3 uLineColor;
uniform float uRealistic;  // 1 = carved surface: paint a soft in-hue groove tint, NOT the flat near-black line

// Matches flatTilingGL FILL_FRAG exactly so a spherical face is the same colour as a Euclidean one.
vec3 hsb2rgb(float h, float s, float v) {
	vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}

// sRGB display value → linear. hsb2rgb and the line colour are DISPLAY (sRGB) values, but the renderer
// applies its own linear→sRGB output encoding to whatever this shader writes. Without pre-linearising, that
// encoding fires twice: faces wash out (saturation ~halved) and the near-black line greys to ~0.35. So we
// hand the renderer the linear values it expects — the exact analogue of the Islamic fill's
// setRGB(…, SRGBColorSpace), which decodes to linear before the same output stage. (Tagging the render
// target sRGB does NOT do this: three ignores colorSpace when sampling this render-target map.)
vec3 sRGBToLinear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void main() {
	// Reconstruct the direction three's SphereGeometry assigns to this UV (uv = (u, 1 - v)).
	float lon = vUv.x * 6.28318530717959;
	float lat = (1.0 - vUv.y) * 3.14159265358979;
	float sl = sin(lat);
	vec3 dir = vec3(-cos(lon) * sl, cos(lat), sin(lon) * sl);

	// Top two face alignments: the largest is the containing face (its index picks the face's hue), and the
	// gap to the second measures nearness to their shared edge. Track BOTH indices — the gap grows at a rate
	// set by the two exit-normals' separation, so dividing by that separation converts the gap into an
	// (approximately) uniform ARC distance to the edge. Without it, edges between near-parallel normals (e.g.
	// a triangle and its neighbour on an Archimedean solid) render visibly thicker than edges between
	// well-separated normals — the "triangles have thicker edges" artefact.
	float m1 = -2.0, m2 = -2.0;
	int best = 0, sec = 0;
	for (int i = 0; i < MAX_FACES; i++) {
		if (i >= uFaceCount) break;
		float d = dot(dir, uFace[i].xyz);
		if (d > m1) { m2 = m1; sec = best; m1 = d; best = i; }
		else if (d > m2) { m2 = d; sec = i; }
	}
	float sep = max(length(uFace[best].xyz - uFace[sec].xyz), 1e-4);
	float g = (m1 - m2) / sep;

	vec3 faceCol = hsb2rgb((uFace[best].w + uHueOffset) / 360.0, 0.40, 1.0);
	float aa = fwidth(g) + 1e-5;
	float edge = 1.0 - smoothstep(uEdgeWidth - aa, uEdgeWidth + aa, g);
	// Flat mode paints the near-black line. Realistic mode carves the edge as geometry instead, so here we
	// only tint the groove a touch darker IN THE FACE HUE — the shading (dip + normal + AO) does the rest.
	// A near-black line in the groove would read as a painted gash, not shadowed stone.
	vec3 lineCol = mix(uLineColor, faceCol * 0.72, uRealistic);
	// Pre-linearise so the renderer's output encoding lands the intended display colours (see sRGBToLinear).
	fragColor = vec4(sRGBToLinear(mix(faceCol, lineCol, edge)), 1.0);
}`;

export interface BakeOptions {
	hueOffset?: number;
	lineWidth?: number; // the cfg.lineWidth stroke slider (0 hides edges)
	dark?: boolean;
	realistic?: boolean; // carved surface: tint the groove in-hue instead of painting the near-black line
}

// One baker owns one render target + quad, and re-bakes into it in place — so the sphere's material.map is
// a stable texture reference that simply updates when hue/stroke change.
export class SphericalTextureBaker {
	private renderer: THREE.WebGLRenderer;
	private rt: THREE.WebGLRenderTarget;
	private scene: THREE.Scene;
	private camera: THREE.Camera;
	private quad: THREE.Mesh;
	private mat: THREE.RawShaderMaterial;

	constructor(renderer: THREE.WebGLRenderer, width = 2048) {
		this.renderer = renderer;
		this.rt = new THREE.WebGLRenderTarget(width, Math.round(width / 2), {
			minFilter: THREE.LinearMipmapLinearFilter,
			magFilter: THREE.LinearFilter,
			generateMipmaps: true,
			wrapS: THREE.RepeatWrapping, // longitude wraps — no seam
			wrapT: THREE.ClampToEdgeWrapping,
		});
		this.rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

		this.mat = new THREE.RawShaderMaterial({
			glslVersion: THREE.GLSL3,
			vertexShader: VERT,
			fragmentShader: FRAG,
			uniforms: {
				uFace: { value: Array.from({ length: MAX_FACES }, () => new THREE.Vector4()) },
				uFaceCount: { value: 0 },
				uHueOffset: { value: 0 },
				uEdgeWidth: { value: 0.012 },
				// Raw normalised RGB (NOT a THREE.Color, which would linearise) so it shares the space of
				// the hsb2rgb face colour and the map reads back matching the flat tiles.
				uLineColor: { value: new THREE.Vector3(0.1, 0.105, 0.125) },
				uRealistic: { value: 0 },
			},
		});

		this.scene = new THREE.Scene();
		this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
		this.scene.add(this.quad);
		this.camera = new THREE.Camera(); // identity view — the quad is already in clip space
	}

	bake(poly: Polyhedron, opts: BakeOptions = {}): THREE.Texture {
		// Exit-face normals (C_f/|C_f|²), NOT unit normals: correct for Archimedean solids whose face types
		// sit at different distances from the centre. argmax(dot(dir, N_f)) then picks the face the ray
		// exits through — with plain unit normals the small far-out faces (e.g. the truncated
		// dodecahedron's vertex triangles) vanish and the edges land in the wrong place.
		const N = faceExitNormals(poly);
		const u = this.mat.uniforms;
		const arr = u.uFace.value as THREE.Vector4[];
		for (let i = 0; i < MAX_FACES; i++) {
			if (i < N.length) {
				// xyz = exit-face normal, w = the face's hue (by polygon size) — congruent faces share a hue.
				arr[i].set(N[i][0], N[i][1], N[i][2], polygonHue(poly.faces[i].length));
			} else {
				arr[i].set(0, 0, 0, 0);
			}
		}
		u.uFaceCount.value = Math.min(N.length, MAX_FACES);
		u.uHueOffset.value = opts.hueOffset ?? 0;

		// g is now normalised to an arc distance in-shader, so the width is a plain arc half-width — no
		// per-solid spread scaling, which also makes the stroke read the same thickness on every solid.
		u.uEdgeWidth.value = Math.max(0, opts.lineWidth ?? 1) * EDGE_ANGLE_PER_STROKE;

		const line = opts.dark ?? true ? [0.1, 0.105, 0.125] : [0.06, 0.06, 0.08];
		(u.uLineColor.value as THREE.Vector3).set(line[0], line[1], line[2]);
		u.uRealistic.value = opts.realistic ? 1 : 0;

		const prev = this.renderer.getRenderTarget();
		this.renderer.setRenderTarget(this.rt);
		this.renderer.render(this.scene, this.camera);
		this.renderer.setRenderTarget(prev);
		return this.rt.texture;
	}

	get texture(): THREE.Texture {
		return this.rt.texture;
	}

	dispose() {
		this.rt.dispose();
		this.mat.dispose();
		this.quad.geometry.dispose();
	}
}
