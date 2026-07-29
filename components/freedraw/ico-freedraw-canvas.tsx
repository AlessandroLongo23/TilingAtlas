"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ArcballControls } from "three/examples/jsm/controls/ArcballControls.js";
import { useMemo } from "react";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { measureBox } from "@/lib/render/canvasSize";
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
	showGrid: boolean;
	/** Which Platonic solid this pattern lives on ("icosahedron", "cube", …). Ignored when `vertices`
	 *  is given — a spherical SCHWARZ board has no canonical solid to name. */
	solidId: string;
	/** Self-contained boards (Schwarz, lib/render/sphSchwarz.ts) ship their own unit vertices and edge
	 *  list rather than indexing into a solid. Supplying both switches off the solid lookup entirely. */
	vertices?: [number, number, number][];
	allEdges?: [number, number][];
}

const CAMERA_DISTANCE = 3.2;

export function IcoFreedrawCanvas({ pattern, mode, showGrid, solidId, vertices, allEdges }: Props) {
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
		// Deliberately FLAT lighting: a tile is a catalogue colour, so the same tile must read as the same
		// lightness wherever it sits on the sphere — a strong directional light turned same-coloured regions
		// into wildly different shades (bright where they faced the light, near-black where they faced away).
		// Mostly ambient + a near-white hemisphere (light ground, so downward faces aren't dark) + a whisper
		// of directional just to hint at the round form.
		const hemi = new THREE.HemisphereLight(0xffffff, 0xccd0d6, 0.45);
		const dir = new THREE.DirectionalLight(0xffffff, 0.12);
		dir.position.set(2, 3, 4);
		const ambient = new THREE.AmbientLight(0xffffff, 0.85);
		scene.add(hemi, dir, ambient);

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

		let box = { w: 0, h: 0 };
		const animate = () => {
			controlsRef.current?.update();
			const cam = cameraRef.current;
			// Measured in the loop, not taken from props: a size arriving a React render later would be
			// rescaled into the new box while a layout transition runs (lib/render/canvasSize.ts).
			const { w, h } = measureBox(host);
			if (w > 0 && h > 0 && (w !== box.w || h !== box.h)) {
				box = { w, h };
				renderer.setSize(w, h, false);
				if (cam) {
					cam.aspect = w / h;
					cam.updateProjectionMatrix();
				}
			}
			if (cam) renderer.render(scene, cam);
			rafRef.current = requestAnimationFrame(animate);
		};
		rafRef.current = requestAnimationFrame(animate);

		return () => {
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
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
			showGrid,
			allEdges: solidEdgeList,
		});
		scene.add(content.object);
		contentRef.current = content;
		return () => {
			scene.remove(content.object);
			content.dispose();
			if (contentRef.current === content) contentRef.current = null;
		};
	}, [pattern, mode, showGrid, solid, solidEdgeList]);

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
