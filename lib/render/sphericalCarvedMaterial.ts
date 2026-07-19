// The "realistic" spherical surface: the tiling lines shaded as if CARVED into the sphere. It is a stock
// MeshStandardMaterial (matte stone — high roughness, no metal) carrying the same baked equirect tiling
// albedo as the flat surface, patched via onBeforeCompile to drive geometry + shading from the SAME
// edge-distance field the texture baker uses (sphericalTextureBaker.ts). Nothing is pre-baked into normal /
// AO / displacement textures: the field is recomputed live in-shader, so the groove stays crisp at any zoom
// and there is no equirect tangent-space distortion near the poles.
//
// Three things, all keyed off g = the arc-distance to the nearest tiling edge (0 on the edge, growing into
// the face):
//   • displacement — the vertex stage raises the faces and sinks the edges into a smooth SDF fillet whose
//     radius is a few line-widths ("use the SDF to calculate the radius"). Real geometry, visible on the rim.
//   • normal — the fragment stage bumps the shading normal from the surface-gradient of that SAME height, so
//     the groove walls catch the light with the exact curvature the displacement carved.
//   • AO — the groove and its shoulder darken (fake contact shadow), folded into both the albedo and three's
//     ambient occlusion so it reads under any light direction.
//
// Solid sphere only — see lib/render/sphericalScene.ts for where this is chosen over the flat MeshBasic.

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { faceExitNormals } from "./sphericalGeometry";

// Must match the texture baker's uniform budget (snub dodecahedron = 92 faces, under the WebGL2 minimum).
const MAX_FACES = 96;

// Same base half-width per stroke unit as sphericalTextureBaker's EDGE_ANGLE_PER_STROKE, so the carved
// groove lands exactly on the painted line rather than beside it.
const EDGE_ANGLE_PER_STROKE = 0.011;

// Radial amplitude of the carve (faces out by +½, edges in by −½). "Slightly", per the design — a subtle
// relief that reads on the silhouette without ballooning the sphere. Tweak here if you want it deeper.
const DEFAULT_CARVE_DEPTH = 0.022;
const DEFAULT_NORMAL_STRENGTH = 1.0; // how hard the groove wall tilts the shading normal
// A light extra shoulder-shadow on top of the in-hue groove tint the baker already lays down (faceCol*0.72)
// and the dip's self-shadow. Kept small so the groove reads as softly shadowed stone, never a dark gash.
const DEFAULT_AO_STRENGTH = 0.14;

export interface CarvedMaterialOptions {
	map: THREE.Texture; // the baked equirect tiling albedo (face colours + painted edges)
	poly: Polyhedron; // face set → the live edge-distance field
	lineWidth?: number; // cfg.lineWidth stroke slider → groove / line half-width
	carveDepth?: number; // radial amplitude (defaults to DEFAULT_CARVE_DEPTH)
}

export interface CarvedMaterial {
	material: THREE.Material; // add to the mesh
	update: (o: { lineWidth?: number }) => void; // stroke changed → move the groove width live (no recompile)
	dispose: () => void;
}

// Shared decls + the SDF/height helpers, injected into BOTH stages after #include <common>.
const DECL = /* glsl */ `
	#define CARVE_MAX_FACES ${MAX_FACES}
	uniform vec3 uCarveFace[CARVE_MAX_FACES]; // exit-face normals (NOT unit) — matches the baker's metric
	uniform int  uCarveFaceCount;
	uniform float uCarveEdgeWidth;   // line half-width in the arc-distance metric
	uniform float uCarveDepth;       // radial displacement amplitude
	uniform float uCarveNormalStrength;
	uniform float uCarveAoStrength;
	varying vec3 vCarveDir;          // undisplaced object-space surface direction (unit)

	// g = distance-to-nearest-edge, the IDENTICAL metric to sphericalTextureBaker's g: classify against the
	// exit normals, take the gap between the top two dot products, normalise by their separation (so the
	// width is a roughly uniform arc distance across every solid and every edge type).
	float carveG(vec3 dir) {
		float m1 = -2.0, m2 = -2.0; int best = 0, sec = 0;
		for (int i = 0; i < CARVE_MAX_FACES; i++) {
			if (i >= uCarveFaceCount) break;
			float d = dot(dir, uCarveFace[i]);
			if (d > m1) { m2 = m1; sec = best; m1 = d; best = i; }
			else if (d > m2) { m2 = d; sec = i; }
		}
		float sep = max(length(uCarveFace[best] - uCarveFace[sec]), 1e-4);
		return (m1 - m2) / sep;
	}

	// Fillet radius: a few line-widths, floored so a hidden/thin stroke still gives a smooth groove. This R
	// is where "use the SDF to calculate the radius" happens — g feeds smoothstep(0, R, g).
	float carveFillet() { return max(uCarveEdgeWidth * 3.0, 0.02); }

	// Height profile: raised plateau on the faces (+½ depth), sunk edge (−½ depth), joined by a smooth
	// fillet across g ∈ [0, R]. The fragment normal is the surface-gradient of exactly this height.
	float carveHeight(float g) { return uCarveDepth * (smoothstep(0.0, carveFillet(), g) - 0.5); }

	// AO / shoulder darkening: widest near the edge, fading out just past the fillet.
	float carveShade(float g) { return 1.0 - smoothstep(0.0, carveFillet() * 1.6, g); }
`;

export function createCarvedSphereMaterial(opts: CarvedMaterialOptions): CarvedMaterial {
	const faces = faceExitNormals(opts.poly);
	const faceArr: THREE.Vector3[] = Array.from({ length: MAX_FACES }, () => new THREE.Vector3());
	for (let i = 0; i < Math.min(faces.length, MAX_FACES); i++) faceArr[i].set(faces[i][0], faces[i][1], faces[i][2]);

	const uniforms = {
		uCarveFace: { value: faceArr },
		uCarveFaceCount: { value: Math.min(faces.length, MAX_FACES) },
		uCarveEdgeWidth: { value: Math.max(0, opts.lineWidth ?? 1) * EDGE_ANGLE_PER_STROKE },
		uCarveDepth: { value: opts.carveDepth ?? DEFAULT_CARVE_DEPTH },
		uCarveNormalStrength: { value: DEFAULT_NORMAL_STRENGTH },
		uCarveAoStrength: { value: DEFAULT_AO_STRENGTH },
	};

	// Matte stone: rough, non-metallic, so the grooves read through AO + soft form shading and the bright
	// tile hues never blow out into specular hot spots.
	const material = new THREE.MeshStandardMaterial({
		map: opts.map,
		roughness: 0.92,
		metalness: 0.0,
		side: THREE.FrontSide,
	});

	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);

		// Vertex: displace along the (undisplaced) radial direction by the height field, and hand that
		// direction to the fragment stage so it can recompute g without any tangent/matrix gymnastics.
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", `#include <common>\n${DECL}`)
			.replace(
				"#include <begin_vertex>",
				`#include <begin_vertex>
				vCarveDir = normalize(position);
				transformed += vCarveDir * carveHeight(carveG(vCarveDir));`,
			);

		// Fragment: darken the groove (the "fake shadow on the lines" — folded into the albedo so it occludes
		// under BOTH direct and indirect light, and needs no aoMap texture), then bump the shading normal from
		// the surface-gradient of the SAME height field. carveGv is declared at map_fragment and stays in
		// main() scope for the normal injection below.
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", `#include <common>\n${DECL}`)
			.replace(
				"#include <map_fragment>",
				`float carveGv = carveG(normalize(vCarveDir));
				#include <map_fragment>
				diffuseColor.rgb *= mix(1.0, 1.0 - uCarveAoStrength, carveShade(carveGv));`,
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
		update: ({ lineWidth }) => {
			if (lineWidth != null) uniforms.uCarveEdgeWidth.value = Math.max(0, lineWidth) * EDGE_ANGLE_PER_STROKE;
		},
		dispose: () => material.dispose(),
	};
}
