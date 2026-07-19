// Shared three.js sphere assembly for the spherical renderer, so the interactive canvas
// (components/spherical-canvas.tsx) and the static thumbnail (components/spherical-thumbnail.tsx) build the
// tiling identically. A plain UV sphere carries the tiling, drawn PROCEDURALLY in the fragment shader (no
// baked texture — sphericalTilingShader.ts), so edges stay pixel-sharp at any zoom; hue-ring and
// stroke-slider changes are plain uniform writes via recolor(). Client-only (imports three).
//
// Two surface looks share this assembly. FLAT (default): an unlit material showing the tiling — edges lie
// flat on the surface (sphericalMaterial.ts). REALISTIC: the tiling lines shaded as if carved into the
// sphere — a lit MeshStandardMaterial driven from the same edge-distance field (sphericalCarvedMaterial.ts),
// on a finer-tessellated sphere so the real displacement resolves.

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { createSphereMaterial, type SphereMaterial } from "./sphericalMaterial";
import { createCarvedSphereMaterial, type CarvedMaterial } from "./sphericalCarvedMaterial";

export const SPHERE_RADIUS = 1;
// Flat surface: comfortably smooth silhouette, no displacement to resolve.
const SPHERE_WIDTH_SEGMENTS = 160;
const SPHERE_HEIGHT_SEGMENTS = 120;
// Realistic surface: finer, so the carved fillet (a few line-widths wide) spans several segments and the
// vertex displacement reads as a smooth groove on the silhouette rather than a faceted notch.
const REALISTIC_WIDTH_SEGMENTS = 512;
const REALISTIC_HEIGHT_SEGMENTS = 256;

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

export interface SphereOptions extends SurfaceOptions {
	realistic?: boolean; // carve the lines into a lit MeshStandardMaterial (see sphericalCarvedMaterial.ts)
}

// Build the sphere for a solid (Platonic or Archimedean), drawing its tiling procedurally on the surface.
// Returns null for a missing solid. Caller owns add/remove + dispose(). (The renderer arg is no longer
// needed — kept for a stable signature with the callers — since there is no bake pass.)
export function createSphere(_renderer: THREE.WebGLRenderer, poly: Polyhedron | null, opts: SphereOptions = {}): Sphere | null {
	if (!poly) return null;

	const realistic = opts.realistic ?? false;
	const wSeg = realistic ? REALISTIC_WIDTH_SEGMENTS : SPHERE_WIDTH_SEGMENTS;
	const hSeg = realistic ? REALISTIC_HEIGHT_SEGMENTS : SPHERE_HEIGHT_SEGMENTS;
	const geom = new THREE.SphereGeometry(SPHERE_RADIUS, wSeg, hSeg);

	let flat: SphereMaterial | null = null;
	let carved: CarvedMaterial | null = null;
	if (realistic) {
		carved = createCarvedSphereMaterial({ poly, hueOffset: opts.hueOffset, lineWidth: opts.lineWidth });
	} else {
		flat = createSphereMaterial({ poly, hueOffset: opts.hueOffset, lineWidth: opts.lineWidth, dark: opts.dark });
	}
	const mat = (carved ?? flat!).material;
	const mesh = new THREE.Mesh(geom, mat);

	return {
		mesh,
		recolor: (o: SurfaceOptions) => {
			if (carved) carved.update({ hueOffset: o.hueOffset, lineWidth: o.lineWidth });
			else flat!.update(o);
		},
		dispose: () => {
			geom.dispose();
			(carved ?? flat!).dispose();
		},
	};
}
