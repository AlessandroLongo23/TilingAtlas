// The flat spherical surface: an unlit tiling drawn PROCEDURALLY in the fragment shader (no baked texture).
// The tiling is a function of the surface direction — face = argmax(dot(dir, N_f)), edge = where the top
// two faces are near-tied (sphericalTilingShader.ts) — so evaluating it per fragment keeps every edge
// pixel-sharp at any zoom. This replaced a 2048×1024 equirectangular bake that went soft under the camera
// dolly (one texel spanning many screen pixels). Hue-ring / stroke changes are plain uniform writes now,
// not a re-bake.
//
// The realistic/carved surface (sphericalCarvedMaterial.ts) shares the same classification but is lit and
// carves the edges into geometry.

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { buildFaceUniforms, EDGE_ANGLE_PER_STROKE, MAX_FACES, TILING_GLSL_CORE, TILING_GLSL_EDGE } from "./sphericalTilingShader";

export interface SphereMaterialOptions {
	poly: Polyhedron;
	hueOffset?: number;
	lineWidth?: number; // the cfg.lineWidth stroke slider (0 hides edges)
	dark?: boolean; // theme — sets the line colour
}

export interface SphereMaterial {
	material: THREE.Material;
	// hue / stroke / theme changed → write uniforms (no rebuild, no re-bake).
	update: (o: { hueOffset?: number; lineWidth?: number; dark?: boolean }) => void;
	dispose: () => void;
}

const VERT = /* glsl */ `in vec3 position;
out vec3 vLocal;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
void main() {
	// Object-space position IS the surface direction (unit sphere at the origin); classified against the
	// solid's exit-face normals, which live in the same object space. No UV, so no equirect seam or pole pinch.
	vLocal = position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// NOTE: no `#version 300 es` — three prepends it for a RawShaderMaterial with glslVersion GLSL3.
const FRAG = /* glsl */ `precision highp float;
in vec3 vLocal;
out vec4 fragColor;
${TILING_GLSL_CORE}
${TILING_GLSL_EDGE}
uniform vec3 uSphLineColor;
void main() {
	vec3 dir = normalize(vLocal);
	int best;
	float sep;
	float g = sphClassify(dir, best, sep);
	vec3 faceCol = sphFaceColor(best);
	vec3 col = mix(faceCol, uSphLineColor, sphEdge(g, sep));
	// RawShaderMaterial output is verbatim (three appends no colour-space/tonemapping chunk), and the scene
	// uses the default NoToneMapping + sRGB output — so write the DISPLAY value directly. This is exactly the
	// pixel the old MeshBasic + baked map produced (baker linearised, MeshBasic re-encoded → net identity).
	fragColor = vec4(col, 1.0);
}`;

const DARK_LINE = new THREE.Vector3(0.1, 0.105, 0.125);
const LIGHT_LINE = new THREE.Vector3(0.06, 0.06, 0.08);

export function createSphereMaterial(opts: SphereMaterialOptions): SphereMaterial {
	const { faces, count } = buildFaceUniforms(opts.poly);
	const uniforms = {
		uSphFace: { value: faces },
		uSphFaceCount: { value: count },
		uSphHueOffset: { value: opts.hueOffset ?? 0 },
		uSphEdgeWidth: { value: Math.max(0, opts.lineWidth ?? 1) * EDGE_ANGLE_PER_STROKE },
		// Raw normalised RGB (NOT a THREE.Color, which would linearise) — this is the display value written
		// straight out; see the FRAG note.
		uSphLineColor: { value: (opts.dark ?? true ? DARK_LINE : LIGHT_LINE).clone() },
	};

	const material = new THREE.RawShaderMaterial({
		glslVersion: THREE.GLSL3,
		vertexShader: VERT,
		fragmentShader: FRAG,
		uniforms,
		side: THREE.FrontSide, // a convex sphere occludes its own back
	});

	return {
		material,
		update: ({ hueOffset, lineWidth, dark }) => {
			if (hueOffset != null) uniforms.uSphHueOffset.value = hueOffset;
			if (lineWidth != null) uniforms.uSphEdgeWidth.value = Math.max(0, lineWidth) * EDGE_ANGLE_PER_STROKE;
			if (dark != null) (uniforms.uSphLineColor.value as THREE.Vector3).copy(dark ? DARK_LINE : LIGHT_LINE);
		},
		dispose: () => material.dispose(),
	};
}

// Re-exported so callers that only need the cap don't reach into the shader module.
export { MAX_FACES };
