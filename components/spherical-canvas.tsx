"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ArcballControls } from "three/examples/jsm/controls/ArcballControls.js";
import { useConfiguration } from "@/stores/configuration";
import {
	applyCameraAspect,
	cameraDistanceFor,
	DEFAULT_FIT_FRACTION,
	makeArcball,
	makeSphericalCamera,
	orthoHalfHeightFor,
	swapProjection,
	type SphericalCamera,
} from "@/lib/render/sphericalCamera";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { measureBox } from "@/lib/render/canvasSize";
import { captureOverride, offerFrame } from "@/lib/render/capture";
import { createSphere, type Sphere } from "@/lib/render/sphericalScene";
import { createOrbitMomentum, type OrbitMomentum } from "@/lib/render/orbitMomentum";
import { installLookRig, applyStudioMaterials, type LookRig } from "@/lib/render/sphericalLook";
import { buildFlatSolid, type FlatSolid } from "@/lib/render/sphericalPolyhedron";
import { buildBubbleSphere, type BubbleSphere } from "@/lib/render/sphBubble";
import { hasSphereView } from "@/lib/tilings/sph-inscribed";
import { createEdgeOcclusion, type EdgeOcclusion } from "@/lib/render/edgeOcclusion";
import { buildIslamicPattern, type IslamicPattern } from "@/lib/render/sphericalIslamicMesh";
import { buildIslamicFill, type IslamicFill } from "@/lib/render/sphericalIslamicFill";
import { buildIslamicWeave, type IslamicWeave } from "@/lib/render/sphericalIslamicWeaveMesh";

// The spherical tiling renderer: a real 3D three.js scene with the tiling on a centred sphere, rotated
// FREELY by quaternion (ArcballControls — a virtual trackball, no gimbal lock, no up-vector constraint, so
// there are no poles). It owns its own input — z-10 above the p5 layer's z-[1], ArcballControls consumes
// drag (rotate) + wheel (zoom); panning is off so the sphere stays centred.
//
// Two looks: the BASE SURFACE — the round sphere (the tiling drawn procedurally per fragment on a UV sphere
// — flat surface edges, stroke slider, pixel-sharp at any zoom) or the flat-faced solid, either of them as
// see-through as the opacity slider says; and the ISLAMIC construction (the star pattern as a hollow line
// structure, no base surface — flat ribbons, or rigid tube bars when Rigid is on).
// The <canvas> is created imperatively per mount (a canvas holds one WebGL context for life; forceContextLoss
// on teardown would poison a reused node across a StrictMode remount).

// No width/height props: the host element fills its parent by CSS and the render loop measures it every
// frame (lib/render/canvasSize.ts), so the drawing buffer never trails a layout transition.
interface SphericalCanvasProps {
	/** Stable solid id ("tetrahedron", "cuboctahedron", …) — the routing key for Platonic + Archimedean. */
	solidId: string;
	/**
	 * SPHERICAL BUBBLE: the per-face bite words of a bump/bite decoration of `solidId`.
	 *
	 * Its presence replaces the surface entirely — the procedural shader classifies a direction against
	 * FACE PLANES, and a bubble tile's sides are arcs, crenels or jigsaw tabs, none of which is a plane.
	 * So these draw as a mesh (lib/render/sphBubble.ts) and, unlike every other spherical record, have
	 * NO polyhedron view: there is no flat-faced solid whose faces these are.
	 */
	bubbleBites?: number[][];
	/**
	 * Whether the solid takes input at all — drag, wheel and touch together. False renders the same
	 * scene inert, which is what an embedded sphere in a SCROLLING page (the landing wall) needs
	 * before the reader has claimed it: ArcballControls preventDefaults every wheel event it acts on,
	 * so a live sphere stops the page scrolling the moment the pointer crosses it, and `touch-action:
	 * none` would eat the swipe on a phone. /play, one sphere filling the viewport, leaves it on.
	 */
	interactive?: boolean;
	/**
	 * Fraction of the viewport's height the unit sphere spans at rest. /play's default leaves a
	 * quarter of the frame as margin, which is right for a viewport with controls floating in its
	 * corners; an embedded cell that IS the picture passes 1 and has the solid meet the top and
	 * bottom edges. Only the resting framing — the wheel dollies from there either way.
	 */
	fitFraction?: number;
}

// Resting framing, as the fraction of the viewport half-height the unit sphere spans. 0.75 is /play's
// long-standing look (camera distance 3.2, orthographic half-height 1.33); the two derivations below
// reproduce those numbers exactly, and stay in step for any other fraction a caller asks for.
// Maps the shared islamicBandWidth slider (a fraction, flat default 0.25) to the sphere strap's arc width in
// radians — 0.25 → 0.09 rad, the tuned default look. The Border Width slider goes through the SAME factor, so
// the border/band ratio on the sphere is identical to the flat one for any pair of slider values.
const WEAVE_WIDTH_FACTOR = 0.36;

type Content =
	| { kind: "sphere"; sphere: Sphere }
	| { kind: "solid"; solid: FlatSolid }
	| { kind: "bubble"; bubble: BubbleSphere };

export function SphericalCanvas({ solidId, bubbleBites, interactive = true, fitFraction = DEFAULT_FIT_FRACTION }: SphericalCanvasProps) {
	const poly = useMemo(() => polyhedronForId(solidId), [solidId]);
	const hostRef = useRef<HTMLDivElement | null>(null);
	// The canvas element itself (created imperatively below) — the gate effect writes its touch-action,
	// and the mount effect reads the gate without taking it as a dep (it must never rebuild the WebGL
	// context).
	const canvasElRef = useRef<HTMLCanvasElement | null>(null);
	// Seeded from the first render's prop, then kept current by the gate effect below — never written
	// during render. The two effects that read it (mount, projection swap) both build a fresh
	// ArcballControls, and the gate effect re-applies the live value right after either.
	const interactiveRef = useRef(interactive);
	// The resting framing, read by the mount and projection effects (both build a camera) and by the
	// render loop's resize path. A ref for the same reason as `interactive`: it must not rebuild the
	// WebGL context.
	const fitRef = useRef(fitFraction);
	const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
	const sceneRef = useRef<THREE.Scene | null>(null);
	const cameraRef = useRef<SphericalCamera | null>(null);
	const controlsRef = useRef<ArcballControls | null>(null);
	// Release momentum: let go mid-drag and the solid coasts (lib/render/orbitMomentum.ts). It reads the
	// camera through a ref, so the projection toggle's fresh camera keeps the spin instead of dropping it.
	const momentumRef = useRef<OrbitMomentum | null>(null);
	// Lights + environment (lib/render/sphericalLook.ts). Held in a ref so the render loop can aim it at
	// the camera each frame without the mount effect re-running.
	const lookRigRef = useRef<LookRig | null>(null);
	// Last host box the renderer was sized to. Cleared to force a re-apply when the projection toggle
	// swaps in a fresh camera; the render loop owns every other update.
	const boxRef = useRef({ w: 0, h: 0 });
	const rafRef = useRef<number | null>(null);
	const contentRef = useRef<Content | null>(null);
	// Depth of the FACES alone, re-rendered each frame, so an edge bar can be hidden by the edge's own
	// visibility instead of its surface's (lib/render/edgeOcclusion.ts).
	const occlusionRef = useRef<EdgeOcclusion | null>(null);
	const islamicRef = useRef<IslamicPattern | null>(null);
	const fillRef = useRef<IslamicFill | null>(null);
	const weaveRef = useRef<IslamicWeave | null>(null);
	const [errored, setErrored] = useState(false);

	// Scene + renderer + light rig + RAF loop: created once per mount (fresh canvas), torn down on unmount. The
	// camera + controls live in a SEPARATE effect (below) so the projection toggle can rebuild them without
	// dropping the WebGL context. The loop reads the camera/controls from refs each frame (they may swap).
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		let canvas: HTMLCanvasElement | null = null;
		let renderer: THREE.WebGLRenderer;
		try {
			canvas = document.createElement("canvas");
			canvas.className = "absolute inset-0 h-full w-full";
			canvas.style.touchAction = interactiveRef.current ? "none" : "auto";
			host.appendChild(canvas);
			canvasElRef.current = canvas;
			renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		} catch (e) {
			console.warn("SphericalCanvas: WebGL unavailable —", e);
			if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
			setErrored(true);
			return;
		}
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.setClearColor(0x000000, 0); // transparent — the app theme background shows through
		rendererRef.current = renderer;

		const scene = new THREE.Scene();
		sceneRef.current = scene;

		// Light rig + environment — a room environment and a key/fill/rim set, shading every lit material:
		// the weave tubes and the flat polyhedron facets. Inert on the unlit surfaces (the tiling sphere's
		// RawShaderMaterial, the flat Islamic fill's MeshBasicMaterial), which is why the tiling sphere
		// carries its own shading in its own shader. It lives in lib/render/sphericalLook.ts so every
		// spherical view changes together.
		lookRigRef.current = installLookRig(renderer, scene, "tiling");
		occlusionRef.current = createEdgeOcclusion();

		// Camera + trackball controls. The loop reads BOTH from refs each frame because the projection toggle
		// (effect below) recreates them as a fresh pair; reading refs keeps the rendered camera and the
		// controlled camera the same instance, so dragging always follows the pointer.
		const aspect0 = host.clientWidth > 0 && host.clientHeight > 0 ? host.clientWidth / host.clientHeight : 1;
		const camera = makeSphericalCamera(useConfiguration.getState().sphericalOrthographic, aspect0, orthoHalfHeightFor(fitRef.current));
		// A three-quarter start so the solid reads as 3D on first paint (before the user rotates).
		camera.position.set(1.35, 1.05, 2.6).setLength(cameraDistanceFor(fitRef.current));
		camera.lookAt(0, 0, 0);
		camera.updateProjectionMatrix();
		cameraRef.current = camera;
		controlsRef.current = makeArcball(camera, canvas, scene, { interactive: interactiveRef.current });
		momentumRef.current = createOrbitMomentum(() => cameraRef.current, { domElement: canvas });

		// DEBUG (dev only): read the live camera + controls state to diagnose the projection-toggle drift.
		if (process.env.NODE_ENV !== "production") {
			(window as unknown as { __sphCam?: () => unknown }).__sphCam = () => {
				const c = cameraRef.current;
				const ctl = controlsRef.current as unknown as { _tbRadius?: number; radiusFactor?: number } | null;
				const dist = c ? Math.hypot(c.position.x, c.position.y, c.position.z) : 0;
				return c
					? { type: c.type, pos: c.position.toArray(), up: c.up.toArray(), quat: c.quaternion.toArray(), dist, tbRadius: ctl?._tbRadius, radiusFactor: ctl?.radiusFactor }
					: null;
			};
		}

		let capRatio = 1;
		let lastFrame = performance.now();
		const animate = () => {
			const t = performance.now();
			const dt = Math.min((t - lastFrame) / 1000, 0.1); // a backgrounded tab must not launch a huge step
			lastFrame = t;
			// Before controls.update(): the coast moves position/up, and the controls' own lookAt then
			// rebuilds the orientation from them in the same frame.
			momentumRef.current?.frame(dt);
			const controls = controlsRef.current;
			const cam = cameraRef.current;
			// Track the host box here, in the loop, not through a React size prop: a size that
			// arrives a render later gets rescaled into the new box while a layout transition (the /play
			// fullscreen toggle) is running, which reads as the sphere squashing and springing back.
			// See lib/render/canvasSize.ts.
			// An export in flight (lib/render/capture.ts) outranks the host box, the same override the flat
			// and hyperbolic layers get through syncCanvasSize: the sphere is rendered at the requested
			// aspect and resolution, then read back below while the frame is still in the drawing buffer.
			// setSize's third argument stays false, so the element's CSS box never moves and nothing reflows.
			const cap = captureOverride();
			const ratio = cap ? cap.dpr : 1;
			const { w, h } = cap ? { w: cap.w, h: cap.h } : measureBox(host);
			if (w > 0 && h > 0 && (w !== boxRef.current.w || h !== boxRef.current.h || ratio !== capRatio)) {
				boxRef.current = { w, h };
				capRatio = ratio;
				renderer.setPixelRatio(ratio);
				renderer.setSize(w, h, false);
				if (cam) applyCameraAspect(cam, w, h, orthoHalfHeightFor(fitRef.current));
			}
			if (controls) controls.update();
			// The light rig rides the camera, so a drag re-lights the solid instead of sliding a frozen
			// highlight across it. After controls.update(), which is what settles the camera for this frame.
			if (cam) lookRigRef.current?.follow(cam);
			// Back-to-front the see-through facets before anything is drawn (lib/render/depthSort.ts), then
			// take the faces' depth for the hidden-edge test (lib/render/edgeOcclusion.ts).
			if (cam) {
				const c = contentRef.current;
			if (c?.kind === "solid") c.solid.depthSort(cam);
				occlusionRef.current?.capture(renderer, scene, cam);
			}
			if (cam) renderer.render(scene, cam);
			if (cap) offerFrame(renderer.domElement);
			rafRef.current = requestAnimationFrame(animate);
		};
		rafRef.current = requestAnimationFrame(animate);

		return () => {
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			momentumRef.current?.dispose();
			momentumRef.current = null;
			lookRigRef.current?.dispose();
			lookRigRef.current = null;
			occlusionRef.current?.dispose();
			occlusionRef.current = null;
			controlsRef.current?.dispose(); // the LATEST controls (a projection toggle may have swapped it)
			renderer.dispose();
			renderer.forceContextLoss();
			if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
			canvasElRef.current = null;
			rendererRef.current = null;
			sceneRef.current = null;
			cameraRef.current = null;
			controlsRef.current = null;
		};
	}, []);

	// Projection toggle: perspective ⇄ orthographic. Recreate the camera AND the controls as a fresh pair —
	// mutating a live ArcballControls' camera (setCamera) left the trackball corrupt after a swap (rotation
	// stopped following the pointer, and cumulatively broke the other projection too). A fresh controls gets a
	// clean constructor init. Orientation carries across via the copied position/quaternion/up. Guarded to
	// no-op when the live camera already matches the request (the initial mount + StrictMode's double-invoke).
	const orthographic = useConfiguration((s) => s.sphericalOrthographic);
	useEffect(() => {
		const renderer = rendererRef.current;
		const scene = sceneRef.current;
		const host = hostRef.current;
		const prev = cameraRef.current;
		const oldControls = controlsRef.current;
		if (!renderer || !scene || !host || !prev || !oldControls) return;
		const next = swapProjection({
			orthographic,
			prev,
			renderer,
			scene,
			host,
			fit: fitRef.current,
			interactive: interactiveRef.current,
		});
		if (!next) return; // already the requested projection
		cameraRef.current = next.camera;
		controlsRef.current = next.controls; // publish the fresh pair before disposing the old one
		oldControls.dispose();
	}, [orthographic]);

	// The interaction gate. Kept off the mount effect's deps (it must not rebuild the WebGL context)
	// and re-applied on `orthographic` because a projection swap builds a fresh ArcballControls, which
	// would otherwise come up at the constructor default.
	useEffect(() => {
		interactiveRef.current = interactive;
		const controls = controlsRef.current;
		if (controls) controls.enabled = interactive;
		const canvas = canvasElRef.current;
		if (canvas) canvas.style.touchAction = interactive ? "none" : "auto";
	}, [interactive, orthographic]);

	// The BASE surface — rebuilt when the solid or a mode changes. Islamic wins: with it on there is NO base
	// (no sphere, no flat solid) — the star construction lines are the whole picture, drawn by the
	// overlay effect. Otherwise Wireframe gives the hollow tiling-edge tube skeleton, else the solid sphere.
	const faceOpacity = useConfiguration((s) => s.sphericalFaceOpacity);
	const islamicRigid = useConfiguration((s) => s.islamicRigid);
	const isIslamic = useConfiguration((s) => s.isIslamic);
	const polyhedron = useConfiguration((s) => s.sphericalPolyhedron);
	// The bubble surface is rebuilt when the profile changes: the arcs are baked into its geometry, so a
	// new profile is new triangles, not a uniform write.
	const edgeStyle = useConfiguration((s) => s.bubbleEdgeStyle);
	const kochLevel = useConfiguration((s) => s.bubbleKochLevel);
	// Subscribed, not read off getState() with the rest: the mod-2 fill changes which triangles exist, so
	// the solid has to be rebuilt when it flips and the effect needs it as a dependency.
	const starMod2 = useConfiguration((s) => s.starMod2);
	useEffect(() => {
		const renderer = rendererRef.current;
		const scene = sceneRef.current;
		if (!renderer || !scene) return;
		const cfg = useConfiguration.getState();
		const dark = document.documentElement.classList.contains("dark");
		// ⚑ A solid with NO CIRCUMSPHERE has no spherical view, so the flat one is not a preference here,
		// it is the only honest reading. The round sphere is the solid RADIALLY PROJECTED onto its
		// circumsphere; without one, projection moves every vertex a different distance and what appears is
		// a different object — AL saw J31 come out as a blob and asked whether its faces were really regular
		// (2026-08-21). The Options tab hides the toggle for the same records, so this is not overriding a
		// control a visitor can see. lib/tilings/sph-inscribed.ts holds the list and the fit that derives it.
		// ⚑ A bubble decoration overrides the shape toggle, it does not read it. See `bubbleBites`.
		const flat = !bubbleBites && (cfg.sphericalPolyhedron || !hasSphereView(solidId));
		let content: Content | null = null;
		if (bubbleBites) {
			const bubble = buildBubbleSphere(poly, bubbleBites, {
				style: cfg.bubbleEdgeStyle,
				kochLevel: cfg.bubbleKochLevel,
				hueOffset: cfg.hueOffset,
				lineWidth: cfg.lineWidth,
				dark,
				faceOpacity: cfg.sphericalFaceOpacity,
			});
			if (bubble) {
				// ⚑ The studio pass is what makes it read as a lit solid rather than a flat disc, and it only
				// touches MeshStandardMaterial — skipping this call was half of why the surface looked 2D.
				applyStudioMaterials(bubble.object);
				scene.add(bubble.object);
				content = { kind: "bubble", bubble };
			}
		} else if (cfg.isIslamic) {
			// No base surface — the overlay effect below draws the star lines (flat ribbons, or rigid tubes
			// when Wireframe is also on; the Wireframe toggle makes the LINES rigid, it does not add edges).
			content = null;
		} else if (flat) {
			// The TRUE flat-faced solid instead of the round sphere: lit facets + dark edge tubes, same hue.
			const solid = buildFlatSolid(poly, {
				hueOffset: cfg.hueOffset,
				lineWidth: cfg.lineWidth,
				dark,
				faceOpacity: cfg.sphericalFaceOpacity,
				occlude: occlusionRef.current?.uniforms,
				starMod2,
			});
			if (solid) {
				applyStudioMaterials(solid.object);
				scene.add(solid.object);
				content = { kind: "solid", solid };
			}
		} else {
			const sphere = createSphere(renderer, poly, { hueOffset: cfg.hueOffset, lineWidth: cfg.lineWidth, dark });
			if (sphere) {
				applyStudioMaterials(sphere.mesh);
				scene.add(sphere.mesh);
				content = { kind: "sphere", sphere };
			}
		}
		contentRef.current = content;
		return () => {
			if (!content) return;
			if (content.kind === "bubble") {
				scene.remove(content.bubble.object);
				content.bubble.dispose();
			} else if (content.kind === "sphere") {
				scene.remove(content.sphere.mesh);
				content.sphere.dispose();
			} else {
				scene.remove(content.solid.object);
				content.solid.dispose();
			}
			contentRef.current = null;
		};
		// solidId is listed even though `poly` is derived from it: the flat/sphere decision above reads the
		// id directly (hasSphereView), so the effect has to re-run when it changes.
		// `faceOpacity` is NOT a rebuild dep. Crossing 1 changes how the faces are drawn, and the builder
		// answers that live through `setOpacity` below — re-deriving the creases of a 212-face solid on every
		// frame of a slider drag is not something a drag can afford.
		// starMod2 belongs here and not in the recolor pass: it changes which triangles exist.
	}, [poly, solidId, isIslamic, polyhedron, bubbleBites, edgeStyle, kochLevel, starMod2]);

	// Face opacity, live. The hidden-edge test does not switch off below 1, it SOFTENS: a bar behind a face
	// is worth 1 − opacity, so it is dropped behind a solid face and comes back as the face turns to glass.
	useEffect(() => {
		const c = contentRef.current;
		if (c?.kind === "solid") c.solid.setOpacity(faceOpacity);
		else if (c?.kind === "bubble") c.bubble.setOpacity(faceOpacity);
		occlusionRef.current?.setFaceOpacity(faceOpacity);
	}, [faceOpacity, poly, solidId, polyhedron, isIslamic, bubbleBites]);

	// Cross-section of the RIGID Islamic bars (the overlay effect below rebuilds from these).
	const section = useConfiguration((s) => s.islamicBarSection);
	const thickness = useConfiguration((s) => s.islamicBarThickness);
	const wireHeight = useConfiguration((s) => s.islamicBarHeight);
	const bevel = useConfiguration((s) => s.islamicBarBevel);

	// A projection toggle swaps in a fresh camera, which starts with no aspect applied. Drop the tracked box
	// so the render loop re-fits it (perspective aspect or orthographic frustum) on its next frame; plain
	// resizes need nothing here — the loop measures the host itself. A changed `fitFraction` re-frames
	// through the same path, after pulling the camera to the matching distance.
	useEffect(() => {
		fitRef.current = fitFraction;
		const cam = cameraRef.current;
		if (cam) cam.position.setLength(cameraDistanceFor(fitFraction));
		boxRef.current = { w: 0, h: 0 };
	}, [orthographic, fitFraction]);

	// Hue ring + Line-stroke slider. Solid sphere: re-bake the surface texture in place. Wireframe: recolour
	// the tubes (stroke doesn't apply — thickness is its own control). Both are cheap, so drags stay live.
	const hueOffset = useConfiguration((s) => s.hueOffset);
	const lineWidth = useConfiguration((s) => s.lineWidth);
	useEffect(() => {
		const dark = document.documentElement.classList.contains("dark");
		const c = contentRef.current;
		if (c) {
			// The bubble surface has no stroke of its own — its tiles ARE the drawing — so only the hue
			// ring reaches it, and it takes that as a vertex-colour rewrite with no rebuild.
			if (c.kind === "bubble") { c.bubble.recolor(hueOffset); c.bubble.setLineWidth(lineWidth, dark); }
			else if (c.kind === "sphere") c.sphere.recolor({ hueOffset, lineWidth, dark });
			else c.solid.recolor({ hueOffset, lineWidth, dark });
		}
		// The Islamic overlay + cell fill live in their own refs (independent of the base content) — recolour too.
		if (islamicRef.current) islamicRef.current.setColor(hueOffset, dark);
		if (fillRef.current) fillRef.current.setColor(hueOffset);
		if (weaveRef.current) weaveRef.current.setColor(dark);
	}, [hueOffset, lineWidth]);

	// Islamic star-pattern overlay: the construction as great-circle ribbons — a hollow structure with no base
	// surface behind it. Rebuilt when a construction param or the stroke width changes, torn down when
	// Islamic turns off.
	const islamicAngle = useConfiguration((s) => s.islamicAngle);
	const islamicEdgeOffset = useConfiguration((s) => s.islamicEdgeOffset);
	const islamicIntersectionCount = useConfiguration((s) => s.islamicIntersectionCount);
	const islamicStyle = useConfiguration((s) => s.islamicStyle);
	const islamicBandWidth = useConfiguration((s) => s.islamicBandWidth);
	const islamicOutlineWidth = useConfiguration((s) => s.islamicOutlineWidth);
	const weaveFlat = useConfiguration((s) => s.sphericalWeaveFlat);
	// Interlace and Outline are the two STRAP styles: same band + border geometry, differing only in whether
	// the crossings weave. Both are drawn by buildIslamicWeave and neither wants the plain star-line overlay.
	const isStrapStyle = islamicStyle === "interlace" || islamicStyle === "outline";
	useEffect(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		const clear = () => {
			if (islamicRef.current) {
				scene.remove(islamicRef.current.object);
				islamicRef.current.dispose();
				islamicRef.current = null;
			}
		};
		clear();
		// The strap styles draw their own dark borders — the plain star-line ribbons would double them, so skip.
		if (!isIslamic || isStrapStyle) return;
		const pattern = buildIslamicPattern(poly, {
			angleRad: (Math.min(Math.max(islamicAngle, 0), 90) * Math.PI) / 180,
			edgeOffsetFrac: Math.min(Math.max(islamicEdgeOffset, 0), 100) / 100,
			intersectionCount: islamicIntersectionCount,
			// Rigid ON ⇒ the star lines become 3D tube/rect bars, shaped by Section / Thickness / Height /
			// Bevel; OFF ⇒ flat surface ribbons sized by the stroke.
			rigid: islamicRigid,
			section,
			thickness,
			height: wireHeight,
			bevel,
			lineWidth,
			hueOffset: useConfiguration.getState().hueOffset,
			dark: document.documentElement.classList.contains("dark"),
		});
		if (pattern) {
			applyStudioMaterials(pattern.object);
			scene.add(pattern.object);
			islamicRef.current = pattern;
		}
		return clear;
	}, [poly, isIslamic, isStrapStyle, islamicAngle, islamicEdgeOffset, islamicIntersectionCount, lineWidth, islamicRigid, section, thickness, wireHeight, bevel]);

	// Islamic cell fill: the regions the star lines cut, coloured by cell shape and laid on the sphere just
	// under the lines. Rigid OFF ⇒ filled cells + flat ribbon lines; Rigid ON ⇒ the hollow just-lines look,
	// rigid bars and no fill. Only the construction params rebuild it, so it does NOT rebuild on the
	// stroke/thickness drags that only reshape the lines — the Rigid flag flips it on/off.
	const islamicFill = !islamicRigid;
	useEffect(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		const clear = () => {
			if (fillRef.current) {
				scene.remove(fillRef.current.object);
				fillRef.current.dispose();
				fillRef.current = null;
			}
			if (weaveRef.current) {
				scene.remove(weaveRef.current.object);
				weaveRef.current.dispose();
				weaveRef.current = null;
			}
		};
		clear();
		if (!isIslamic) return;
		const cfg = useConfiguration.getState();
		const angleRad = (Math.min(Math.max(islamicAngle, 0), 90) * Math.PI) / 180;
		const edgeOffsetFrac = Math.min(Math.max(islamicEdgeOffset, 0), 100) / 100;

		if (isStrapStyle) {
			// Straps + border rings. Not gated by Polygon fill — the borders always show; the fill toggle only
			// decides whether the cream strap BODIES are drawn (filled straps) or just the outlines.
			const outlineStyle = islamicStyle === "outline";
			const weave = buildIslamicWeave(poly, {
				angleRad,
				edgeOffsetFrac,
				intersectionCount: islamicIntersectionCount,
				// Both widths go through the same factor, so band:border matches the flat renderer's ratio.
				width: Math.max(0.02, islamicBandWidth * WEAVE_WIDTH_FACTOR), // strap width in radians of arc
				border: Math.max(0, islamicOutlineWidth * WEAVE_WIDTH_FACTOR), // border ring, grown outward
				// Outline crosses its straps flat: no over/under, so the border sinks under the bodies and the
				// crossings paint it out, leaving the silhouette of the ribbon union.
				weave: !outlineStyle,
				showBodies: islamicFill,
				// Rigid ON ⇒ extrude the straps into lit 3D ribbons, over/under separated radially.
				solid: islamicRigid,
				solidFlat: outlineStyle || weaveFlat, // flat coplanar ribbons instead of the woven relief
				dark: document.documentElement.classList.contains("dark"),
			});
			if (weave) {
				applyStudioMaterials(weave.object);
				scene.add(weave.object);
				weaveRef.current = weave;
			}
			return clear;
		}

		if (!islamicFill) return;
		const fill = buildIslamicFill(poly, {
			angleRad,
			edgeOffsetFrac,
			intersectionCount: islamicIntersectionCount,
			hueOffset: cfg.hueOffset,
			style: cfg.islamicStyle, // "checkerboard" 2-colours the cells; otherwise A/B/C plain
			fillHueB: cfg.islamicFillHueB, // A/B/C background fields — the same store hues the flat fill uses
			fillHueC: cfg.islamicFillHueC,
			checkerHueA: cfg.islamicCheckerHueA,
			checkerHueB: cfg.islamicCheckerHueB,
		});
		if (fill) {
			applyStudioMaterials(fill.object);
			scene.add(fill.object);
			fillRef.current = fill;
		}
		return clear;
	}, [poly, isIslamic, islamicFill, islamicStyle, isStrapStyle, islamicAngle, islamicEdgeOffset, islamicIntersectionCount, islamicBandWidth, islamicOutlineWidth, islamicRigid, weaveFlat]);

	if (errored) {
		return (
			<div className="absolute inset-0 z-10 flex items-center justify-center">
				<p className="text-sm text-fg-muted max-w-xs text-center">
					3D view unavailable — the browser ran out of WebGL contexts. Reload the page to free them.
				</p>
			</div>
		);
	}

	// z-10 sits ABOVE the p5 input layer (canvas.tsx container is z-[1]) so ArcballControls receives the
	// drag/wheel, while staying below the z-20 canvas badges/buttons so those remain clickable.
	return (
		<div
			ref={hostRef}
			className="absolute inset-0 z-10 h-full w-full"
			style={{ touchAction: interactive ? "none" : "auto" }}
		/>
	);
}
