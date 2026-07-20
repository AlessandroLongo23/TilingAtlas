"use client";

import { useEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { buildTilingGL } from "@/lib/render/hyperbolicGroup";
import {
	createDevelopedProgram,
	buildDevelopedUniforms,
	type DevelopedProgram,
	type DevelopedUniformData,
} from "@/lib/render/hyperbolicDevelopedShader";
import { loadDevelopedPatches, type DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";

// Static Poincaré-disk preview of an engine-developed hyperbolic tiling for the library grid and /play
// sidebar. Renders ONE frame at the identity (centred) view through the SAME per-pixel shader as the
// interactive canvas — full disk to the rim, single source of truth for the look — and, like the euclidean
// and spherical thumbnails, re-renders live on hue-ring drags and stroke-option changes. Lazy via
// IntersectionObserver.
//
// ONE shared, persistent offscreen WebGL2 context renders every thumbnail in turn (a fresh context per
// thumbnail churns past the browser's live-context cap and blanks some previews). The per-patch symmetry
// group is expensive to build, so its shader uniforms are cached by patch id — a hue/stroke change only
// re-uploads the handful of dynamic uniforms and redraws, never rebuilds the group.

let glCtx: WebGL2RenderingContext | null = null;
let glProg: DevelopedProgram | null = null;
let glCanvas: HTMLCanvasElement | null = null;
const uniformCache = new Map<string, DevelopedUniformData>();

interface ThumbOpts {
	hueOffset: number;
	showFill: boolean;
	lineMode: "geometry" | "constant";
	lineWidth: number;
}

function renderThumb(patch: DevelopedPatch, size: number, opts: ThumbOpts): string | null {
	if (!glCanvas) glCanvas = document.createElement("canvas");
	if (glCanvas.width !== size) {
		glCanvas.width = size;
		glCanvas.height = size;
	}
	if (!glCtx || glCtx.isContextLost()) {
		glCtx = glCanvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
		glProg = glCtx ? createDevelopedProgram(glCtx) : null;
	}
	const gl = glCtx;
	const prog = glProg;
	if (!gl || !prog) return null;
	gl.useProgram(prog.program);

	// Group extraction is expensive and hue/stroke-independent — build once per patch, cache the uniforms.
	let uni = uniformCache.get(patch.id);
	if (!uni) {
		const glData = buildTilingGL(
			patch.vertices.map(([x, y]) => ({ x, y })),
			patch.faces,
		);
		uni = buildDevelopedUniforms(glData);
		uniformCache.set(patch.id, uni);
	}
	const U = prog.uniforms;
	const dark = document.documentElement.classList.contains("dark");
	const lw = Math.max(opts.lineWidth, 0.5);

	gl.viewport(0, 0, size, size);
	// per-tiling static arrays (cheap uniform uploads; the shared context serves many patches)
	gl.uniform2f(U.uO, uni.o[0], uni.o[1]);
	gl.uniform1f(U.uOInvDen, uni.oInvDen);
	gl.uniform1i(U.uNGen, uni.nGen);
	gl.uniform4fv(U.uGenInv, uni.genInv);
	gl.uniform2fv(U.uSite, uni.site);
	gl.uniform1fv(U.uSiteInvDen, uni.siteInvDen);
	gl.uniform1i(U.uNTile, uni.nTile);
	gl.uniform1fv(U.uTileHue, uni.tileHue);
	gl.uniform2fv(U.uTileCentroid, uni.tileCentroid);
	gl.uniform1iv(U.uTileEdgeOff, uni.tileEdgeOff);
	gl.uniform1iv(U.uTileEdgeCount, uni.tileEdgeCount);
	gl.uniform4fv(U.uEdge, uni.edge);
	// view + theme (fixed identity view — no pan)
	gl.uniform2f(U.uRes, size, size);
	gl.uniform1f(U.uDpr, 1);
	gl.uniform1f(U.uPadPx, 4);
	gl.uniform2f(U.uMa, 1, 0);
	gl.uniform2f(U.uMb, 0, 0);
	gl.uniform1i(U.uDark, dark ? 1 : 0);
	gl.uniform3f(U.uSurface, dark ? 0.08 : 0.976, dark ? 0.067 : 0.973, dark ? 0.051 : 0.961);
	gl.uniform3f(U.uLine, dark ? 0.0 : 0.067, dark ? 0.0 : 0.067, dark ? 0.0 : 0.043);
	// live hue + stroke options — the same fields the interactive canvas reads (dpr = 1 at thumbnail scale)
	gl.uniform1f(U.uHueOffset, opts.hueOffset || 0);
	gl.uniform1i(U.uShowFill, opts.showFill ? 1 : 0);
	gl.uniform1i(U.uStrokeMode, opts.lineMode === "constant" ? 1 : 0);
	gl.uniform1f(U.uStrokePx, lw * 1.1);
	gl.uniform1f(U.uStrokeGeom, lw * 0.02);
	gl.drawArrays(gl.TRIANGLES, 0, 6);

	return glCanvas.toDataURL("image/png");
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
	// euclidean and spherical thumbnails redraw on the hue ring. Cheap: the group is cached per patch.
	const hueOffset = useConfiguration((s) => s.hueOffset);
	const showFill = useConfiguration((s) => s.showPolygonFill);
	const lineMode = useConfiguration((s) => s.hyperbolicLineMode);
	const lineWidth = useConfiguration((s) => s.lineWidth);

	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		let disposed = false;
		const draw = () => {
			loadDevelopedPatches().then((map) => {
				if (disposed) return;
				const p = map[patch];
				if (!p) {
					setFailed(true);
					return;
				}
				try {
					const dataUrl = renderThumb(p, size, { hueOffset, showFill, lineMode, lineWidth });
					if (dataUrl) setUrl(dataUrl);
					else setFailed(true);
				} catch (e) {
					console.warn("HyperbolicDevelopedThumbnail render error:", e);
					setFailed(true);
				}
			});
		};
		// Re-runs whenever a dep changes (hue/stroke). A new observer fires immediately if in view — so a
		// visible thumbnail redraws at once, an off-screen one waits until it scrolls in (no wasted work).
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
		};
	}, [patch, size, hueOffset, showFill, lineMode, lineWidth]);

	if (failed) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-surface-raised rounded text-fg-disabled text-[10px]">
				disk
			</div>
		);
	}

	return (
		<div ref={wrapRef} className="w-full h-full">
			{url ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img src={url} alt={`hyperbolic tiling ${patch}`} className="w-full h-full rounded block object-cover" />
			) : null}
		</div>
	);
}
