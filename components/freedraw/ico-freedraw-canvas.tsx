"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ArcballControls } from "three/examples/jsm/controls/ArcballControls.js";
import { useMemo } from "react";
import { useConfiguration } from "@/stores/configuration";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { measureBox } from "@/lib/render/canvasSize";
import { createOrbitMomentum, type OrbitMomentum } from "@/lib/render/orbitMomentum";
import { installLookRig, applyStudioMaterials, type LookRig } from "@/lib/render/sphericalLook";
import { captureOverride, offerFrame } from "@/lib/render/capture";
import { solidEdges } from "@/lib/render/sphericalGeometry";
import { buildIcoFreedraw, type IcoPattern, type IcoFreedraw, type IcoMode } from "@/lib/render/icoFreedraw";

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
	/** Per-tile HSB, parallel to the pattern's tiles; see sphStar.faceHsb. */
	tileHsb?: [number, number, number][];
	showCrossings?: boolean;
	/** Draw the pattern's own edges at all. False is the star shelf's "no edges" state. */
	showEdges?: boolean;
	/** Sphere mode, star shelf: covering number of the circumsphere, which swaps the lit tiling fill for
	 *  the density fill. See lib/render/icoFreedraw.ts. */
	densitySheets?: number;
}

const CAMERA_DISTANCE = 3.2;

export function IcoFreedrawCanvas({ pattern, mode, showGrid, solidId, vertices, allEdges, keepRadius, crossings, showCrossings, showEdges, tileHsb, densitySheets }: Props) {
	// The one store flag this otherwise self-contained canvas reads: the shared spherical surface look.
	const studio = useConfiguration((s) => s.sphericalStudio);
	const solid = useMemo(() => (vertices ? null : polyhedronForId(solidId)), [solidId, vertices]);
	const verts = vertices ?? (solid?.vertices as [number, number, number][] | undefined);
	const solidEdgeList = useMemo<[number, number][]>(
		() => allEdges ?? (solid ? solidEdges(solid) : []),
		[allEdges, solid],
	);
	const hostRef = useRef<HTMLDivElement | null>(null);
	const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
	const sceneRef = useRef<THREE.Scene | null>(null);
	const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
	const controlsRef = useRef<ArcballControls | null>(null);
	// Release momentum — let go mid-drag and the solid coasts (lib/render/orbitMomentum.ts).
	const momentumRef = useRef<OrbitMomentum | null>(null);
	// Lights + environment for the current surface look (lib/render/sphericalLook.ts).
	const lookRigRef = useRef<LookRig | null>(null);
	const rafRef = useRef<number | null>(null);
	const contentRef = useRef<IcoFreedraw | null>(null);
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
		lookRigRef.current = installLookRig(renderer, scene, "catalogue", useConfiguration.getState().sphericalStudio);

		const aspect0 = host.clientWidth > 0 && host.clientHeight > 0 ? host.clientWidth / host.clientHeight : 1;
		const camera = new THREE.PerspectiveCamera(45, aspect0, 0.1, 100);
		camera.position.set(1.35, 1.05, 2.6).setLength(CAMERA_DISTANCE);
		camera.lookAt(0, 0, 0);
		camera.updateProjectionMatrix();
		cameraRef.current = camera;

		const controls = new ArcballControls(camera, canvas, scene);
		controls.enablePan = false;
		controls.enableZoom = true;
		controls.enableRotate = true;
		controls.enableFocus = false;
		controls.enableGrid = false;
		controls.cursorZoom = false;
		controls.enableAnimations = false;
		controls.minDistance = 1.8;
		controls.maxDistance = 8;
		controls.setGizmosVisible(false);
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
				if (cam) {
					cam.aspect = w / h;
					cam.updateProjectionMatrix();
				}
			}
			// The light rig rides the camera, so a drag re-lights the solid (see LookRig.follow).
			if (cam) lookRigRef.current?.follow(cam);
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
			showEdges,
			tileHsb,
			densitySheets,
		});
		applyStudioMaterials(content.object, studio);
		scene.add(content.object);
		contentRef.current = content;
		return () => {
			scene.remove(content.object);
			content.dispose();
			if (contentRef.current === content) contentRef.current = null;
		};
		// `studio` rebuilds because the material tuning is applied to freshly built materials — turning the
		// look off has to give back the untouched originals, not a second guess at what they were.
	}, [pattern, mode, showGrid, solid, solidEdgeList, crossings, showCrossings, showEdges, tileHsb, densitySheets, studio]);

	// Studio ⇄ plain: re-dial the lights and the environment in place (the geometry effect above re-tunes
	// the materials from the same flag).
	useEffect(() => {
		lookRigRef.current?.setStudio(studio);
	}, [studio]);

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
