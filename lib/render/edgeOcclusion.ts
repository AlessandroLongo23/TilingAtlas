// Hidden edges: which parts of an edge tube the solid's own faces cover.
//
// ⚑ THE PROBLEM IS THE TUBE'S RADIUS, NOT ITS DEPTH. An edge bar is a cylinder of radius r laid along the
// edge with its CENTRE on the surface, so half the section is buried and only the outer half reads as ink.
// That is right for an edge on the outside of the solid and wrong for one the solid hides: an edge whose
// axis runs a hair UNDER a face still pushes the outer r of its section out through that face, and what
// shows is a dark sliver crawling across a facet that should be unbroken. AL reported it on the non-convex
// shelf (2026-08-25) — "the width of the tube bleeds outside into the polygon". Ordinary depth testing
// cannot answer it, because the sliver genuinely IS in front of the face; it is the tube that should not
// be there, not the pixel that is mis-sorted.
//
// So the test is moved off the tube's SURFACE and onto its AXIS: a fragment of the bar is drawn exactly
// when the point on the edge it wraps is itself visible. That is one rule and it settles all three cases
// AL set out — an edge fully outside draws whole, an edge fully inside draws not at all, and an edge that
// crosses the surface is cut at the crossing, to the pixel, with no cap and nothing to bleed. It also
// covers the case his own splitting rule could not: an edge that is outside the solid but hidden from
// THIS angle by a face passing in front of it.
//
// ⚑ AND IT HAS TO BE PER-VIEW. The obvious alternative is to classify each edge once, geometrically —
// split it where it crosses the surface and keep the outside runs — and I built that first. It does not
// converge. "Outside" for a self-intersecting solid means "some ray from here reaches infinity", and
// probing that by direction sampling still disagreed with itself on 12 of the 476 solids between 176 and
// 352 probe directions, dropping up to 17 runs of a single solid (ncx-72-210-132-c). Escape cones on this
// corpus get arbitrarily narrow, so no fixed budget is safe, and the failure mode is the bad one: a
// visible edge silently deleted, asymmetrically, on a solid whose symmetry is the whole point. The depth
// buffer already answers the same question exactly, for the view being drawn, at no per-solid cost.

import * as THREE from "three";

/** The layer the FACE meshes go on, so the prepass can draw them and nothing else. */
export const OCCLUDER_LAYER = 1;

/** The uniforms a tube/ribbon material tests against. Shared by reference, so `capture` updates every
 *  material that took them without touching any of them. */
export interface EdgeOcclusionUniforms {
	uEdgeDepth: { value: THREE.Texture | null };
	uEdgeBias: { value: number };
	uEdgeOn: { value: number };
	/** What a hidden bar is worth: 0 drops it outright, 1 draws it whole. It is 1 − face opacity, so a bar
	 *  behind a face is dimmed by exactly as much of that face as you cannot see through. */
	uEdgeHidden: { value: number };
}

export interface EdgeOcclusion {
	uniforms: EdgeOcclusionUniforms;
	/** Render the faces' depth. Call once per frame, immediately before the scene render. */
	capture: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void;
	/** Tell the test how solid the faces are. At 1 a hidden bar is dropped; below it the bar survives at
	 *  1 − opacity, which is what you would see of it through that much glass. */
	setFaceOpacity: (o: number) => void;
	dispose: () => void;
}

// ⚑ THE BIAS HAS TO SCALE WITH THE FACE'S DEPTH SLOPE, AND A CONSTANT ONE DOES NOT.
//
// An edge on the outside of the solid lies exactly ON the surface, so its axis and the depth behind it are
// the same number and the comparison is a dead tie. The tie is not decided at the axis's own position: the
// face is rasterised at PIXEL CENTRES, and across one pixel its depth changes by its slope — which on a
// face seen nearly edge-on is enormous. A constant world-space epsilon lost that race on every inclined
// facet, and the edges came out as dotted and dashed lines instead of bars (AL, 2026-08-25, at opacity 1).
//
// So the bias is applied where the slope is known: the prepass pushes the faces AWAY from the camera with
// polygonOffset, whose `factor` term is by construction the polygon's own maximum depth slope. That is the
// standard decal bias, and it is the one case where a slope term is right — the note in buildCreaseRibbons
// warns against `factor` for geometry that is COPLANAR with its face, which never diverges across the
// polygon; here the two surfaces are the same surface seen at a grazing angle, which is the opposite case.
//
// Pushing the occluder back rather than pulling the bar forward also fails in the safe direction: an edge
// buried a hair under a nearly-edge-on face may draw, where the alternative is a visible edge deleted.
const PREPASS_SLOPE = 2;
const PREPASS_UNITS = 8;
// A last constant in WINDOW depth, on top of the slope term, for the flat-on faces where the slope term is
// nearly zero. Two orders above a 24-bit buffer's quantisation and far below any burial worth catching.
const DEPTH_BIAS = 1e-5;

// Depth-only, DoubleSide: the prepass wants the nearest surface whichever way it faces. A non-convex solid
// shows plenty of back faces, and culling them would leave holes for the far side's edges to draw through.
const PREPASS_MATERIAL = new THREE.MeshBasicMaterial({
	colorWrite: false,
	side: THREE.DoubleSide,
	polygonOffset: true,
	polygonOffsetFactor: PREPASS_SLOPE,
	polygonOffsetUnits: PREPASS_UNITS,
});

/**
 * Build the depth prepass. `capture` draws everything on OCCLUDER_LAYER into an offscreen depth texture at
 * the drawing buffer's own size, so the test is per-pixel against the very frame being drawn — including
 * an export, which renders at a different size through the same loop.
 */
export function createEdgeOcclusion(): EdgeOcclusion {
	let target: THREE.WebGLRenderTarget | null = null;
	const size = new THREE.Vector2();
	const uniforms: EdgeOcclusionUniforms = {
		uEdgeDepth: { value: null },
		uEdgeBias: { value: DEPTH_BIAS },
		uEdgeOn: { value: 0 },
		uEdgeHidden: { value: 0 },
	};

	const resize = (w: number, h: number) => {
		if (target && target.width === w && target.height === h) return;
		target?.dispose();
		const depth = new THREE.DepthTexture(w, h);
		depth.type = THREE.UnsignedIntType;
		target = new THREE.WebGLRenderTarget(w, h, { depthTexture: depth, depthBuffer: true });
		uniforms.uEdgeDepth.value = depth;
	};

	return {
		uniforms,
		setFaceOpacity: (o: number) => {
			uniforms.uEdgeHidden.value = 1 - Math.min(Math.max(o, 0), 1);
		},
		capture: (renderer, scene, camera) => {
			renderer.getDrawingBufferSize(size);
			if (size.x < 1 || size.y < 1) return;
			resize(size.x, size.y);
			// The camera's layer mask, the scene's material and the shadow refresh are borrowed for one draw
			// and handed back — the caller's render on the next line has to see exactly what it set up, and
			// the shadow map it is about to build must not be built twice.
			const mask = camera.layers.mask;
			const override = scene.overrideMaterial;
			const shadows = renderer.shadowMap.autoUpdate;
			camera.layers.set(OCCLUDER_LAYER);
			scene.overrideMaterial = PREPASS_MATERIAL;
			renderer.shadowMap.autoUpdate = false;
			renderer.setRenderTarget(target);
			renderer.clear();
			renderer.render(scene, camera);
			renderer.setRenderTarget(null);
			renderer.shadowMap.autoUpdate = shadows;
			scene.overrideMaterial = override;
			camera.layers.mask = mask;
			uniforms.uEdgeOn.value = 1;
		},
		dispose: () => {
			target?.dispose();
			target = null;
			uniforms.uEdgeDepth.value = null;
		},
	};
}

/**
 * Bars draw AFTER the faces, always. While the faces are see-through they stop writing depth, and an
 * opaque bar drawn before them writes depth they then fail against — which knocked ribbon-shaped holes
 * clean through the facets and let the far side show through the near one in a scribble of hairlines (AL,
 * 2026-08-25, at opacity 0.95). Flagging the bars transparent moves them into the same pass as the faces,
 * where renderOrder decides, and 1 puts them last; at opacity 1 the faces are opaque and drawn in the pass
 * before either way, so nothing about that case changes.
 */
export function markEdgeOverlay(object: THREE.Object3D, material: THREE.Material) {
	material.transparent = true;
	object.renderOrder = 1;
}

/** Put a face mesh (and its children) in the prepass. */
export function markOccluder(object: THREE.Object3D) {
	object.traverse((o) => o.layers.enable(OCCLUDER_LAYER));
}

// The test, injected into the fragment shader. `vEdgeAxis` is the point on the EDGE this fragment wraps,
// carried through from the vertex shader; the fragment asks whether that point is behind what the faces
// wrote, not whether the fragment itself is.
//
// The comparison is in WINDOW depth, the same space polygonOffset biases the prepass in, so the two are
// measured in one unit and there is no projection maths here to get wrong under either camera.
//
// A hidden bar FADES rather than vanishing, because the faces hiding it may themselves be see-through. At
// opacity 1 the fade is 0 and this is a plain discard; at 0.6 an interior edge comes through at 0.4, the
// same fraction of it the faces in front let past; at 0 the faces are gone and every bar is whole. One
// expression covers the range, and the slider never jumps.
const OCCLUSION_TEST = /* glsl */ `
	float edgeFade = 1.0;
	if ( uEdgeOn > 0.5 ) {
		vec3 axisNdc = vEdgeAxis.xyz / vEdgeAxis.w;
		vec2 axisUv = axisNdc.xy * 0.5 + 0.5;
		if ( all( greaterThanEqual( axisUv, vec2( 0.0 ) ) ) && all( lessThanEqual( axisUv, vec2( 1.0 ) ) ) ) {
			float surfaceD = texture2D( uEdgeDepth, axisUv ).x;
			float axisD = axisNdc.z * 0.5 + 0.5;
			if ( axisD > surfaceD + uEdgeBias ) {
				if ( uEdgeHidden <= 0.0 ) discard;
				edgeFade = uEdgeHidden;
			}
		}
	}
`;

/**
 * Make a material draw only where the edge it decorates is visible. The geometry must carry an `aAxis`
 * attribute: the point on the edge each vertex belongs to.
 */
export function applyEdgeOcclusion(material: THREE.Material, uniforms: EdgeOcclusionUniforms) {
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace(
				"#include <common>",
				`#include <common>
				attribute vec3 aAxis;
				varying vec4 vEdgeAxis;`,
			)
			.replace(
				"#include <project_vertex>",
				`#include <project_vertex>
				vEdgeAxis = projectionMatrix * modelViewMatrix * vec4( aAxis, 1.0 );`,
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <common>",
				`#include <common>
				uniform sampler2D uEdgeDepth;
				uniform float uEdgeBias;
				uniform float uEdgeOn;
				uniform float uEdgeHidden;
				varying vec4 vEdgeAxis;`,
			)
			.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>${OCCLUSION_TEST}`)
			// `edgeFade` is declared by the test above, in the same scope, and spent here.
			.replace("#include <color_fragment>", "#include <color_fragment>\n\t\t\t\tdiffuseColor.a *= edgeFade;");
	};
	// Without this three reuses the unpatched program compiled for an identical material description.
	material.customProgramCacheKey = () => "edgeOcclusion";
}
