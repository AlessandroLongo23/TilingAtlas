// The material seam for the spherical renderer — the ONE place a future textured / PBR surface plugs in.
// The tiling (face colours + edges) is baked into an equirectangular `map` (sphericalTextureBaker.ts) and
// the sphere is a plain UV sphere, so the surface is now standard PBR-shaped: today a flat opaque
// MeshBasicMaterial carrying just the tiling map. When we want the surface to react to light and look like
// a real material, swap this for a MeshStandardMaterial/MeshPhysicalMaterial and add normalMap /
// displacementMap / roughnessMap — they share the sphere's UVs, so nothing else changes.

import * as THREE from "three";

export interface SphereMaterialOptions {
	// Reserved for the future textured/PBR path: normalMap, displacementMap, displacementScale, roughness,
	// metalness, roughnessMap, envMap — set them when this switches to MeshStandardMaterial.
	map: THREE.Texture;
}

// The sphere surface material. FLAT + OPAQUE today (MeshBasicMaterial ignores the scene lights by design);
// the tiling colours + edges come entirely from `map`. FrontSide since a convex sphere occludes its back.
// SWAP POINT for future textured/lit materials — see file head.
export function createSphereMaterial(opts: SphereMaterialOptions): THREE.Material {
	return new THREE.MeshBasicMaterial({ map: opts.map, side: THREE.FrontSide });
}
