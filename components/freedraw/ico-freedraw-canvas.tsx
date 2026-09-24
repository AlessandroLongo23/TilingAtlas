"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ArcballControls } from "three/examples/jsm/controls/ArcballControls.js";
import { useMemo } from "react";
import { useConfiguration } from "@/stores/configuration";
import { edgeRadius } from "@/lib/render/sphericalPolyhedron";
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
import { createOrbitMomentum, type OrbitMomentum } from "@/lib/render/orbitMomentum";
import { installLookRig, applyStudioMaterials, type LookRig } from "@/lib/render/sphericalLook";
import { captureOverride, offerFrame } from "@/lib/render/capture";
import { solidEdges } from "@/lib/render/sphericalGeometry";
import { buildIcoFreedraw, type IcoPattern, type IcoFreedraw, type IcoMode } from "@/lib/render/icoFreedraw";
import { createEdgeOcclusion, type EdgeOcclusion } from "@/lib/render/edgeOcclusion";

// Interactive viewer for one Platonic-solid freedraw pattern: a real 3D three.js solid you rotate freely
// with a quaternion trackball (ArcballControls — no poles, no gimbal lock), same input model as the
// Platonic/Archimedean SphericalCanvas. Deliberately self-contained (no Zustand mode flags): it draws
// exactly one pattern's coloured tiles + drawn-edge tubes and rebuilds when the pattern, solid, mode or
// grid changes.

// No width/height props: the host element fills its parent by CSS and the render loop measures it every
// frame (lib/render/canvasSize.ts), so the drawing buffer never trails a layout transition.
interface Props {
	pattern: IcoPattern;
	mode: IcoMode;
	/** Skip unit-sphere normalisation. Star polyhedra need it; nothing else does. */
	keepRadius?: boolean;
	showGrid: boolean;
	/** Which Platonic solid this pattern lives on ("icosahedron", "cube", …). Ignored when `vertices`
	 *  is given — a spherical SCHWARZ board has no canonical solid to name. */
	solidId: string;
	/** Self-contained boards (Schwarz, lib/render/sphSchwarz.ts) ship their own unit vertices and edge
	 *  list instead of indexing into a solid. Supplying both switches off the solid lookup entirely. */
	vertices?: [number, number, number][];
	allEdges?: [number, number][];
	/** Face-through-face creases (star polyhedra), drawn only when `showCrossings` is on. */
	crossings?: import("@/lib/render/sphStar").Crease[];
	/** Per-tile hue, parallel to the pattern's tiles; see sphStar.faceHue. */
	tileHue?: number[];
	showCrossings?: boolean;
	/** Draw the pattern's own edges at all. False is the star shelf's "no edges" state. */
	showEdges?: boolean;
	/** Sphere mode, star shelf: covering number of the circumsphere, which swaps the lit tiling fill for
	 *  the density fill. See lib/render/icoFreedraw.ts. */
	densitySheets?: number;
}

// The framing every spherical view shares: the unit sphere at three quarters of the viewport half-height.
// This used to be a hardcoded 3.2, which is what cameraDistanceFor(0.75) works out to; deriving it keeps
// this canvas and the tiling sphere the same size on screen when either is retuned.
const CAMERA_DISTANCE = cameraDistanceFor(DEFAULT_FIT_FRACTION);

export function IcoFreedrawCanvas({ pattern, mode, showGrid, solidId, vertices, allEdges, keepRadius, crossings, showCrossings, showEdges, tileHue, densitySheets }: Props) {
	// The store fields this otherwise self-contained canvas reads. It used to read only the surface-look
	// flag, which is why the sidebar hid the hue ring and the stroke slider for every shelf on this canvas:
	// the builder has taken `hueOffset` and `edgeThickness` all along, nothing passed them (AL, 2026-08-21).
	const hueOffset = useConfiguration((s) => s.hueOffset);
	const lineWidth = useConfiguration((s) => s.lineWidth);
	const faceOpacity = useConfiguration((s) => s.sphericalFaceOpacity);
	const solid = useMemo(() => (vertices ? null : polyhedronForId(solidId)), [solidId, vertices]);
	const verts = vertices ?? (solid?.vertices as [number, number, number][] | undefined);
	const solidEdgeList = useMemo<[number, number][]>(
		() => allEdges ?? (solid ? solidEdges(solid) : []),
		[allEdges, solid],
	);
	const hostRef = useRef<HTMLDivElement | null>(null);
	const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
	const sceneRef = useRef<THREE.Scene | null>(null);
	const cameraRef = useRef<SphericalCamera | null>(null);
	const controlsRef = useRef<ArcballControls | null>(null);
	// Release momentum — let go mid-drag and the solid coasts (lib/render/orbitMomentum.ts).
	const momentumRef = useRef<OrbitMomentum | null>(null);
	// Lights + environment for the current surface look (lib/render/sphericalLook.ts).
	const lookRigRef = useRef<LookRig | null>(null);
	const rafRef = useRef<number | null>(null);
	const contentRef = useRef<IcoFreedraw | null>(null);
	// Depth of the FACES alone, re-rendered each frame, so an edge bar can be hidden by the edge's own
	// visibility instead of its surface's (lib/render/edgeOcclusion.ts).
	const occlusionRef = useRef<EdgeOcclusion | null>(null);
	const [errored, setErrored] = useState(false);

	// Renderer + scene + camera + controls + RAF loop, created once per mount.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		let canvas: HTMLCanvasElement | null = null;
		let renderer: THREE.WebGLRenderer;
		try {
			canvas = document.createElement("canvas");
			canvas.className = "absolute inset-0 h-full w-full";
			canvas.style.touchAction = "none";
			host.appendChild(canvas);
			renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		} catch (e) {
			console.warn("IcoFreedrawCanvas: WebGL unavailable —", e);
			if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
			setErrored(true);
			return;
		}
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.setClearColor(0x000000, 0);
		rendererRef.current = renderer;

		const scene = new THREE.Scene();
		sceneRef.current = scene;
		// The "catalogue" rig, whose plain look is deliberately FLAT: a tile is a catalogue colour, so the same
		// tile must read as the same lightness wherever it sits on the sphere — a strong directional light
		// turned same-coloured regions into wildly different shades (bright where they faced the light,
		// near-black where they faced away). Studio lights it properly but keeps that constraint, holding the
		// ambient high and the key low. Both sets live in lib/render/sphericalLook.ts.
		lookRigRef.current = installLookRig(renderer, scene, "catalogue");
		occlusionRef.current = createEdgeOcclusion();
		occlusionRef.current.setFaceOpacity(useConfiguration.getState().sphericalFaceOpacity);

		const aspect0 = host.clientWidth > 0 && host.clientHeight > 0 ? host.clientWidth / host.clientHeight : 1;
		const camera = makeSphericalCamera(
			useConfiguration.getState().sphericalOrthographic,
			aspect0,
			orthoHalfHeightFor(DEFAULT_FIT_FRACTION),
		);
		camera.position.set(1.35, 1.05, 2.6).setLength(CAMERA_DISTANCE);
		camera.lookAt(0, 0, 0);
		camera.updateProjectionMatrix();
		cameraRef.current = camera;

		const controls = makeArcball(camera, canvas, scene, { minDistance: 1.8 });
		controlsRef.current = controls;
		// ArcballControls' own inertia stays off above (enableAnimations = false): it runs a private rAF loop
		// and its velocity estimate is unstable. This measures the camera basis instead, and is clamped.
		momentumRef.current = createOrbitMomentum(() => cameraRef.current, { domElement: canvas });

		let box = { w: 0, h: 0, r: 1 };
		let lastFrame = performance.now();
		const animate = () => {
			const t = performance.now();
			const dt = Math.min((t - lastFrame) / 1000, 0.1); // a backgrounded tab must not launch a huge step
			lastFrame = t;
			// Before update(): the coast moves position/up and the controls' lookAt rebuilds the orientation.
			momentumRef.current?.frame(dt);
			controlsRef.current?.update();
			const cam = cameraRef.current;
			// Measured in the loop, not taken from props: a size arriving a React render later would be
			// rescaled into the new box while a layout transition runs (lib/render/canvasSize.ts).
			// An export in flight (lib/render/capture.ts) outranks the host box, the same override the flat
			// and hyperbolic layers get through syncCanvasSize: the sphere is rendered at the requested
			// aspect and resolution, then read back below while the frame is still in the drawing buffer.
			// setSize's third argument stays false, so the element's CSS box never moves and nothing reflows.
			const cap = captureOverride();
			const ratio = cap ? cap.dpr : 1;
			const { w, h } = cap ? { w: cap.w, h: cap.h } : measureBox(host);
			if (w > 0 && h > 0 && (w !== box.w || h !== box.h || ratio !== box.r)) {
				box = { w, h, r: ratio };
				renderer.setPixelRatio(ratio);
				renderer.setSize(w, h, false);
				// Both projections: an orthographic camera re-fits its frustum, not an aspect field.
				if (cam) applyCameraAspect(cam, w, h, orthoHalfHeightFor(DEFAULT_FIT_FRACTION));
			}
			// The light rig rides the camera, so a drag re-lights the solid (see LookRig.follow).
			if (cam) lookRigRef.current?.follow(cam);
			// Back-to-front the see-through facets before anything is drawn (lib/render/depthSort.ts), then
			// take the faces' depth for the hidden-edge test (lib/render/edgeOcclusion.ts).
			if (cam) {
				contentRef.current?.depthSort(cam);
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
			controlsRef.current?.dispose();
			contentRef.current?.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
			if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
			rendererRef.current = null;
			sceneRef.current = null;
			cameraRef.current = null;
			controlsRef.current = null;
			contentRef.current = null;
		};
	}, []);

	// Projection swap, the same shape as the tiling sphere's: a fresh camera AND fresh controls, because
	// re-pointing a live ArcballControls leaves it half-bound to the old camera. `momentumRef` reads
	// `cameraRef` through a closure, so it follows the swap without being rebuilt.
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
			fit: DEFAULT_FIT_FRACTION,
			minDistance: 1.8,
		});
		if (!next) return; // already the requested projection
		cameraRef.current = next.camera;
		controlsRef.current = next.controls; // publish the fresh pair before disposing the old one
		oldControls.dispose();
	}, [orthographic]);

	// Rebuild the pattern geometry when the pattern, solid, sphere/polyhedron mode, or grid toggle changes.
	useEffect(() => {
		const scene = sceneRef.current;
		if (!scene || !verts) return;
		// Guard against a pattern/geometry mismatch during a solid or board switch: for one render the
		// pattern can still be the previous one's (its vertex indices out of range here). Skip until the
		// matching data lands.
		const nVerts = verts.length;
		const inRange =
			pattern.drawn.every(([i, j]) => i < nVerts && j < nVerts) &&
			pattern.tiles.every((tile) => tile.every((face) => face.every((idx) => idx < nVerts)));
		if (!inRange) return;
		const dark = document.documentElement.classList.contains("dark");
		const content = buildIcoFreedraw(pattern, verts, {
			dark,
			mode,
			keepRadius,
			showGrid,
			allEdges: solidEdgeList,
			crossings,
			showCrossings,
			// `edgeRadius` is the tiling sphere's own stroke curve (sphericalPolyhedron.ts), so stroke 1 is
			// the 0.006 this canvas used to hardcode and the two spherical shelves thicken together. A stroke
			// of 0 means no edges there, and it means the same here.
			edgeThickness: edgeRadius(lineWidth),
			showEdges: showEdges !== false && lineWidth > 0,
			hueOffset,
			tileHue,
			densitySheets,
			faceOpacity,
			occlude: occlusionRef.current?.uniforms,
		});
		// A hidden bar is worth 1 − opacity: dropped outright behind solid faces, and increasingly visible
		// as they turn to glass.
		occlusionRef.current?.setFaceOpacity(faceOpacity);
		applyStudioMaterials(content.object);
		scene.add(content.object);
		contentRef.current = content;
		return () => {
			scene.remove(content.object);
			content.dispose();
			if (contentRef.current === content) contentRef.current = null;
		};
		// `faceOpacity` IS a rebuild dep here, unlike the tiling sphere's: this builder makes the facet
		// meshes and their materials in one pass and has no live setter, and the boards it serves are small.
	}, [pattern, mode, showGrid, solid, solidEdgeList, crossings, showCrossings, showEdges, tileHue, densitySheets, hueOffset, lineWidth, faceOpacity]);

	if (errored) {
		return (
			<div className="absolute inset-0 z-10 flex items-center justify-center">
				<p className="text-sm text-fg-muted max-w-xs text-center">
					3D view unavailable — the browser ran out of WebGL contexts. Reload to free them.
				</p>
			</div>
		);
	}
	return <div ref={hostRef} className="absolute inset-0 z-10 h-full w-full" style={{ touchAction: "none" }} />;
}
