"use client";

import { useEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { su11Identity } from "@/lib/render/hyperbolic";
import { drawDevelopedEdgePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { HyperbolicDeveloper } from "@/lib/render/hyperbolicDevelopClient";
import { prepareEdgeShaderTiling, type ShaderTiling } from "@/lib/render/hyperbolicReduce";
import { HyperbolicPerPixelRenderer } from "@/lib/render/hyperbolicPerPixelGL";
import { enqueueThumbnailRender } from "@/lib/render/thumbnailQueue";
import { ThumbnailSkeleton } from "@/components/ui/thumbnail-skeleton";
import type { HypEdgesPattern } from "@/lib/freedraw/hyp-edges";

// Static Poincaré-disk preview of a hyperbolic edge-system tiling for the library grid and /play sidebar.
// It renders ONE frame with the SAME per-pixel renderer as the interactive canvas — reduce each pixel into
// the fundamental domain and colour it by merged-tile orbit + drawn/scaffold edge distance — so the preview
// fills the whole disk to the rim and matches the /play view. One shared offscreen WebGL2 canvas renders
// every thumbnail in turn; the per-tiling edge field is cached so hue/stroke drags just re-draw. Falls back
// to the explicit 2D developed-edge draw where WebGL2 is unavailable or the Dirichlet certificate fails.
// Frame-paced through the shared thumbnail queue, lazy via IntersectionObserver.

let glCanvas: HTMLCanvasElement | null = null;
let glRenderer: HyperbolicPerPixelRenderer | null | undefined; // undefined = untried, null = unavailable
let thumbCanvas2d: HTMLCanvasElement | null = null;
const tilingCache = new Map<string, ShaderTiling | null>(); // null = certificate failed → 2D fallback

interface ThumbOpts {
	hueOffset: number;
	showFill: boolean;
	showScaffold: boolean;
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

function renderThumbGL(pattern: HypEdgesThumbInput, size: number, opts: ThumbOpts): string | null {
	const r = ensureRenderer(size);
	if (!r || !glCanvas) return null;
	let st = tilingCache.get(pattern.id);
	if (st === undefined) {
		const meta = { id: pattern.id, name: pattern.id, config: pattern.config, edge: pattern.edge };
		st = prepareEdgeShaderTiling(pattern.darts, pattern.edge, meta, { fieldRes: 512 });
		tilingCache.set(pattern.id, st);
	}
	if (!st) return null; // certificate failed → 2D fallback
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
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5),
		taper: opts.lineMode !== "constant",
		edgeMode: true,
		scaffold: opts.showScaffold,
	});
	return glCanvas.toDataURL("image/png");
}

function renderThumb2d(pattern: HypEdgesThumbInput, size: number, opts: ThumbOpts): string | null {
	if (!thumbCanvas2d) thumbCanvas2d = document.createElement("canvas");
	if (thumbCanvas2d.width !== size) {
		thumbCanvas2d.width = size;
		thumbCanvas2d.height = size;
	}
	const ctx = thumbCanvas2d.getContext("2d");
	if (!ctx) return null;
	const dark = document.documentElement.classList.contains("dark");
	ctx.clearRect(0, 0, size, size);
	const meta = { id: pattern.id, name: pattern.id, config: pattern.config, edge: pattern.edge };
	const drawn = new HyperbolicDeveloper(pattern.darts, pattern.edge).developEdges(meta, su11Identity(), 0.985, 4000);
	drawDevelopedEdgePatch(ctx, drawn, su11Identity(), {
		R: size / 2 - 4,
		cx: size / 2,
		cy: size / 2,
		dark,
		frame: true,
		showFill: opts.showFill,
		showScaffold: opts.showScaffold,
		hueOffset: opts.hueOffset || 0,
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5),
		taper: opts.lineMode !== "constant",
	});
	return thumbCanvas2d.toDataURL("image/png");
}

function renderThumb(pattern: HypEdgesThumbInput, size: number, opts: ThumbOpts): string | null {
	return renderThumbGL(pattern, size, opts) ?? renderThumb2d(pattern, size, opts);
}

/** Everything either render path reads off a record. The Schwarz shelf (lib/freedraw/schwarz.ts) is not a
 *  HypEdgesPattern but supplies exactly this, so it draws through the same component — SCALENE boards
 *  included, since their per-dart turns and lengths ride inside `darts`. */
export type HypEdgesThumbInput = Pick<HypEdgesPattern, "id" | "config" | "edge" | "darts">;

export function HyperbolicEdgesThumbnail({
	pattern,
	size = 256,
}: {
	pattern: HypEdgesThumbInput;
	size?: number;
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const hueOffset = useConfiguration((s) => s.hueOffset);
	const showFill = useConfiguration((s) => s.showPolygonFill);
	const showScaffold = useConfiguration((s) => s.freedrawScaffold);
	const lineMode = useConfiguration((s) => s.hyperbolicLineMode);
	const lineWidth = useConfiguration((s) => s.lineWidth);

	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		let disposed = false;
		let cancelJob: (() => void) | null = null;
		const io = new IntersectionObserver(
			(entries) => {
				if (!entries[0].isIntersecting) return;
				cancelJob = enqueueThumbnailRender(() => {
					if (disposed) return;
					try {
						const dataUrl = renderThumb(pattern, size, { hueOffset, showFill, showScaffold, lineMode, lineWidth });
						if (dataUrl) setUrl(dataUrl);
						else setFailed(true);
					} catch (e) {
						console.warn("HyperbolicEdgesThumbnail render error:", e);
						setFailed(true);
					}
				});
				io.disconnect();
			},
			{ rootMargin: "300px" },
		);
		io.observe(el);
		return () => {
			disposed = true;
			io.disconnect();
			cancelJob?.();
		};
	}, [pattern, size, hueOffset, showFill, showScaffold, lineMode, lineWidth]);

	if (failed) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-surface-raised rounded text-fg-disabled text-[10px]">
				disk
			</div>
		);
	}

	return (
		<div ref={wrapRef} className="relative w-full h-full">
			<ThumbnailSkeleton done={url != null} />
			{url ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={url}
					alt={`hyperbolic edge tiling ${pattern.id}`}
					className="ta-fade-in relative w-full h-full rounded block object-cover"
				/>
			) : null}
		</div>
	);
}
