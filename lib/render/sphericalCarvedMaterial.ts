// The "realistic" spherical surface: the tiling lines shaded as if CARVED into the sphere. It is a stock
// MeshStandardMaterial (matte stone — high roughness, no metal) whose albedo AND geometry are both driven
// PROCEDURALLY from the shared edge-distance field (sphericalTilingShader.ts), patched in via
// onBeforeCompile. Nothing is pre-baked into albedo / normal / AO / displacement textures: everything is
// recomputed live in-shader, so the tiling and its groove stay crisp at any zoom and there is no
// equirectangular distortion near the poles.
//
// Four things, all keyed off the classification: the winning face gives the fill hue, and g = the arc
// distance to the nearest tiling edge (0 on the edge, growing into the face) drives:
//   • albedo — the face hue, tinted darker in-hue inside the groove (a shadowed dip, not a painted gash).
//   • displacement — the vertex stage raises the faces and sinks the edges into a smooth SDF fillet whose
//     radius is a few line-widths. Real geometry, visible on the rim.
//   • normal — the fragment stage bumps the shading normal from the surface-gradient of that SAME height, so
//     the groove walls catch the light with the exact curvature the displacement carved.
//   • AO — the groove and its shoulder darken (fake contact shadow), folded into the albedo so it reads
//     under any light direction.
//
// Solid sphere only — see lib/render/sphericalScene.ts for where this is chosen over the flat material.

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { buildFaceUniforms, EDGE_ANGLE_PER_STROKE, TILING_GLSL_CORE, TILING_GLSL_EDGE } from "./sphericalTilingShader";

// Radial amplitude of the carve (faces out by +½, edges in by −½). "Slightly", per the design — a subtle
// relief that reads on the silhouette without ballooning the sphere.
const DEFAULT_CARVE_DEPTH = 0.022;
const DEFAULT_NORMAL_STRENGTH = 1.0; // how hard the groove wall tilts the shading normal
// A light extra shoulder-shadow on top of the in-hue groove tint and the dip's self-shadow. Kept small so
// the groove reads as softly shadowed stone, never a dark gash.
const DEFAULT_AO_STRENGTH = 0.14;

export interface CarvedMaterialOptions {
	poly: Polyhedron; // face set → the live edge-distance field + fill hues
	hueOffset?: number; // global hue ring
	lineWidth?: number; // cfg.lineWidth stroke slider → groove / line half-width
	carveDepth?: number; // radial amplitude (defaults to DEFAULT_CARVE_DEPTH)
}

export interface CarvedMaterial {
	material: THREE.Material; // add to the mesh
	update: (o: { hueOffset?: number; lineWidth?: number }) => void; // hue / stroke changed — no recompile
	dispose: () => void;
}

// Carve-specific helpers, injected after the shared TILING_GLSL into BOTH stages.
const CARVE_DECL = /* glsl */ `
	uniform float uCarveDepth;       // radial displacement amplitude
	uniform float uCarveNormalStrength;
	uniform float uCarveAoStrength;
	varying vec3 vCarveDir;          // undisplaced object-space surface direction (unit)

	// Fillet radius: a few line-widths, floored so a hidden/thin stroke still gives a smooth groove. This is
	// where "use the SDF to calculate the radius" happens — g feeds smoothstep(0, R, g).
	float carveFillet() { return max(uSphEdgeWidth * 3.0, 0.02); }

	// Height profile: raised plateau on the faces (+½ depth), sunk edge (−½ depth), joined by a smooth fillet
	// across g ∈ [0, R]. The fragment normal is the surface-gradient of exactly this height.
	float carveHeight(float g) { return uCarveDepth * (smoothstep(0.0, carveFillet(), g) - 0.5); }

	// AO / shoulder darkening: widest near the edge, fading out just past the fillet.
	float carveShade(float g) { return 1.0 - smoothstep(0.0, carveFillet() * 1.6, g); }
`;

export function createCarvedSphereMaterial(opts: CarvedMaterialOptions): CarvedMaterial {
	const { faces, count } = buildFaceUniforms(opts.poly);
	const uniforms = {
		uSphFace: { value: faces },
		uSphFaceCount: { value: count },
		uSphHueOffset: { value: opts.hueOffset ?? 0 },
		uSphEdgeWidth: { value: Math.max(0, opts.lineWidth ?? 1) * EDGE_ANGLE_PER_STROKE },
		uCarveDepth: { value: opts.carveDepth ?? DEFAULT_CARVE_DEPTH },
		uCarveNormalStrength: { value: DEFAULT_NORMAL_STRENGTH },
		uCarveAoStrength: { value: DEFAULT_AO_STRENGTH },
	};

	// Matte stone: rough, non-metallic, so the grooves read through AO + soft form shading and the bright
	// tile hues never blow out into specular hot spots.
	const material = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.0, side: THREE.FrontSide });

	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);

		// Vertex: displace along the (undisplaced) radial direction by the height field, and hand that
		// direction to the fragment stage so it can reclassify without any tangent/matrix gymnastics.
		// Vertex stage gets only the fwidth-free CORE (fwidth is fragment-only) — it just needs sphClassify.
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", `#include <common>\n${TILING_GLSL_CORE}\n${CARVE_DECL}`)
			.replace(
				"#include <begin_vertex>",
				`#include <begin_vertex>
				vCarveDir = normalize(position);
				int carveVB;
				transformed += vCarveDir * carveHeight(sphClassify(vCarveDir, carveVB));`,
			);

		// Fragment: paint the procedural albedo (face hue, tinted darker in-hue inside the groove, plus AO
		// shoulder), then bump the shading normal from the surface-gradient of the SAME height field. carveGv
		// stays in main() scope for the normal injection below.
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", `#include <common>\n${TILING_GLSL_CORE}\n${TILING_GLSL_EDGE}\n${CARVE_DECL}`)
			.replace(
				"#include <map_fragment>",
				`int carveFB;
				float carveGv = sphClassify(normalize(vCarveDir), carveFB);
				vec3 carveFace = sphFaceColor(carveFB);
				// Groove tint: darker IN the face hue (a shadowed dip, not a painted gash), then the AO shoulder.
				vec3 carveAlbedo = mix(carveFace, carveFace * 0.72, sphEdge(carveGv));
				carveAlbedo *= mix(1.0, 1.0 - uCarveAoStrength, carveShade(carveGv));
				// diffuseColor is linear working space; sphFaceColor is a display value, so linearise.
				diffuseColor = vec4(sphSRGBToLinear(carveAlbedo), opacity);`,
			)
			.replace(
				"#include <normal_fragment_begin>",
				`#include <normal_fragment_begin>
				{
					float H = carveHeight(carveGv);
					vec3 vP = -vViewPosition;
					vec3 fdx = dFdx(vP), fdy = dFdy(vP);
					vec3 r1 = cross(fdy, normal);
					vec3 r2 = cross(normal, fdx);
					float det = dot(fdx, r1);
					vec3 surfGrad = sign(det) * (dFdx(H) * r1 + dFdy(H) * r2);
					normal = normalize(abs(det) * normal - uCarveNormalStrength * surfGrad);
				}`,
			);
	};
	// Distinct cache key so three never shares a program with a plain MeshStandardMaterial.
	material.customProgramCacheKey = () => "spherical-carved";

	return {
		material,
		update: ({ hueOffset, lineWidth }) => {
			if (hueOffset != null) uniforms.uSphHueOffset.value = hueOffset;
			if (lineWidth != null) uniforms.uSphEdgeWidth.value = Math.max(0, lineWidth) * EDGE_ANGLE_PER_STROKE;
		},
		dispose: () => material.dispose(),
	};
}
