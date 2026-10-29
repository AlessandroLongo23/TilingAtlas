// The spherical surface: the tiling drawn PROCEDURALLY in the fragment shader (no baked texture). The
// tiling is a function of the surface direction — face = argmax(dot(dir, N_f)), edge = where the top two
// faces are near-tied (sphericalTilingShader.ts) — so evaluating it per fragment keeps every edge
// pixel-sharp at any zoom. This replaced a 2048×1024 equirectangular bake that went soft under the camera
// dolly (one texel spanning many screen pixels). Hue-ring / stroke changes are plain uniform writes now,
// not a re-bake.

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import {
	buildFaceUniforms,
	EDGE_ANGLE_PER_STROKE,
	MAX_FACES,
	TILING_GLSL_CORE,
	TILING_GLSL_EDGE,
} from "./sphericalTilingShader";
import { LOOK } from "./sphericalLook";
import { COMPLEX_GLSL, MATERIAL_CODE, MATERIAL_GLSL, sizeRanks, SurfaceTextures, type Material } from "./materials";

/** Material units per radian of the unit sphere: an icosahedron's face (inradius 0.36 rad) comes out
 *  near a {7,3} heptagon's 0.55 on the disk, so the materials read at the same scale on both. */
const MAT_SCALE = 1.6;

/** The live look: hue ring, stroke, theme, and the material (null = the plain tiling). */
export interface SphereLook {
	hueOffset?: number;
	lineWidth?: number;
	dark?: boolean;
	material?: Material | null;
	scanned?: boolean;
}

export interface SphereMaterialOptions extends SphereLook {
	poly: Polyhedron;
	/** The renderer whose context the scanned surfaces are uploaded on. */
	renderer: THREE.WebGLRenderer;
}

export interface SphereMaterial {
	material: THREE.Material;
	// hue / stroke / theme / material changed → write uniforms (no rebuild, no re-bake).
	update: (o: SphereLook) => void;
	/** Per frame, before the draw: whether the material's scans have landed yet. */
	tick: () => void;
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
	// View-space position + normal, for the shading below. A RawShaderMaterial declares its own built-ins,
	// and three binds normalMatrix like any other material.
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	vViewPos = mv.xyz;
	vViewNor = normalMatrix * normalize(position);
	gl_Position = projectionMatrix * mv;
}`;

const FRAG_HEAD = /* glsl */ `precision highp float;
in vec3 vLocal;
in vec3 vViewPos;
in vec3 vViewNor;
out vec4 fragColor;
${TILING_GLSL_CORE}
${TILING_GLSL_EDGE}
uniform vec3 uSphLineColor;
uniform mat3 normalMatrix;
uniform float uHueOffset; // = uSphHueOffset, under the name the materials read
${COMPLEX_GLSL}
${MATERIAL_GLSL}
`;

// The tiling, lit. This material cannot use the scene's lights (a RawShaderMaterial has no lighting
// chunks and no envMap), so the rig is written out analytically in VIEW space — which also means the
// highlight sits still under the trackball instead of sliding across the surface as the sphere turns,
// the way a studio lamp behaves relative to the camera.
//
// NOTE: no `#version 300 es` — three prepends it for a RawShaderMaterial with glslVersion GLSL3.
//
// Five terms, each there for something a flat disc lacks:
//   • an ENGRAVED line. The tiling edge gets a height profile (a shallow trench across the same g the line
//     is drawn from), and the shading normal is tilted by that height's surface gradient — the screen-space
//     derivative trick the carved material uses, minus the displacement. This is what makes the line read
//     as cut into the surface, catching light on one wall and shadow on the other, rather than printed on.
//   • wrapped diffuse from a key and a fill. Wrapping (the (·+w)/(1+w) form) softens the terminator so a
//     matte ball does not show the hard day/night line a raw N·L gives.
//   • a Blinn-Phong highlight, tight and weak — the "this is a glossy object" cue.
//   • a Fresnel rim, which is what stops a solid from dissolving into the page at its silhouette.
//   • ambient occlusion in the trench, so the groove stays dark even where the light falls into it.
const frag = () => /* glsl */ `${FRAG_HEAD}
const vec3 KEY_DIR  = normalize(vec3(0.42, 0.62, 0.66));
const vec3 FILL_DIR = normalize(vec3(-0.72, 0.10, 0.42));
// Depth of the engraved trench, in the same units as the view-space position the gradient is taken in
// (sphere radius 1, no scale in the model matrix, so these are radii).
const float GROOVE_DEPTH = 0.012;
const float GROOVE_TILT = 1.0; // how hard the trench wall turns the shading normal

float wrapped(vec3 N, vec3 L, float w) { return clamp((dot(N, L) + w) / (1.0 + w), 0.0, 1.0); }
// Trench half-width: a few stroke widths, floored so a hairline stroke still gets a wall to shade.
float grooveWidth() { return max(uSphEdgeWidth * 3.0, 0.018); }
// 0 on the face, −GROOVE_DEPTH in the line, joined smoothly across the wall.
float grooveHeight(float g) { return -GROOVE_DEPTH * (1.0 - smoothstep(0.0, grooveWidth(), g)); }

// The face in its material (materials.ts). The face's frame is its tangent plane, unrolled azimuthally
// about the face's centre, so a texture unit is a fixed arc on the sphere. Distances come from g, the arc
// to the nearest edge, and its screen gradient; the lighting is the plain sphere's, gentler.
vec3 materialFace(vec3 dir, int best, float g) {
	vec3 n = normalize(uSphFace[best].xyz);
	vec3 t1 = normalize(cross(abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), n));
	vec3 t2 = cross(n, t1);
	vec2 tang = vec2(dot(dir, t1), dot(dir, t2));
	float lt = length(tang);
	float arcPx = max(length(dFdx(dir)), length(dFdy(dir))); // radians per device px
	vec2 gg = vec2(dFdx(g), dFdy(g));
	float gm = max(length(gg), 1e-7);
	Surf sf;
	sf.horo = false;
	sf.p = (lt > 1e-7 ? tang / lt * atan(lt, dot(dir, n)) : vec2(0.0)) * ${MAT_SCALE.toFixed(4)};
	sf.fp = max(arcPx, 1e-6) * ${MAT_SCALE.toFixed(4)};
	sf.conf = 1.0 / sf.fp;
	sf.seed = float(mhash(uint(best) * 2654435761u + 17u) & 0xffffffu) / 16777216.0;
	sf.key = uSphFace[best].w;
	sf.edgePx = g / gm;
	sf.edgeH = g * ${MAT_SCALE.toFixed(4)};
	sf.halfW = uSphEdgeWidth / gm;
	sf.inward = gg / gm;
	vec2 ts = (normalMatrix * t1).xy;
	sf.toScreen = dot(ts, ts) > 1e-8 ? normalize(ts) : vec2(1.0, 0.0);
	sf.z = vViewPos.xy; // the sphere spans about (−1, 1) of view space, as the disk does of its frame
	return shadeMaterial(sf);
}

void main() {
	vec3 dir = normalize(vLocal);
	int best;
	float g = sphClassify(dir, best);
	if (uMaterial > 0.5) {
		vec3 col = materialFace(dir, best, g);
		vec3 N = normalize(vViewNor), V = normalize(-vViewPos);
		float shade = 0.62 + 0.38 * wrapped(N, KEY_DIR, 0.45) + 0.1 * wrapped(N, FILL_DIR, 0.7);
		float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.5);
		fragColor = vec4(min(col * shade + mix(vec3(0.30, 0.33, 0.40), col, 0.55) * fres * ${LOOK.fresnel.toFixed(3)}, vec3(1.0)), 1.0);
		return;
	}
	float line = sphEdge(g);
	// Deepen the fill before lighting it: the catalogue hue is the pale tile palette, chosen for an UNLIT
	// fill, and lit as-is it washes to near-white under the key. See LOOK.sat in sphericalLook.ts.
	vec3 face = sphFaceColor(best);
	float lum = dot(face, vec3(0.2126, 0.7152, 0.0722));
	face = clamp(mix(vec3(lum), face, ${LOOK.sat.toFixed(3)}) * ${LOOK.val.toFixed(3)}, 0.0, 1.0);
	vec3 base = mix(face, uSphLineColor, line);
	// The rim carries the surface's own colour, not a blue-white wash — a white rim is what makes a
	// rendered ball look like a stock 3D icon.
	vec3 rim = mix(vec3(0.30, 0.33, 0.40), face, 0.55);

	vec3 N = normalize(vViewNor);
	vec3 V = normalize(-vViewPos);

	// Tilt the normal by the surface gradient of the trench. r1/r2/det build the screen-space→surface
	// basis without a tangent attribute — no normal/tangent attribute is needed on the sphere geometry.
	{
		float H = grooveHeight(g);
		vec3 fdx = dFdx(vViewPos), fdy = dFdy(vViewPos);
		vec3 r1 = cross(fdy, N);
		vec3 r2 = cross(N, fdx);
		float det = dot(fdx, r1);
		vec3 grad = sign(det) * (dFdx(H) * r1 + dFdy(H) * r2);
		N = normalize(abs(det) * N - GROOVE_TILT * grad);
	}

	// Occlusion inside the trench and along its shoulder — a groove the light reaches into still reads
	// as a groove because this darkens it independently of direction.
	float ao = mix(0.74, 1.0, smoothstep(0.0, grooveWidth() * 1.7, g));

	float diffuse = 0.40 + 0.48 * wrapped(N, KEY_DIR, 0.45) + 0.15 * wrapped(N, FILL_DIR, 0.7);
	float spec = pow(max(dot(N, normalize(KEY_DIR + V)), 0.0), ${LOOK.specPower.toFixed(1)}) * ${LOOK.specStrength.toFixed(3)};
	float fres = pow(1.0 - clamp(dot(normalize(vViewNor), V), 0.0, 1.0), 3.5);
	// The highlight and the rim both read as light, so both are pulled back on the dark lines, which have
	// to stay dark for the tiling to read.
	vec3 col = base * diffuse * ao
		+ vec3(spec) * ao * (1.0 - 0.75 * line)
		+ rim * fres * ${LOOK.fresnel.toFixed(3)} * (1.0 - 0.5 * line);
	fragColor = vec4(min(col, vec3(1.0)), 1.0);
}`;

const DARK_LINE = new THREE.Vector3(0.1, 0.105, 0.125);
const LIGHT_LINE = new THREE.Vector3(0.06, 0.06, 0.08);

export function createSphereMaterial(opts: SphereMaterialOptions): SphereMaterial {
	const { faces, count, sizes } = buildFaceUniforms(opts.poly);
	// The scans share three's context; three's cached GL state is reset after every raw upload.
	const renderer = opts.renderer;
	const surf = new SurfaceTextures(renderer.getContext() as WebGL2RenderingContext, () => renderer.resetState());
	const ranks = sizeRanks(sizes);
	const look = { material: opts.material ?? null, scanned: opts.scanned ?? true };
	const uniforms = {
		uSphFace: { value: faces },
		uSphFaceCount: { value: count },
		uSphHueOffset: { value: opts.hueOffset ?? 0 },
		uSphEdgeWidth: { value: Math.max(0, opts.lineWidth ?? 1) * EDGE_ANGLE_PER_STROKE },
		// Raw normalised RGB (NOT a THREE.Color, which would linearise) — this is the display value written
		// straight out; see the FRAG note.
		uSphLineColor: { value: ((opts.dark ?? true) ? DARK_LINE : LIGHT_LINE).clone() },
		uHueOffset: { value: opts.hueOffset ?? 0 },
		uMaterial: { value: 0 },
		uScan: { value: 0 },
		uSurfSlots: { value: 1 },
		uSurfC: { value: new THREE.ExternalTexture(surf.c) },
		uSurfN: { value: new THREE.ExternalTexture(surf.n) },
		uRank: {
			value: Array.from({ length: 16 }, (_, i) => new THREE.Vector2(ranks.pairs[i * 2], ranks.pairs[i * 2 + 1])),
		},
		uRankN: { value: ranks.n },
	};

	const material = new THREE.RawShaderMaterial({
		glslVersion: THREE.GLSL3,
		vertexShader: VERT,
		fragmentShader: frag(),
		uniforms,
		side: THREE.FrontSide, // a convex sphere occludes its own back
	});

	return {
		material,
		update: ({ hueOffset, lineWidth, dark, material, scanned }) => {
			if (material !== undefined) look.material = material;
			if (scanned != null) look.scanned = scanned;
			if (hueOffset != null) uniforms.uSphHueOffset.value = uniforms.uHueOffset.value = hueOffset;
			if (lineWidth != null) uniforms.uSphEdgeWidth.value = Math.max(0, lineWidth) * EDGE_ANGLE_PER_STROKE;
			if (dark != null) (uniforms.uSphLineColor.value as THREE.Vector3).copy(dark ? DARK_LINE : LIGHT_LINE);
		},
		tick: () => {
			uniforms.uMaterial.value = look.material ? MATERIAL_CODE[look.material] : 0;
			const { scan, slots } = surf.want(look.material, look.scanned);
			uniforms.uScan.value = scan ? 1 : 0;
			uniforms.uSurfSlots.value = slots;
		},
		dispose: () => {
			material.dispose();
			surf.dispose();
		},
	};
}

// Re-exported so callers that only need the cap don't reach into the shader module.
export { MAX_FACES };
