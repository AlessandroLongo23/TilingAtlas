// Shared pieces for drawing a spherical tiling PROCEDURALLY (per fragment) instead of baking it into an
// equirectangular texture. The tiling is an analytic function of the surface direction — the face a point
// belongs to is argmax(dot(dir, N_f)) over the solid's exit-face normals, and an edge is where the top two
// faces are near-tied — so evaluating it in the fragment shader keeps every edge pixel-sharp at any zoom
// (the baked-texture approach it replaced went soft the moment the camera dollied in and one texel spanned
// many screen pixels). Both surface looks use this: the flat sphere (sphericalMaterial.ts) and the carved
// realistic sphere (sphericalCarvedMaterial.ts).

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { faceExitNormals } from "./sphericalGeometry";
import { polygonHue } from "@/lib/utils/renderTiling";

// Covers the snub dodecahedron (92 faces), the most-faced Archimedean solid. Faces are packed one-per-vec4
// (xyz = exit-face normal, w = hue) so the array costs 96 uniform vectors, safely under the WebGL2 minimum
// (MAX_FRAGMENT_UNIFORM_VECTORS ≥ 224).
export const MAX_FACES = 96;

// Half-width of an edge line at stroke = 1, as an arc half-width in the classification-gap metric g (g is
// normalised to an arc distance in the shader). Scaled only by the stroke slider — uniform across edge
// types and solids. Shared so the flat line and the carved groove land on the exact same place.
export const EDGE_ANGLE_PER_STROKE = 0.011;

// Build the packed face array (xyz = exit-face normal, w = hue by polygon size) + count for the uniforms.
// Exit-face normals (C_f/|C_f|²), NOT unit normals: correct for Archimedean solids whose face types sit at
// different distances from the centre — argmax(dot(dir, N_f)) then picks the face the outward ray exits
// through (with plain unit normals the small far-out faces vanish and edges land wrong). Congruent faces
// share a hue, so a Platonic solid is one hue and an Archimedean solid is one hue per polygon size.
export function buildFaceUniforms(poly: Polyhedron): { faces: THREE.Vector4[]; count: number } {
	const N = faceExitNormals(poly);
	// ⚑ ONE ENTRY PER PLANE, not per face. Faces that share a plane share an exit normal exactly, and the
	// classifier cannot tell them apart in the first place: it asks which plane a direction exits through.
	// Feeding it the same normal twice is worse than useless — the gap g is normalised by |N_best − N_f|,
	// so a duplicate makes that separation ~0 and g collapses to 0 over the WHOLE sphere, which paints
	// every fragment as an edge. That is why sph-ncx-7-15-10-a rendered as a solid black ball: three of its
	// seven vertices are coincident to 1.5e-6 and seven of its ten faces lie in one plane (AL, 2026-08-21).
	// The non-convex shelf is the only one with such solids; every other shelf dedupes to itself.
	const DUP_EPS = 1e-4;
	const kept: { n: readonly [number, number, number]; hue: number }[] = [];
	for (let i = 0; i < N.length && kept.length < MAX_FACES; i++) {
		const n = N[i];
		if (kept.some((k) => Math.hypot(k.n[0] - n[0], k.n[1] - n[1], k.n[2] - n[2]) < DUP_EPS)) continue;
		kept.push({ n: [n[0], n[1], n[2]], hue: polygonHue(poly.faces[i].length) });
	}
	const faces = Array.from({ length: MAX_FACES }, () => new THREE.Vector4());
	for (let i = 0; i < MAX_FACES; i++) {
		if (i < kept.length) faces[i].set(kept[i].n[0], kept[i].n[1], kept[i].n[2], kept[i].hue);
		else faces[i].set(0, 0, 0, 0);
	}
	return { faces, count: kept.length };
}

// The fwidth-free CORE, safe in BOTH shader stages: the uniform block + classification/colour helpers.
// Injected after `#include <common>` in the carved MeshStandardMaterial (vertex AND fragment) and used
// verbatim by the flat RawShaderMaterial. Uniform names are `uSph…`-prefixed so they never collide with
// three's built-in material uniforms. `sphEdge` is split out (TILING_GLSL_EDGE) because it calls fwidth,
// which is a FRAGMENT-only builtin — including it in a vertex stage is a compile error.
export const TILING_GLSL_CORE = /* glsl */ `
#define SPH_MAX_FACES ${MAX_FACES}
uniform vec4 uSphFace[SPH_MAX_FACES]; // xyz = exit-face normal, w = face hue (degrees)
uniform int  uSphFaceCount;
uniform float uSphHueOffset; // global hue ring
uniform float uSphEdgeWidth; // edge half-width in the classification-gap (arc) metric

// Matches flatTilingGL FILL_FRAG exactly so a spherical face is the same colour as a Euclidean one.
vec3 sphHsb2rgb(float h, float s, float v) {
	vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}

// display sRGB → linear working space, for the carved MeshStandardMaterial (its diffuseColor is linear and
// three re-encodes on output). The flat RawShaderMaterial writes the display value straight to the canvas
// and does NOT call this.
vec3 sphSRGBToLinear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

// Classify a surface direction: the containing face (best) is the largest dot — the face the outward ray
// exits through — and the return value g is the normalised angular distance to the NEAREST tiling edge (0 on
// an edge, growing into the face). g is the MIN over every other face f of the gap (m1 − dot_f) divided by
// that pair's exit-normal separation |N_best − N_f|; the per-pair normalisation makes g a roughly uniform
// arc distance across every solid and edge type (without it, edges between near-parallel normals render
// visibly thicker).
//
// Taking the true min over all faces — not "the second-highest dot divided by ITS separation" — is what
// keeps the edge band a clean uniform-width stroke through every vertex. The old single-runner-up form
// clipped each edge band at the curve where the runner-up flips (dot_A == dot_C near a vertex): past that
// curve it silently measured distance to a DIFFERENT edge with a different separation, notching/stepping the
// stroke. The min is also CONTINUOUS across those flip curves (min of smooth terms), so fwidth(g) in sphEdge
// no longer spikes into faint phantom lines reaching into the face interior.
float sphClassify(vec3 dir, out int best) {
	// Pass 1: the containing face (largest dot).
	float m1 = -2.0;
	int b = 0;
	for (int i = 0; i < SPH_MAX_FACES; i++) {
		if (i >= uSphFaceCount) break;
		float d = dot(dir, uSphFace[i].xyz);
		if (d > m1) { m1 = d; b = i; }
	}
	best = b;
	// Pass 2: min normalised gap to any OTHER face = distance to the nearest edge.
	vec3 Nb = uSphFace[b].xyz;
	float g = 1e9;
	for (int i = 0; i < SPH_MAX_FACES; i++) {
		if (i >= uSphFaceCount) break;
		if (i == b) continue;
		float sep = max(length(Nb - uSphFace[i].xyz), 1e-4);
		g = min(g, (m1 - dot(dir, uSphFace[i].xyz)) / sep);
	}
	return g;
}

// The face's fill hue (with the global hue-ring offset applied), matching the flat Euclidean tiles.
vec3 sphFaceColor(int best) {
	return sphHsb2rgb((uSphFace[best].w + uSphHueOffset) / 360.0, 0.40, 1.0);
}
`;

// FRAGMENT-only: anti-aliased edge coverage in [0,1] (1 = on the line) from the classification gap. fwidth
// gives a pixel-exact feather at any zoom — the whole point of going procedural. MUST NOT be included in a
// vertex stage (fwidth is fragment-only). Append it after TILING_GLSL_CORE in fragment shaders.
export const TILING_GLSL_EDGE = /* glsl */ `
float sphEdge(float g) {
	float aa = fwidth(g) + 1e-5;
	return 1.0 - smoothstep(uSphEdgeWidth - aa, uSphEdgeWidth + aa, g);
}
`;
