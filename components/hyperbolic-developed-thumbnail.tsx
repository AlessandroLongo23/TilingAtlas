"use client";

import { useEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { su11Identity } from "@/lib/render/hyperbolic";
import { loadDevelopedPatches, drawDevelopedPatch, type DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { HyperbolicDeveloper } from "@/lib/render/hyperbolicDevelopClient";
import { prepareShaderTiling, type ShaderTiling } from "@/lib/render/hyperbolicReduce";
import { HyperbolicPerPixelRenderer } from "@/lib/render/hyperbolicPerPixelGL";
import { enqueueThumbnailRender } from "@/lib/render/thumbnailQueue";
import { ThumbnailSkeleton } from "@/components/ui/thumbnail-skeleton";

// Static Poincaré-disk preview of an engine-developed hyperbolic tiling for the library grid and /play
// sidebar. It renders ONE frame with the SAME per-pixel renderer as the interactive canvas — reduce each
// pixel into the fundamental domain and colour it — so the preview fills the whole disk to the rim and
// matches the /play view exactly. One shared offscreen WebGL2 canvas renders every thumbnail in turn; the
// per-tiling reduction generators + field are cached so hue/stroke drags just re-draw (no rebuild). Falls
// back to the explicit-polygon 2D renderer where WebGL2 is unavailable. Lazy via IntersectionObserver.

// Shared offscreen surfaces (module singletons — thumbnails render one at a time).
let glCanvas: HTMLCanvasElement | null = null;
let glRenderer: HyperbolicPerPixelRenderer | null | undefined; // undefined = untried, null = unavailable
let thumbCanvas2d: HTMLCanvasElement | null = null; // 2D fallback
const tilingCache = new Map<string, ShaderTiling | null>(); // null = certificate failed → 2D fallback

interface ThumbOpts {
	hueOffset: number;
	showFill: boolean;
	lineMode: "geometry" | "constant";
	lineWidth: number;
}

function ensureRenderer(size: number): HyperbolicPerPixelRenderer | null {
	if (!glCanvas) glCanvas = document.createElement("canvas");
	if (glCanvas.width !== size) {
		glCanvas.width = size;
		glCanvas.height = size;
	}
	if (glRenderer === undefined) {
		const gl = glCanvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
		if (!gl) {
			glRenderer = null;
		} else {
			try {
				glRenderer = new HyperbolicPerPixelRenderer(gl);
			} catch {
				glRenderer = null;
			}
		}
	}
	return glRenderer ?? null;
}

function renderThumbGL(patch: DevelopedPatch, size: number, opts: ThumbOpts): string | null {
	if (!patch.darts) return null;
	const r = ensureRenderer(size);
	if (!r || !glCanvas) return null;
	let st = tilingCache.get(patch.id);
	if (st === undefined) {
		st = prepareShaderTiling(
			patch.darts,
			patch.edge,
			{ id: patch.id, name: patch.name, config: patch.config, edge: patch.edge },
			{ fieldRes: 512 },
		);
		tilingCache.set(patch.id, st);
	}
	if (!st) return null; // certificate failed (loud in prepareShaderTiling) → 2D fallback
	r.setTiling(st);
	const dark = document.documentElement.classList.contains("dark");
	r.draw({
		view: su11Identity(),
		R: size / 2 - 4,
		cx: size / 2,
		cy: size / 2,
		canvasH: size,
		dark,
		showFill: opts.showFill,
		hueOffset: opts.hueOffset || 0,
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5) * 1.1, // 0 = no stroke
		taper: opts.lineMode !== "constant",
	});
	return glCanvas.toDataURL("image/png");
}

function renderThumb2d(patch: DevelopedPatch, size: number, opts: ThumbOpts): string | null {
	if (!thumbCanvas2d) thumbCanvas2d = document.createElement("canvas");
	if (thumbCanvas2d.width !== size) {
		thumbCanvas2d.width = size;
		thumbCanvas2d.height = size;
	}
	const ctx = thumbCanvas2d.getContext("2d");
	if (!ctx) return null;
	const dark = document.documentElement.classList.contains("dark");
	ctx.clearRect(0, 0, size, size);
	const drawn = patch.darts
		? new HyperbolicDeveloper(patch.darts, patch.edge).develop(
				{ id: patch.id, name: patch.name, config: patch.config, edge: patch.edge },
				su11Identity(),
				0.99,
				5000,
			)
		: patch;
	drawDevelopedPatch(ctx, drawn, su11Identity(), {
		R: size / 2 - 4,
		cx: size / 2,
		cy: size / 2,
		dark,
		frame: true,
		showFill: opts.showFill,
		hueOffset: opts.hueOffset || 0,
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5) * 1.1, // 0 = no stroke
		taper: opts.lineMode !== "constant",
	});
	return thumbCanvas2d.toDataURL("image/png");
}

function renderThumb(patch: DevelopedPatch, size: number, opts: ThumbOpts): string | null {
	return renderThumbGL(patch, size, opts) ?? renderThumb2d(patch, size, opts);
}

interface Props {
	patch: string;
	size?: number;
}

export function HyperbolicDevelopedThumbnail({ patch, size = 256 }: Props) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	// Live config — re-render the preview on hue-ring drags and stroke-option changes, exactly as the
	// euclidean and spherical thumbnails redraw on the hue ring. Cheap: the reduction field is cached per patch.
	const hueOffset = useConfiguration((s) => s.hueOffset);
	const showFill = useConfiguration((s) => s.showPolygonFill);
	const lineMode = useConfiguration((s) => s.hyperbolicLineMode);
	const lineWidth = useConfiguration((s) => s.lineWidth);

	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		let disposed = false;
		let cancelJob: (() => void) | null = null;
		const draw = () => {
			// The patch fetch is async and shared across every card, so it runs OUTSIDE the queue — only
			// the synchronous bake below is frame-paced. See lib/render/thumbnailQueue.ts.
			loadDevelopedPatches().then((map) => {
				if (disposed) return;
				const p = map[patch];
				if (!p) {
					setFailed(true);
					return;
				}
				cancelJob = enqueueThumbnailRender(() => {
					if (disposed) return;
					try {
						const dataUrl = renderThumb(p, size, { hueOffset, showFill, lineMode, lineWidth });
						if (dataUrl) setUrl(dataUrl);
						else setFailed(true);
					} catch (e) {
						console.warn("HyperbolicDevelopedThumbnail render error:", e);
						setFailed(true);
					}
				});
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
			disposed = true;
			io.disconnect();
			// Drop a pending bake when the card unmounts (pagination, filter change) — otherwise the
			// queue keeps grinding through 512² fields for cards that no longer exist.
			cancelJob?.();
		};
	}, [patch, size, hueOffset, showFill, lineMode, lineWidth]);

	if (failed) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-surface-raised rounded text-fg-disabled text-[10px]">
				disk
			</div>
		);
	}

	// The skeleton holds the slot until the bake lands, then the disk fades in over it. `url` is never
	// reset once set, so a hue-ring drag swaps the image in place without flashing the skeleton back.
	return (
		<div ref={wrapRef} className="relative w-full h-full">
			<ThumbnailSkeleton done={url != null} />
			{url ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={url}
					alt={`hyperbolic tiling ${patch}`}
					className="ta-fade-in relative w-full h-full rounded block object-cover"
				/>
			) : null}
		</div>
	);
}
