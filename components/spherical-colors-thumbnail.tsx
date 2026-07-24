"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildSphColors } from "@/lib/render/sphColors";
import { paletteRgb255 } from "@/lib/colors/render";
import { enqueueThumbnailRender } from "@/lib/render/thumbnailQueue";
import { ThumbnailSkeleton } from "@/components/ui/thumbnail-skeleton";
import { useConfiguration } from "@/stores/configuration";
import type { IcoMode } from "@/lib/render/icoFreedraw";
import type { SphColorsPattern } from "@/lib/colors/sph-colors";

// Static 3D preview of one colored Platonic solid for the catalogue grid and /play sidebar — the sibling
// of SphereFreedrawThumbnail. One frame of the same geometry builder as the interactive canvas
// (buildSphColors), read to a data URL. All previews share ONE persistent WebGLRenderer (one context for
// the whole grid — browsers cap live contexts at ~16). Lazy via IntersectionObserver, frame-paced.

interface Props {
	pattern: SphColorsPattern;
	mode: IcoMode;
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
		console.warn("SphericalColorsThumbnail: WebGL unavailable —", e);
		return null;
	}
}

function renderToDataUrl(pattern: SphColorsPattern, size: number, mode: IcoMode, palette: (number | "cream" | "dark")[]): string | null {
	const renderer = getSharedRenderer();
	if (!renderer || !sharedCanvas) return null;
	renderer.setSize(size, size, false);

	const scene = new THREE.Scene();
	const hemi = new THREE.HemisphereLight(0xffffff, 0xccd0d6, 0.45);
	const dir = new THREE.DirectionalLight(0xffffff, 0.12);
	dir.position.set(2, 3, 4);
	const ambient = new THREE.AmbientLight(0xffffff, 0.85);
	scene.add(hemi, dir, ambient);

	const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
	camera.position.set(1.35, 1.05, 2.6).setLength(3.2);
	camera.lookAt(0, 0, 0);

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
	try {
		renderer.setRenderTarget(null);
		renderer.render(scene, camera);
		return sharedCanvas.toDataURL("image/png");
	} finally {
		scene.remove(content.object);
		content.dispose();
	}
}

export function SphericalColorsThumbnail({ pattern, mode, size = 256 }: Props) {
	const holderRef = useRef<HTMLDivElement | null>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const palette = useConfiguration((s) => s.colorsPalette);
	const specKey = `${pattern.id}-${mode}-${palette.join(",")}`;

	useEffect(() => {
		const el = holderRef.current;
		if (!el) return;
		let done = false;
		let cancelJob: (() => void) | null = null;
		const draw = () => {
			if (done) return;
			done = true;
			cancelJob = enqueueThumbnailRender(() => {
				try {
					const dataUrl = renderToDataUrl(pattern, size, mode, palette);
					if (dataUrl) setUrl(dataUrl);
					else setFailed(true);
				} catch (e) {
					console.warn("SphericalColorsThumbnail render error:", e);
					setFailed(true);
				}
			});
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
		return () => {
			io.disconnect();
			cancelJob?.();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [specKey, size]);

	if (failed) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-surface-raised rounded text-fg-disabled text-[10px]">
				sphere
			</div>
		);
	}

	return (
		<div ref={holderRef} className="relative w-full h-full">
			<ThumbnailSkeleton done={url != null} />
			{url ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={url}
					alt={`colored ${pattern.solid} ${pattern.id}`}
					className="ta-fade-in relative w-full h-full rounded block object-cover"
				/>
			) : null}
		</div>
	);
}
