"use client";

import { useEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { su11Identity } from "@/lib/render/hyperbolic";
import { drawDevelopedEdgePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { FALLBACK_BOUND_R, HyperbolicDeveloper, THUMB_BUDGET } from "@/lib/render/hyperbolicDevelopClient";
import { prepareEdgeShaderTiling, type ShaderTiling } from "@/lib/render/hyperbolicReduce";
import { HyperbolicPerPixelRenderer } from "@/lib/render/hyperbolicPerPixelGL";
import { enqueueThumbnailRender } from "@/lib/render/thumbnailQueue";
import { ThumbnailSkeleton } from "@/components/ui/thumbnail-skeleton";
import { paletteRgb255 } from "@/lib/colors/render";
import type { HypColorsPattern } from "@/lib/colors/hyp-colors";

/** Everything this component reads off a record. Declared as a subset so a shelf that is NOT a colouring
 *  can draw through it: the 3.4.n.4 tilings (lib/tilings/hyp-poly.ts) fill each face by POLYGON SIZE
 *  instead of by solver colour, which is the same render — an index per face and every edge a boundary. */
export type HypColorsThumbInput = Pick<HypColorsPattern, "id" | "config" | "edge" | "darts" | "colors" | "certified">;

// Static Poincaré-disk preview of a hyperbolic colored tiling — one frame of the same per-pixel colors
// renderer as the interactive canvas, so the preview fills the disk to the rim and matches /play. One
// shared offscreen WebGL2 canvas; the colors field is cached per tiling so palette/stroke drags re-draw.
// 2D developed fallback where WebGL2 / the Dirichlet certificate is unavailable.

let glCanvas: HTMLCanvasElement | null = null;
let glRenderer: HyperbolicPerPixelRenderer | null | undefined;
let thumbCanvas2d: HTMLCanvasElement | null = null;
const tilingCache = new Map<string, ShaderTiling | null>();

interface ThumbOpts {
	palette: (number | "cream" | "dark")[];
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

function renderThumbGL(pattern: HypColorsThumbInput, size: number, opts: ThumbOpts): string | null {
	const r = ensureRenderer(size);
	if (!r || !glCanvas) return null;
	let st = tilingCache.get(pattern.id);
	if (st === undefined) {
		const meta = { id: pattern.id, name: pattern.id, config: pattern.config, edge: pattern.edge };
		st = prepareEdgeShaderTiling(pattern.darts, pattern.edge, meta, { fieldRes: 512, colors: true });
		tilingCache.set(pattern.id, st);
	}
	if (!st) return null;
	r.setTiling(st);
	const dark = document.documentElement.classList.contains("dark");
	const pal = paletteRgb255(pattern.colors, opts.palette, dark);
	r.draw({
		view: su11Identity(),
		R: size / 2 - 4,
		cx: size / 2,
		cy: size / 2,
		canvasH: size,
		dark,
		showFill: opts.showFill,
		hueOffset: 0,
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5),
		taper: opts.lineMode !== "constant",
		edgeMode: true,
		colorsMode: true,
		palette: pal.map((c) => [c[0] / 255, c[1] / 255, c[2] / 255] as [number, number, number]),
	});
	return glCanvas.toDataURL("image/png");
}

function renderThumb2d(pattern: HypColorsThumbInput, size: number, opts: ThumbOpts): string | null {
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
	const drawn = new HyperbolicDeveloper(pattern.darts, pattern.edge).developColors(meta, su11Identity(), FALLBACK_BOUND_R, THUMB_BUDGET);
	drawDevelopedEdgePatch(ctx, drawn, su11Identity(), {
		R: size / 2 - 4,
		cx: size / 2,
		cy: size / 2,
		dark,
		frame: true,
		showFill: opts.showFill,
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5),
		taper: opts.lineMode !== "constant",
		palette: paletteRgb255(pattern.colors, opts.palette, dark),
	});
	return thumbCanvas2d.toDataURL("image/png");
}

function renderThumb(pattern: HypColorsThumbInput, size: number, opts: ThumbOpts): string | null {
	// A record stamped un-certifiable would spend a median 210 ms inside buildDirichletDomain only to
	// fail, once per card, and a grid bakes dozens of them. Skip straight to the 2D bake.
	if (pattern.certified === false) return renderThumb2d(pattern, size, opts);
	return renderThumbGL(pattern, size, opts) ?? renderThumb2d(pattern, size, opts);
}

export function HyperbolicColorsThumbnail({ pattern, size = 256 }: { pattern: HypColorsThumbInput; size?: number }) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const palette = useConfiguration((s) => s.colorsPalette);
	const showFill = useConfiguration((s) => s.showPolygonFill);
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
						const dataUrl = renderThumb(pattern, size, { palette, showFill, lineMode, lineWidth });
						if (dataUrl) setUrl(dataUrl);
						else setFailed(true);
					} catch (e) {
						console.warn("HyperbolicColorsThumbnail render error:", e);
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
	}, [pattern, size, palette, showFill, lineMode, lineWidth]);

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
					alt={`hyperbolic colored tiling ${pattern.id}`}
					className="ta-fade-in relative w-full h-full rounded block object-cover"
				/>
			) : null}
		</div>
	);
}
