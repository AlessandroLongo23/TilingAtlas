// Shared three.js sphere assembly for the spherical renderer, so the interactive canvas
// (components/spherical-canvas.tsx) and the static thumbnail (components/spherical-thumbnail.tsx) build the
// tiling identically. A plain UV sphere carries an equirectangular tiling texture baked from the {p,q}
// solid; hue-ring and stroke-slider changes re-bake in place via rebake(). Client-only (imports three).
//
// Two surface looks share this assembly. FLAT (default): an unlit MeshBasicMaterial showing the baked
// albedo — edges lie flat on the surface. REALISTIC: the tiling lines shaded as if carved into the sphere —
// a lit MeshStandardMaterial driven live from the same edge-distance field (sphericalCarvedMaterial.ts),
// on a finer-tessellated sphere so the real displacement resolves.

import * as THREE from "three";
import type { Polyhedron } from "./platonicSolids";
import { SphericalTextureBaker, type BakeOptions } from "./sphericalTextureBaker";
import { createSphereMaterial } from "./sphericalMaterial";
import { createCarvedSphereMaterial, type CarvedMaterial } from "./sphericalCarvedMaterial";

export const SPHERE_RADIUS = 1;
// Flat surface: comfortably smooth silhouette, no displacement to resolve.
const SPHERE_WIDTH_SEGMENTS = 160;
const SPHERE_HEIGHT_SEGMENTS = 120;
// Realistic surface: finer, so the carved fillet (a few line-widths wide) spans several segments and the
// vertex displacement reads as a smooth groove on the silhouette rather than a faceted notch.
const REALISTIC_WIDTH_SEGMENTS = 512;
const REALISTIC_HEIGHT_SEGMENTS = 256;

export interface Sphere {
	mesh: THREE.Mesh; // add this to the scene
	rebake: (opts: BakeOptions) => void; // re-bake the texture in place (hue / stroke / theme change)
	dispose: () => void; // frees geometry, material, texture, baker
}

export interface SphereOptions extends BakeOptions {
	textureSize?: number; // equirect texture width (height = width/2). 2048 interactive, smaller for stills.
	realistic?: boolean; // carve the lines into a lit MeshStandardMaterial (see sphericalCarvedMaterial.ts)
}

// Build the sphere for a solid (Platonic or Archimedean), baking its tiling into the surface texture.
// Returns null for a missing solid. Needs the renderer to run the bake pass. Caller owns add/remove +
// dispose().
export function createSphere(renderer: THREE.WebGLRenderer, poly: Polyhedron | null, opts: SphereOptions = {}): Sphere | null {
	if (!poly) return null;

	const realistic = opts.realistic ?? false;
	const baker = new SphericalTextureBaker(renderer, opts.textureSize ?? 2048);
	const bakeOpts: BakeOptions = { hueOffset: opts.hueOffset, lineWidth: opts.lineWidth, dark: opts.dark, realistic };
	const texture = baker.bake(poly, bakeOpts);

	const wSeg = realistic ? REALISTIC_WIDTH_SEGMENTS : SPHERE_WIDTH_SEGMENTS;
	const hSeg = realistic ? REALISTIC_HEIGHT_SEGMENTS : SPHERE_HEIGHT_SEGMENTS;
	const geom = new THREE.SphereGeometry(SPHERE_RADIUS, wSeg, hSeg);

	let carved: CarvedMaterial | null = null;
	let mat: THREE.Material;
	if (realistic) {
		carved = createCarvedSphereMaterial({ map: texture, poly, lineWidth: opts.lineWidth });
		mat = carved.material;
	} else {
		mat = createSphereMaterial({ map: texture });
	}
	const mesh = new THREE.Mesh(geom, mat);

	return {
		mesh,
		rebake: (o: BakeOptions) => {
			// Re-bake the albedo (face hues + line/groove width), keeping the realistic groove-tint mode, and
			// move the carved groove width to match the stroke.
			baker.bake(poly, { ...o, realistic });
			if (carved) carved.update({ lineWidth: o.lineWidth });
		},
		dispose: () => {
			geom.dispose();
			mat.dispose(); // === carved.material when realistic
			baker.dispose();
		},
	};
}
