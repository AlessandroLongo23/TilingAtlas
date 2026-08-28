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
import { createSphereMaterial } from "./sphericalMaterial";

export const SPHERE_RADIUS = 1;
// Comfortably smooth silhouette; nothing displaces the surface, so this is all it has to carry.
const SPHERE_WIDTH_SEGMENTS = 160;
const SPHERE_HEIGHT_SEGMENTS = 120;

// Live surface controls — the hue ring, stroke width, and theme, all written straight into shader uniforms.
export interface SurfaceOptions {
	hueOffset?: number;
	lineWidth?: number; // stroke slider (0 hides edges)
	dark?: boolean; // theme — flat line colour
}

export interface Sphere {
	mesh: THREE.Mesh; // add this to the scene
	recolor: (opts: SurfaceOptions) => void; // write hue / stroke / theme into the shader (no rebuild)
	dispose: () => void; // frees geometry + material
}

// Build the sphere for a solid (Platonic or Archimedean), drawing its tiling procedurally on the surface.
// Returns null for a missing solid. Caller owns add/remove + dispose(). (The renderer arg is no longer
// needed — kept for a stable signature with the callers — since there is no bake pass.)
export function createSphere(_renderer: THREE.WebGLRenderer, poly: Polyhedron | null, opts: SurfaceOptions = {}): Sphere | null {
	if (!poly) return null;

	const geom = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS);
	const surface = createSphereMaterial({ poly, hueOffset: opts.hueOffset, lineWidth: opts.lineWidth, dark: opts.dark });
	const mesh = new THREE.Mesh(geom, surface.material);

	return {
		mesh,
		recolor: (o: SurfaceOptions) => surface.update(o),
		dispose: () => {
			geom.dispose();
			surface.dispose();
		},
	};
}
