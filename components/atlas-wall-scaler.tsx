"use client";

import { useEffect, useRef } from "react";
import styles from "./atlas-wall.module.css";

// Cover-fits the fixed 1920x1200 design canvas to the viewport (scale = max of the two ratios,
// centered; portrait anchors on the masthead/Library column instead of dead center). The initial
// transform is applied by a SYNCHRONOUS inline script during HTML parse — before first paint —
// otherwise the page flashes two frames: the unscaled crop, then the fitted wall. React only
// takes over for resizes.

function applyTransform(el: HTMLElement) {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const s = Math.max(vw / 1920, vh / 1200);
	const anchorX = vw / vh < 0.9 ? 0.19 : 0.5;
	el.style.left = "0";
	el.style.top = "0";
	el.style.transformOrigin = "0 0";
	el.style.transform = `translate(${vw / 2 - anchorX * 1920 * s}px, ${vh / 2 - 0.5 * 1200 * s}px) scale(${s})`;
}

// String twin of applyTransform for the pre-paint inline script. Kept tiny and dependency-free.
const INIT_SCRIPT = `(function(){var el=document.getElementById("atlas-wall-canvas");if(!el)return;var vw=window.innerWidth,vh=window.innerHeight,s=Math.max(vw/1920,vh/1200),ax=vw/vh<0.9?0.19:0.5;el.style.left="0";el.style.top="0";el.style.transformOrigin="0 0";el.style.transform="translate("+(vw/2-ax*1920*s)+"px,"+(vh/2-0.5*1200*s)+"px) scale("+s+")";})();`;

export function AtlasWallScaler({ children }: { children: React.ReactNode }) {
	const ref = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const apply = () => applyTransform(el);
		apply();
		window.addEventListener("resize", apply);
		return () => window.removeEventListener("resize", apply);
	}, []);

	return (
		<div className={styles.viewport}>
			{/* suppressHydrationWarning: the pre-paint script below sets an inline style React never rendered */}
			<div ref={ref} id="atlas-wall-canvas" className={styles.canvas} suppressHydrationWarning>
				{/* first child on purpose: must execute before the SVG below it streams in and paints */}
				<script dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} />
				{children}
			</div>
		</div>
	);
}
