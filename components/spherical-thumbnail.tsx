"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useConfiguration } from "@/stores/configuration";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { createSphere } from "@/lib/render/sphericalScene";

// A static 3D preview of a spherical tiling for the library grid and /play sidebar. Renders ONE frame with
// the same scene builder as the interactive view (single source of truth for the look) and reads it to a
// data URL. Lazy via IntersectionObserver like HyperbolicThumbnail/TilingThumbnail.
//
// All previews share ONE persistent WebGLRenderer (one WebGL context for the whole grid) instead of a
// context per thumbnail: a page can show many previews at once, and browsers cap live WebGL contexts
// (~16), so a context-per-thumbnail burst can exhaust the pool and kill an unrelated live context (the
// interactive sphere on /play). Renders are synchronous and one-at-a-time, so a single reused renderer is
// safe; it lives for the session (never disposed).

interface SphericalThumbnailProps {
	/** Stable solid id ("tetrahedron", "cuboctahedron", …). */
	solidId: string;
	/** Render resolution in device px (square). The <img> scales to fill its slot. */
	size?: number;
}

let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;

function getSharedRenderer(): THREE.WebGLRenderer | null {
	if (sharedRenderer) return sharedRenderer;
	try {
		const canvas = document.createElement("canvas");
		const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
		r.setClearColor(0x000000, 0);
		sharedRenderer = r;
		sharedCanvas = canvas;
		return r;
	} catch (e) {
		console.warn("SphericalThumbnail: WebGL unavailable —", e);
		return null;
	}
}

function renderToDataUrl(solidId: string, size: number, hueOffset = 0): string | null {
	const renderer = getSharedRenderer();
	if (!renderer || !sharedCanvas) return null;
	renderer.setSize(size, size, false);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
	camera.position.set(1.35, 1.05, 2.6).setLength(3.2);
	camera.lookAt(0, 0, 0);

	const dark = document.documentElement.classList.contains("dark");
	const lineWidth = useConfiguration.getState().lineWidth;
	// The tiling is drawn procedurally per fragment (no bake), so a still is just one render — sharp and cheap.
	const sphere = createSphere(renderer, polyhedronForId(solidId), { hueOffset, lineWidth, dark });
	if (!sphere) return null;
	scene.add(sphere.mesh);
	try {
		renderer.setRenderTarget(null);
		renderer.render(scene, camera);
		return sharedCanvas.toDataURL("image/png");
	} finally {
		sphere.dispose();
	}
}

export function SphericalThumbnail({ solidId, size = 256 }: SphericalThumbnailProps) {
	const holderRef = useRef<HTMLDivElement | null>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const specKey = solidId;
	// Global hue ring: subscribed LIVE — every visible preview re-renders per drag tick, matching the
	// hyperbolic thumbnails' exact-colours choice.
	const hueOffset = useConfiguration((s) => s.hueOffset);

	useEffect(() => {
		const el = holderRef.current;
		if (!el) return;
		let done = false;
		const draw = () => {
			if (done) return;
			done = true;
			try {
				const dataUrl = renderToDataUrl(solidId, size, hueOffset);
				if (dataUrl) setUrl(dataUrl);
				else setFailed(true);
			} catch (e) {
				console.warn("SphericalThumbnail render error:", e);
				setFailed(true);
			}
		};
		const io = new IntersectionObserver(
			(entries) => {
				if (!entries[0].isIntersecting) return;
				draw();
				io.disconnect();
			},
			{ rootMargin: "300px" },
		);
		io.observe(el);
		return () => io.disconnect();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [specKey, size, hueOffset]);

	if (failed) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-surface-raised rounded text-fg-disabled text-[10px]">
				sphere
			</div>
		);
	}

	return (
		<div ref={holderRef} className="w-full h-full">
			{url ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img src={url} alt={`${solidId} spherical tiling`} className="w-full h-full rounded block object-cover" />
			) : null}
		</div>
	);
}
