"use client";

import { useEffect, useRef, useState } from "react";
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
import { measureBox } from "@/lib/render/canvasSize";
import { createOrbitMomentum, type OrbitMomentum } from "@/lib/render/orbitMomentum";
import { installLookRig, applyStudioMaterials, type LookRig } from "@/lib/render/sphericalLook";
import { captureOverride, offerFrame } from "@/lib/render/capture";
import { buildSphColors, type SphColorsScene } from "@/lib/render/sphColors";
import { paletteRgb255 } from "@/lib/colors/render";
import type { IcoMode } from "@/lib/render/icoFreedraw";
import type { SphColorsPattern } from "@/lib/colors/sph-colors";

// Interactive viewer for one colored Platonic solid: a real 3D three.js polyhedron you rotate with a
// quaternion trackball (ArcballControls), the exact sibling of IcoFreedrawCanvas. It draws one pattern's
// color-filled faces + tile-boundary edge tubes and rebuilds when the pattern, palette, or sphere/polyhedron
// mode changes. Self-contained: the record ships its own geometry (no solid lookup, no vertex-index guard).

// Derived from the shared fit, like every other spherical view: the unit sphere at three quarters of the
// viewport half-height, which is the 3.2 this used to hardcode.
const CAMERA_DISTANCE = cameraDistanceFor(DEFAULT_FIT_FRACTION);

interface Props {
	pattern: SphColorsPattern;
	mode: IcoMode;
}

export function SphericalColorsCanvas({ pattern, mode }: Props) {
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
	const contentRef = useRef<SphColorsScene | null>(null);
	const [errored, setErrored] = useState(false);
	const palette = useConfiguration((s) => s.colorsPalette);
	const studio = useConfiguration((s) => s.sphericalStudio);

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
		// The "catalogue" rig: flat in the plain look so a color reads the same wherever it sits on the
		// sphere, gently lit in Studio (see IcoFreedrawCanvas and lib/render/sphericalLook.ts).
		lookRigRef.current = installLookRig(renderer, scene, "catalogue", useConfiguration.getState().sphericalStudio);

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

	// Projection swap, the same shape as the other two spherical canvases: a fresh camera AND fresh
	// controls, because re-pointing a live ArcballControls leaves it half-bound to the old camera.
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
		applyStudioMaterials(content.object, studio);
		scene.add(content.object);
		contentRef.current = content;
		return () => {
			scene.remove(content.object);
			content.dispose();
			if (contentRef.current === content) contentRef.current = null;
		};
		// `studio` rebuilds so the material tuning always lands on fresh materials.
	}, [pattern, mode, palette, studio]);

	// Studio ⇄ plain: re-dial the lights and the environment in place.
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
