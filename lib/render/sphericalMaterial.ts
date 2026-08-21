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
	studio?: boolean; // shade the surface in-shader instead of drawing it flat (lib/render/sphericalLook.ts)
}

export interface SphereMaterial {
	material: THREE.Material;
	// hue / stroke / theme changed → write uniforms (no rebuild, no re-bake).
	update: (o: { hueOffset?: number; lineWidth?: number; dark?: boolean }) => void;
	dispose: () => void;
}

const VERT = /* glsl */ `in vec3 position;
out vec3 vLocal;
out vec3 vViewPos;
out vec3 vViewNor;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
void main() {
	// Object-space position IS the surface direction (unit sphere at the origin); classified against the
	// solid's exit-face normals, which live in the same object space. No UV, so no equirect seam or pole pinch.
	vLocal = position;
	// View-space position + normal, for the studio shading below. Unused (and free) in the plain look —
	// a RawShaderMaterial declares its own built-ins, and three binds normalMatrix like any other material.
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	vViewPos = mv.xyz;
	vViewNor = normalMatrix * normalize(position);
	gl_Position = projectionMatrix * mv;
}`;

// The tiling colour, shared by both looks. Everything above the shading is identical between them.
const FRAG_HEAD = /* glsl */ `precision highp float;
in vec3 vLocal;
in vec3 vViewPos;
in vec3 vViewNor;
out vec4 fragColor;
${TILING_GLSL_CORE}
${TILING_GLSL_EDGE}
uniform vec3 uSphLineColor;
`;

// PLAIN: unlit, exactly as this surface has always drawn — a flat field of face colour with the edge lines
// painted on. NOTE: no `#version 300 es` — three prepends it for a RawShaderMaterial with glslVersion GLSL3.
const FRAG_PLAIN = /* glsl */ `${FRAG_HEAD}
void main() {
	vec3 dir = normalize(vLocal);
	int best;
	float g = sphClassify(dir, best);
	vec3 faceCol = sphFaceColor(best);
	vec3 col = mix(faceCol, uSphLineColor, sphEdge(g));
	// RawShaderMaterial output is verbatim (three appends no colour-space/tonemapping chunk), and the scene
	// uses the default NoToneMapping + sRGB output — so write the DISPLAY value directly. This is exactly the
	// pixel the old MeshBasic + baked map produced (baker linearised, MeshBasic re-encoded → net identity).
	fragColor = vec4(col, 1.0);
}`;

// STUDIO: the same tiling, lit. This material cannot use the scene's lights (a RawShaderMaterial has no
// lighting chunks and no envMap), so the rig is written out analytically in VIEW space — which also means
// the highlight sits still under the trackball instead of sliding across the surface as the sphere turns,
// the way a studio lamp behaves relative to the camera.
//
// Four terms, and each is there for a reason a flat disc lacks:
//   • wrapped diffuse from a key and a fill. Wrapping (the +w)/(1+w) form) softens the terminator so a
//     matte ball does not show the hard day/night line a raw N·L gives.
//   • a Blinn-Phong highlight, tight and weak — the "this is a glossy object" cue.
//   • a Fresnel rim, which is what stops a dark solid from dissolving into a dark page.
//   • a groove shadow beside every tiling edge, from the SAME g the line is drawn with: the line reads as
//     sunk into the surface rather than printed on it, at zero geometry cost.
const FRAG_STUDIO = /* glsl */ `${FRAG_HEAD}
const vec3 KEY_DIR  = normalize(vec3(0.42, 0.62, 0.66));
const vec3 FILL_DIR = normalize(vec3(-0.72, 0.10, 0.42));
float wrapped(vec3 N, vec3 L, float w) { return clamp((dot(N, L) + w) / (1.0 + w), 0.0, 1.0); }
void main() {
	vec3 dir = normalize(vLocal);
	int best;
	float g = sphClassify(dir, best);
	float line = sphEdge(g);
	vec3 base = mix(sphFaceColor(best), uSphLineColor, line);
	// The groove: darkest right beside the line, gone a few line-widths into the face.
	base *= mix(0.80, 1.0, smoothstep(uSphEdgeWidth, uSphEdgeWidth * 4.0 + 0.006, g));

	vec3 N = normalize(vViewNor);
	vec3 V = normalize(-vViewPos);
	float diffuse = 0.40 + 0.50 * wrapped(N, KEY_DIR, 0.45) + 0.16 * wrapped(N, FILL_DIR, 0.7);
	float spec = pow(max(dot(N, normalize(KEY_DIR + V)), 0.0), 48.0) * 0.30;
	float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.5);
	// The rim reads as light, so it is weaker on the dark lines (which should stay dark) than on the faces.
	vec3 col = base * diffuse + vec3(spec) * (1.0 - 0.6 * line) + vec3(0.34, 0.37, 0.44) * fres * 0.55;
	fragColor = vec4(min(col, vec3(1.0)), 1.0);
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
		fragmentShader: opts.studio ? FRAG_STUDIO : FRAG_PLAIN,
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
