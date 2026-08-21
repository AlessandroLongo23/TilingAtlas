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

// ── Tunables ──────────────────────────────────────────────────────────────────────────────────────
// The whole studio look in one object, so a change lands everywhere at once and the numbers can be
// compared side by side instead of hunted across four files. In dev this is reachable as
// `window.__sphLook` (see the bottom of this file), which is how the values below were chosen: flip
// sphericalStudio off and on to rebuild the materials against a new set.
export const LOOK = {
	// Colour grade. The catalogue hues are deliberately pale (HSB saturation 0.40, value 1.0) because a
	// flat unlit fill has nothing but hue to work with. Lit, that same pale fill washes to near-white
	// wherever the key hits it, so studio deepens the colour to give the light something to sit on.
	sat: 1.35, // >1 pushes away from grey, around the colour's own luminance
	val: 0.84, // <1 darkens, so a fully lit facet stops short of the paper white behind it
	// The flat tiling sphere's analytic rig (sphericalMaterial.ts FRAG_STUDIO).
	specStrength: 0.06,
	specPower: 180,
	fresnel: 0.2,
	// Image-based lighting. One number: studio lights both flavors the same way (see RIGS).
	envTiling: 0.55,
	// Sun shadows. The key light casts, so a star polyhedron's spikes shade the pockets between them and
	// the concavity reads as concavity — the thing a flat fill cannot say. Bounds are exact: every solid
	// here is inscribed in the unit sphere, so an orthographic shadow camera of half-width 1.8 covers it
	// with room for the star points that reach past radius 1.
	shadowRadius: 1.8,
	shadowBias: -0.0006,
	shadowNormalBias: 0.02,
	// Material roles.
	facetRough: 0.55,
	facetMetal: 0.0,
	facetEnv: 1.0,
	lineRough: 0.5,
	lineMetal: 0.0,
	lineEnv: 0.5,
};

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
	/**
	 * Point the rig at the camera. Call once per frame, before render.
	 *
	 * ⚑ The lights are CAMERA-RELATIVE, and that is not a stylistic choice. These views rotate by orbiting
	 * the camera around a solid that never moves, so a world-fixed light keeps hitting the same faces from
	 * the same angle forever: drag the solid around and the shading is painted on, every shadow frozen
	 * exactly where it was (AL, 2026-08-21 — "the shadows are static, regardless of the rotation"). Moving
	 * the rig with the camera restores what the gesture is supposed to mean, a solid turning under fixed
	 * studio lamps, and it puts the lit meshes in the same frame as the tiling sphere's own shader, which
	 * lights in view space for the same reason.
	 */
	follow: (camera: THREE.Camera) => void;
	dispose: () => void;
}

// Light intensities per flavor and look. The plain columns are the values these scenes have always used —
// spherical-canvas.tsx's boosted rig, and the deliberately flat one ico-freedraw-canvas.tsx documents.
// ⚑ ONE studio rig for both flavors, two different plain ones. The flavors exist because the plain looks
// genuinely differ (the catalogue shelves flood their solids with ambient so a tile colour reads the same
// everywhere). Studio started out keeping that split, and the result was that a star polyhedron came out
// visibly washed out beside a convex one — AL, 2026-08-21: "the colors of the convex solids are more
// saturated than those of the non-convex", which is exactly backwards from the palettes (star tiles are
// HSB 0.50/0.98, convex ones 0.40/1.00). Flat white ambient was eating the saturation. Studio therefore
// lights every spherical shelf identically; the flavor now only chooses the plain fallback.
const STUDIO_RIG = { hemi: 0.18, ambient: 0.06, key: 1.15, fill: 0.3, rim: 0.55, env: () => LOOK.envTiling };
const RIGS = {
	tiling: {
		plain: { hemi: 0.85, ambient: 0.2, key: 0.8, fill: 0, rim: 0, env: () => 0 },
		studio: STUDIO_RIG,
	},
	catalogue: {
		plain: { hemi: 0.45, ambient: 0.85, key: 0.12, fill: 0, rim: 0, env: () => 0 },
		studio: STUDIO_RIG,
	},
} as const;

// Light positions, in the CAMERA's frame (x right, y up, z toward the viewer) — see LookRig.follow. Key
// from over the viewer's right shoulder (the long-standing direction), fill from the opposite side to keep
// the shadow side readable, rim from behind the solid so its silhouette separates from the page.
const KEY_POS = new THREE.Vector3(3, 4, 5);
const FILL_POS = new THREE.Vector3(-4, 0.5, 2);
const RIM_POS = new THREE.Vector3(-2.5, 2, -4.5);

/**
 * Install the light rig + environment for a spherical scene. Owns the lights it adds; the caller disposes.
 * The plain path reproduces each view's existing rig exactly, so `studio: false` is a true "before".
 */
export function installLookRig(
	renderer: THREE.WebGLRenderer,
	scene: THREE.Scene,
	flavor: LookFlavor,
	studio: boolean,
	/** Shadow-map resolution. 2048 for a full-viewport solid; 512 is plenty for a 256 px thumbnail. */
	shadowMapSize = 2048,
): LookRig {
	const hemi = new THREE.HemisphereLight(0xffffff, flavor === "tiling" ? 0x445566 : 0xccd0d6, 0);
	const ambient = new THREE.AmbientLight(0xffffff, 0);
	const key = new THREE.DirectionalLight(0xffffff, 0);
	key.position.copy(KEY_POS);
	// Slightly cool fill / warm rim: the cheapest way to make a single-hue solid read as photographed
	// rather than flood-lit, and far too subtle to shift a catalogue colour.
	const fill = new THREE.DirectionalLight(0xdbe6ff, 0);
	fill.position.copy(FILL_POS);
	const rim = new THREE.DirectionalLight(0xfff2e0, 0);
	rim.position.copy(RIM_POS);
	// Only the key casts. A second shadow-casting light doubles the cost and, on a solid with this much
	// concavity, mostly cancels the first one's reading of the shape.
	key.castShadow = true;
	key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
	const cam = key.shadow.camera as THREE.OrthographicCamera;
	cam.left = -LOOK.shadowRadius;
	cam.right = LOOK.shadowRadius;
	cam.top = LOOK.shadowRadius;
	cam.bottom = -LOOK.shadowRadius;
	cam.near = 0.5;
	cam.far = 20;
	cam.updateProjectionMatrix();
	key.shadow.bias = LOOK.shadowBias;
	// normalBias is what keeps a DoubleSide star face from shadowing itself into stripes: it pushes the
	// shadow lookup along the surface normal, so a face is never a hair in front of its own depth sample.
	key.shadow.normalBias = LOOK.shadowNormalBias;
	scene.add(hemi, ambient, key, fill, rim);

	const apply = (on: boolean) => {
		const r = RIGS[flavor][on ? "studio" : "plain"];
		hemi.intensity = r.hemi;
		ambient.intensity = r.ambient;
		key.intensity = r.key;
		fill.intensity = r.fill;
		rim.intensity = r.rim;
		scene.environment = on ? studioEnvironment(renderer) : null;
		scene.environmentIntensity = r.env();
		// Shadows are renderer-global state; every spherical view on a page shares one look, so this is
		// never contested. PCFSoft costs a blur in the lookup and is what keeps a 2048 map from reading
		// as a staircase along a star polyhedron's ridge.
		renderer.shadowMap.enabled = on;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.shadowMap.needsUpdate = true;
	};
	apply(studio);

	// Rotate each light's camera-frame offset into world space. The lights all aim at their default target,
	// the world origin, which is where every one of these solids is centred — so a rotated position is a
	// rotated direction, and nothing else needs updating. The hemisphere and ambient lights stay world-fixed
	// on purpose: a sky/ground gradient that swung with the camera would read as the SOLID wobbling.
	const follow = (camera: THREE.Camera) => {
		key.position.copy(KEY_POS).applyQuaternion(camera.quaternion);
		fill.position.copy(FILL_POS).applyQuaternion(camera.quaternion);
		rim.position.copy(RIM_POS).applyQuaternion(camera.quaternion);
	};

	return {
		setStudio: apply,
		follow,
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
	facet: () => ({ roughness: LOOK.facetRough, metalness: LOOK.facetMetal, envMapIntensity: LOOK.facetEnv }),
	// Lines cover two shapes that must agree: the round edge tubes and the FLAT crease ribbons the star
	// shelf lays on its faces. A flat ribbon is a mirror where a tube is a cylinder, so anything glossy
	// makes the creases flare white next to a tube that stays dark (AL, 2026-08-21). Keeping them rough
	// and non-metallic is what holds the two together.
	line: () => ({ roughness: LOOK.lineRough, metalness: LOOK.lineMetal, envMapIntensity: LOOK.lineEnv }),
	// The carved "realistic" sphere is stone, and stone that reflects like a chrome bar stops reading as
	// carved. Polished, not plated: it keeps a broad soft highlight and no metal.
	stone: () => ({ roughness: 0.55, metalness: 0.0, envMapIntensity: 0.8 }),
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
			const role = tagged ?? (std.vertexColors ? "facet" : "line");
			const spec = ROLES[role]();
			std.roughness = spec.roughness;
			std.metalness = spec.metalness;
			std.envMapIntensity = spec.envMapIntensity;
			// Deepen the fill colour, for the reason LOOK.sat gives. Only the fills: a line is already dark,
			// and grading it would only wash it toward grey.
			if (role === "facet") gradeMaterial(std);
			std.needsUpdate = true;
			// Cast AND receive: on a star polyhedron the interesting shadows are the ones a solid throws on
			// itself. Restricted to the lit meshes, so the density-sheet fill (an unlit accumulation of
			// coincident transparent patches) never enters the shadow pass, where it would be nonsense.
			mesh.castShadow = true;
			mesh.receiveShadow = true;
		}
	});
}

// The colour grade, as a patch on three's own fragment shader. diffuseColor at this point is the linear
// working-space albedo with vertex colours already folded in, which is exactly what wants deepening.
//
// ⚑ There is deliberately NO ambient occlusion term here. The obvious cheap proxy — darken by distance
// from the centre, on the theory that a point deep in a star polyhedron's pocket is more enclosed than one
// out at a tip — is wrong, and looks it: the interior of any FLAT polygon is nearer the centre than its own
// corners, so every face picks up a dark blob in the middle of it that corresponds to nothing (AL,
// 2026-08-21, on the crossed square cupola). Real occlusion needs real visibility, either ray-cast per
// vertex at build time or screen-space in a post pass; a radial stand-in is not an approximation of it.
function gradeMaterial(std: THREE.MeshStandardMaterial): void {
	// A material that already patches its own shader (the carved sphere) owns that hook; do not take it.
	// `onBeforeCompile` is a no-op on Material.prototype, so the test is for an OWN one, not for truthiness.
	if (Object.prototype.hasOwnProperty.call(std, "onBeforeCompile")) return;
	const sat = LOOK.sat.toFixed(3);
	const val = LOOK.val.toFixed(3);
	std.onBeforeCompile = (shader) => {
		shader.fragmentShader = shader.fragmentShader.replace(
			"#include <color_fragment>",
			`#include <color_fragment>
			{
				float sphLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
				diffuseColor.rgb = clamp(mix(vec3(sphLum), diffuseColor.rgb, ${sat}) * ${val}, 0.0, 1.0);
			}`,
		);
	};
	const key = `sph-studio-grade:${sat}:${val}`;
	std.customProgramCacheKey = () => key;
}

// Dev-only tuning hook. `window.__sphLook.set({ sat: 1.5, specStrength: 0.08 })` then flip the Studio
// checkbox (or `window.__stores.configuration.setState({ sphericalStudio: false })` and back) to rebuild
// the materials against the new numbers. Stripped from production builds.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
	(window as unknown as { __sphLook?: unknown }).__sphLook = {
		get: () => ({ ...LOOK }),
		set: (patch: Partial<typeof LOOK>) => Object.assign(LOOK, patch),
	};
}
