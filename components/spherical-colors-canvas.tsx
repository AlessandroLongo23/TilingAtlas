"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ArcballControls } from "three/examples/jsm/controls/ArcballControls.js";
import { useConfiguration } from "@/stores/configuration";
import { measureBox } from "@/lib/render/canvasSize";
import { captureOverride, offerFrame } from "@/lib/render/capture";
import { buildSphColors, type SphColorsScene } from "@/lib/render/sphColors";
import { paletteRgb255 } from "@/lib/colors/render";
import type { IcoMode } from "@/lib/render/icoFreedraw";
import type { SphColorsPattern } from "@/lib/colors/sph-colors";

// Interactive viewer for one colored Platonic solid: a real 3D three.js polyhedron you rotate with a
// quaternion trackball (ArcballControls), the exact sibling of IcoFreedrawCanvas. It draws one pattern's
// color-filled faces + tile-boundary edge tubes and rebuilds when the pattern, palette, or sphere/polyhedron
// mode changes. Self-contained: the record ships its own geometry (no solid lookup, no vertex-index guard).

const CAMERA_DISTANCE = 3.2;

interface Props {
	pattern: SphColorsPattern;
	mode: IcoMode;
}

export function SphericalColorsCanvas({ pattern, mode }: Props) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
	const sceneRef = useRef<THREE.Scene | null>(null);
	const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
	const controlsRef = useRef<ArcballControls | null>(null);
	const rafRef = useRef<number | null>(null);
	const contentRef = useRef<SphColorsScene | null>(null);
	const [errored, setErrored] = useState(false);
	const palette = useConfiguration((s) => s.colorsPalette);

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
			console.warn("SphericalColorsCanvas: WebGL unavailable —", e);
			if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
			setErrored(true);
			return;
		}
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.setClearColor(0x000000, 0);
		rendererRef.current = renderer;

		const scene = new THREE.Scene();
		sceneRef.current = scene;
		// Flat lighting so a color reads the same wherever it sits on the sphere (see IcoFreedrawCanvas).
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

		let box = { w: 0, h: 0, r: 1 };
		const animate = () => {
			controlsRef.current?.update();
			const cam = cameraRef.current;
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
			if (cam) renderer.render(scene, cam);
			if (cap) offerFrame(renderer.domElement);
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

	// Rebuild geometry when the pattern, palette, or sphere/polyhedron mode changes.
	useEffect(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		const dark = document.documentElement.classList.contains("dark");
		const content = buildSphColors(
			pattern.vertices,
			pattern.faces,
			pattern.faceColor,
			pattern.edges,
			paletteRgb255(pattern.colors, palette, dark),
			{ dark, mode },
		);
		scene.add(content.object);
		contentRef.current = content;
		return () => {
			scene.remove(content.object);
			content.dispose();
			if (contentRef.current === content) contentRef.current = null;
		};
	}, [pattern, mode, palette]);

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
