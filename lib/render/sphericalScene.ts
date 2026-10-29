// Shared three.js sphere assembly for the spherical renderer, so the interactive canvas
// (components/spherical-canvas.tsx) and the static thumbnail (components/spherical-thumbnail.tsx) build the
// tiling identically. A plain UV sphere carries the tiling, drawn PROCEDURALLY in the fragment shader (no
// baked texture — sphericalTilingShader.ts), so edges stay pixel-sharp at any zoom; hue-ring and
// stroke-slider changes are plain uniform writes via recolor(). Client-only (imports three).
//
// There used to be a second surface here, "Realistic", which carved the tiling lines into the sphere as
// displaced geometry on a 512×256 mesh. Deleted with its material and its control (AL, 2026-08-25).

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { createSphereMaterial, type SphereLook } from "./sphericalMaterial";

export const SPHERE_RADIUS = 1;
// Comfortably smooth silhouette; nothing displaces the surface, so this is all it has to carry.
const SPHERE_WIDTH_SEGMENTS = 160;
const SPHERE_HEIGHT_SEGMENTS = 120;

// Live surface controls — the hue ring, stroke width, theme and material, all written straight into
// shader uniforms.
export type SurfaceOptions = SphereLook;

export interface Sphere {
	mesh: THREE.Mesh; // add this to the scene
	recolor: (opts: SurfaceOptions) => void; // write hue / stroke / theme / material into the shader (no rebuild)
	dispose: () => void; // frees geometry + material
}

// Build the sphere for a solid (Platonic or Archimedean), drawing its tiling procedurally on the surface.
// Returns null for a missing solid. Caller owns add/remove + dispose(). The renderer's context carries the
// materials' scanned surfaces.
export function createSphere(
	renderer: THREE.WebGLRenderer,
	poly: Polyhedron | null,
	opts: SurfaceOptions = {},
): Sphere | null {
	if (!poly) return null;

	const geom = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS);
	const surface = createSphereMaterial({ poly, renderer, ...opts });
	const mesh = new THREE.Mesh(geom, surface.material);
	mesh.onBeforeRender = () => surface.tick();

	return {
		mesh,
		recolor: (o: SurfaceOptions) => surface.update(o),
		dispose: () => {
			geom.dispose();
			surface.dispose();
		},
	};
}
