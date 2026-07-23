"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ArcballControls } from "three/examples/jsm/controls/ArcballControls.js";
import { useMemo } from "react";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { solidEdges } from "@/lib/render/sphericalGeometry";
import { buildIcoFreedraw, type IcoPattern, type IcoFreedraw, type IcoMode } from "@/lib/render/icoFreedraw";

// Interactive viewer for one Platonic-solid freedraw pattern: a real 3D three.js solid you rotate freely
// with a quaternion trackball (ArcballControls — no poles, no gimbal lock), same input model as the
// Platonic/Archimedean SphericalCanvas. Deliberately self-contained (no Zustand mode flags): it draws
// exactly one pattern's coloured tiles + drawn-edge tubes and rebuilds when the pattern, solid, mode or
// grid changes.

interface Props {
	width: number;
	height: number;
	pattern: IcoPattern;
	mode: IcoMode;
	showGrid: boolean;
	/** Which Platonic solid this pattern lives on ("icosahedron", "cube", …). */
	solidId: string;
}

const CAMERA_DISTANCE = 3.2;

export function IcoFreedrawCanvas({ width, height, pattern, mode, showGrid, solidId }: Props) {
	const solid = useMemo(() => polyhedronForId(solidId), [solidId]);
	const solidEdgeList = useMemo<[number, number][]>(() => (solid ? solidEdges(solid) : []), [solid]);
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

		const animate = () => {
			controlsRef.current?.update();
			const cam = cameraRef.current;
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
		if (!scene || !solid) return;
		// Guard against a pattern/solid mismatch during a solid switch: for one render the pattern can still
		// be the previous solid's (its vertex indices out of range here). Skip until the matching data lands.
		const nVerts = solid.vertices.length;
		const inRange =
			pattern.drawn.every(([i, j]) => i < nVerts && j < nVerts) &&
			pattern.tiles.every((tile) => tile.every((face) => face.every((idx) => idx < nVerts)));
		if (!inRange) return;
		const dark = document.documentElement.classList.contains("dark");
		const content = buildIcoFreedraw(pattern, solid.vertices as [number, number, number][], {
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

	// Resize with the measured parent size.
	useEffect(() => {
		const renderer = rendererRef.current;
		const camera = cameraRef.current;
		if (!renderer || !camera || width <= 0 || height <= 0) return;
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	}, [width, height]);

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
