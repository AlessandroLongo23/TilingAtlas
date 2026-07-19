"use client";

import { useEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { createHyperbolicProgram } from "@/lib/render/hyperbolicShader";
import { hyperbolicUniformValues, isHyperbolic, type WythoffSpec } from "@/lib/render/hyperbolic";

// A static Poincaré-disk preview of a hyperbolic tiling for the library grid and /play sidebar. Renders one
// frame with the SAME shader as the interactive view (single source of truth for the look), reads it to
// a data URL, and disposes the WebGL context immediately — so a long list never holds live contexts.
// Fixed view (no pan/rotation). Lazy via IntersectionObserver like TilingThumbnail.

interface HyperbolicThumbnailProps {
	wythoff: WythoffSpec;
	/** Render resolution in device px (square). The <img> scales to fill its slot. */
	size?: number;
}

function renderToDataUrl(wythoff: WythoffSpec, size: number, hueOffset = 0): string | null {
	if (!isHyperbolic(wythoff.p, wythoff.q)) return null;
	const g = hyperbolicUniformValues(wythoff);
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
	if (!gl) return null;
	const prog = createHyperbolicProgram(gl);
	if (!prog) return null;
	const U = prog.uniforms;
	const dark = document.documentElement.classList.contains("dark");

	gl.viewport(0, 0, size, size);
	gl.uniform2f(U.uRes, size, size);
	gl.uniform1f(U.uDpr, 1);
	gl.uniform2f(U.uMa, 1, 0); // identity view
	gl.uniform2f(U.uMb, 0, 0);
	gl.uniform1f(U.uP, g.p);
	gl.uniform1f(U.uEdgeA, g.edgeA);
	gl.uniform1f(U.uEdgeRho, g.edgeRho);
	gl.uniform1i(U.uShadeMode, 0);
	gl.uniform1f(U.uHue, g.hue);
	gl.uniform1f(U.uHueOffset, hueOffset);
	gl.uniform1f(U.uStrokePx, 1.0);
	gl.uniform1i(U.uStrokeMode, 1); // constant 1px stroke for the small static preview
	gl.uniform3f(U.uSurface, dark ? 0.08 : 0.96, dark ? 0.09 : 0.96, dark ? 0.11 : 0.97);
	gl.uniform3f(U.uLine, 0.05, 0.05, 0.07);
	gl.uniform1i(U.uShowFill, 1); // previews always render filled, point-free tiles
	gl.uniform1i(U.uShowPoints, 0);
	gl.uniform1i(U.uNumPoints, 0);
	gl.uniform3f(U.uParityA, 0.9, 0.9, 0.92);
	gl.uniform3f(U.uParityB, 0.12, 0.12, 0.14);
	gl.uniform1i(U.uNTiles, g.nTiles);
	gl.uniform2f(U.uWythoff, g.wythoff.x, g.wythoff.y);
	gl.uniform2f(U.uFootA, g.footA.x, g.footA.y);
	gl.uniform2f(U.uFootB, g.footB.x, g.footB.y);
	gl.uniform2f(U.uFootC, g.footC.x, g.footC.y);
	gl.uniform2f(U.uCornerV, g.cornerV.x, g.cornerV.y);
	gl.uniform1f(U.uRin, g.rIn);
	gl.uniform3f(U.uOcc, g.occ[0], g.occ[1], g.occ[2]);
	gl.uniform3f(U.uTileHue, g.tileHue[0], g.tileHue[1], g.tileHue[2]);
	gl.uniform1i(U.uSnub, g.snub ? 1 : 0);
	if (g.snub) {
		gl.uniform2f(U.uSnubS, g.snub.s.x, g.snub.s.y);
		gl.uniform2f(U.uSnubAs, g.snub.as.x, g.snub.as.y);
		gl.uniform2f(U.uSnubAis, g.snub.ais.x, g.snub.ais.y);
		gl.uniform2f(U.uSnubBs, g.snub.bs.x, g.snub.bs.y);
		gl.uniform2f(U.uSnubBis, g.snub.bis.x, g.snub.bis.y);
		gl.uniform2f(U.uSnubN, g.snub.n.x, g.snub.n.y);
		gl.uniform2f(U.uSnubB2s, g.snub.b2s.x, g.snub.b2s.y);
	}
	gl.drawArrays(gl.TRIANGLES, 0, 6);

	const url = canvas.toDataURL("image/png");

	gl.deleteProgram(prog.program);
	gl.deleteShader(prog.vs);
	gl.deleteShader(prog.fs);
	gl.deleteBuffer(prog.quad);
	gl.getExtension("WEBGL_lose_context")?.loseContext();
	return url;
}

export function HyperbolicThumbnail({ wythoff, size = 256 }: HyperbolicThumbnailProps) {
	const holderRef = useRef<HTMLDivElement | null>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const specKey = `${wythoff.p},${wythoff.q},${wythoff.rings.join("")},${wythoff.snub ? 1 : 0}`;
	// Global hue ring: subscribed LIVE — every visible disk preview re-renders (fresh GL context +
	// data URL) per drag tick. The deliberate exact-colors choice; revisit if it janks.
	const hueOffset = useConfiguration((s) => s.hueOffset);

	useEffect(() => {
		const el = holderRef.current;
		if (!el) return;
		let done = false;
		const draw = () => {
			if (done) return;
			done = true;
			try {
				const dataUrl = renderToDataUrl(wythoff, size, hueOffset);
				if (dataUrl) setUrl(dataUrl);
				else setFailed(true);
			} catch (e) {
				console.warn("HyperbolicThumbnail render error:", e);
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
				disk
			</div>
		);
	}

	return (
		<div ref={holderRef} className="w-full h-full">
			{url ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img src={url} alt={`{${wythoff.p},${wythoff.q}} hyperbolic tiling`} className="w-full h-full rounded block object-cover" />
			) : null}
		</div>
	);
}
