"use client";

import { useEffect, useRef, useState } from "react";
import { createHyperbolicProgram } from "@/lib/render/hyperbolicShader";
import { isHyperbolic, mirrorParams } from "@/lib/render/hyperbolic";

// A static Poincaré-disk preview of a {p,q} tiling for the library grid and /play sidebar. Renders one
// frame with the SAME shader as the interactive view (single source of truth for the look), reads it to
// a data URL, and disposes the WebGL context immediately — so a long list never holds live contexts.
// Fixed view (no pan/rotation). Lazy via IntersectionObserver like TilingThumbnail.

interface HyperbolicThumbnailProps {
	schlafli: [number, number];
	/** Render resolution in device px (square). The <img> scales to fill its slot. */
	size?: number;
}

function hueFor(p: number, q: number): number {
	return (p * 97 + q * 31) % 360;
}

function renderToDataUrl(schlafli: [number, number], size: number): string | null {
	const [p, q] = schlafli;
	if (!isHyperbolic(p, q)) return null;
	const m = mirrorParams(p, q);
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
	gl.uniform1f(U.uP, p);
	gl.uniform1f(U.uEdgeA, m.edgeA);
	gl.uniform1f(U.uEdgeRho, m.edgeRho);
	gl.uniform1i(U.uShadeMode, 0);
	gl.uniform1f(U.uHue, hueFor(p, q));
	gl.uniform1f(U.uStrokePx, 1.0);
	gl.uniform1i(U.uStrokeMode, 1); // constant 1px stroke for the small static preview
	gl.uniform3f(U.uSurface, dark ? 0.08 : 0.96, dark ? 0.09 : 0.96, dark ? 0.11 : 0.97);
	gl.uniform3f(U.uLine, 0.05, 0.05, 0.07);
	gl.uniform3f(U.uParityA, 0.9, 0.9, 0.92);
	gl.uniform3f(U.uParityB, 0.12, 0.12, 0.14);
	gl.drawArrays(gl.TRIANGLES, 0, 6);

	const url = canvas.toDataURL("image/png");

	gl.deleteProgram(prog.program);
	gl.deleteShader(prog.vs);
	gl.deleteShader(prog.fs);
	gl.deleteBuffer(prog.quad);
	gl.getExtension("WEBGL_lose_context")?.loseContext();
	return url;
}

export function HyperbolicThumbnail({ schlafli, size = 256 }: HyperbolicThumbnailProps) {
	const holderRef = useRef<HTMLDivElement | null>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		const el = holderRef.current;
		if (!el) return;
		let done = false;
		const draw = () => {
			if (done) return;
			done = true;
			try {
				const dataUrl = renderToDataUrl(schlafli, size);
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
	}, [schlafli, size]);

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
				<img src={url} alt={`{${schlafli[0]},${schlafli[1]}} hyperbolic tiling`} className="w-full h-full rounded block object-cover" />
			) : null}
		</div>
	);
}
