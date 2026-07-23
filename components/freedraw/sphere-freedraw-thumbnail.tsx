"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { solidEdges } from "@/lib/render/sphericalGeometry";
import { buildIcoFreedraw, type IcoMode, type IcoPattern } from "@/lib/render/icoFreedraw";
import { enqueueThumbnailRender } from "@/lib/render/thumbnailQueue";
import { ThumbnailSkeleton } from "@/components/ui/thumbnail-skeleton";

// Static 3D preview of ONE Platonic-solid freedraw pattern for the catalogue grid on /freedraw
// (spherical). Sibling of SphericalThumbnail: it renders a single frame with the same geometry builder
// as the interactive IcoFreedrawCanvas (one source of truth for the look) and reads it to a data URL.
// Lazy via IntersectionObserver, frame-paced through the shared thumbnail queue.
//
// Like SphericalThumbnail, ALL previews share ONE persistent WebGLRenderer (one WebGL context for the
// whole grid). Browsers cap live contexts at ~16, so a context-per-thumbnail burst would exhaust the
// pool and kill the interactive sphere in the preview pane. The renderer is synchronous and used
// one-at-a-time, so a single reused instance is safe; it lives for the session (never disposed).
//
// Thumbnails track the header's Display toggles — polyhedron/sphere and grid on/off — so the catalogue
// reads the same way as the interactive preview. Flipping a toggle re-renders the visible thumbnails
// (lazy + queued, so only what's on screen re-bakes).

interface SphereFreedrawThumbnailProps {
	pattern: IcoPattern;
	/** Which Platonic solid the pattern lives on ("icosahedron", "cube", …). */
	solidId: string;
	/** "polyhedron" flat facets + chord edges, or "sphere" curved patches + arc edges. */
	mode: IcoMode;
	/** Draw the solid's full edge grid faintly under the pattern. */
	showGrid: boolean;
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
		console.warn("SphereFreedrawThumbnail: WebGL unavailable —", e);
		return null;
	}
}

function renderToDataUrl(
	pattern: IcoPattern,
	solidId: string,
	size: number,
	mode: IcoMode,
	showGrid: boolean,
): string | null {
	const renderer = getSharedRenderer();
	if (!renderer || !sharedCanvas) return null;
	const solid = polyhedronForId(solidId);
	if (!solid) return null;
	renderer.setSize(size, size, false);

	const scene = new THREE.Scene();
	// Same flat lighting as IcoFreedrawCanvas: a tile is a catalogue colour, so the same tile must read as
	// the same lightness wherever it sits on the solid (see icoFreedraw notes).
	const hemi = new THREE.HemisphereLight(0xffffff, 0xccd0d6, 0.45);
	const dir = new THREE.DirectionalLight(0xffffff, 0.12);
	dir.position.set(2, 3, 4);
	const ambient = new THREE.AmbientLight(0xffffff, 0.85);
	scene.add(hemi, dir, ambient);

	const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
	camera.position.set(1.35, 1.05, 2.6).setLength(3.2);
	camera.lookAt(0, 0, 0);

	const dark = document.documentElement.classList.contains("dark");
	const content = buildIcoFreedraw(pattern, solid.vertices as [number, number, number][], {
		dark,
		mode,
		showGrid,
		allEdges: showGrid ? solidEdges(solid) : undefined,
	});
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

export function SphereFreedrawThumbnail({ pattern, solidId, mode, showGrid, size = 256 }: SphereFreedrawThumbnailProps) {
	const holderRef = useRef<HTMLDivElement | null>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const specKey = `${solidId}-${pattern.id}-${mode}-${showGrid ? "g" : ""}`;

	useEffect(() => {
		const el = holderRef.current;
		if (!el) return;
		let done = false;
		let cancelJob: (() => void) | null = null;
		const draw = () => {
			if (done) return;
			done = true;
			// Building the scene + rendering is synchronous, so it goes through the shared frame-paced queue
			// rather than firing alongside every other card's render in one task.
			cancelJob = enqueueThumbnailRender(() => {
				try {
					const dataUrl = renderToDataUrl(pattern, solidId, size, mode, showGrid);
					if (dataUrl) setUrl(dataUrl);
					else setFailed(true);
				} catch (e) {
					console.warn("SphereFreedrawThumbnail render error:", e);
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
					alt={`${solidId} freedraw ${pattern.id}`}
					className="ta-fade-in relative w-full h-full rounded block object-cover"
				/>
			) : null}
		</div>
	);
}
