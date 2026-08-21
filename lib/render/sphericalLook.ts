// The SURFACE LOOK of every spherical 3D view — one switch, one place, so the whole shelf changes together
// and the change can be judged against what it replaced.
//
// Two looks, chosen by cfg.sphericalStudio:
//
//   PLAIN (studio off) — what the Atlas has always drawn. A tiny light rig, matte MeshStandardMaterial, no
//   environment, and the round tiling sphere drawn UNLIT (a flat disc of colour with black arcs on it).
//   Kept byte-for-byte so the toggle is a real before/after and not a "before, roughly".
//
//   STUDIO (studio on) — the same geometry photographed instead of diagrammed. Three things do the work,
//   in order of how much they matter:
//     1. An image-based environment (PMREM of three's RoomEnvironment). This is the big one: it lights
//        every surface from a whole room instead of two lamps, so a facet's brightness varies with its
//        orientation the way a real object's does, and every material gets a specular reflection it did
//        not have before. A polyhedron stops reading as flat vector art the moment it has one.
//     2. Materials that reflect. Matte roughness 0.85–0.9 throws away the environment almost entirely;
//        0.35–0.5 with a whisper of metalness keeps the colour and adds a sheen and a highlight.
//     3. A key/fill/rim rig on top, dimmed because the environment already carries the ambient. The rim is
//        what separates a dark solid from a dark page.
//
// The unlit tiling sphere is the one surface an environment cannot reach (its RawShaderMaterial ignores
// lights by construction), so it gets its own analytic shading inside the fragment shader —
// sphericalMaterial.ts, gated on the same flag.
//
// Client-only (imports three).

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Which rig a view wants. The two differ in how much they are allowed to shade a tile's colour. */
export type LookFlavor =
	// The uniform-tiling sphere and flat solid (/play): the hue is decorative, so shape may win.
	| "tiling"
	// The freedraw / star / Schwarz / colouring shelves: a tile's colour is CATALOGUE DATA (which orbit,
	// which colour class), so the same colour must stay recognisably the same colour wherever it sits on
	// the solid. Studio still lights it, but with the contrast pulled well in.
	| "catalogue";

// One PMREM per renderer, built on first use and kept for the renderer's life. Generating it costs ~20 ms
// and a render target; every sphere on a page shares one renderer, so this happens once.
const envCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture | null {
	const cached = envCache.get(renderer);
	if (cached) return cached;
	try {
		const pmrem = new THREE.PMREMGenerator(renderer);
		const room = new RoomEnvironment();
		const texture = pmrem.fromScene(room, 0.04).texture;
		room.dispose();
		pmrem.dispose();
		envCache.set(renderer, texture);
		return texture;
	} catch (e) {
		// A context that cannot render to a float target still has to draw the solid; drop to lights only.
		console.warn("sphericalLook: environment unavailable —", e);
		return null;
	}
}

export interface LookRig {
	/** Flip the look without rebuilding the scene's lights. */
	setStudio: (studio: boolean) => void;
	dispose: () => void;
}

// Light intensities per flavor and look. The plain columns are the values these scenes have always used —
// spherical-canvas.tsx's boosted rig, and the deliberately flat one ico-freedraw-canvas.tsx documents.
const RIGS = {
	tiling: {
		plain: { hemi: 0.85, ambient: 0.2, key: 0.8, fill: 0, rim: 0, env: 0 },
		// Environment carries the ambient, so the hemisphere and ambient drop hard and the key does the
		// modelling. The rim is a back-left light that draws a bright edge along the silhouette.
		studio: { hemi: 0.18, ambient: 0.06, key: 1.15, fill: 0.3, rim: 0.55, env: 0.85 },
	},
	catalogue: {
		plain: { hemi: 0.45, ambient: 0.85, key: 0.12, fill: 0, rim: 0, env: 0 },
		// Much gentler: ambient stays high so a tile colour survives, and the environment is dialled back
		// to a sheen rather than a light source.
		studio: { hemi: 0.25, ambient: 0.45, key: 0.42, fill: 0.16, rim: 0.42, env: 0.5 },
	},
} as const;

// Key light from over the viewer's right shoulder (the long-standing direction), fill from the opposite
// side to keep the shadow side readable, rim from behind so the silhouette separates from the page.
const KEY_POS: [number, number, number] = [3, 4, 5];
const FILL_POS: [number, number, number] = [-4, 0.5, 2];
const RIM_POS: [number, number, number] = [-2.5, 2, -4.5];

/**
 * Install the light rig + environment for a spherical scene. Owns the lights it adds; the caller disposes.
 * The plain path reproduces each view's existing rig exactly, so `studio: false` is a true "before".
 */
export function installLookRig(
	renderer: THREE.WebGLRenderer,
	scene: THREE.Scene,
	flavor: LookFlavor,
	studio: boolean,
): LookRig {
	const hemi = new THREE.HemisphereLight(0xffffff, flavor === "tiling" ? 0x445566 : 0xccd0d6, 0);
	const ambient = new THREE.AmbientLight(0xffffff, 0);
	const key = new THREE.DirectionalLight(0xffffff, 0);
	key.position.set(...KEY_POS);
	// Slightly cool fill / warm rim: the cheapest way to make a single-hue solid read as photographed
	// rather than flood-lit, and far too subtle to shift a catalogue colour.
	const fill = new THREE.DirectionalLight(0xdbe6ff, 0);
	fill.position.set(...FILL_POS);
	const rim = new THREE.DirectionalLight(0xfff2e0, 0);
	rim.position.set(...RIM_POS);
	scene.add(hemi, ambient, key, fill, rim);

	const apply = (on: boolean) => {
		const r = RIGS[flavor][on ? "studio" : "plain"];
		hemi.intensity = r.hemi;
		ambient.intensity = r.ambient;
		key.intensity = r.key;
		fill.intensity = r.fill;
		rim.intensity = r.rim;
		scene.environment = on ? studioEnvironment(renderer) : null;
		scene.environmentIntensity = r.env;
	};
	apply(studio);

	return {
		setStudio: apply,
		dispose: () => {
			scene.remove(hemi, ambient, key, fill, rim);
			hemi.dispose();
			ambient.dispose();
			key.dispose();
			fill.dispose();
			rim.dispose();
			scene.environment = null;
		},
	};
}

// How a surface answers the environment. Roles are read off the material rather than threaded through
// eight builder signatures: every FILL in these scenes carries per-vertex colour (a facet's hue is baked
// into the geometry) and every LINE — edge tube, crease ribbon, strap — is a single-colour material.
// That split is exact today, and a new material that breaks it lands in the "line" bucket, whose numbers
// are the conservative ones.
const ROLES = {
	facet: { roughness: 0.42, metalness: 0.04, envMapIntensity: 1.0 },
	line: { roughness: 0.32, metalness: 0.18, envMapIntensity: 0.85 },
	// The carved "realistic" sphere is stone, and stone that reflects like a chrome bar stops reading as
	// carved. Polished, not plated: it keeps a broad soft highlight and no metal.
	stone: { roughness: 0.55, metalness: 0.0, envMapIntensity: 0.8 },
} as const;

/** Materials whose role the vertexColors rule would get wrong tag themselves through userData.sphLook. */
export type LookRole = keyof typeof ROLES;

/**
 * Re-tune a built object's materials for the studio look. A no-op when `studio` is false, which is what
 * keeps the plain look untouched — so every caller can apply this unconditionally right after building.
 *
 * Only MeshStandardMaterial (and its Physical subclass) is touched: the unlit materials in these scenes
 * are load-bearing — the star shelf's density fill counts covering sheets through an exact custom blend,
 * and the flat Islamic fill is a deliberately flat colour field — and shading either would be a lie.
 */
export function applyStudioMaterials(root: THREE.Object3D, studio: boolean): void {
	if (!studio) return;
	root.traverse((node) => {
		const mesh = node as THREE.Mesh;
		if (!mesh.isMesh) return;
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const m of mats) {
			if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
			const std = m as THREE.MeshStandardMaterial;
			const tagged = std.userData?.sphLook as LookRole | undefined;
			const spec = ROLES[tagged ?? (std.vertexColors ? "facet" : "line")];
			std.roughness = spec.roughness;
			std.metalness = spec.metalness;
			std.envMapIntensity = spec.envMapIntensity;
			std.needsUpdate = true;
		}
	});
}
