"use client";

import { useEffect, useRef, useState } from "react";
import { su11Identity } from "@/lib/render/hyperbolic";
import { drawDevelopedPatch, loadDevelopedPatches } from "@/lib/render/hyperbolicDevelopedDraw";

// Static Poincaré-disk preview of an engine-developed hyperbolic tiling for the library grid and /play
// sidebar. Draws one frame at the identity (centred) view with the SAME drawDevelopedPatch used by the
// interactive canvas — single source of truth for the look. Lazy via IntersectionObserver like the other
// thumbnails, so a long list never draws off-screen tilings.

interface Props {
	patch: string;
	size?: number;
}

export function HyperbolicDevelopedThumbnail({ patch, size = 256 }: Props) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setVisible(true);
					io.disconnect();
				}
			},
			{ rootMargin: "200px" },
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	useEffect(() => {
		if (!visible) return;
		let alive = true;
		loadDevelopedPatches().then((map) => {
			if (!alive) return;
			const p = map[patch];
			const canvas = canvasRef.current;
			if (!p || !canvas) return;
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const dark = document.documentElement.classList.contains("dark");
			const R = size / 2 - 4;
			drawDevelopedPatch(ctx, p, su11Identity(), { R, cx: size / 2, cy: size / 2, dark, frame: true });
		});
		return () => {
			alive = false;
		};
	}, [visible, patch, size]);

	return (
		<div ref={wrapRef} className="w-full h-full">
			<canvas ref={canvasRef} className="w-full h-full rounded block object-cover" />
		</div>
	);
}
