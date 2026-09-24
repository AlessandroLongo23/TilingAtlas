// The SURFACE LOOK of every spherical 3D view — one place, so the whole shelf looks like one shelf.
//
// The geometry is photographed, not diagrammed. Three things do the work, in order of how much they
// matter:
//   1. An image-based environment (PMREM of three's RoomEnvironment). This is the big one: it lights
//      every surface from a whole room instead of two lamps, so a facet's brightness varies with its
//      orientation the way a real object's does, and every material gets a specular reflection it did
//      not have before. A polyhedron stops reading as flat vector art the moment it has one.
//   2. Materials that reflect. Matte roughness 0.85–0.9 throws away the environment almost entirely;
//      0.35–0.5 with a whisper of metalness keeps the colour and adds a sheen and a highlight.
//   3. A key/fill/rim rig on top, dimmed because the environment already carries the ambient. The rim is
//      what separates a dark solid from a dark page.
//
// This used to be one of two looks behind a "Studio look" checkbox, the other being the flat diagram look
// the Atlas drew before it. The choice is gone (AL, 2026-08-25): the diagram look was never the one anyone
// picked, and keeping it meant every surface in this file, every canvas and every thumbnail carried a
// second code path to hold it. The plain rig, the unlit fragment shader and the flag are all deleted.
//
// The tiling sphere is the one surface an environment cannot reach (its RawShaderMaterial ignores lights
// by construction), so it shades itself analytically in its fragment shader — sphericalMaterial.ts.
//
// Client-only (imports three).

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Which scene a view belongs to. The two differ only in the hemisphere light's ground colour (see RIG),
 *  but they stay separate because the thumbnail stage keeps one scene per flavor. */
export type LookFlavor =
	// The uniform-tiling sphere and flat solid (/play): the hue is decorative, so shape may win.
	| "tiling"
	// The freedraw / star / Schwarz / colouring shelves: a tile's colour is CATALOGUE DATA (which orbit,
	// which colour class), so the same colour must stay recognisably the same colour wherever it sits on
	// the solid.
	| "catalogue";

// ── Tunables ──────────────────────────────────────────────────────────────────────────────────────
// The whole look in one object, so a change lands everywhere at once and the numbers can be compared
// side by side instead of hunted across four files. In dev this is reachable as `window.__sphLook` (see
// the bottom of this file), which is how the values below were chosen.
export const LOOK = {
	// Colour grade. The catalogue hues are deliberately pale (the tile palette) because a
	// flat unlit fill has nothing but hue to work with. Lit, that same pale fill washes to near-white
	// wherever the key hits it, so studio deepens the colour to give the light something to sit on.
	sat: 1.35, // >1 pushes away from grey, around the colour's own luminance
	val: 0.84, // <1 darkens, so a fully lit facet stops short of the paper white behind it
	// The tiling sphere's analytic rig (sphericalMaterial.ts).
	specStrength: 0.06,
	specPower: 180,
	fresnel: 0.2,
	// Image-based lighting. One number: both flavors are lit the same way (see RIG).
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

// ⚑ ONE rig for both flavors, and that is the correction, not the shortcut. Each flavor used to light its
// own way, and the result was that a star polyhedron came out visibly washed out beside a convex one —
// AL, 2026-08-21: "the colors of the convex solids are more saturated than those of the non-convex",
// which is exactly backwards from the palettes as they then stood (star tiles HSB 0.50/0.98, convex ones
// 0.40/1.00). Flat white ambient was eating the saturation. Every spherical shelf is lit identically now,
// and both shelves take their fill from lib/render/tilePalette.ts, so they cannot drift apart.
const RIG = { hemi: 0.18, ambient: 0.06, key: 1.15, fill: 0.3, rim: 0.55, env: LOOK.envTiling };

// Light positions, in the CAMERA's frame (x right, y up, z toward the viewer) — see LookRig.follow. Key
// from over the viewer's right shoulder (the long-standing direction), fill from the opposite side to keep
// the shadow side readable, rim from behind the solid so its silhouette separates from the page.
const KEY_POS = new THREE.Vector3(3, 4, 5);
const FILL_POS = new THREE.Vector3(-4, 0.5, 2);
const RIM_POS = new THREE.Vector3(-2.5, 2, -4.5);

/**
 * Install the light rig + environment for a spherical scene. Owns the lights it adds; the caller disposes.
 */
export function installLookRig(
	renderer: THREE.WebGLRenderer,
	scene: THREE.Scene,
	flavor: LookFlavor,
	/** Shadow-map resolution. 2048 for a full-viewport solid; 512 is plenty for a 256 px thumbnail. */
	shadowMapSize = 2048,
): LookRig {
	const hemi = new THREE.HemisphereLight(0xffffff, flavor === "tiling" ? 0x445566 : 0xccd0d6, RIG.hemi);
	const ambient = new THREE.AmbientLight(0xffffff, RIG.ambient);
	const key = new THREE.DirectionalLight(0xffffff, RIG.key);
	key.position.copy(KEY_POS);
	// Slightly cool fill / warm rim: the cheapest way to make a single-hue solid read as photographed
	// rather than flood-lit, and far too subtle to shift a catalogue colour.
	const fill = new THREE.DirectionalLight(0xdbe6ff, RIG.fill);
	fill.position.copy(FILL_POS);
	const rim = new THREE.DirectionalLight(0xfff2e0, RIG.rim);
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
	scene.environment = studioEnvironment(renderer);
	scene.environmentIntensity = RIG.env;
	// Shadows are renderer-global state; every spherical view on a page shares one look, so this is never
	// contested. PCFSoft is deprecated as of three 0.185 (WebGLShadowMap downgrades it to PCF and warns on
	// every render), so ask for PCF directly; its hardware comparison tap is what keeps a 2048 map from
	// reading as a staircase along a star polyhedron's ridge. VSM is the one soft mode left and is wrong
	// here: it makes every receiver a caster and bleeds light through this much concavity.
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	renderer.shadowMap.needsUpdate = true;

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
} as const;

/** Materials whose role the vertexColors rule would get wrong tag themselves through userData.sphLook. */
export type LookRole = keyof typeof ROLES;

/**
 * Re-tune a built object's materials for the look. Every caller applies this right after building.
 *
 * Only MeshStandardMaterial (and its Physical subclass) is touched: the unlit materials in these scenes
 * are load-bearing — the star shelf's density fill counts covering sheets through an exact custom blend,
 * and the flat Islamic fill is a deliberately flat colour field — and shading either would be a lie.
 */
export function applyStudioMaterials(root: THREE.Object3D): void {
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

// Dev-only tuning hook. `window.__sphLook.set({ sat: 1.5, specStrength: 0.08 })`, then change a control
// that rebuilds the surface (the shape toggle will do) to compile the materials against the new numbers.
// Stripped from production builds.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
	(window as unknown as { __sphLook?: unknown }).__sphLook = {
		get: () => ({ ...LOOK }),
		set: (patch: Partial<typeof LOOK>) => Object.assign(LOOK, patch),
	};
}
